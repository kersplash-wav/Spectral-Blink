"""M0 go/no-go probe: can we get time-resolved SPHEREx cutouts of a moving star?

Usage: .venv/bin/python -I scripts/probe.py [target-name] [--size DEG] [--per-cell N]
"""
import argparse
import asyncio
import io
import time
from collections import Counter

import httpx
import numpy as np
from astropy import units as u
from astropy.coordinates import Distance, SkyCoord
from astropy.io import fits
from astropy.table import Table
from astropy.time import Time
from astropy.wcs import WCS
from PIL import Image
from reproject import reproject_interp

SIA = "https://irsa.ipac.caltech.edu/SIA"
COLLECTIONS = ["spherex_dr1", "spherex_qr3"]
BAD_BITS = [0, 1, 2, 6, 9, 10, 11, 15, 17, 19, 20, 22, 23, 24, 25, 26, 27, 28]
BAD_MASK = sum(1 << b for b in BAD_BITS)


def sip_header(hdr):
    hdr = hdr.copy()
    if "A_ORDER" in hdr and not hdr["CTYPE1"].endswith("-SIP"):
        hdr["CTYPE1"] += "-SIP"
        hdr["CTYPE2"] += "-SIP"
    return hdr


def resolve(name: str, when: Time) -> SkyCoord:
    import xml.etree.ElementTree as ET

    r = httpx.get(f"https://cds.unistra.fr/cgi-bin/nph-sesame/-oxp/SNV?{name}", follow_redirects=True, timeout=30)
    res = ET.fromstring(r.text).find(".//Resolver")
    f = lambda path: (float(res.findtext(path)) if res.findtext(path) else np.nan)  # noqa: E731
    ra, dec = f("jradeg"), f("jdedeg")
    pmra, pmdec, plx, rv = f("pm/pmRA"), f("pm/pmDE"), f("plx/v"), f("Vel/v")
    print(f"  {res.findtext('oname')} [{res.findtext('otype')}] pm=({pmra},{pmdec}) plx={plx}")
    # SIMBAD positions are ICRS at epoch J2000
    kw = dict(ra=ra * u.deg, dec=dec * u.deg, obstime=Time("J2000"), frame="icrs")
    if np.isfinite(pmra) and np.isfinite(plx) and plx > 0:
        c = SkyCoord(
            **kw,
            pm_ra_cosdec=pmra * u.mas / u.yr,
            pm_dec=pmdec * u.mas / u.yr,
            distance=Distance(parallax=plx * u.mas),
            radial_velocity=(rv if np.isfinite(rv) else 0) * u.km / u.s,
        )
        moved = c.apply_space_motion(new_obstime=when)
        print(f"  J2000 {c.ra.deg:.5f} {c.dec.deg:+.5f} -> {when.jyear:.1f} "
              f"{moved.ra.deg:.5f} {moved.dec.deg:+.5f} (moved {c.separation(moved).arcsec:.0f}\")")
        return SkyCoord(moved.ra, moved.dec)
    return SkyCoord(**kw)


def sia_query(c: SkyCoord) -> Table:
    rows = []
    with httpx.Client(timeout=120) as cl:
        for coll in COLLECTIONS:
            t0 = time.time()
            r = cl.get(SIA, params={"COLLECTION": coll, "POS": f"circle {c.ra.deg} {c.dec.deg} 0.0003",
                                    "MAXREC": 20000})
            r.raise_for_status()
            from astropy.io.votable import parse_single_table
            t = parse_single_table(io.BytesIO(r.content)).to_table(use_names_over_ids=True)
            print(f"  {coll}: {len(t)} images ({time.time() - t0:.1f}s)")
            if len(t):
                rows.append(t["energy_bandpassname", "obs_id", "access_url", "t_min", "em_min", "em_max", "obs_collection"])
    from astropy.table import vstack
    return vstack(rows)


def epochs_from(mjd: np.ndarray, gap=30.0) -> np.ndarray:
    order = np.argsort(mjd)
    ep = np.zeros(len(mjd), int)
    cur = 0
    for i in range(1, len(order)):
        if mjd[order[i]] - mjd[order[i - 1]] > gap:
            cur += 1
        ep[order[i]] = cur
    return ep


