"""Turn raw SPHEREx cutouts into aligned, co-added frames on a common sky grid."""
from __future__ import annotations

import io
from functools import lru_cache

import numpy as np
from astropy.coordinates import SkyCoord
from astropy.io import fits
from astropy.wcs import WCS
from reproject import reproject_interp

from . import config


def make_grid(ra: float, dec: float, fov: float) -> tuple[WCS, int]:
    """North-up TAN grid centred on the target at native SPHEREx pixel scale."""
    npx = max(9, int(round(fov * 3600 / config.PIXEL_SCALE_ARCSEC)) | 1)  # odd -> target on a pixel centre
    w = WCS(naxis=2)
    w.wcs.ctype = ["RA---TAN", "DEC--TAN"]
    w.wcs.crval = [ra, dec]
    w.wcs.crpix = [(npx + 1) / 2, (npx + 1) / 2]
    s = config.PIXEL_SCALE_ARCSEC / 3600
    w.wcs.cdelt = [-s, s]
    return w, npx


def sip_header(hdr: fits.Header) -> fits.Header:
    hdr = hdr.copy()
    if "A_ORDER" in hdr and not str(hdr["CTYPE1"]).endswith("-SIP"):
        hdr["CTYPE1"] = str(hdr["CTYPE1"]) + "-SIP"
        hdr["CTYPE2"] = str(hdr["CTYPE2"]) + "-SIP"
    return hdr


@lru_cache(maxsize=4096)
def _header_from_str(s: str) -> fits.Header:
    return fits.Header.fromstring(s)


def wavelength_at(hdr_str: str, wave_hdu: fits.BinTableHDU, ra: float, dec: float) -> tuple[float, float]:
    """(lambda, bandwidth) in micron seen by this exposure at sky position (ra, dec)."""
    hdr = _header_from_str(hdr_str)
    x, y = WCS(sip_header(hdr)).world_to_pixel(SkyCoord(ra, dec, unit="deg"))
    hl = fits.HDUList([fits.PrimaryHDU(), fits.ImageHDU(header=hdr, name="IMAGE"), wave_hdu])
    sw = WCS(hdr, fobj=hl, key="W")
    sw.sip = None
    lam, bw = sw.pixel_to_world_values(float(x), float(y))
    return float(lam), float(bw)


def process_exposure(blob: bytes, grid: WCS, npx: int, wave_hdu, ra: float, dec: float) -> dict:
    with fits.open(io.BytesIO(blob)) as h:
        hdr = h["IMAGE"].header
        img = h["IMAGE"].data.astype(np.float32) - h["ZODI"].data.astype(np.float32)
        var = h["VARIANCE"].data.astype(np.float32)
        flg = h["FLAGS"].data.astype(np.int64)
    w = WCS(sip_header(hdr))
    bad = (flg & config.HARD_BAD_MASK) != 0
    img[bad] = np.nan
    var[bad] = np.nan
    shape = (npx, npx)
    rimg, _ = reproject_interp((img, w), grid, shape_out=shape, order="bilinear")
    rvar, _ = reproject_interp((var, w), grid, shape_out=shape, order="bilinear")
    rflg, _ = reproject_interp((flg.astype(np.float64), w), grid, shape_out=shape, order="nearest-neighbor")
    foot = np.isfinite(rflg)  # true sky coverage, including NaN'd saturated cores
    rflg = np.nan_to_num(rflg, nan=0).astype(np.int64)
    hdr_str = hdr.tostring()
    # wavelength (and its gradient across our grid) from ONE spectral-WCS build
    c = npx // 2
    d = 8.0
    gx = np.array([c, c + d, c], float)
    gy = np.array([c, c, c + d], float)
    sky = grid.pixel_to_world(gx, gy)
    cx, cy = w.world_to_pixel(sky)
    hl = fits.HDUList([fits.PrimaryHDU(), fits.ImageHDU(header=hdr, name="IMAGE"), wave_hdu])
    sw = WCS(hdr, fobj=hl, key="W")
    sw.sip = None
    lams, bws = sw.pixel_to_world_values(cx, cy)
    lam, bw = float(lams[0]), float(bws[0])
    return {
        "img": rimg.astype(np.float32),
        "var": rvar.astype(np.float32),
        "flags": rflg.astype(np.int32),
        "foot": foot,
        "lam": lam,
        "bw": bw,
        "dlam_dx": float((lams[1] - lams[0]) / d),
        "dlam_dy": float((lams[2] - lams[0]) / d),
        "hdr": hdr_str,
        "flag_center": int(np.bitwise_or.reduce(rflg[c - 1:c + 2, c - 1:c + 2].ravel())),
    }


