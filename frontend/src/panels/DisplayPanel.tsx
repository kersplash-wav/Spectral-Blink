import clsx from 'clsx'
import { motion } from 'motion/react'
import { useStore } from '../state/store'
import { GROUPS, MOLECULES, type Cmap, type Mode, type StretchKind } from '../lib/types'
import { Navigation, RotateCcw } from 'lucide-react'
import { Section, Segmented, Slider, Tip } from '../ui/primitives'

export function DisplayPanel() {
  const s = useStore()
  const frames = s.frames

  return (
    <>
      <Section title="View">
        <Segmented<Mode> id="mode" value={s.mode} onChange={(mode) => s.set({ mode })} options={[
          { value: 'blink', label: 'Blink', title: 'Flip between sky surveys (B)' },
          { value: 'diff', label: 'Diff', title: 'Each survey minus the average of the others (D)' },
          { value: 'molecule', label: 'Molecule', title: 'See molecules: methane, water, CO₂, CO (M)' },
          { value: 'stack', label: 'Stack', title: 'Shift-and-stack along a motion to reveal faint movers (S)' },
        ]} />
        <p className="mt-2 text-[11.5px] leading-snug text-muted">
          {s.mode === 'blink' && 'Things that jump between frames are moving. Things that pulse are changing brightness.'}
          {s.mode === 'diff' && 'Steady stars cancel out. Movers show up as a blue/accent pair: where it was → where it is.'}
          {s.mode === 'molecule' && 'Compares light inside a molecule’s absorption band with light just outside it. Ordinary stars cancel; objects containing the molecule glow pink.'}
          {s.mode === 'stack' && 'Slide each survey back along a guessed motion and add them up. Anything moving at that speed sharpens into a dot; everything else smears.'}
        </p>
        {s.mode === 'molecule' && <MoleculeControls />}
        {s.mode === 'stack' && <StackControls />}
      </Section>

      {s.mode !== 'molecule' && <Section title="Wavelength">
        <div className="grid grid-cols-7 gap-1">
          {GROUPS.map((g, i) => {
            const has = Object.keys(frames).some((k) => k.endsWith(`|${g.id}`))
            const active = s.band === g.id
            return (
              <Tip key={g.id} label={<span><b>{g.id === 'all' ? 'All 6 detectors' : `Detector ${g.label}`}</b><br />{g.range} · key {i}</span>}>
                <button onClick={() => s.set({ band: g.id })} disabled={!has && !!Object.keys(frames).length}
                  className={clsx('relative flex flex-col items-center rounded-md border py-1.5 text-[11px] font-medium transition',
                    active ? 'border-transparent text-ink' : 'border-line text-muted hover:border-line-2 hover:text-ink')}>
                  {active && <motion.span layoutId="band-hl" className="absolute inset-0 rounded-md border bg-panel-2"
                    style={{ borderColor: g.color }} transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
                  <span className="relative mb-1 h-1.5 w-1.5 rounded-full" style={{ background: g.color }} />
                  <span className="relative">{g.label}</span>
                </button>
              </Tip>
            )
          })}
        </div>
        <div className="mt-2 h-1.5 rounded-full" style={{ background: 'linear-gradient(90deg, var(--color-d1), var(--color-d2), var(--color-d3), var(--color-d4), var(--color-d5), var(--color-d6))' }} />
        <div className="mt-1 flex justify-between font-mono text-[11px] text-faint"><span>0.75 µm</span><span>near-infrared</span><span>5.0 µm</span></div>
      </Section>}

      <OverlayControls />

      <Section title="Contrast">
        <Segmented<StretchKind> id="stretch" value={s.stretch} onChange={(stretch) => s.set({ stretch })} options={[
          { value: 'asinh', label: 'Asinh' }, { value: 'linear', label: 'Linear' }, { value: 'log', label: 'Log' },
        ]} />
        <div className="mt-3 space-y-3">
          <div>
            <div className="mb-1 flex justify-between text-[11px] text-muted"><span>Highlights</span><span className="font-mono">{s.contrast.toFixed(1)}%</span></div>
            <Slider label="Highlights" value={s.contrast} min={95} max={99.95} step={0.05} onChange={(contrast) => s.set({ contrast })} />
          </div>
          <div>
            <div className="mb-1 flex justify-between text-[11px] text-muted"><span>Black point</span><span className="font-mono">{s.black.toFixed(0)}%</span></div>
            <Slider label="Black point" value={s.black} min={0} max={60} step={1} onChange={(black) => s.set({ black })} />
          </div>
        </div>
        <div className="mt-3 flex gap-1.5">
          {(['grey', 'nebula', 'cobalt'] as Cmap[]).map((c) => (
            <button key={c} onClick={() => s.set({ cmap: c })} title={c}
              className={clsx('h-6 flex-1 rounded-md border transition', s.cmap === c ? 'border-accent' : 'border-line hover:border-line-2')}
              style={{ background: c === 'grey' ? 'linear-gradient(90deg,#000,#fff)' : c === 'nebula' ? 'linear-gradient(90deg,#040210,#341878,#9646cd,#eb96eb,#fceeff)' : 'linear-gradient(90deg,#02040e,#183490,#60b0f0,#ecf8ff)' }} />
          ))}
        </div>
      </Section>
    </>
  )
}

function MoleculeControls() {
  const mol = useStore((st) => st.mol)
  const per = useStore((st) => st.molPerSurvey)
  const set = useStore((st) => st.set)
  const m = MOLECULES.find((x) => x.id === mol)!
  return (
    <div className="mt-3">
      <div className="grid grid-cols-4 gap-1">
        {MOLECULES.map((x) => (
          <button key={x.id} onClick={() => set({ mol: x.id })}
            className={clsx('rounded-md border py-1.5 text-center transition', mol === x.id ? 'border-accent/70 bg-accent/10 text-accent' : 'border-line text-muted hover:border-line-2 hover:text-ink')}>
            <div className="font-mono text-[12.5px] font-medium">{x.label}</div>
            <div className="text-[10.5px] opacity-80">{x.sub}</div>
          </button>
        ))}
      </div>
      <p className="mt-2 text-[11.5px] leading-snug text-ink/80">{m.hint}</p>
      <div className="mt-2 flex items-center gap-2 text-[11.5px] text-faint">
        <span className="h-2 w-6 rounded-sm" style={{ background: 'linear-gradient(90deg,#60a5ff,#0e1234)' }} /> less absorbing
        <span className="ml-auto h-2 w-6 rounded-sm" style={{ background: 'linear-gradient(90deg,#2a1034,#ff78c4)' }} /> absorbs
      </div>
      <label className="mt-3 flex cursor-pointer items-center justify-between text-[12px] text-muted">
        <span>Show each survey separately</span>
        <input type="checkbox" checked={per} onChange={(e) => set({ molPerSurvey: e.target.checked })} className="accent-accent" />
      </label>
    </div>
  )
}

function StackControls() {
  const pm = useStore((st) => st.stackPm)
  const target = useStore((st) => st.target)
  const set = useStore((st) => st.set)
  const cat = target?.pm ? { ra: target.pm.pmra / 1000, dec: target.pm.pmdec / 1000 } : null
  return (
    <div className="mt-3 space-y-3">
      {(['ra', 'dec'] as const).map((k) => (
        <div key={k}>
          <div className="mb-1 flex justify-between text-[11px] text-muted">
            <span>{k === 'ra' ? 'Motion east (μα*)' : 'Motion north (μδ)'}</span>
            <span className="font-mono">{pm[k] >= 0 ? '+' : ''}{pm[k].toFixed(1)}″/yr</span>
          </div>
          <Slider label={k} value={pm[k]} min={-12} max={12} step={0.1} onChange={(v) => set({ stackPm: { ...pm, [k]: v } })} />
        </div>
      ))}
      <div className="flex gap-1.5">
        <button disabled={!cat} onClick={() => cat && set({ stackPm: cat })}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-sky/30 bg-sky/[0.06] py-1.5 text-[11.5px] text-sky transition hover:bg-sky/10 disabled:cursor-not-allowed disabled:opacity-40">
          <Navigation className="h-3.5 w-3.5" /> Use catalogue motion
        </button>
        <button onClick={() => set({ stackPm: { ra: 0, dec: 0 } })} className="grid w-9 place-items-center rounded-md border border-line text-muted hover:text-ink" title="Reset to zero motion">
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}

function OverlayControls() {
  const job = useStore((st) => st.manifest?.job)
  const ov = useStore((st) => (st.manifest ? st.overlays[st.manifest.job] : undefined))
  const showGaia = useStore((st) => st.showGaia)
  const showDark = useStore((st) => st.showDark)
  const set = useStore((st) => st.set)
  if (!job) return null
  const data = ov && typeof ov === 'object' ? ov : null
  const dark = data?.detections.filter((d) => !d.gaia) ?? []
  const Toggle = ({ on, onClick, color, label, count, tip }: { on: boolean; onClick: () => void; color: string; label: string; count?: number | string; tip: string }) => (
    <Tip label={tip}>
      <button onClick={onClick} className={clsx('flex w-full items-center gap-2.5 rounded-md border px-2.5 py-1.5 text-left text-[12.5px] transition',
        on ? 'border-line-2 bg-panel-2 text-ink' : 'border-line text-muted hover:text-ink')}>
        <span className="h-3 w-3 rounded-full border-2" style={{ borderColor: color, opacity: on ? 1 : 0.35 }} />
        <span className="flex-1">{label}</span>
        <span className="font-mono text-[11px] text-faint">{count ?? ''}</span>
      </button>
    </Tip>
  )
  return (
    <Section title="Overlays">
      <div className="space-y-1.5">
        <Toggle on={showGaia} onClick={() => set({ showGaia: !showGaia })} color="#6fb7ff" label="Gaia DR3 stars"
          count={ov === 'loading' ? '…' : data ? data.gaia.filter((g) => g.g <= 18.5).length : '—'}
          tip="Stars catalogued by ESA’s Gaia, drawn where they should be on each survey date (their motion is applied)." />
        <Toggle on={showDark} onClick={() => set({ showDark: !showDark })} color="#ff7fbf" label="Not in Gaia"
          count={ov === 'loading' ? '…' : data ? dark.length : '—'}
          tip="SPHEREx sources with no Gaia counterpart: too red or cold for Gaia (brown dwarfs!), dust-hidden, or galaxies. Worth a look." />
      </div>
      {showDark && dark.length > 0 && (
        <div className="mt-2 space-y-1">
          {dark.slice(0, 6).map((d, i) => (
            <button key={i} onClick={() => set({ pick: { px: d.px, py: d.py, ra: d.ra, dec: d.dec }, inspectorOpen: true })}
              className="flex w-full items-center justify-between rounded px-2 py-1 font-mono text-[11px] text-muted transition hover:bg-panel-2 hover:text-ink">
              <span>Candidate {i + 1}</span><span>{d.snr.toFixed(0)}σ</span>
            </button>
          ))}
        </div>
      )}
    </Section>
  )
}
