"""A 'job' = every SPHEREx exposure of one patch of sky, aligned on a common grid.

`run_job` is an async generator yielding NDJSON-ready dicts so the UI can show
progress and start blinking before all data has arrived.
"""
from __future__ import annotations

import asyncio
import base64
import hashlib
import json
import logging
import time
from collections import OrderedDict

import httpx
import numpy as np

from . import config, process, spherex

log = logging.getLogger("jobs")


def job_id(ra: float, dec: float, fov: float) -> str:
    return hashlib.sha1(f"{round(ra, 6):.6f}|{round(dec, 6):.6f}|{fov:.3f}|{','.join(config.COLLECTIONS)}".encode()).hexdigest()[:16]


class Job:
    def __init__(self, jid, ra, dec, fov, npx, exps, epochs):
        self.id, self.ra, self.dec, self.fov, self.npx = jid, ra, dec, fov, npx
        self.exps = exps            # list of dicts (meta + arrays)
        self.epochs = epochs        # list of dicts
        self.frames: dict[tuple[int, str], np.ndarray] = {}

    # ---- persistence -------------------------------------------------
    def save(self):
        p = config.CACHE_DIR / "jobs" / self.id
        keep = [i for i, e in enumerate(self.exps) if "img" in e]
        np.savez_compressed(
            f"{p}.npz",
            img=np.stack([self.exps[i]["img"] for i in keep]),
            var=np.stack([self.exps[i]["var"] for i in keep]),
            flags=np.stack([self.exps[i]["flags"] for i in keep]),
            foot=np.stack([self.exps[i]["foot"] for i in keep]),
        )
        meta = {"ra": self.ra, "dec": self.dec, "fov": self.fov, "npx": self.npx, "epochs": self.epochs,
                "exps": [{k: v for k, v in self.exps[i].items() if k not in ("img", "var", "flags", "foot")} for i in keep]}
        (config.CACHE_DIR / "jobs" / f"{self.id}.json").write_text(json.dumps(meta))

    @classmethod
    def load(cls, jid: str) -> "Job | None":
        p = config.CACHE_DIR / "jobs" / jid
        if not (p.with_suffix(".json").exists() and p.with_suffix(".npz").exists()):
            return None
        meta = json.loads(p.with_suffix(".json").read_text())
        with np.load(p.with_suffix(".npz")) as z:
            arr = {k: z[k] for k in ("img", "var", "flags", "foot")}  # decompress each array once
        exps = meta["exps"]
        for i, e in enumerate(exps):
            e["img"], e["var"], e["flags"], e["foot"] = arr["img"][i], arr["var"][i], arr["flags"][i], arr["foot"][i]
        job = cls(jid, meta["ra"], meta["dec"], meta["fov"], meta["npx"], exps, meta["epochs"])
        job.build_all_frames()
        return job

    # ---- frames ------------------------------------------------------
    def build_epoch(self, ep: int) -> dict[str, np.ndarray]:
        idx = [i for i, e in enumerate(self.exps) if e["epoch"] == ep and "img" in e]
        fr = process.epoch_frames(self.exps, idx)
        for g, a in fr.items():
            self.frames[(ep, g)] = a
        return fr

    def build_all_frames(self):
        for ep in range(len(self.epochs)):
            self.build_epoch(ep)

    def manifest(self) -> dict:
        return {
            "type": "manifest", "job": self.id, "ra": self.ra, "dec": self.dec, "fov": self.fov, "npx": self.npx,
            "pixel_arcsec": config.PIXEL_SCALE_ARCSEC, "collections": config.COLLECTIONS,
            "epochs": self.epochs,
            "exposures": [{k: e.get(k) for k in ("id", "det", "mjd", "epoch", "lam", "bw", "flag_center", "collection")}
                          for e in self.exps],
        }

    def frame_msg(self, ep: int, group: str) -> dict:
        a = self.frames[(ep, group)]
        sel = [e for e in self.exps if e["epoch"] == ep and "img" in e and (group == "all" or f"D{e['det']}" == group)]
        lams = [e["lam"] for e in sel if e.get("lam") is not None]
        return {
            "type": "frame", "epoch": ep, "group": group, "w": a.shape[1], "h": a.shape[0],
            "nexp": len(sel), "lam": [min(lams), max(lams)] if lams else None,
            "data": base64.b64encode(np.ascontiguousarray(a, dtype="<f4").tobytes()).decode(),
        }


_JOBS: "OrderedDict[str, Job]" = OrderedDict()
_JOB_LOCKS: dict[str, asyncio.Lock] = {}


