import { useEffect, useMemo } from 'react'
import { frameKey, useStore } from '../state/store'
import { meanOf, percentiles, renderToCanvas, shiftStack, subtract } from '../lib/frameMath'
import type { Frame, MolData } from '../lib/types'
import { fetchMolecule, fetchOverlays } from '../api/stream'

export interface Rendered {
  canvases: (HTMLCanvasElement | null)[] // one per epoch (null = not loaded yet)
  frames: (Frame | null)[]
  values: (Float32Array | null)[] // what is displayed (raw, difference, lens or stack)
  lo: number
  hi: number
  note: string | null // explains an empty / special view
}

export const REF_MJD = 61100 // 2026-03-01: positions of moving stars are referred to this date

/** Fetch molecule-lens data when that mode is active and the field has finished loading. */
export function useMoleculeLoader() {
  const mode = useStore((s) => s.mode)
  const mol = useStore((s) => s.mol)
  const job = useStore((s) => s.manifest?.job)
  const loading = useStore((s) => s.loading)
  useEffect(() => {
    if (mode === 'molecule' && job && !loading) fetchMolecule(job, mol)
  }, [mode, mol, job, loading])
  useEffect(() => {
    if (job && !loading) fetchOverlays(job)
  }, [job, loading])
}

/** Stretch + colour-map every epoch of the current view with shared limits so blinking is fair. */
export function useRendered(): Rendered {
  const framesVersion = useStore((s) => s.framesVersion)
  const manifest = useStore((s) => s.manifest)
  const band = useStore((s) => s.band)
  const mode = useStore((s) => s.mode)
  const stretch = useStore((s) => s.stretch)
  const contrast = useStore((s) => s.contrast)
  const black = useStore((s) => s.black)
  const cmap = useStore((s) => s.cmap)
  const mol = useStore((s) => s.mol)
  const molEntry = useStore((s) => (s.manifest ? s.molData[`${s.manifest.job}|${s.mol}`] : undefined))
  const molPerSurvey = useStore((s) => s.molPerSurvey)
  const stackPm = useStore((s) => s.stackPm)
  const nEp = manifest?.epochs.length ?? 0

  return useMemo(() => {
    const empty = (note: string | null): Rendered => ({ canvases: Array(nEp).fill(null), frames: Array(nEp).fill(null), values: Array(nEp).fill(null), lo: 0, hi: 1, note })
    const all = useStore.getState().frames
    const base: (Frame | null)[] = Array.from({ length: nEp }, (_, e) => all[frameKey(e, band)] ?? null)
    const have = base.filter((f): f is Frame => !!f)

    // ---------- molecule lens ----------
    if (mode === 'molecule') {
      if (!molEntry || molEntry === 'loading') return empty(useStore.getState().loading ? 'The molecule lens needs every exposure. Waiting for the download to finish…' : 'Building the molecule lens…')
      if (molEntry === 'error') return empty('The molecule lens could not be computed for this field.')
      const md = molEntry as MolData
      const comb = md.frames.find((f) => f.epoch === 'all')!
      const frames: (Frame | null)[] = Array.from({ length: nEp }, (_, e) => {
        const f = molPerSurvey ? md.frames.find((x) => x.epoch === e) : comb
        if (!f || !f.n_on || !f.n_cont) return null
        return { epoch: e, group: band, w: f.w, h: f.h, nexp: f.n_on + f.n_cont, lam: md.band, data: f.data, partial: false }
      })
      const vals = frames.map((f) => f?.data ?? null)
      const ok = vals.filter((v): v is Float32Array => !!v)
      if (!ok.length) return { ...empty(`No exposures landed in the ${md.label} band (${md.band[0]}–${md.band[1]} µm) here.`) }
      const [p1, p2] = percentiles(ok, [100 - contrast, contrast])
      const lim = Math.max(Math.abs(p1), Math.abs(p2), 3)
      const canvases = frames.map((f) => (f ? renderToCanvas(f.data, f.w, f.h, -lim, lim, 'linear', 'diverge') : null))
      return { canvases, frames, values: vals, lo: -lim, hi: lim, note: null }
    }

    if (!have.length) return empty(null)

    // ---------- shift-and-stack ----------
    if (mode === 'stack' && manifest) {
      const idx = base.map((f, i) => (f ? i : -1)).filter((i) => i >= 0)
      const dt = idx.map((i) => (manifest.epochs[i].mjd_mid - REF_MJD) / 365.25)
      const s = manifest.pixel_arcsec
      const f0 = base[idx[0]]!
      const stacked = shiftStack(idx.map((i) => base[i]!.data), f0.w, f0.h, dt, -stackPm.ra / s, stackPm.dec / s)
      const [lo, hi] = percentiles([stacked], [black, contrast])
      const cv = renderToCanvas(stacked, f0.w, f0.h, lo, hi, stretch, cmap)
      const nexp = have.reduce((n, f) => n + f.nexp, 0)
      const frames = base.map((f) => (f ? { ...f, nexp, data: stacked } : null))
      return { canvases: base.map((f) => (f ? cv : null)), frames, values: base.map((f) => (f ? stacked : null)), lo, hi, note: null }
    }

    // ---------- blink / difference ----------
    let values: (Float32Array | null)[]
    let lo: number, hi: number
    const diff = mode === 'diff' && have.length > 1
    if (diff) {
      values = base.map((f) => (f ? subtract(f.data, meanOf(have.filter((o) => o !== f).map((o) => o.data))) : null))
      const [p1, p2] = percentiles(values.filter((v): v is Float32Array => !!v), [100 - contrast, contrast])
      const lim = Math.max(Math.abs(p1), Math.abs(p2)) || 1
      lo = -lim; hi = lim
    } else {
      values = base.map((f) => f?.data ?? null)
      ;[lo, hi] = percentiles(have.map((f) => f.data), [black, contrast])
    }
    const canvases = base.map((f, i) => (f && values[i] ? renderToCanvas(values[i]!, f.w, f.h, lo, hi, stretch, diff ? 'diverge' : cmap) : null))
    return { canvases, frames: base, values, lo, hi, note: null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [framesVersion, nEp, band, mode, stretch, contrast, black, cmap, mol, molEntry, molPerSurvey, stackPm.ra, stackPm.dec, manifest?.job])
}
