"""On-the-fly spectra, light curves and a simple molecular 'fingerprint' for any clicked position.

Every SPHEREx exposure sees a given sky position at a slightly different wavelength (the
linear-variable filters), so ~100 exposures per six-month survey = a 0.75-5 µm spectrum.
"""
from __future__ import annotations

import numpy as np
from astropy.io import fits

from . import config, process

H, C, K = 6.62607e-34, 2.99792458e8, 1.380649e-23

# Molecular feature windows (µm): (feature, continuum) — tune here.
MOLECULES = {
    "CH4": {"label": "Methane", "band": (3.20, 3.45), "cont": (3.85, 4.15),
            "note": "Deep in T and Y brown dwarfs; absent in stars."},
    "H2O": {"label": "Water", "band": (1.33, 1.48), "cont": (1.20, 1.30),
            "note": "Steam absorption in cool stars and brown dwarfs."},
    "CO2": {"label": "Carbon dioxide", "band": (4.22, 4.34), "cont": (4.00, 4.15),
            "note": "Seen in the coldest brown dwarfs, comets and interstellar ices."},
    "CO": {"label": "Carbon monoxide", "band": (4.55, 4.75), "cont": (4.00, 4.15),
           "note": "Absorbs in brown dwarfs; glows in some comets."},
}

_wave_cache: dict[int, fits.BinTableHDU] = {}


def wave_hdu(det: int) -> fits.BinTableHDU:
    if det not in _wave_cache:
        with fits.open(config.CACHE_DIR / "wave" / f"D{det}.fits") as h:
            hdu = h["WCS-WAVE"].copy()
            hdu.data = np.array(hdu.data)
        _wave_cache[det] = hdu
    return _wave_cache[det]


def aperture_flux(img, var, flags, px, py, r_ap=2.0, r_in=4.5, r_out=7.5):
    """Aperture photometry on a surface-brightness image (MJy/sr) -> flux in mJy."""
    ny, nx = img.shape
    yy, xx = np.mgrid[:ny, :nx]
    rr = np.hypot(xx - px, yy - py)
    ap = rr <= r_ap
    ann = (rr >= r_in) & (rr <= r_out) & np.isfinite(img)
    if ap.sum() == 0 or ann.sum() < 5:
        return np.nan, np.nan, True
    sat = bool(((flags[ap] & config.SATURATION_MASK) != 0).any() or (~np.isfinite(img[ap])).any())
    bkg = np.median(img[ann])
    vals = img[ap]
    good = np.isfinite(vals)
    if good.sum() < ap.sum() * 0.6:
        return np.nan, np.nan, True
    s = (vals[good] - bkg).sum() * ap.sum() / good.sum()
    v = np.nansum(var[ap]) + ap.sum() ** 2 * np.var(img[ann]) / ann.sum()
    to_mjy = config.PIXEL_SR * 1e9  # MJy/sr * sr -> MJy -> mJy
    return float(s * to_mjy), float(np.sqrt(max(v, 0)) * to_mjy), sat


def saturation_radius(imgs, px, py, rmax=20):
    """Smallest radius beyond which >=90% of pixels are usable in all exposures."""
    ny, nx = imgs[0].shape
    yy, xx = np.mgrid[:ny, :nx]
    rr = np.hypot(xx - px, yy - py)
    fin = np.mean([np.isfinite(im) for im in imgs], axis=0)
    for r in np.arange(2.6, rmax, 0.5):
        ring = (rr >= r) & (rr < r + 1.5)
        if ring.any() and fin[ring].mean() >= 0.92:
            return float(r)
    return float(rmax)


def wing_flux(img, px, py, r1=2.6, r2=5.0, b1=8.0, b2=11.0):
    """Light in the unsaturated PSF wings: a relative brightness measure for saturated stars."""
    ny, nx = img.shape
    yy, xx = np.mgrid[:ny, :nx]
    rr = np.hypot(xx - px, yy - py)
    ring = (rr >= r1) & (rr <= r2)
    ann = (rr >= b1) & (rr <= b2) & np.isfinite(img)
    v = img[ring]
    if ann.sum() < 5 or np.isfinite(v).mean() < 0.85:
        return np.nan
    return float((np.nanmean(v) - np.median(img[ann])) * ring.sum() * config.PIXEL_SR * 1e9)


def planck_fnu(lam_um, T):
    lam = np.asarray(lam_um) * 1e-6
    nu = C / lam
    x = np.clip(H * nu / (K * T), 1e-6, 700)
    return nu ** 3 / np.expm1(x)


def fit_temperature(lam, f, e):
    ok = np.isfinite(f) & np.isfinite(e) & (e > 0) & (f > 0)
    if ok.sum() < 8:
        return None
    lam, f, w = lam[ok], f[ok], 1 / e[ok] ** 2
    best = (np.inf, None, None)
    for T in np.geomspace(250, 30000, 260):
        m = planck_fnu(lam, T)
        a = (w * f * m).sum() / (w * m * m).sum()
        chi = (w * (f - a * m) ** 2).sum()
        if chi < best[0]:
            best = (chi, T, a)
    return float(best[1]), float(best[2])


