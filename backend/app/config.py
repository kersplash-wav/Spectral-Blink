"""Central constants. Add new SPHEREx releases to COLLECTIONS as IRSA publishes them."""
import logging
import os
import warnings
from pathlib import Path

from astropy import log as astropy_log
from astropy.utils.exceptions import AstropyWarning

warnings.simplefilter("ignore", AstropyWarning)
astropy_log.setLevel("WARNING")
logging.getLogger("astropy").setLevel(logging.WARNING)

# New data release? Add its IRSA collection name here (newest last).
COLLECTIONS = [c.strip() for c in os.environ.get("SPHEREX_COLLECTIONS", "spherex_dr1,spherex_qr3").split(",") if c.strip()]

SIA_URL = "https://irsa.ipac.caltech.edu/SIA"
SESAME_URL = "https://cds.unistra.fr/cgi-bin/nph-sesame/-oxp/SNV"

PIXEL_SCALE_ARCSEC = 6.15
PIXEL_SR = (PIXEL_SCALE_ARCSEC / 206264.806) ** 2
EPOCH_GAP_DAYS = 30.0
# Positions of moving stars are propagated to this fixed date (roughly mid-mission) so caches stay stable.
REF_EPOCH_ISO = "2026-03-01"
MAX_FOV_DEG = 0.35
MIN_FOV_DEG = 0.02
FETCH_CONCURRENCY = int(os.environ.get("FETCH_CONCURRENCY", "10"))

CACHE_DIR = Path(os.environ.get("SPHEREX_CACHE", Path(__file__).resolve().parents[2] / "cache"))
for sub in ("cutouts", "wave", "jobs"):
    (CACHE_DIR / sub).mkdir(parents=True, exist_ok=True)

DETECTORS = {
    1: (0.75, 1.09), 2: (1.10, 1.62), 3: (1.63, 2.41),
    4: (2.42, 3.82), 5: (3.83, 4.41), 6: (4.42, 5.00),
}

# FLAGS bits (SPHEREx Explanatory Supplement)
FLAG_NAMES = {
    0: "TRANSIENT", 1: "OVERFLOW", 2: "SUR_ERROR", 6: "NONFUNC", 7: "DICHROIC", 9: "MISSING_DATA",
    10: "HOT", 11: "COLD", 12: "FULLSAMPLE", 14: "PHANMISS", 15: "NONLINEAR", 17: "PERSIST",
    19: "OUTLIER", 20: "CROSSTALK", 21: "SOURCE", 22: "GHOST", 23: "GHOST_FPA", 24: "GHOST_EXT",
    25: "STREAK", 26: "BLOOM", 27: "SNOWBALL", 28: "HALO",
}
# Pixels with these bits are unusable -> NaN before co-adding.
HARD_BAD_BITS = [0, 2, 6, 9, 10, 11, 19, 25, 27]
HARD_BAD_MASK = sum(1 << b for b in HARD_BAD_BITS)
# Saturation: value kept for display, but photometry is marked unreliable.
SATURATION_MASK = (1 << 1) | (1 << 15)
# Contamination worth showing to the user.
CONTAM_MASK = sum(1 << b for b in (17, 20, 22, 23, 24, 26, 28))
