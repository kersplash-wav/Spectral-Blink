import numpy as np

from backend.app import catalogs, jobs, process, science


def test_epochs_split_on_gaps():
    mjd = [100, 101, 130, 300, 305, 500]
    assert process.assign_epochs(mjd) == [0, 0, 0, 1, 1, 2]


def test_job_id_is_stable_across_rounding():
    # UI sends 6 decimals; scripts send full precision -> must hit the same cache entry
    assert jobs.job_id(round(331.09699524957153, 6), -56.80076, 0.1) == jobs.job_id(331.096995, -56.80076, 0.1)


def test_coadd_weights_and_fills_saturated_core():
    a = np.ones((3, 9, 9), np.float32)
    a[:, 4, 4] = np.nan  # saturated core in every exposure
    a[:, 3, 4] = 50
    v = np.ones_like(a)
    foot = np.ones_like(a, bool)
    out = process.coadd(a, v, foot)
    assert np.isfinite(out[4, 4]) and out[4, 4] == 50  # filled from bright neighbour
    assert np.isclose(out[0, 0], 1.0)


def test_isolated_hole_blends_into_background():
    img = np.zeros((7, 7), np.float32)
    img[3, 3] = np.nan
    out = process.fill_holes(img, np.ones_like(img, bool))
    assert out[3, 3] == 0


def test_parse_coords():
    c = catalogs.parse_coords("08h55m10.831s -7d14m42.53s")
    assert abs(c.ra.deg - 133.79513) < 1e-4 and abs(c.dec.deg + 7.24515) < 1e-4
    c = catalogs.parse_coords("269.45, 4.69")
    assert abs(c.ra.deg - 269.45) < 1e-9
    assert catalogs.parse_coords("Barnard's Star") is None


def test_blackbody_fit_recovers_temperature():
    lam = np.linspace(0.8, 5, 120)
    f = 3e-12 * science.planck_fnu(lam, 3000)
    T, _ = science.fit_temperature(lam, f, f * 0.02)
    assert 2700 < T < 3300


def test_aperture_photometry_point_source():
    img = np.zeros((31, 31), np.float32)
    img[15, 15] = 100
    var = np.full_like(img, 1e-4)
    flux, err, sat = science.aperture_flux(img, var, np.zeros((31, 31), np.int32), 15, 15)
    assert not sat and np.isclose(flux, 100 * science.config.PIXEL_SR * 1e9, rtol=1e-3)
