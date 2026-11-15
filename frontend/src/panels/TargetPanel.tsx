import { useState } from 'react'
import { Search, Loader2, Navigation } from 'lucide-react'
import { toast } from 'sonner'
import clsx from 'clsx'
import { useStore } from '../state/store'
import { loadField, resolveTarget } from '../api/stream'
import { PRESETS, type Preset } from '../lib/presets'
import { Section, Slider } from '../ui/primitives'
import { fmtDec, fmtRA } from '../lib/wcs'
import { fmtArcsec } from '../lib/format'
import type { Group } from '../lib/types'

const TAG_COLOR: Record<Preset['tag'], string> = { mover: 'text-sky', 'brown dwarf': 'text-accent', variable: 'text-bloom' }

export async function goTo(query: string, opts: { fov?: number; band?: Group; presetId?: string } = {}) {
  const fov = opts.fov ?? useStore.getState().fov
  useStore.getState().set({ error: null, status: `Looking up ${query}…` })
  try {
    const t = await resolveTarget(query)
    if (opts.band) useStore.getState().set({ band: opts.band })
    loadField(t, fov)
    useStore.getState().set({ presetId: opts.presetId ?? PRESETS.find((p) => p.query === query)?.id ?? null })
  } catch (e) {
    const msg = (e as Error).message
    useStore.getState().set({ error: `Couldn’t find “${query}”: ${msg}`, loading: false, status: null })
    toast.error(msg)
  }
}

export function TargetPanel() {
  const target = useStore((s) => s.target)
  const fov = useStore((s) => s.fov)
  const presetId = useStore((s) => s.presetId)
  const set = useStore((s) => s.set)
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [fovDraft, setFovDraft] = useState<number | null>(null)

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!q.trim()) return
    setBusy(true)
    await goTo(q.trim())
    setBusy(false)
  }

  return (
    <>
      <Section title="Target">
        <form onSubmit={submit} className="group relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or RA Dec…"
            id="target-search"
            className="w-full rounded-md border border-line-2 bg-void py-2 pl-9 pr-9 text-[14px] outline-none placeholder:text-faint focus:border-accent" />
          {busy && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-accent" />}
        </form>
        <p className="mt-2 text-[12px] leading-relaxed text-faint">
          Type a name, or coordinates like<br />
          <span className="font-mono">08h55m10.8s −7d14m42s</span><br />
          <span className="font-mono">133.79, −7.24</span>
        </p>

        <ul className="mt-4 -mx-1">
          {PRESETS.map((p) => {
            const active = presetId === p.id
            return (
              <li key={p.id}>
                <button onClick={() => goTo(p.query, { band: p.band as Group | undefined, presetId: p.id })}
                  className={clsx('w-full border-l-2 py-2 pl-3 pr-2 text-left transition-colors',
                    active ? 'border-accent bg-panel-2' : 'border-transparent hover:bg-panel-2/60')}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[14px] font-medium">{p.name}</span>
                    <span className={clsx('text-[12px]', TAG_COLOR[p.tag])}>{p.tag}</span>
                  </div>
                  <div className="mt-0.5 text-[12.5px] leading-snug text-muted">{p.blurb}</div>
                </button>
              </li>
            )
          })}
        </ul>
      </Section>

      {target && (
        <Section title="Position">
          <div className="font-mono text-[12px] leading-relaxed tabular">
            <div>{fmtRA(target.ra)}</div>
            <div>{fmtDec(target.dec)}</div>
          </div>
          {target.type && <div className="mt-1 text-[11.5px] text-muted">{target.name} · {target.type}{target.sptype ? ` · ${target.sptype}` : ''}</div>}
          {!!target.moved_arcsec && target.moved_arcsec > 5 && (
            <div className="mt-2 flex items-start gap-2 rounded-md border border-sky/25 bg-sky/[0.06] px-2.5 py-2 text-[11.5px] leading-snug text-sky">
              <Navigation className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>Moved <b>{fmtArcsec(target.moved_arcsec)}</b> since its catalogue position (J2000). We re-centred on where it is now.</span>
            </div>
          )}
        </Section>
      )}

      <Section title="Field of view" right={<span className="font-mono text-[11px] text-muted">{((fovDraft ?? fov) * 60).toFixed(1)}′</span>}>
        <Slider label="Field of view" value={fovDraft ?? fov} min={0.04} max={0.3} step={0.01}
          onChange={setFovDraft}
          onCommit={(v) => { setFovDraft(null); set({ fov: v }); if (target) loadField(target, v) }} />
        <p className="mt-2 text-[11px] leading-snug text-faint">Wider fields catch faster movers but take longer to download.</p>
      </Section>
    </>
  )
}