def window_median(lam, f, lo, hi):
    m = (lam >= lo) & (lam <= hi) & np.isfinite(f)
    return (float(np.median(f[m])), int(m.sum())) if m.sum() >= 2 else (np.nan, int(m.sum()))


def fingerprint(lam, f, e):
    snr = np.nanmedian(np.abs(f) / e) if np.isfinite(e).any() else 0
    indices = {}
    for key, m in MOLECULES.items():
        fb, nb = window_median(lam, f, *m["band"])
        fc, nc = window_median(lam, f, *m["cont"])
        depth = 1 - fb / fc if np.isfinite(fb) and np.isfinite(fc) and fc > 0 else None
        indices[key] = {"label": m["label"], "depth": depth, "n": nb + nc, "band": m["band"], "cont": m["cont"], "note": m["note"]}
    fit = fit_temperature(lam, f, e)
    T = fit[0] if fit else None
    model = None
    if fit:
        g = np.geomspace(0.74, 5.02, 80)
        model = [{"lam": float(x), "flux": float(y)} for x, y in zip(g, fit[1] * planck_fnu(g, fit[0]))]
    peak = float(lam[np.nanargmax(f)]) if np.isfinite(f).any() else None

    ch4 = indices["CH4"]["depth"]
    if not np.isfinite(snr) or snr < 8:
        label, kind = "Faint: near SPHEREx's limit, so the fingerprint is uncertain. Try Stack mode.", "faint"
    elif ch4 is not None and ch4 > 0.45:
        label, kind = "Strong methane absorption: looks like a T or Y brown dwarf", "brown-dwarf"
    elif T is not None and T < 1400:
        label, kind = "Extremely red: a cold brown dwarf or a dust-shrouded object", "very-red"
    elif T is not None and T < 2400:
        label, kind = "Very cool: an L-type brown dwarf or late-M star", "cool"
    elif T is not None and T < 4200:
        label, kind = "Cool red star (M or K type)", "cool-star"
    elif T is not None:
        label, kind = "Star hotter than ~4000 K", "star"
    else:
        label, kind = "Spectrum doesn't look like a simple star", "unknown"
    return {"label": label, "kind": kind, "T_color": T, "model": model, "peak_um": peak, "snr": float(snr) if np.isfinite(snr) else None, "molecules": indices}


def variability(lam, f, ep, sat):
    """Compare surveys at matched wavelengths: median flux ratio of each epoch vs the mean."""
    ok = np.isfinite(f) & ~sat & (f > 0)
    if ok.sum() < 10 or len(set(ep[ok])) < 2:
        return None
    bins = np.geomspace(0.74, 5.02, 36)
    eps = sorted(set(ep[ok]))
    tab = np.full((len(eps), len(bins) - 1), np.nan)
    for i, e_ in enumerate(eps):
        for b in range(len(bins) - 1):
            m = ok & (ep == e_) & (lam >= bins[b]) & (lam < bins[b + 1])
            if m.any():
                tab[i, b] = np.median(f[m])
    ref = np.nanmean(tab, axis=0)
    with np.errstate(invalid="ignore", divide="ignore"):
        ratio = np.nanmedian(tab / ref, axis=1)
    ratio = [float(r) if np.isfinite(r) else None for r in ratio]
    vals = [r for r in ratio if r]
    amp = (max(vals) / min(vals) - 1) if len(vals) >= 2 else None
    return {"epochs": [int(e_) for e_ in eps], "relative": ratio, "amplitude": amp,
            "variable": bool(amp is not None and amp > 0.08)}


