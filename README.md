# Spectral Blink

**Watch the infrared sky change with NASA's SPHEREx.**
NASA Space Apps Challenge 2026: *Planet X and SPHEREx*.

Enter any sky position (or a name like `WISE 0855`). Spectral Blink pulls every SPHEREx exposure of that patch from NASA/IRSA, aligns them, and plays the sky surveys as a smooth "blink" animation: **moving things jump, and changing things pulse.** Because SPHEREx sees 102 infrared colours, it also measures a **spectrum** for anything you click and can show where **molecules** are.

## What it does
| Feature | Why it matters |
|---|---|
| **Blink** each six-month all-sky survey (per detector or all bands combined) | Spot nearby stars, brown dwarfs and variable stars |
| **Difference** mode (each survey minus the others) | Steady stars cancel; movers become blue/amber pairs |
| **Molecule lens** (CH₄, H₂O, CO₂, CO) | Compares light in vs. out of a molecular band: ordinary stars vanish, methane brown dwarfs glow |
| **Shift-and-stack** along any motion | Reveals objects too faint to see in one survey (e.g. WISE 0855) |
| **Click → spectrum** (0.75–5 µm) built on the fly from ~100–450 exposures, with a molecular **fingerprint** and blackbody fit | ε Indi B is automatically labelled "strong methane: T/Y brown dwarf" |
| **Brightness tab** compares surveys at matched wavelengths (with a PSF-halo method for saturated stars) | RW Aur (+46 %) and R Dra (Mira, ~73 %) flagged as variable; Barnard's Star steady |
| **Gaia DR3 overlay** with positions moved to each survey date; fast movers drawn with their track | Validate motion; **"Not in Gaia"** flags red/cold candidates Gaia can't see |
| Proper-motion-aware search | Catalogue positions are moved to now. Barnard's Star has moved 4.5′ since J2000 |
| Shareable / embeddable URLs | `?target=eps%20Ind%20B&mode=molecule&mol=CH4`, add `&embed=1` for iframes |
| Keyboard-driven, progressive loading | Frames stream in and sharpen; first blink in ~10 s on a cold field, instant when cached |

## Validation on the challenge targets
- **Barnard's Star**: measured shift of about 10″ north over ~1 year in D6 (Gaia: 10.4″/yr).
- **ε Indi B**: CH₄ absorption 82 % deep and a 4 µm peak, the classic T-dwarf spectrum; 2000σ in the methane lens.
- **WISE 0855**: at SPHEREx's single-survey limit (~6σ in D6). Stacking surveys helps.
- **RW Aurigae**: +46 % between surveys. **R Draconis**: ~73 % swing (Mira pulsation), via PSF-halo photometry.

## Run it
```bash
# backend
python3 -m venv .venv && .venv/bin/pip install -r backend/requirements.txt
.venv/bin/uvicorn backend.app.main:app --port 8000
# frontend (dev)
cd frontend && npm install && npm run dev        # http://localhost:5173
# or everything in one container
docker build -t spectral-blink . && docker run -p 8000:8000 spectral-blink   # http://localhost:8000
```
Warm the cache for the demo targets: `python -I scripts/precompute.py`.

## New SPHEREx data
Releases are queried live from IRSA. When a new release appears, add its collection name:
`SPHEREX_COLLECTIONS=spherex_dr1,spherex_qr3,spherex_qr4` (env var, or `backend/app/config.py`). Nothing else changes.

## How it works
```
Browser (React)                                 FastAPI backend
  stretch, colour, diff, stack (all client-side)   IRSA SIA query → exposure list
  NDJSON stream reader → frames sharpen live       stream cutouts, stop before 4 MB PSF table (~100 KB each)
  canvas viewer, Gaia overlay, spectrum charts     reproject → common grid, flag-mask, inverse-variance co-add
                                                   λ per pixel from the WCS-WAVE table (+ gradient)
                                                   aperture / PSF-halo photometry, molecule indices
```
API: `/api/resolve`, `/api/frames` (NDJSON stream), `/api/spectrum`, `/api/molecule`, `/api/overlays`.

See [REFERENCES.md](REFERENCES.md) for data and library credits.
