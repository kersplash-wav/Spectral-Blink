import clsx from 'clsx'
import { useStore } from '../state/store'
import { GROUPS, MOLECULES, type Mode, type StretchKind } from '../lib/types'
import { Section, Segmented, Slider, Tip } from '../ui/primitives'

const chip = (active: boolean) =>
  clsx('border py-1.5 text-center text-[11.5px]', active ? 'border-ink text-ink' : 'border-line text-muted hover:border-line-2 hover:text-ink')

export function DisplayPanel() {
  const s = useStore()
  const frames = s.frames

  return (
    <>
      <Section title="View">
        <Segmented<Mode> id="mode" value={s.mode} onChange={(mode) => s.set({ mode })} options={[
          { value: 'blink', label: 'Blink', title: 'Flip between sky surveys (B)' },
          { value: 'diff', label: 'Diff', title: 'Each survey minus the average of the others (D)' },
          { value: 'molecule', label: 'Molec', title: 'See molecules: methane, water, CO₂, CO (M)' },
          { value: 'stack', label: 'Stack', title: 'Shift-and-stack along a motion to reveal faint movers (S)' },
        ]} />
        <p className="mt-2 text-[11.5px] leading-snug text-muted">
          {s.mode === 'blink' && 'Things that jump between frames are moving. Things that pulse are changing brightness.'}
          {s.mode === 'diff' && 'Steady stars cancel out. Movers show up as a dark/bright pair: where it was → where it is.'}
          {s.mode === 'molecule' && 'Compares light inside a molecule’s absorption band with light just outside it. Ordinary stars cancel; objects containing the molecule show bright.'}
          {s.mode === 'stack' && 'Slide each survey back along a guessed motion and add them up. Anything moving at that speed sharpens into a dot; everything else smears.'}
        </p>
        {s.mode === 'molecule' && <MoleculeControls />}
        {s.mode === 'stack' && <StackControls />}
      </Section>

      {s.mode !== 'molecule' && (
        <Section title="Wavelength">
          <div className="grid grid-cols-7 gap-1">
            {GROUPS.map((g, i) => {
              const has = Object.keys(frames).some((k) => k.endsWith(`|${g.id}`))
              return (
                <Tip key={g.id} label={<span>{g.id === 'all' ? 'All 6 detectors' : `Detector ${g.label}`}<br />{g.range} · key {i}</span>}>
                  <button onClick={() => s.set({ band: g.id })} disabled={!has && !!Object.keys(frames).length}
                    className={clsx(chip(s.band === g.id), 'disabled:opacity-30')}>
                    {g.label}
                  </button>
                </Tip>
              )
            })}
          </div>
          <div className="mt-1.5 flex justify-between text-[10.5px] text-faint"><span>0.75 µm</span><span>5.0 µm</span></div>
        </Section>
      )}

      <OverlayControls />

      <Section title="Contrast">
        <Segmented<StretchKind> id="stretch" value={s.stretch} onChange={(stretch) => s.set({ stretch })} options={[
          { value: 'asinh', label: 'Asinh' }, { value: 'linear', label: 'Linear' }, { value: 'log', label: 'Log' },
        ]} />
        <div className="mt-3 space-y-3">
          <div>
            <div className="mb-1 flex justify-between text-[11px] text-muted"><span>Highlights</span><span>{s.contrast.toFixed(1)}%</span></div>
            <Slider label="Highlights" value={s.contrast} min={95} max={99.95} step={0.05} onChange={(contrast) => s.set({ contrast })} />
          </div>
          <div>
            <div className="mb-1 flex justify-between text-[11px] text-muted"><span>Black point</span><span>{s.black.toFixed(0)}%</span></div>
            <Slider label="Black point" value={s.black} min={0} max={60} step={1} onChange={(black) => s.set({ black })} />
          </div>
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
          <button key={x.id} onClick={() => set({ mol: x.id })} className={chip(mol === x.id)}>
            <div className="text-[12px]">{x.label}</div>
            <div className="text-[9.5px] opacity-70">{x.sub}</div>
          </button>
        ))}
      </div>
      <p className="mt-2 text-[11.5px] leading-snug text-muted">{m.hint}</p>
      <p className="mt-1 text-[10.5px] text-faint">bright = absorbs · dark = less absorbing</p>
      <label className="mt-3 flex cursor-pointer items-center justify-between text-[11.5px] text-muted">
        <span>Show each survey separately</span>
        <input type="checkbox" checked={per} onChange={(e) => set({ molPerSurvey: e.target.checked })} className="accent-neutral-300" />
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
            <span>{pm[k] >= 0 ? '+' : ''}{pm[k].toFixed(1)}″/yr</span>
          </div>
          <Slider label={k} value={pm[k]} min={-12} max={12} step={0.1} onChange={(v) => set({ stackPm: { ...pm, [k]: v } })} />
        </div>
      ))}
      <div className="flex gap-1">
        <button disabled={!cat} onClick={() => cat && set({ stackPm: cat })}
          className="flex-1 border border-line py-1.5 text-[11.5px] text-ink hover:border-line-2 disabled:cursor-not-allowed disabled:opacity-30">
          Use catalogue motion
        </button>
        <button onClick={() => set({ stackPm: { ra: 0, dec: 0 } })} className="border border-line px-3 text-[11.5px] text-muted hover:text-ink" title="Reset to zero motion">
          Reset
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
  const Toggle = ({ on, onClick, mark, label, count, tip }: { on: boolean; onClick: () => void; mark: string; label: string; count?: number | string; tip: string }) => (
    <Tip label={tip}>
      <button onClick={onClick} className={clsx('flex w-full items-center gap-2.5 border px-2.5 py-1.5 text-left text-[12px]',
        on ? 'border-line-2 text-ink' : 'border-line text-faint hover:text-muted')}>
        <span className="w-3 text-center">{on ? mark : '·'}</span>
        <span className="flex-1">{label}</span>
        <span className="text-[11px] text-faint">{count ?? ''}</span>
      </button>
    </Tip>
  )
  return (
    <Section title="Overlays">
      <div className="space-y-1">
        <Toggle on={showGaia} onClick={() => set({ showGaia: !showGaia })} mark="○" label="Gaia DR3 stars"
          count={ov === 'loading' ? '…' : data ? data.gaia.filter((g) => g.g <= 18.5).length : '—'}
          tip="Stars catalogued by ESA’s Gaia, drawn where they should be on each survey date (their motion is applied)." />
        <Toggle on={showDark} onClick={() => set({ showDark: !showDark })} mark="◇" label="Not in Gaia"
          count={ov === 'loading' ? '…' : data ? dark.length : '—'}
          tip="SPHEREx sources with no Gaia counterpart: too red or cold for Gaia (brown dwarfs!), dust-hidden, or galaxies. Worth a look." />
      </div>
      {showDark && dark.length > 0 && (
        <div className="mt-1.5">
          {dark.slice(0, 6).map((d, i) => (
            <button key={i} onClick={() => set({ pick: { px: d.px, py: d.py, ra: d.ra, dec: d.dec }, inspectorOpen: true })}
              className="flex w-full items-center justify-between px-2.5 py-1 text-[11px] text-muted hover:bg-panel-2 hover:text-ink">
              <span>◇ candidate {i + 1}</span><span>{d.snr.toFixed(0)}σ</span>
            </button>
          ))}
        </div>
      )}
    </Section>
  )
}
