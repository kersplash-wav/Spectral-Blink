import { useState } from 'react'
import { toast } from 'sonner'
import clsx from 'clsx'
import { useStore } from '../state/store'
import { loadField, resolveTarget } from '../api/stream'
import { PRESETS, PRESET_FOV } from '../lib/presets'
import { Section, Slider } from '../ui/primitives'
import { fmtDec, fmtRA } from '../lib/wcs'
import { fmtArcsec } from '../lib/format'
import type { Group } from '../lib/types'

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
        <form onSubmit={submit}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={busy ? 'resolving…' : 'name or RA Dec'}
            id="target-search"
            className="w-full border border-line bg-void px-2.5 py-2 text-[12.5px] outline-none placeholder:text-faint focus:border-line-2" />
        </form>
        <p className="mt-1.5 text-[10.5px] text-faint">e.g. 08h55m10.8s −7d14m42s or 133.79, −7.24</p>

        <div className="mt-3">
          {PRESETS.map((p) => {
            const active = presetId === p.id
            return (
              <button key={p.id} onClick={() => goTo(p.query, { band: p.band as Group | undefined, presetId: p.id, fov: PRESET_FOV })}
                className={clsx('block w-full border-l px-3 py-1.5 text-left', active ? 'border-ink' : 'border-line hover:border-line-2')}>
                <div className="flex items-baseline justify-between">
                  <span className={clsx('text-[12.5px]', active ? 'text-ink' : 'text-muted')}>{p.name}</span>
                  <span className="text-[10px] text-faint">{p.tag}</span>
                </div>
                <div className="text-[11px] leading-snug text-faint">{p.blurb}</div>
              </button>
            )
          })}
        </div>
      </Section>

      {target && (
        <Section title="Position">
          <div className="text-[12px] leading-relaxed tabular">
            <div>{fmtRA(target.ra)}</div>
            <div>{fmtDec(target.dec)}</div>
          </div>
          {target.type && <div className="mt-1 text-[11px] text-muted">{target.name} · {target.type}{target.sptype ? ` · ${target.sptype}` : ''}</div>}
          {!!target.moved_arcsec && target.moved_arcsec > 5 && (
            <p className="mt-2 text-[11px] leading-snug text-muted">
              Moved {fmtArcsec(target.moved_arcsec)} since its J2000 catalogue position; centred on where it is now.
            </p>
          )}
        </Section>
      )}

      <Section title="Field of view" right={<span className="text-[11px] text-muted">{((fovDraft ?? fov) * 60).toFixed(1)}′</span>}>
        <Slider label="Field of view" value={fovDraft ?? fov} min={0.04} max={0.3} step={0.01}
          onChange={setFovDraft}
          onCommit={(v) => { setFovDraft(null); set({ fov: v }); if (target) loadField(target, v) }} />
        <p className="mt-2 text-[10.5px] leading-snug text-faint">Wider fields catch faster movers but take longer to download.</p>
      </Section>
    </>
  )
}
