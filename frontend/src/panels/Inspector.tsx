import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence } from 'motion/react'
import { X } from 'lucide-react'
import clsx from 'clsx'
import {
  CartesianGrid, ComposedChart, Line, ReferenceArea, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis,
} from 'recharts'
import { useStore } from '../state/store'
import { fmtDec, fmtRA } from '../lib/wcs'
import { fmtDate, fmtRange, mjdToDate } from '../lib/format'
import { Segmented, Tip } from '../ui/primitives'
import { GROUPS } from '../lib/types'

interface SpecPoint { lam: number; bw: number; flux: number | null; err: number | null; sat: boolean; wing: number | null; det: number; mjd: number; epoch: number }
interface Molecule { label: string; depth: number | null; n: number; band: [number, number]; cont: [number, number]; note: string }
interface Spectrum {
  points: SpecPoint[]
  fingerprint: { label: string; kind: string; T_color: number | null; model: { lam: number; flux: number }[] | null; peak_um: number | null; snr: number | null; molecules: Record<string, Molecule>; n_saturated: number }
  variability: { epochs: number[]; relative: (number | null)[]; amplitude: number | null; variable: boolean; method: string; saturation_radius_arcsec?: number } | null
}

const MOL_TINT: Record<string, string> = { H2O: '#8f8f8f', CH4: '#8f8f8f', CO2: '#8f8f8f', CO: '#8f8f8f' }
const ACCENT = '#e6e6e6'
const MUTED = '#3a3a3a'

