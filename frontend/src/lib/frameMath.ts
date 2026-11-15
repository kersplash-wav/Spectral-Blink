// All per-pixel image math lives on the client so every slider responds instantly.
import type { Cmap, StretchKind } from './types'

export function percentiles(arrs: Float32Array[], ps: number[]): number[] {
  const total = arrs.reduce((n, a) => n + a.length, 0)
  const step = Math.max(1, Math.floor(total / 60000))
  const vals: number[] = []
  let k = 0
  for (const a of arrs)
    for (let i = 0; i < a.length; i++, k++) if (k % step === 0 && Number.isFinite(a[i])) vals.push(a[i])
  if (!vals.length) return ps.map(() => 0)
  vals.sort((x, y) => x - y)
  return ps.map((p) => vals[Math.min(vals.length - 1, Math.max(0, Math.round((p / 100) * (vals.length - 1))))])
}

/** NaN-aware mean of several frames. */
export function meanOf(frames: Float32Array[]): Float32Array {
  const n = frames[0].length
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    let s = 0, c = 0
    for (const f of frames) if (Number.isFinite(f[i])) { s += f[i]; c++ }
    out[i] = c ? s / c : NaN
  }
  return out
}

export function subtract(a: Float32Array, b: Float32Array): Float32Array {
  const out = new Float32Array(a.length)
  for (let i = 0; i < a.length; i++) out[i] = a[i] - b[i]
  return out
}

// ---- colour maps -------------------------------------------------------
type Stop = [number, number, number, number]
const STOPS: Record<Cmap | 'diverge', Stop[]> = {
  grey: [[0, 0, 0, 0], [1, 255, 255, 255]],
  nebula: [[0, 4, 2, 16], [0.3, 52, 24, 120], [0.6, 150, 70, 205], [0.85, 235, 150, 235], [1, 252, 238, 255]],
  cobalt: [[0, 2, 4, 14], [0.35, 24, 52, 140], [0.7, 96, 176, 240], [1, 236, 248, 255]],
  diverge: [[0, 96, 165, 255], [0.45, 14, 18, 52], [0.5, 9, 8, 26], [0.55, 52, 16, 52], [1, 255, 120, 196]],
}
const LUTS = new Map<string, Uint8Array>()
export function lut(name: Cmap | 'diverge'): Uint8Array {
  let l = LUTS.get(name)
  if (l) return l
  l = new Uint8Array(256 * 3)
  const st = STOPS[name]
  for (let i = 0; i < 256; i++) {
    const t = i / 255
    let j = 0
    while (j < st.length - 2 && t > st[j + 1][0]) j++
    const [t0, r0, g0, b0] = st[j], [t1, r1, g1, b1] = st[j + 1]
    const u = (t - t0) / (t1 - t0 || 1)
    l[i * 3] = r0 + (r1 - r0) * u
    l[i * 3 + 1] = g0 + (g1 - g0) * u
    l[i * 3 + 2] = b0 + (b1 - b0) * u
  }
  LUTS.set(name, l)
  return l
}

function stretchFn(kind: StretchKind): (t: number) => number {
  if (kind === 'linear') return (t) => t
  if (kind === 'log') return (t) => Math.log10(1 + 999 * t) / 3
  const a = 12, n = Math.asinh(a)
  return (t) => Math.asinh(a * t) / n
}

/** Render a float frame to an RGBA canvas (rows flipped so north is up). NaN = no coverage. */
export function renderToCanvas(
  data: Float32Array, w: number, h: number, lo: number, hi: number,
  kind: StretchKind, cmap: Cmap | 'diverge', canvas?: HTMLCanvasElement,
): HTMLCanvasElement {
  const cv = canvas ?? document.createElement('canvas')
  cv.width = w
  cv.height = h
  const ctx = cv.getContext('2d')!
  const img = ctx.createImageData(w, h)
  const L = lut(cmap)
  const f = cmap === 'diverge' ? (t: number) => t : stretchFn(kind)
  const span = hi - lo || 1
  for (let y = 0; y < h; y++) {
    const src = (h - 1 - y) * w
    const dst = y * w * 4
    for (let x = 0; x < w; x++) {
      const v = data[src + x]
      const o = dst + x * 4
      if (!Number.isFinite(v)) {
        // hatched "no data"
        const c = ((x + y) & 3) === 0 ? 34 : 14
        img.data[o] = c; img.data[o + 1] = c; img.data[o + 2] = c + 6; img.data[o + 3] = 255
        continue
      }
      let t = (v - lo) / span
      t = t < 0 ? 0 : t > 1 ? 1 : t
      const k = Math.round(f(t) * 255) * 3
      img.data[o] = L[k]; img.data[o + 1] = L[k + 1]; img.data[o + 2] = L[k + 2]; img.data[o + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  return cv
}

/** Bilinear sample of a frame at fractional array coords (x right, y up). */
function sample(a: Float32Array, w: number, h: number, x: number, y: number): number {
  const x0 = Math.floor(x), y0 = Math.floor(y)
  if (x0 < 0 || y0 < 0 || x0 + 1 >= w || y0 + 1 >= h) return NaN
  const fx = x - x0, fy = y - y0
  const i = y0 * w + x0
  return a[i] * (1 - fx) * (1 - fy) + a[i + 1] * fx * (1 - fy) + a[i + w] * (1 - fx) * fy + a[i + w + 1] * fx * fy
}

/**
 * Shift-and-stack ("synthetic tracking"): move every survey back along a trial motion
 * and average. Objects moving at that rate sharpen; everything else blurs.
 * vx, vy in pixels per year; dt[i] = years since the reference date for frame i.
 */
export function shiftStack(frames: Float32Array[], w: number, h: number, dt: number[], vx: number, vy: number): Float32Array {
  const out = new Float32Array(w * h)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let s = 0, c = 0
      for (let k = 0; k < frames.length; k++) {
        const v = sample(frames[k], w, h, x + vx * dt[k], y + vy * dt[k])
        if (Number.isFinite(v)) { s += v; c++ }
      }
      out[y * w + x] = c ? s / c : NaN
    }
  return out
}