async def fetch_all(urls, c, size, conc=12):
    sem = asyncio.Semaphore(conc)
    async with httpx.AsyncClient(timeout=120, follow_redirects=True) as cl:
        async def one(u_):
            async with sem:
                for attempt in range(3):
                    try:
                        r = await cl.get(u_, params={"center": f"{c.ra.deg},{c.dec.deg}d", "size": size})
                        r.raise_for_status()
                        return r.content
                    except Exception as e:  # noqa: BLE001
                        if attempt == 2:
                            print("   fail", u_[-50:], e)
                            return None
                        await asyncio.sleep(1 + attempt)
        return await asyncio.gather(*(one(u_) for u_ in urls))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("name", nargs="?", default="Barnard's Star")
    ap.add_argument("--size", type=float, default=0.05)
    ap.add_argument("--per-cell", type=int, default=4)
    ap.add_argument("--band", default="SPHEREx-D3")
    ap.add_argument("--out", default="probe_blink.gif")
    a = ap.parse_args()

    print(f"[1] resolve {a.name}")
    c = resolve(a.name, Time("2026-01-01"))

    print("[2] SIA query")
    t = sia_query(c)
    mjd = np.array(t["t_min"], float)
    t["epoch"] = epochs_from(mjd)
    print(f"  total {len(t)} exposures, MJD {mjd.min():.1f}..{mjd.max():.1f}")
    for e in sorted(set(t["epoch"])):
        m = t["epoch"] == e
        dets = Counter(t["energy_bandpassname"][m])
        d0, d1 = Time(mjd[m].min(), format="mjd").iso[:10], Time(mjd[m].max(), format="mjd").iso[:10]
        print(f"  epoch {e}: {m.sum():4d} exp  {d0}..{d1}  " + " ".join(f"D{k[-1]}:{v}" for k, v in sorted(dets.items())))

    print(f"[3] fetch cutouts (size {a.size} deg, {a.per_cell}/epoch for {a.band} + 1/epoch/other band)")
    pick = []
    for e in sorted(set(t["epoch"])):
        for b in sorted(set(t["energy_bandpassname"])):
            idx = np.where((t["epoch"] == e) & (t["energy_bandpassname"] == b))[0]
            pick += list(idx[: (a.per_cell if b == a.band else 1)])
    t0 = time.time()
    blobs = asyncio.run(fetch_all([t["access_url"][i] for i in pick], c, a.size))
    ok = [b for b in blobs if b]
    print(f"  {len(ok)}/{len(pick)} cutouts in {time.time() - t0:.1f}s, avg {np.mean([len(b) for b in ok]) / 1024:.0f} KB")

    print("[4] wavelength check + per-epoch co-add")
    # common grid: TAN centred on target, 6.15"/px
    npx = int(round(a.size * 3600 / 6.15))
    g = WCS(naxis=2)
    g.wcs.ctype = ["RA---TAN", "DEC--TAN"]
    g.wcs.crval = [c.ra.deg, c.dec.deg]
    g.wcs.crpix = [(npx + 1) / 2, (npx + 1) / 2]
    g.wcs.cdelt = [-6.15 / 3600, 6.15 / 3600]
    stacks = {}
    for i, blob in zip(pick, blobs):
        if not blob:
            continue
        with fits.open(io.BytesIO(blob)) as h:
            if i == pick[0]:
                print("  HDUs:", [x.name for x in h], "IMAGE shape", h["IMAGE"].data.shape)
            hdr = h["IMAGE"].header
            hdr_sp = sip_header(hdr)
            w = WCS(hdr_sp)
            x, y = w.world_to_pixel(c)
            sw = WCS(hdr, fobj=h, key="W")
            sw.sip = None
            lam, _ = sw.pixel_to_world(x, y)
            lam_um = lam.to(u.um).value
            b = t["energy_bandpassname"][i]
            inside = t["em_min"][i] * 1e6 - 0.01 <= lam_um <= t["em_max"][i] * 1e6 + 0.01
            print(f"   ep{t['epoch'][i]} {b} λ={lam_um:.3f}µm range[{t['em_min'][i]*1e6:.2f},{t['em_max'][i]*1e6:.2f}] {'ok' if inside else 'OUT'}")
            if b != a.band:
                continue
            img = h["IMAGE"].data.astype(float) - h["ZODI"].data
            img[(h["FLAGS"].data & BAD_MASK) != 0] = np.nan
            rep, _ = reproject_interp((img, w), g, shape_out=(npx, npx))
            stacks.setdefault(t["epoch"][i], []).append(rep)

    frames = {e: np.nanmedian(v, axis=0) for e, v in sorted(stacks.items())}
    print("[5] centroid of brightest source near centre per epoch")
    cy = cx = (npx - 1) / 2
    yy, xx = np.mgrid[:npx, :npx]
    ref = None
    for e, f in frames.items():
        sub = np.nan_to_num(f - np.nanmedian(f))
        r = np.hypot(yy - cy, xx - cx) < 8
        sub = np.where(r, sub, 0)
        py, px = np.unravel_index(np.argmax(sub), sub.shape)
        win = (np.hypot(yy - py, xx - px) < 3)
        wts = np.clip(sub * win, 0, None)
        my, mx = (wts * yy).sum() / wts.sum(), (wts * xx).sum() / wts.sum()
        ref = ref or (mx, my)
        dx, dy = (mx - ref[0]) * 6.15, (my - ref[1]) * 6.15
        print(f"  epoch {e}: centroid ({mx:.2f},{my:.2f}) shift from ep0 = ({dx:+.1f}\", {dy:+.1f}\") |{np.hypot(dx, dy):.1f}\"|")

    vals = np.concatenate([f[np.isfinite(f)] for f in frames.values()])
    lo, hi = np.percentile(vals, [1, 99.7])
    ims = []
    for f in frames.values():
        s = np.arcsinh((np.nan_to_num(f, nan=lo) - lo) / (hi - lo) * 10) / np.arcsinh(10)
        im = Image.fromarray((np.clip(s, 0, 1)[::-1] * 255).astype(np.uint8)).resize((npx * 6, npx * 6), Image.NEAREST)
        ims.append(im)
    ims[0].save(a.out, save_all=True, append_images=ims[1:], duration=500, loop=0)
    print(f"  saved {a.out} ({len(ims)} frames)")


if __name__ == "__main__":
    main()
