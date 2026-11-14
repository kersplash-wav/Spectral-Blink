"""FastAPI entry point. Run: uvicorn backend.app.main:app --reload"""
from __future__ import annotations

import asyncio
import base64
import json
from contextlib import asynccontextmanager
from pathlib import Path

import httpx
import numpy as np
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles

from . import catalogs, config, detect, jobs, science


@asynccontextmanager
async def lifespan(app: FastAPI):
    limits = httpx.Limits(max_connections=40, max_keepalive_connections=20)
    app.state.http = httpx.AsyncClient(limits=limits, follow_redirects=True,
                                       headers={"User-Agent": "spherex-blinker/0.1 (NASA Space Apps)"})
    yield
    await app.state.http.aclose()


app = FastAPI(title="SPHEREx Blinker", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["GET"], allow_headers=["*"])


@app.get("/api/health")
async def health():
    return {"ok": True, "collections": config.COLLECTIONS}


@app.get("/api/resolve")
async def resolve(q: str = Query(..., min_length=1, max_length=200)):
    try:
        return await catalogs.resolve(app.state.http, q)
    except LookupError as e:
        raise HTTPException(404, str(e)) from e
    except Exception as e:  # noqa: BLE001
        raise HTTPException(502, f"Name resolver unavailable: {e}") from e


@app.get("/api/frames")
async def frames(ra: float = Query(..., ge=0, lt=360), dec: float = Query(..., ge=-90, le=90),
                 fov: float = Query(0.1, gt=0, le=1)):
    async def gen():
        try:
            async for msg in jobs.run_job(app.state.http, ra, dec, fov):
                yield json.dumps(msg, separators=(",", ":")) + "\n"
        except Exception as e:  # noqa: BLE001
            yield json.dumps({"type": "error", "msg": f"Pipeline error: {e}"}) + "\n"

    return StreamingResponse(gen(), media_type="application/x-ndjson",
                             headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"})


@app.get("/api/spectrum")
async def spectrum(job: str = Query(..., pattern=r"^[0-9a-f]{16}$"), ra: float = Query(...), dec: float = Query(...)):
    j = jobs.get_job(job)
    if j is None:
        raise HTTPException(404, "Field not loaded yet. Reload the target.")
    out = await asyncio.to_thread(science.spectrum, j, ra, dec)
    return JSONResponse(json.loads(json.dumps(out, default=_nan_safe).replace("NaN", "null")))


@app.get("/api/molecule")
async def molecule(job: str = Query(..., pattern=r"^[0-9a-f]{16}$"), mol: str = Query(..., pattern=r"^(CH4|H2O|CO2|CO)$")):
    j = jobs.get_job(job)
    if j is None:
        raise HTTPException(404, "Field not loaded yet. Reload the target.")
    out = await asyncio.to_thread(science.molecule_frames, j, mol)
    for f in out["frames"]:
        a = f.pop("data")
        f.update(w=a.shape[1], h=a.shape[0], data=base64.b64encode(np.ascontiguousarray(a, dtype="<f4").tobytes()).decode())
    return out


@app.get("/api/overlays")
async def overlays(job: str = Query(..., pattern=r"^[0-9a-f]{16}$")):
    j = jobs.get_job(job)
    if j is None:
        raise HTTPException(404, "Field not loaded yet. Reload the target.")
    radius = j.fov * 0.75 + 0.04  # margin: fast movers' 2016 positions can sit outside the field
    try:
        gaia = await catalogs.gaia_cone(app.state.http, j.ra, j.dec, radius)
        gaia_err = None
    except Exception as e:  # noqa: BLE001
        gaia, gaia_err = [], str(e)
    dets = await asyncio.to_thread(detect.detect, j, gaia)
    return {"gaia": gaia, "gaia_epoch": detect.GAIA_EPOCH, "gaia_error": gaia_err, "detections": dets,
            "n_gaia_dark": sum(1 for d in dets if d["gaia"] is None)}


def _nan_safe(o):
    if isinstance(o, (np.floating, np.integer)):
        return o.item()
    if isinstance(o, np.bool_):
        return bool(o)
    return str(o)


# ---- serve the built frontend (single-container deploy) ----
DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"
if DIST.exists():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")

    @app.get("/{path:path}")
    async def spa(path: str):
        f = DIST / path
        if path and f.is_file():
            return FileResponse(f)
        return FileResponse(DIST / "index.html")
