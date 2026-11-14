"""Find sources in the SPHEREx co-add and flag the ones Gaia can't see ('Gaia-dark')."""
from __future__ import annotations

import numpy as np
from astropy.time import Time
from scipy import ndimage

from . import config, process

GAIA_EPOCH = 2016.0


def gaia_at(gaia: list[dict], year: float) -> tuple[np.ndarray, np.ndarray]:
    ra = np.array([g["ra"] for g in gaia])
    dec = np.array([g["dec"] for g in gaia])
    pmra = np.array([g["pmra"] for g in gaia])
    pmdec = np.array([g["pmdec"] for g in gaia])
    dt = year - GAIA_EPOCH
    return ra + pmra * dt / 3.6e6 / np.cos(np.radians(dec)), dec + pmdec * dt / 3.6e6


def detect(job, gaia: list[dict], thresh: float = 6.0) -> list[dict]:
    frames = [job.frames.get((ep, "all")) for ep in range(len(job.epochs))]
    frames = [f for f in frames if f is not None]
    if not frames:
        return []
    img = np.nanmean(np.stack(frames), axis=0)
    img = process.robust_norm(img)
    npx = img.shape[0]
    mask = np.nan_to_num(img) > thresh
    e = 6  # ignore the noisier field edges
    mask[:e, :] = mask[-e:, :] = mask[:, :e] = mask[:, -e:] = False
    lab, n = ndimage.label(mask)
    if n == 0:
        return []
    idx = np.arange(1, n + 1)
    peaks = ndimage.maximum(np.nan_to_num(img), lab, idx)
    coms = ndimage.center_of_mass(np.clip(np.nan_to_num(img), 0, None), lab, idx)
    grid, _ = process.make_grid(job.ra, job.dec, job.fov)
    mid_year = Time(np.median([e["mjd_mid"] for e in job.epochs]), format="mjd").jyear
    gra, gdec = gaia_at(gaia, mid_year) if gaia else (np.array([]), np.array([]))
    out = []
    for (cy, cx), pk in zip(coms, peaks):
        sky = grid.pixel_to_world(cx, cy)
        ra, dec = float(sky.ra.deg), float(sky.dec.deg)
        sep = None
        gmatch = None
        if gra.size:
            d = np.hypot((gra - ra) * np.cos(np.radians(dec)), gdec - dec) * 3600
            j = int(np.argmin(d))
            sep = float(d[j])
            if sep < 1.6 * config.PIXEL_SCALE_ARCSEC:
                gmatch = gaia[j]["id"]
        out.append({"ra": ra, "dec": dec, "px": float(cx), "py": float(cy), "snr": float(pk),
                    "gaia": gmatch, "sep": sep})
    out.sort(key=lambda d: -d["snr"])
    return out