export function Inspector() {
  const pick = useStore((s) => s.pick)
  const manifest = useStore((s) => s.manifest)
  const band = useStore((s) => s.band)
  const set = useStore((s) => s.set)
  const [spec, setSpec] = useState<Spectrum | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [tab, setTab] = useState<'spectrum' | 'light'>('spectrum')
  const [hl, setHl] = useState<number | 'all'>('all')

  useEffect(() => {
    if (!pick || !manifest) return
    const ctrl = new AbortController()
    setBusy(true); setErr(null)
    fetch(`/api/spectrum?job=${manifest.job}&ra=${pick.ra.toFixed(6)}&dec=${pick.dec.toFixed(6)}`, { signal: ctrl.signal })
      .then(async (r) => { if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail ?? `Error ${r.status}`); return r.json() })
      .then((d) => { setSpec(d); setBusy(false) })
      .catch((e) => { if (e.name !== 'AbortError') { setErr(e.message); setBusy(false) } })
    return () => ctrl.abort()
  }, [pick?.ra, pick?.dec, manifest?.job, manifest?.exposures.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const fp = spec?.fingerprint
  const good = useMemo(() => (spec?.points ?? []).filter((p) => !p.sat && p.flux != null), [spec])
  const nEp = manifest?.epochs.length ?? 0

  return (
    <aside
      className="scroll-thin flex h-full w-[380px] shrink-0 flex-col overflow-y-auto border-l border-line bg-panel">
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-void px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="text-[12.5px] text-ink">inspector</span>
          {pick && <span className="font-mono text-[11px] text-muted tabular">{fmtRA(pick.ra)} {fmtDec(pick.dec)}</span>}
        </div>
        <button onClick={() => set({ inspectorOpen: false, pick: null })} className="grid h-6 w-6 place-items-center text-muted hover:text-ink" aria-label="Close inspector">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {!pick && <div className="p-6 text-center text-sm text-muted">Click any source in the image to measure its spectrum.</div>}

      {pick && (busy || !spec) && !err && (
        <div className="space-y-3 p-4">
          
          <p className="text-[12px] text-muted">measuring this spot in every SPHEREx exposure…</p>
        </div>
      )}
      {err && <div className="m-4 border border-line-2 p-3 text-[12px] text-ink">{err}</div>}

      <AnimatePresence mode="wait">
        {pick && spec && fp && !busy && (
          <div key={`${pick.ra}${pick.dec}`} className="space-y-4 p-4">
            {/* fingerprint verdict */}
            <div className={clsx('border p-3', fp.kind === 'brown-dwarf' ? 'border-ink' : 'border-line')}>
              <div>
                <div>
                  <div className="text-[12.5px] leading-snug text-ink">{fp.label}</div>
                  <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted">
                    {fp.T_color && <span>colour temp ≈ {Math.round(fp.T_color).toLocaleString()} K</span>}
                    {fp.peak_um && <span>peak {fp.peak_um.toFixed(2)} µm</span>}
                    <span>{good.length} good points</span>
                    {fp.n_saturated > 0 && <span>{fp.n_saturated} saturated</span>}
                  </div>
                </div>
              </div>
            </div>

            <Segmented id="insp-tab" value={tab} onChange={setTab} options={[
              { value: 'spectrum', label: 'Spectrum' },
              { value: 'light', label: 'Brightness' },
            ]} />

            {tab === 'spectrum' ? (
              <>
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <h4 className="text-[11px] text-faint">spectrum · 0.75–5 µm</h4>
                    <div className="flex gap-1">
                      {(['all', ...Array.from({ length: nEp }, (_, i) => i)] as (number | 'all')[]).map((e) => (
                        <button key={String(e)} onClick={() => setHl(e)}
                          className={clsx('px-1.5 py-0.5 text-[10.5px]', hl === e ? 'bg-ink text-void' : 'text-faint hover:text-ink')}>
                          {e === 'all' ? 'all' : `S${e + 1}`}
                        </button>
                      ))}
                    </div>
                  </div>
                  {good.length ? <SpectrumChart spec={spec} good={good} hl={hl} /> : (
                    <div className="grid h-48 place-items-center border border-dashed border-line text-center text-[11.5px] text-muted">
                      This star saturates SPHEREx’s detectors,<br />so its spectrum can’t be measured.<br />Its brightness changes are still tracked →
                    </div>
                  )}
                  <p className="mt-1.5 text-[11px] leading-snug text-faint">
                    Each dot is one exposure: SPHEREx’s filters give every exposure a different wavelength. Dashed line: best-fit blackbody.
                  </p>
                </div>

                {Object.keys(fp.molecules).length > 0 && (
                  <div>
                    <h4 className="mb-2 text-[11px] text-faint">molecular fingerprint</h4>
                    <div className="space-y-2">
                      {Object.entries(fp.molecules).map(([k, m]) => {
                        const d = m.depth
                        const strong = d != null && d > 0.35
                        return (
                          <Tip key={k} label={<span><b>{m.label}</b> absorption at {m.band[0]}–{m.band[1]} µm vs {m.cont[0]}–{m.cont[1]} µm.<br />{m.note}</span>}>
                            <div className="flex cursor-help items-center gap-2 text-[12px]">
                              <span className="w-28 shrink-0"><span className="text-ink">{k.replace('2', '₂').replace('4', '₄')}</span> <span className="text-muted">{m.label}</span></span>
                              <div className="h-1 flex-1 bg-line">
                                <div className="h-full" style={{ background: strong ? 'var(--color-ink)' : 'var(--color-line-2)', width: `${d != null ? Math.max(0, Math.min(1, d)) * 100 : 0}%` }} />
                              </div>
                              <span className="w-16 text-right text-[11px] text-muted">{d == null ? 'no data' : d <= 0.05 ? 'none' : `${Math.round(d * 100)}% deep`}</span>
                            </div>
                          </Tip>
                        )
                      })}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <BrightnessTab spec={spec} band={band} />
            )}
          </div>
        )}
      </AnimatePresence>
    </aside>
  )
}

function SpectrumChart({ spec, good, hl }: { spec: Spectrum; good: SpecPoint[]; hl: number | 'all' }) {
  const fp = spec.fingerprint
  const fl = good.map((p) => p.flux!)
  const sorted = [...fl].sort((a, b) => a - b)
  const yMax = sorted[Math.floor(sorted.length * 0.98)] * 1.25 || 1
  const yMin = Math.min(0, sorted[Math.floor(sorted.length * 0.02)] * 1.1)
  const on = good.filter((p) => hl === 'all' || p.epoch === hl).map((p) => ({ x: p.lam, y: p.flux, ...p }))
  const off = hl === 'all' ? [] : good.filter((p) => p.epoch !== hl).map((p) => ({ x: p.lam, y: p.flux, ...p }))
  const model = fp.model?.map((m) => ({ x: m.lam, y: m.flux })) ?? []
  return (
    <div className="h-56 border border-line pt-2">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart margin={{ top: 6, right: 12, bottom: 18, left: -6 }}>
          <CartesianGrid stroke="#262626" strokeDasharray="2 4" vertical={false} />
          {Object.entries(fp.molecules).map(([k, m]) => (
            <ReferenceArea key={k} x1={m.band[0]} x2={m.band[1]} fill={MOL_TINT[k]} fillOpacity={0.08} stroke="none" ifOverflow="hidden"
              label={{ value: k.replace('2', '₂').replace('4', '₄'), position: 'insideTop', fill: MOL_TINT[k], fontSize: 10, opacity: 0.8 }} />
          ))}
          <XAxis type="number" dataKey="x" domain={[0.7, 5.05]} ticks={[1, 2, 3, 4, 5]} tick={{ fill: '#8f8f8f', fontSize: 10.5 }}
            stroke="#3a3a3a" label={{ value: 'wavelength (µm)', position: 'insideBottom', offset: -10, fill: '#5e5e5e', fontSize: 10.5 }} />
          <YAxis type="number" dataKey="y" domain={[yMin, yMax]} allowDataOverflow tick={{ fill: '#8f8f8f', fontSize: 10.5 }} stroke="#3a3a3a"
            tickFormatter={(v: number) => (Math.abs(v) >= 100 ? v.toFixed(0) : v.toPrecision(2))} width={48}
            label={{ value: 'mJy', angle: -90, position: 'insideLeft', offset: 18, fill: '#5e5e5e', fontSize: 10.5 }} />
          <Tooltip cursor={{ stroke: '#3a3a3a' }} content={<PointTip />} />
          {off.length > 0 && <Scatter data={off} fill={MUTED} shape={<Dot r={2.5} />} isAnimationActive={false} />}
          <Scatter data={on} fill={ACCENT} shape={<Dot r={3} />} isAnimationActive={false} />
          {model.length > 0 && <Line data={model} dataKey="y" stroke="#8f8f8f" strokeWidth={1} strokeDasharray="4 4" dot={false} isAnimationActive={false} />}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function Dot(props: any) {
  const { cx, cy, fill, r } = props
  if (cx == null || cy == null) return null
  return <circle cx={cx} cy={cy} r={r} fill={fill} stroke="#0a0a0a" strokeWidth={1} />
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function PointTip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload as SpecPoint & { x: number; y: number }
  if (p.det == null) return null
  return (
    <div className="border border-line-2 bg-panel px-2.5 py-1.5 text-[11px]">
      <div className="text-ink">{p.lam.toFixed(3)} µm · {p.flux?.toPrecision(3)} mJy</div>
      <div className="text-muted">D{p.det} · survey {p.epoch + 1} · {fmtDate(p.mjd)}</div>
    </div>
  )
}

function BrightnessTab({ spec, band }: { spec: Spectrum; band: string }) {
  const v = spec.variability
  const manifest = useStore((s) => s.manifest)
  const det = band === 'all' ? null : Number(band.slice(1))
  const g = GROUPS.find((x) => x.id === band)!
  const pts = det == null ? [] : spec.points.filter((p) => p.det === det && (p.sat ? p.wing != null : p.flux != null))
    .map((p) => ({ x: mjdToDate(p.mjd).getTime(), y: p.sat ? p.wing : p.flux, ...p }))
  const usesWing = pts.some((p) => p.sat)

  return (
    <div className="space-y-4">
      <div className={clsx('border p-3', v?.variable ? 'border-ink' : 'border-line')}>
        {v && v.amplitude != null ? (
          <>
            <div className="text-[12.5px] text-ink">
              {v.variable ? `Changes brightness by ~${Math.round(v.amplitude * 100)}% between surveys` : `Steady: varies by only ${Math.round(v.amplitude * 100)}%`}
            </div>
            <div className="mt-3 space-y-1.5">
              {v.epochs.map((e, i) => {
                const r = v.relative[i]
                const ep = manifest?.epochs[e]
                return (
                  <div key={e} className="flex items-center gap-2 text-[11.5px]">
                    <span className="w-28 shrink-0 text-muted">S{e + 1} · {ep ? fmtRange(ep.mjd_start, ep.mjd_end) : ''}</span>
                    <div className="relative h-1 flex-1 bg-line">
                      <div className="absolute left-1/2 top-[-3px] h-[10px] w-px bg-line-2" />
                      {r != null && (
                        <div className="absolute top-0 h-1 bg-ink"
                          style={{ width: `${Math.min(50, Math.abs(r - 1) * 100)}%`, left: r >= 1 ? '50%' : `${50 - Math.min(50, (1 - r) * 100)}%` }} />
                      )}
                    </div>
                    <span className="w-12 text-right text-muted">{r != null ? `${r >= 1 ? '+' : '−'}${Math.abs(Math.round((r - 1) * 100))}%` : '—'}</span>
                  </div>
                )
              })}
            </div>
            <p className="mt-2.5 text-[11px] leading-snug text-faint">
              Compared at matched wavelengths, so changes are real, not colour effects.
              {v.method === 'psf-wings' && ' This star saturates the detector, so we measured the light in its glowing halo instead (approximate).'}
            </p>
          </>
        ) : <div className="text-[12px] text-muted">Not enough clean measurements to judge variability.</div>}
      </div>

      <div>
        <h4 className="mb-2 text-[11px] text-faint">
          <span>every exposure</span> · {det ? `${g.label} ${g.range}` : 'pick a detector'}
        </h4>
        {det == null ? (
          <div className="border border-dashed border-line p-4 text-center text-[11.5px] text-muted">Choose a detector (keys 1–6) to see each individual exposure over time.</div>
        ) : (
          <div className="h-44 border border-line pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart margin={{ top: 6, right: 12, bottom: 4, left: -6 }}>
                <CartesianGrid stroke="#262626" strokeDasharray="2 4" vertical={false} />
                <XAxis type="number" dataKey="x" domain={['dataMin - 1500000000', 'dataMax + 1500000000']} scale="time"
                  tickFormatter={(t: number) => new Date(t).toISOString().slice(2, 7)} tick={{ fill: '#8f8f8f', fontSize: 10.5 }} stroke="#3a3a3a" />
                <YAxis type="number" dataKey="y" tick={{ fill: '#8f8f8f', fontSize: 10.5 }} stroke="#3a3a3a" width={48}
                  tickFormatter={(v: number) => (Math.abs(v) >= 100 ? v.toFixed(0) : v.toPrecision(2))} />
                <Tooltip content={<PointTip />} />
                <Scatter data={pts} fill={ACCENT} shape={<Dot r={3} />} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
        {usesWing && <p className="mt-1.5 text-[11px] text-faint">Halo brightness (relative units): the core is saturated.</p>}
      </div>
    </div>
  )
}
