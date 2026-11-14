"""Warm the cache for the five Space Apps test targets (so the demo is instant).

Usage: python -I scripts/precompute.py [--fov 0.1] [--force]
"""
import argparse
import asyncio
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import httpx  # noqa: E402

from backend.app import catalogs, config, jobs  # noqa: E402

TARGETS = ["Barnard's Star", "WISE J085510.83-071442.5", "eps Ind B", "RW Aur", "R Dra"]


async def main(fov: float, force: bool):
    async with httpx.AsyncClient(follow_redirects=True, limits=httpx.Limits(max_connections=40)) as c:
        for name in TARGETS:
            t = await catalogs.resolve(c, name)
            jid = jobs.job_id(t["ra"], t["dec"], fov)
            if force:
                for ext in (".json", ".npz"):
                    (config.CACHE_DIR / "jobs" / f"{jid}{ext}").unlink(missing_ok=True)
            t0 = time.time()
            last = {}
            async for m in jobs.run_job(c, t["ra"], t["dec"], fov):
                if m["type"] in ("done", "error"):
                    last = m
            print(f"{name:28s} job={jid} {time.time() - t0:6.1f}s {last}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--fov", type=float, default=0.1)
    ap.add_argument("--force", action="store_true")
    a = ap.parse_args()
    asyncio.run(main(a.fov, a.force))
