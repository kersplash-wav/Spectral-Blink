import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { useStore } from '../state/store'
import { REF_MJD, useRendered } from './useRendered'
import { fmtDec, fmtRA, pixToWorld, worldToPix, type Grid } from '../lib/wcs'
import { fmtRange } from '../lib/format'
import { GROUPS, MOLECULES } from '../lib/types'
import { LoadingRadar } from './LoadingRadar'

interface Hover { sx: number; sy: number; ra: number; dec: number; v: number | null }

export function SkyCanvas() {
  const wrapRef = useRef<HTMLDivElement>(null)
  const cvRef = useRef<HTMLCanvasElement>(null)
  const rendered = useRendered()
  const rRef = useRef(rendered)
  rRef.current = rendered
  const view = useRef({ zoom: 1, ox: 0, oy: 0 })
  const size = useRef({ w: 0, h: 0, dpr: 1 })
  const [hover, setHover] = useState<Hover | null>(null)

  const manifest = useStore((s) => s.manifest)
  const band = useStore((s) => s.band)
  const mode = useStore((s) => s.mode)
  const frameIdx = useStore((s) => s.frameIdx)
  const loading = useStore((s) => s.loading)
  const progress = useStore((s) => s.progress)
  const mol = useStore((s) => s.mol)
  const molPerSurvey = useStore((s) => s.molPerSurvey)
  const stackPm = useStore((s) => s.stackPm)

  const grid: Grid | null = manifest ? { ra0: manifest.ra, dec0: manifest.dec, npx: manifest.npx, scaleDeg: manifest.pixel_arcsec / 3600 } : null
  const gridRef = useRef(grid)
  gridRef.current = grid

  // reset zoom when the field changes
  useEffect(() => { view.current = { zoom: 1, ox: 0, oy: 0 } }, [manifest?.job])

  // keep canvas sized to its container (crisp on HiDPI)
  useEffect(() => {
    const el = wrapRef.current!
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      size.current = { w: r.width, h: r.height, dpr }
      const cv = cvRef.current!
      cv.width = Math.round(r.width * dpr)
      cv.height = Math.round(r.height * dpr)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // geometry helpers
  const layout = () => {
    const g = gridRef.current
    const { w, h } = size.current
    if (!g) return null
    const scale = (Math.min(w, h) * 0.92 / g.npx) * view.current.zoom
    const x0 = w / 2 - (g.npx * scale) / 2 + view.current.ox
    const y0 = h / 2 - (g.npx * scale) / 2 + view.current.oy
    return { g, scale, x0, y0 }
  }
  const screenToGrid = (sx: number, sy: number) => {
    const L = layout()
    if (!L) return null
    const col = (sx - L.x0) / L.scale, row = (sy - L.y0) / L.scale
    return { px: col - 0.5, py: L.g.npx - 0.5 - row, L }
  }

  // render + playback loop
  useEffect(() => {
    let raf = 0
    let lastSwitch = performance.now()
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop)
      const st = useStore.getState()
      const R = rRef.current
      const avail = R.canvases.map((c, i) => (c ? i : -1)).filter((i) => i >= 0)
      const interval = 1000 / st.fps
      let cur = st.frameIdx
      if (!avail.includes(cur) && avail.length) {
        cur = avail[0]
        st.set({ frameIdx: cur })
      }
      let mix = 0
      let next = cur
      if (st.playing && avail.length > 1) {
        const el = now - lastSwitch
        const pos = avail.indexOf(cur)
        next = avail[(pos + 1) % avail.length]
        if (el >= interval) {
          lastSwitch = now
          st.set({ frameIdx: next })
          cur = next
          next = avail[(avail.indexOf(cur) + 1) % avail.length]
        } else if (st.crossfade) {
          mix = Math.max(0, (el - interval * 0.45) / (interval * 0.55))
        }
      } else {
        lastSwitch = now
      }
      draw(cur, next, mix)
    }
    const draw = (cur: number, next: number, mix: number) => {
      const cv = cvRef.current
      if (!cv) return
      const ctx = cv.getContext('2d')!
      const { dpr } = size.current
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, cv.width, cv.height)
      const L = layout()
      const R = rRef.current
      const img = R.canvases[cur]
      if (!L || !img) return
      const S = L.g.npx * L.scale
      ctx.imageSmoothingEnabled = false
      ctx.drawImage(img, L.x0, L.y0, S, S)
      const nimg = R.canvases[next]
      if (mix > 0 && nimg) {
        ctx.globalAlpha = Math.min(1, mix)
        ctx.drawImage(nimg, L.x0, L.y0, S, S)
        ctx.globalAlpha = 1
      }
      // frame border
      ctx.strokeStyle = 'rgba(255,255,255,0.08)'
      ctx.lineWidth = 1
      ctx.strokeRect(L.x0 - 0.5, L.y0 - 0.5, S + 1, S + 1)
      // target reticle (centre of the grid)
      const cx = L.x0 + S / 2, cy = L.y0 + S / 2
      const rr = Math.max(10, L.scale * 2.6)
      ctx.strokeStyle = 'rgba(255,181,71,0.9)'
      ctx.lineWidth = 1.5
      for (let k = 0; k < 4; k++) {
        const a = (k * Math.PI) / 2 + Math.PI / 4
        ctx.beginPath()
        ctx.arc(cx, cy, rr, a - 0.45, a + 0.45)
        ctx.stroke()
      }
      // catalogue overlays (positions propagated to the date of the frame on screen)
      const st2 = useStore.getState()
      const ov = st2.manifest ? st2.overlays[st2.manifest.job] : undefined
      if (ov && typeof ov === 'object') {
        const combined = st2.mode === 'stack' || (st2.mode === 'molecule' && !st2.molPerSurvey)
        const mjd = combined || !st2.manifest!.epochs[cur] ? REF_MJD : st2.manifest!.epochs[cur].mjd_mid
        const yrs = (mjd - 57388.5) / 365.25 // years since Gaia epoch 2016.0
        const toScreen = (ra: number, dec: number) => {
          const p = worldToPix(L.g, ra, dec)
          return [L.x0 + (p.px + 0.5) * L.scale, L.y0 + (L.g.npx - 0.5 - p.py) * L.scale] as const
        }
        if (st2.showGaia) {
          const eps = st2.manifest!.epochs
          const at = (g: { ra: number; dec: number; pmra: number; pmdec: number }, y: number) =>
            toScreen(g.ra + (g.pmra * y) / 3.6e6 / Math.cos((g.dec * Math.PI) / 180), g.dec + (g.pmdec * y) / 3.6e6)
          const inView = (x: number, y: number) => x >= L.x0 && y >= L.y0 && x <= L.x0 + S && y <= L.y0 + S
          const vis = ov.gaia.map((g) => ({ g, p: at(g, yrs) })).filter((o) => inView(o.p[0], o.p[1]))
          vis.sort((a, b) => a.g.g - b.g.g)
          ctx.lineWidth = 1
          for (const { g, p } of vis.slice(0, 80)) {
            const fast = Math.hypot(g.pmra, g.pmdec) > 150
            if (fast) continue
            ctx.strokeStyle = 'rgba(110,231,249,0.5)'
            const r = Math.max(4, Math.min(L.scale * 2.2, L.scale * (0.9 + Math.max(0, 16 - g.g) * 0.14)))
            ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, Math.PI * 2); ctx.stroke()
          }
          // fast movers: track through every survey + current position
          for (const { g, p } of vis.filter((o) => Math.hypot(o.g.pmra, o.g.pmdec) > 150)) {
            const pts = eps.map((e) => at(g, (e.mjd_mid - 57388.5) / 365.25))
            ctx.strokeStyle = 'rgba(255,181,71,0.85)'
            ctx.fillStyle = 'rgba(255,181,71,0.95)'
            ctx.lineWidth = 1.5
            ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke()
            for (const [x, y] of pts) { ctx.beginPath(); ctx.arc(x, y, 2.2, 0, Math.PI * 2); ctx.fill() }
            const r = Math.max(9, L.scale * 3.2)
            ctx.setLineDash([4, 3])
            ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, Math.PI * 2); ctx.stroke()
            ctx.setLineDash([])
            ctx.font = '600 10.5px "JetBrains Mono", monospace'
            ctx.fillText(`${(Math.hypot(g.pmra, g.pmdec) / 1000).toFixed(1)}″/yr`, p[0] + r + 4, p[1] - r + 6)
          }
        }
        if (st2.showDark) {
          ctx.strokeStyle = 'rgba(255,107,129,0.95)'
          ctx.fillStyle = 'rgba(255,107,129,0.95)'
          ctx.lineWidth = 1.5
          for (const d of ov.detections) {
            if (d.gaia) continue
            const x = L.x0 + (d.px + 0.5) * L.scale, y = L.y0 + (L.g.npx - 0.5 - d.py) * L.scale
            const r = Math.max(7, L.scale * 2.2)
            ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y); ctx.closePath(); ctx.stroke()
            ctx.font = '600 10px "JetBrains Mono", monospace'
            ctx.fillText('?', x + r + 2, y - r + 4)
          }
        }
      }
      // picked point
      const pick = useStore.getState().pick
      if (pick) {
        const px = L.x0 + (pick.px + 0.5) * L.scale, py = L.y0 + (L.g.npx - 0.5 - pick.py) * L.scale
        ctx.strokeStyle = 'rgba(110,231,249,0.95)'
        ctx.lineWidth = 1.5
        ctx.beginPath(); ctx.arc(px, py, Math.max(7, L.scale * 1.6), 0, Math.PI * 2); ctx.stroke()
        ctx.beginPath(); ctx.moveTo(px - rr * 1.4, py); ctx.lineTo(px - rr * 0.8, py); ctx.moveTo(px + rr * 0.8, py); ctx.lineTo(px + rr * 1.4, py); ctx.stroke()
      }
      // scale bar (1 arcmin)
      const arcminPx = (60 / (L.g.scaleDeg * 3600)) * L.scale
      const bx = 20, by = size.current.h - 22
      ctx.strokeStyle = 'rgba(231,234,241,0.85)'
      ctx.lineWidth = 2
      ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + arcminPx, by); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(bx, by - 4); ctx.lineTo(bx, by + 4); ctx.moveTo(bx + arcminPx, by - 4); ctx.lineTo(bx + arcminPx, by + 4); ctx.stroke()
      ctx.fillStyle = 'rgba(231,234,241,0.85)'
      ctx.font = '500 11px "JetBrains Mono", monospace'
      ctx.fillText('1′', bx + arcminPx / 2 - 4, by - 8)
      // compass
      const qx = size.current.w - 34, qy = 40
      ctx.strokeStyle = 'rgba(231,234,241,0.7)'
      ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.moveTo(qx, qy); ctx.lineTo(qx, qy - 20); ctx.moveTo(qx, qy); ctx.lineTo(qx - 20, qy); ctx.stroke()
      ctx.fillStyle = 'rgba(231,234,241,0.8)'
      ctx.fillText('N', qx - 4, qy - 25)
      ctx.fillText('E', qx - 33, qy + 4)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---- interaction: wheel zoom, drag pan, click pick, double-click reset ----
  const drag = useRef<{ x: number; y: number; ox: number; oy: number; moved: number } | null>(null)
  const onWheel = (e: React.WheelEvent) => {
    const r = wrapRef.current!.getBoundingClientRect()
    const sx = e.clientX - r.left, sy = e.clientY - r.top
    const v = view.current
    const nz = Math.min(24, Math.max(0.5, v.zoom * Math.exp(-e.deltaY * 0.0015)))
    const k = nz / v.zoom
    const { w, h } = size.current
    // keep the point under the cursor fixed
    v.ox = (sx - w / 2) - (sx - w / 2 - v.ox) * k
    v.oy = (sy - h / 2) - (sy - h / 2 - v.oy) * k
    v.zoom = nz
  }
  const onDown = (e: React.PointerEvent) => {
    ;(e.target as Element).setPointerCapture(e.pointerId)
    drag.current = { x: e.clientX, y: e.clientY, ox: view.current.ox, oy: view.current.oy, moved: 0 }
  }
  const onMove = (e: React.PointerEvent) => {
    const r = wrapRef.current!.getBoundingClientRect()
    const sx = e.clientX - r.left, sy = e.clientY - r.top
    const d = drag.current
    if (d) {
      d.moved = Math.max(d.moved, Math.hypot(e.clientX - d.x, e.clientY - d.y))
      view.current.ox = d.ox + e.clientX - d.x
      view.current.oy = d.oy + e.clientY - d.y
    }
    const q = screenToGrid(sx, sy)
    if (!q) return setHover(null)
    const n = q.L.g.npx
    if (q.px < -0.5 || q.py < -0.5 || q.px > n - 0.5 || q.py > n - 0.5) return setHover(null)
    const { ra, dec } = pixToWorld(q.L.g, q.px, q.py)
    const vals = rRef.current.values[useStore.getState().frameIdx]
    const i = Math.round(q.py) * n + Math.round(q.px)
    setHover({ sx, sy, ra, dec, v: vals ? vals[i] : null })
  }
  const onUp = (e: React.PointerEvent) => {
    const d = drag.current
    drag.current = null
    if (d && d.moved < 4) {
      const r = wrapRef.current!.getBoundingClientRect()
      const q = screenToGrid(e.clientX - r.left, e.clientY - r.top)
      if (!q) return
      const n = q.L.g.npx
      if (q.px < 0 || q.py < 0 || q.px > n - 1 || q.py > n - 1) return
      const { ra, dec } = pixToWorld(q.L.g, q.px, q.py)
      useStore.getState().set({ pick: { px: q.px, py: q.py, ra, dec }, inspectorOpen: true })
    }
  }

  const f = rendered.frames[frameIdx]
  const ep = manifest?.epochs[frameIdx]
  const g = GROUPS.find((x) => x.id === band)!
  const hasAny = rendered.canvases.some(Boolean)

  return (
    <div ref={wrapRef} className="relative h-full w-full overflow-hidden select-none"
      style={{ background: 'radial-gradient(ellipse at center, #0b1020 0%, #05070c 70%)', cursor: drag.current ? 'grabbing' : 'crosshair' }}
      onWheel={onWheel} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={() => setHover(null)}
      onDoubleClick={() => { view.current = { zoom: 1, ox: 0, oy: 0 } }}>
      <canvas ref={cvRef} className="absolute inset-0 h-full w-full" />

      <AnimatePresence>
        {!hasAny && (!rendered.note || !manifest) && <LoadingRadar key="radar" />}
        {!hasAny && rendered.note && manifest && (
          <motion.div key="note" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 grid place-items-center">
            <div className="max-w-xs rounded-xl border border-line bg-panel/80 px-5 py-4 text-center text-[13px] text-muted backdrop-blur">
              {(loading || rendered.note.startsWith('Building')) && <div className="mx-auto mb-3 h-6 w-6 animate-spin rounded-full border-2 border-line-2 border-t-amber" />}
              {rendered.note}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {hasAny && ep && (
        <div className="pointer-events-none absolute left-4 top-4 flex flex-col gap-1.5">
          <motion.div key={`${frameIdx}`} initial={{ opacity: 0.4, y: -2 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}
            className="rounded-lg border border-line bg-panel/80 px-3 py-2 backdrop-blur-md">
            <div className="font-display text-[15px] font-semibold tracking-tight">
              {mode === 'stack' ? <>All {manifest?.epochs.length} surveys stacked</>
                : mode === 'molecule' && !molPerSurvey ? <>{MOLECULES.find((m) => m.id === mol)?.sub} lens<span className="text-muted"> · all surveys</span></>
                : <>Survey {frameIdx + 1}<span className="text-muted"> · {fmtRange(ep.mjd_start, ep.mjd_end)}</span></>}
            </div>
            <div className="mt-0.5 flex items-center gap-2 font-mono text-[11px] text-muted">
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: g.color }} />
              {mode === 'molecule' ? `${f?.lam ? `${f.lam[0]}–${f.lam[1]} µm vs continuum` : ''}`
                : band === 'all' ? 'All bands (S/N-weighted)' : `${g.label} · ${f?.lam ? `${f.lam[0].toFixed(2)}–${f.lam[1].toFixed(2)} µm` : g.range}`}
              <span>· {f?.nexp ?? 0} exposures</span>
              {mode === 'diff' && <span className="text-amber">· difference</span>}
              {mode === 'stack' && <span className="text-amber">· tracking {stackPm.ra.toFixed(1)}″, {stackPm.dec.toFixed(1)}″ /yr</span>}
            </div>
          </motion.div>
          {loading && progress && (
            <div className="w-fit rounded-md border border-line bg-panel/80 px-2 py-1 font-mono text-[10.5px] text-cyan backdrop-blur-md">
              sharpening… {progress.done}/{progress.total}
            </div>
          )}
        </div>
      )}

      {hover && (
        <div className="pointer-events-none absolute bottom-3 right-3 rounded-lg border border-line bg-panel/85 px-3 py-1.5 font-mono text-[11px] tabular text-muted backdrop-blur-md">
          <span className="text-ink">{fmtRA(hover.ra)} {fmtDec(hover.dec)}</span>
          <span className="ml-3">{hover.v != null && Number.isFinite(hover.v) ? `${hover.v.toPrecision(3)} ${mode === 'diff' ? 'Δ MJy/sr' : mode === 'molecule' ? 'σ absorption' : band === 'all' ? 'σ' : 'MJy/sr'}` : 'no data'}</span>
        </div>
      )}
    </div>
  )
}
