import { useState } from 'react'
import { motion } from 'motion/react'
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

const TAG_COLOR: Record<Preset['tag'], string> = { mover: 'text-cyan', 'brown dwarf': 'text-amber', variable: 'text-rose' }

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
            className="w-full rounded-lg border border-line bg-panel-2 py-2 pl-9 pr-9 text-[13.5px] outline-none transition placeholder:text-faint focus:border-amber/60 focus:ring-2 focus:ring-amber/15" />
          {busy && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-amber" />}
        </form>
        <p className="mt-1.5 text-[11px] text-faint">e.g. <span className="font-mono">08h55m10.8s −7d14m42s</span> or <span className="font-mono">133.79, −7.24</span></p>

        <div className="mt-3 flex flex-col gap-1.5">
          {PRESETS.map((p) => {
            const active = presetId === p.id
            return (
              <motion.button key={p.id} whileHover={{ x: 2 }} whileTap={{ scale: 0.98 }}
                onClick={() => goTo(p.query, { band: p.band as Group | undefined, presetId: p.id })}
                className={clsx('rounded-lg border px-3 py-2 text-left transition-colors',
                  active ? 'border-amber/50 bg-amber/[0.07]' : 'border-line bg-panel-2/60 hover:border-line-2 hover:bg-panel-2')}>
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-medium">{p.name}</span>
                  <span className={clsx('text-[10px] font-medium uppercase tracking-wider', TAG_COLOR[p.tag])}>{p.tag}</span>
                </div>
                <div className="mt-0.5 text-[11.5px] leading-snug text-muted">{p.blurb}</div>
              </motion.button>
            )
          })}
        </div>
      </Section>

      {target && (
        <Section title="Position">
          <div className="font-mono text-[12px] leading-relaxed tabular">
            <div>{fmtRA(target.ra)}</div>
            <div>{fmtDec(target.dec)}</div>
          </div>
          {target.type && <div className="mt-1 text-[11.5px] text-muted">{target.name} · {target.type}{target.sptype ? ` · ${target.sptype}` : ''}</div>}
          {!!target.moved_arcsec && target.moved_arcsec > 5 && (
            <div className="mt-2 flex items-start gap-2 rounded-md border border-cyan/25 bg-cyan/[0.06] px-2.5 py-2 text-[11.5px] leading-snug text-cyan">
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