def get_job(jid: str) -> Job | None:
    if jid in _JOBS:
        _JOBS.move_to_end(jid)
        return _JOBS[jid]
    job = Job.load(jid)
    if job:
        _remember(job)
    return job


def _remember(job: Job):
    _JOBS[job.id] = job
    _JOBS.move_to_end(job.id)
    while len(_JOBS) > 12:
        _JOBS.popitem(last=False)


async def run_job(client: httpx.AsyncClient, ra: float, dec: float, fov: float):
    fov = round(float(np.clip(fov, config.MIN_FOV_DEG, config.MAX_FOV_DEG)), 3)
    ra, dec = round(ra, 6), round(dec, 6)  # canonical: identical keys whether called by the UI or scripts
    jid = job_id(ra, dec, fov)
    lock = _JOB_LOCKS.setdefault(jid, asyncio.Lock())
    async with lock:
        job = get_job(jid)
        if job:
            yield job.manifest()
            for ep in range(len(job.epochs)):
                for g in sorted({k[1] for k in job.frames if k[0] == ep}):
                    yield job.frame_msg(ep, g)
            yield {"type": "done", "cached": True}
            return

        t0 = time.time()
        yield {"type": "status", "msg": "Searching the SPHEREx archive…"}
        exps = await spherex.query_exposures(client, ra, dec)
        if not exps:
            yield {"type": "error", "msg": "SPHEREx hasn't observed this position yet (or IRSA is unreachable)."}
            return
        epochs_of = process.assign_epochs([e["mjd"] for e in exps])
        for e, ep in zip(exps, epochs_of):
            e["epoch"] = ep
        n_ep = max(epochs_of) + 1
        epochs = []
        for ep in range(n_ep):
            m = [e["mjd"] for e in exps if e["epoch"] == ep]
            epochs.append({"epoch": ep, "mjd_start": min(m), "mjd_end": max(m), "mjd_mid": float(np.median(m)), "n": len(m)})

        grid, npx = process.make_grid(ra, dec, fov)
        job = Job(jid, ra, dec, fov, npx, exps, epochs)
        yield job.manifest()

        # wavelength tables (one per detector, cached forever)
        waves = {}
        for det in sorted({e["det"] for e in exps}):
            sample = next(e for e in exps if e["det"] == det)
            waves[det] = await spherex.wave_table(client, det, sample["url"], ra, dec)

        size = min(1.0, fov * 1.45 + 0.01)
        sem = asyncio.Semaphore(config.FETCH_CONCURRENCY)
        q: asyncio.Queue = asyncio.Queue()

        async def work(i: int):
            e = exps[i]
            async with sem:
                try:
                    blob = await spherex.fetch_cutout(client, e["url"], ra, dec, size)
                    res = await asyncio.to_thread(process.process_exposure, blob, grid, npx, waves[e["det"]], ra, dec)
                    e.update(res)
                except Exception as ex:  # noqa: BLE001
                    log.warning("exposure %s failed: %s", e["id"], ex)
                    e["error"] = str(ex)
            await q.put(i)

        # Round-robin over (epoch, detector) so every epoch gets a little of every band early;
        # frames are re-sent at checkpoints and visibly sharpen as more exposures arrive.
        rank: dict[tuple[int, int], int] = {}
        order_key = {}
        for i, e in enumerate(exps):
            k = (e["epoch"], e["det"])
            rank[k] = rank.get(k, -1) + 1
            order_key[i] = (rank[k], e["epoch"], e["det"])
        tasks = [asyncio.create_task(work(i)) for i in sorted(range(len(exps)), key=order_key.get)]
        n = len(exps)
        checkpoints = sorted({min(n, max(6 * n_ep * 2, n // 10)), n // 4, n // 2, (3 * n) // 4, n} - {0})
        done = failed = 0
        try:
            while done < n:
                i = await q.get()
                done += 1
                failed += "error" in exps[i]
                if done % 4 == 0 or done == n:
                    yield {"type": "progress", "done": done, "total": n, "failed": failed}
                if done in checkpoints:
                    final = done == n
                    for ep in range(n_ep):
                        fr = await asyncio.to_thread(job.build_epoch, ep)
                        for g in sorted(fr):
                            msg = job.frame_msg(ep, g)
                            msg["partial"] = not final
                            yield msg
        finally:
            for t in tasks:
                t.cancel()

        # finalise exposure metadata (strip internal fields from manifest)
        job.exps = [e for e in exps if "img" in e]
        for e in job.exps:
            e.pop("url", None)
        _remember(job)
        await asyncio.to_thread(job.save)
        yield {"type": "manifest_update", "exposures": job.manifest()["exposures"]}
        yield {"type": "done", "cached": False, "seconds": round(time.time() - t0, 1), "failed": failed}