def spectrum(job, ra: float, dec: float) -> dict:
    grid, npx = process.make_grid(job.ra, job.dec, job.fov)
    from astropy.coordinates import SkyCoord
    px, py = grid.world_to_pixel(SkyCoord(ra, dec, unit="deg"))
    pts = []
    r_sat = None
    for e in job.exps:
        if "img" not in e:
            continue
        flux, err, sat = aperture_flux(e["img"], e["var"], e["flags"], float(px), float(py))
        wing = np.nan
        if sat:
            if r_sat is None:
                r_sat = saturation_radius([x["img"] for x in job.exps if "img" in x], float(px), float(py))
            wing = wing_flux(e["img"], float(px), float(py), r_sat, r_sat + 4, r_sat + 9, r_sat + 13)
        if e.get("dlam_dx") is not None:
            c = npx // 2
            lam = e["lam"] + e["dlam_dx"] * (float(px) - c) + e["dlam_dy"] * (float(py) - c)
            bw = e["bw"]
        else:
            lam, bw = process.wavelength_at(e["hdr"], wave_hdu(e["det"]), ra, dec)
        pts.append({"lam": lam, "bw": bw, "flux": flux, "err": err, "sat": sat, "wing": wing, "det": e["det"],
                    "mjd": e["mjd"], "epoch": e["epoch"]})
    pts = [p for p in pts if p["lam"] is not None and (np.isfinite(p["flux"]) or np.isfinite(p["wing"]))]
    lam = np.array([p["lam"] for p in pts])
    f = np.array([p["flux"] for p in pts])
    er = np.array([p["err"] for p in pts])
    sat = np.array([p["sat"] for p in pts], bool)
    ep = np.array([p["epoch"] for p in pts])
    use = ~sat & np.isfinite(f)
    fp = fingerprint(lam[use], f[use], er[use]) if use.sum() >= 8 else {
        "label": "Saturated: too bright for SPHEREx photometry", "kind": "saturated", "T_color": None,
        "peak_um": None, "snr": None, "molecules": {}}
    fp["n_saturated"] = int(sat.sum())
    var = variability(lam, f, ep, sat)
    if var is None and sat.sum() >= 10:
        wing = np.array([p["wing"] for p in pts])
        var = variability(lam, wing, ep, np.zeros(len(pts), bool))
        if var:
            var["method"] = "psf-wings"
            var["variable"] = bool(var["amplitude"] is not None and var["amplitude"] > 0.3)  # wings are approximate
            var["saturation_radius_arcsec"] = r_sat * config.PIXEL_SCALE_ARCSEC if r_sat else None
    elif var:
        var["method"] = "aperture"
    return {"ra": ra, "dec": dec, "points": pts, "fingerprint": fp, "variability": var,
            "units": {"lam": "µm", "flux": "mJy"}}


def _robust_sigma(a):
    v = a[np.isfinite(a)]
    if v.size < 10:
        return 1.0
    return float(np.median(np.abs(v - np.median(v))) * 1.4826) or 1.0


def molecule_frames(job, mol: str) -> dict:
    """'Molecule lens': per-pixel (scaled continuum - in-band) so ordinary stars cancel and
    molecule-absorbing objects (e.g. methane brown dwarfs) light up. Positive = absorption."""
    m = MOLECULES[mol]
    npx = job.npx
    c = npx // 2
    yy, xx = np.mgrid[:npx, :npx].astype(np.float32)
    n_ep = len(job.epochs)
    acc = {k: np.zeros((n_ep + 1, npx, npx), np.float64) for k in ("on", "won", "cont", "wcont")}
    counts = np.zeros((n_ep + 1, 2), int)
    for e in job.exps:
        if "img" not in e or e.get("lam") is None:
            continue
        lam = e["lam"] + (e.get("dlam_dx") or 0) * (xx - c) + (e.get("dlam_dy") or 0) * (yy - c)
        img, var = e["img"], e["var"]
        w = np.where(np.isfinite(img) & np.isfinite(var) & (var > 0), 1.0 / np.where(var > 0, var, 1), 0.0)
        val = np.nan_to_num(img)
        for key, (lo, hi) in (("on", m["band"]), ("cont", m["cont"])):
            sel = (lam >= lo) & (lam <= hi)
            if not sel.any():
                continue
            ww = w * sel
            for ep in (e["epoch"], n_ep):  # per-epoch and all-epoch accumulators
                acc[key][ep] += val * ww
                acc["w" + key][ep] += ww
            counts[e["epoch"], 0 if key == "on" else 1] += 1
            counts[n_ep, 0 if key == "on" else 1] += 1
    frames = []
    k_scale = None
    for ep in range(n_ep + 1):
        with np.errstate(invalid="ignore", divide="ignore"):
            on = np.where(acc["won"][ep] > 0, acc["on"][ep] / acc["won"][ep], np.nan)
            cont = np.where(acc["wcont"][ep] > 0, acc["cont"][ep] / acc["wcont"][ep], np.nan)
        if ep == n_ep or k_scale is None:
            # scale continuum so typical bright sources (stars) cancel: k = median(on/cont)
            s = _robust_sigma(cont)
            bright = np.isfinite(on) & np.isfinite(cont) & (cont - np.nanmedian(cont) > 8 * s)
            if bright.sum() >= 3:
                k_scale = float(np.median((on[bright] - np.nanmedian(on)) / (cont[bright] - np.nanmedian(cont))))
            k_scale = k_scale if (k_scale and np.isfinite(k_scale) and k_scale > 0) else 1.0
        lens = (k_scale * (cont - np.nanmedian(cont))) - (on - np.nanmedian(on))
        lens = lens / _robust_sigma(lens)
        frames.append({"epoch": ep if ep < n_ep else "all", "data": lens.astype(np.float32),
                       "n_on": int(counts[ep, 0]), "n_cont": int(counts[ep, 1])})
    return {"mol": mol, "label": m["label"], "band": m["band"], "cont": m["cont"], "note": m["note"],
            "k": k_scale, "frames": frames}
