"""Name resolution (CDS Sesame) with proper-motion propagation, plus external catalogue lookups."""
from __future__ import annotations

import asyncio
import json
import re
import xml.etree.ElementTree as ET

import httpx
import numpy as np
from astropy import units as u
from astropy.coordinates import Distance, SkyCoord
from astropy.time import Time

from . import config

_COORD_RE = re.compile(r"^[\s+\-\d.:hdms°'\"]+[,\s]+[\s+\-\d.:hdms°'\"]+$")


def parse_coords(text: str) -> SkyCoord | None:
    t = text.strip()
    if not _COORD_RE.match(t):
        return None
    parts = re.split(r"[,\s]+", t, maxsplit=1) if "," in t or t.count(" ") == 1 else None
    try:
        if parts and all(re.fullmatch(r"[+\-]?\d+(\.\d+)?", p.strip()) for p in parts):
            return SkyCoord(float(parts[0]), float(parts[1]), unit="deg")
        return SkyCoord(t.replace(",", " "), unit=(u.hourangle, u.deg))
    except Exception:  # noqa: BLE001
        return None


_RESOLVE_CACHE = config.CACHE_DIR / "resolve.json"
SESAME_MIRRORS = [config.SESAME_URL, "https://vizier.cds.unistra.fr/viz-bin/nph-sesame/-oxp/SNV"]


def _load_cache() -> dict:
    try:
        return json.loads(_RESOLVE_CACHE.read_text())
    except Exception:  # noqa: BLE001
        return {}


async def _sesame(client: httpx.AsyncClient, query: str) -> str:
    """Sesame XML for `query`; tries mirrors with retries, falls back to a disk cache."""
    key = query.strip().lower()
    last: Exception | None = None
    for attempt in range(2):
        for url in SESAME_MIRRORS:
            try:
                r = await client.get(f"{url}?{query}", follow_redirects=True, timeout=20)
                r.raise_for_status()
                if "<Resolver" in r.text:
                    cache = _load_cache()
                    cache[key] = r.text
                    _RESOLVE_CACHE.write_text(json.dumps(cache))
                return r.text
            except Exception as e:  # noqa: BLE001
                last = e
        await asyncio.sleep(1 + attempt)
    cached = _load_cache().get(key)
    if cached:
        return cached
    raise RuntimeError(f"name resolver unreachable: {last}")


async def resolve(client: httpx.AsyncClient, query: str, when: Time | None = None) -> dict:
    """Resolve a name or coordinate string. Stars with proper motion are moved to `when` (default: now)."""
    when = when or Time(config.REF_EPOCH_ISO)
    c = parse_coords(query)
    if c is not None:
        return {"ra": round(c.ra.deg, 6), "dec": round(c.dec.deg, 6), "name": query.strip(), "type": None, "pm": None, "moved_arcsec": 0}

    xml_text = await _sesame(client, query)
    res = ET.fromstring(xml_text).find(".//Resolver")
    if res is None or res.findtext("jradeg") is None:
        raise LookupError(f"Could not resolve '{query}'")

    def f(path):
        v = res.findtext(path)
        try:
            return float(v) if v is not None else np.nan
        except ValueError:
            return np.nan

    ra, dec = f("jradeg"), f("jdedeg")
    pmra, pmdec, plx, rv = f("pm/pmRA"), f("pm/pmDE"), f("plx/v"), f("Vel/v")
    oname = re.sub(r"^(NAME|V\*|\*\*|\*)\s+", "", (res.findtext("oname") or query).strip())
    out = {"ra": round(ra, 6), "dec": round(dec, 6), "name": oname, "type": res.findtext("otype"),
           "sptype": res.findtext("spType"), "pm": None, "moved_arcsec": 0.0}
    if np.isfinite(pmra) and np.isfinite(pmdec):
        dist = Distance(parallax=plx * u.mas) if np.isfinite(plx) and plx > 0.05 else 1 * u.kpc
        c0 = SkyCoord(ra=ra * u.deg, dec=dec * u.deg, obstime=Time("J2000"), frame="icrs",
                      pm_ra_cosdec=pmra * u.mas / u.yr, pm_dec=pmdec * u.mas / u.yr,
                      distance=dist, radial_velocity=(rv if np.isfinite(rv) else 0) * u.km / u.s)
        c1 = c0.apply_space_motion(new_obstime=when)
        out.update(ra=round(float(c1.ra.deg), 6), dec=round(float(c1.dec.deg), 6),
                   pm={"pmra": pmra, "pmdec": pmdec, "plx": plx if np.isfinite(plx) else None},
                   moved_arcsec=float(c0.separation(c1).arcsec))
    return out


GAIA_TAP = "https://gea.esac.esa.int/tap-server/tap/sync"


async def gaia_cone(client: httpx.AsyncClient, ra: float, dec: float, radius: float, gmax: float = 20.5) -> list[dict]:
    """Gaia DR3 sources (epoch 2016.0 positions + proper motions). Radius in degrees."""
    cache = config.CACHE_DIR / "gaia"
    cache.mkdir(exist_ok=True)
    key = cache / f"{ra:.5f}_{dec:.5f}_{radius:.3f}.json"
    if key.exists():
        return json.loads(key.read_text())
    q = ("SELECT source_id, ra, dec, pmra, pmdec, parallax, phot_g_mean_mag, bp_rp FROM gaiadr3.gaia_source "
         f"WHERE 1=CONTAINS(POINT('ICRS',ra,dec), CIRCLE('ICRS',{ra},{dec},{radius})) AND phot_g_mean_mag < {gmax}")
    last = None
    for attempt in range(3):
        try:
            r = await client.post(GAIA_TAP, data={"REQUEST": "doQuery", "LANG": "ADQL", "FORMAT": "json", "QUERY": q}, timeout=60)
            r.raise_for_status()
            d = r.json()
            cols = [c["name"] for c in d["metadata"]]
            rows = [dict(zip(cols, row)) for row in d["data"]]
            out = [{"id": str(x["source_id"]), "ra": x["ra"], "dec": x["dec"], "pmra": x["pmra"] or 0.0,
                    "pmdec": x["pmdec"] or 0.0, "plx": x["parallax"], "g": x["phot_g_mean_mag"], "bp_rp": x["bp_rp"]} for x in rows]
            key.write_text(json.dumps(out))
            return out
        except Exception as e:  # noqa: BLE001
            last = e
            await asyncio.sleep(1 + attempt)
    raise RuntimeError(f"Gaia archive unreachable: {last}")
