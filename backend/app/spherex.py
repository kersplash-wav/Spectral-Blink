"""SPHEREx data access: SIA image search + lean cutout fetching from IRSA.

IRSA cutouts carry a ~4 MB EPSF table we don't need. We stream each cutout and stop
reading as soon as the EPSF header appears, keeping PRIMARY..ZODI (~100 KB).
The tiny WCS-WAVE lookup table is identical per detector, so it's fetched once and cached.
"""
from __future__ import annotations

import asyncio
import hashlib
import random
import io
import logging

import httpx
import numpy as np
from astropy.io import fits
from astropy.io.votable import parse_single_table

from . import config

log = logging.getLogger("spherex")
BLOCK = 2880


async def query_exposures(client: httpx.AsyncClient, ra: float, dec: float) -> list[dict]:
    """All SPHEREx L2 exposures whose footprint contains (ra, dec), across configured collections."""

    async def one(coll: str) -> list[dict]:
        for attempt in range(3):
            try:
                r = await client.get(config.SIA_URL, params={
                    "COLLECTION": coll, "POS": f"circle {ra} {dec} 0.0003", "MAXREC": 50000}, timeout=90)
                r.raise_for_status()
                t = parse_single_table(io.BytesIO(r.content)).to_table(use_names_over_ids=True)
                break
            except Exception as e:  # noqa: BLE001
                if attempt == 2:
                    log.warning("SIA %s failed: %s", coll, e)
                    return []
                await asyncio.sleep(1.5 * (attempt + 1))
        out = []
        for row in t:
            band = str(row["energy_bandpassname"])
            if not band.startswith("SPHEREx-D"):
                continue
            out.append({
                "id": str(row["obs_publisher_did"]),
                "obs_id": str(row["obs_id"]),
                "det": int(band[-1]),
                "url": str(row["access_url"]),
                "mjd": float(row["t_min"]),
                "exptime": float(row["t_exptime"]),
                "collection": coll,
            })
        return out

    results = await asyncio.gather(*(one(c) for c in config.COLLECTIONS))
    seen, exps = set(), []
    for lst in results:
        for e in lst:
            if e["id"] not in seen:
                seen.add(e["id"])
                exps.append(e)
    exps.sort(key=lambda e: (e["mjd"], e["det"]))
    return exps


def _hdu_span(buf: bytes, pos: int):
    """Parse a FITS header at `pos`. Returns (header, header_len, data_len) or None if incomplete."""
    i = pos
    while i + BLOCK <= len(buf):
        block = buf[i:i + BLOCK]
        for k in range(0, BLOCK, 80):
            if block[k:k + 8] == b"END     ":
                hlen = i + BLOCK - pos
                hdr = fits.Header.fromstring(buf[pos:pos + hlen].decode("ascii", "replace"))
                naxis = hdr.get("NAXIS", 0)
                n = 0
                if naxis:
                    n = abs(hdr["BITPIX"]) // 8
                    for a in range(1, naxis + 1):
                        n *= hdr[f"NAXIS{a}"]
                    n = (n + hdr.get("PCOUNT", 0)) * hdr.get("GCOUNT", 1)
                dlen = -(-n // BLOCK) * BLOCK
                return hdr, hlen, dlen
        i += BLOCK
    return None


async def _stream_until(client: httpx.AsyncClient, url: str, params: dict, stop_ext: str | None) -> bytes:
    """Download a FITS stream, stopping before the HDU named `stop_ext` (None = whole file)."""
    buf = bytearray()
    pos = 0
    async with client.stream("GET", url, params=params, timeout=90) as r:
        r.raise_for_status()
        async for chunk in r.aiter_bytes(65536):
            buf += chunk
            if len(buf) >= 6 and buf[:6] != b"SIMPLE":
                raise ValueError("not a FITS response")
            if stop_ext is None:
                continue
            while True:
                span = _hdu_span(bytes(buf), pos) if len(buf) - pos >= BLOCK else None
                if span is None:
                    break
                hdr, hlen, dlen = span
                if hdr.get("EXTNAME") == stop_ext:
                    return bytes(buf[:pos])
                if len(buf) < pos + hlen + dlen:
                    break
                pos += hlen + dlen
    if buf[:6] != b"SIMPLE":
        raise ValueError("not a FITS response")
    return bytes(buf)


def _cache_path(url: str, ra: float, dec: float, size: float):
    key = hashlib.sha1(f"{url}|{ra:.6f}|{dec:.6f}|{size:.4f}".encode()).hexdigest()
    return config.CACHE_DIR / "cutouts" / f"{key}.fits"


async def fetch_cutout(client: httpx.AsyncClient, url: str, ra: float, dec: float, size: float) -> bytes:
    """Lean cutout (PRIMARY, IMAGE, FLAGS, VARIANCE, ZODI) with disk caching and retries."""
    p = _cache_path(url, ra, dec, size)
    if p.exists():
        return p.read_bytes()
    params = {"center": f"{ra},{dec}d", "size": f"{size:.4f}"}
    last = None
    for attempt in range(6):
        try:
            data = await _stream_until(client, url, params, stop_ext="EPSF")
            p.write_bytes(data)
            return data
        except Exception as e:  # noqa: BLE001
            last = e
            # IRSA returns 503 under load: back off exponentially with jitter
            await asyncio.sleep(min(10.0, 0.7 * 2 ** attempt) + random.random())
    raise RuntimeError(f"cutout failed after retries: {last}")


_wave_locks: dict[int, asyncio.Lock] = {}
_wave_mem: dict[int, fits.BinTableHDU] = {}


async def wave_table(client: httpx.AsyncClient, det: int, sample_url: str, ra: float, dec: float) -> fits.BinTableHDU:
    """Per-detector WCS-WAVE lookup table (fetched once from a full cutout, then cached)."""
    if det in _wave_mem:
        return _wave_mem[det]
    lock = _wave_locks.setdefault(det, asyncio.Lock())
    async with lock:
        if det in _wave_mem:
            return _wave_mem[det]
        p = config.CACHE_DIR / "wave" / f"D{det}.fits"
        if not p.exists():
            for attempt in range(4):
                try:
                    data = await _stream_until(client, sample_url, {"center": f"{ra},{dec}d", "size": "0.01"}, None)
                    with fits.open(io.BytesIO(data)) as h:
                        fits.HDUList([fits.PrimaryHDU(), h["WCS-WAVE"].copy()]).writeto(p, overwrite=True)
                    break
                except Exception:  # noqa: BLE001
                    if attempt == 3:
                        raise
                    await asyncio.sleep(1 + attempt)
        with fits.open(p) as h:
            hdu = h["WCS-WAVE"].copy()
            hdu.data = np.array(hdu.data)  # detach from file
        _wave_mem[det] = hdu
        return hdu