def assign_epochs(mjds: list[float], gap: float = config.EPOCH_GAP_DAYS) -> list[int]:
    order = np.argsort(mjds)
    ep = [0] * len(mjds)
    cur = 0
    for k in range(1, len(order)):
        if mjds[order[k]] - mjds[order[k - 1]] > gap:
            cur += 1
        ep[order[k]] = cur
    return ep


def coadd(imgs: np.ndarray, vars_: np.ndarray, foots: np.ndarray) -> np.ndarray:
    """Inverse-variance weighted mean. Covered-but-NaN pixels (saturated cores) are filled bright."""
    w = np.where(np.isfinite(imgs) & np.isfinite(vars_) & (vars_ > 0), 1.0 / np.where(vars_ > 0, vars_, 1), 0.0)
    num = np.nansum(np.nan_to_num(imgs) * w, axis=0)
    den = w.sum(axis=0)
    with np.errstate(invalid="ignore", divide="ignore"):
        out = np.where(den > 0, num / den, np.nan).astype(np.float32)
    return fill_holes(out, foots.any(axis=0))


def fill_holes(img: np.ndarray, covered: np.ndarray, iters: int = 25) -> np.ndarray:
    """Fill covered-but-NaN pixels from their neighbours (max of 3x3), growing inwards.
    Saturated star cores (surrounded by bright pixels) become bright plateaus;
    isolated flagged pixels blend into the local background."""
    out = img.copy()
    for _ in range(iters):
        hole = covered & ~np.isfinite(out)
        if not hole.any():
            break
        pad = np.pad(out, 1, constant_values=np.nan)
        stack = np.stack([pad[dy:dy + out.shape[0], dx:dx + out.shape[1]] for dy in range(3) for dx in range(3)])
        with np.errstate(all="ignore"):
            import warnings
            with warnings.catch_warnings():
                warnings.simplefilter("ignore", RuntimeWarning)
                nb = np.nanmax(stack, axis=0)
        upd = hole & np.isfinite(nb)
        if not upd.any():
            break
        out[upd] = nb[upd]
    return out


def robust_norm(frame: np.ndarray) -> np.ndarray:
    v = frame[np.isfinite(frame)]
    if v.size < 10:
        return frame
    med = np.median(v)
    mad = np.median(np.abs(v - med)) * 1.4826 or 1.0
    return (frame - med) / mad


def epoch_frames(exps: list[dict], idx: list[int]) -> dict[str, np.ndarray]:
    """Co-add one epoch: one frame per detector + an S/N-normalised all-band 'detection' frame."""
    frames: dict[str, np.ndarray] = {}
    for det in range(1, 7):
        sel = [i for i in idx if exps[i]["det"] == det]
        if not sel:
            continue
        frames[f"D{det}"] = coadd(
            np.stack([exps[i]["img"] for i in sel]),
            np.stack([exps[i]["var"] for i in sel]),
            np.stack([exps[i]["foot"] for i in sel]),
        )
    if frames:
        frames["all"] = np.nanmean(np.stack([robust_norm(f) for f in frames.values()]), axis=0).astype(np.float32)
    return frames
