// Two-way sync between app state and the URL, so any view can be shared or embedded:
//   ?target=WISE%200855&ra=133.759&dec=-7.242&fov=0.1&band=D6&mode=diff&embed=1
import { useStore } from './store'
import { loadField } from '../api/stream'
import { goTo } from '../panels/TargetPanel'
import { GROUPS, type Group, type Mode, type Mol } from '../lib/types'

export function initFromUrl() {
  const p = new URLSearchParams(location.search)
  const s = useStore.getState()
  const band = p.get('band') as Group | null
  const mode = p.get('mode') as Mode | null
  const fov = parseFloat(p.get('fov') ?? '')
  const fps = parseFloat(p.get('fps') ?? '')
  s.set({
    ...(band && GROUPS.some((g) => g.id === band) ? { band } : {}),
    ...(mode && ['blink', 'diff', 'molecule', 'stack'].includes(mode) ? { mode } : {}),
    ...(p.get('mol') && ['CH4', 'H2O', 'CO2', 'CO'].includes(p.get('mol')!) ? { mol: p.get('mol') as Mol } : {}),
    ...(Number.isFinite(fov) ? { fov: Math.min(0.3, Math.max(0.04, fov)) } : {}),
    ...(Number.isFinite(fps) ? { fps } : {}),
    embed: p.get('embed') === '1',
  })
  const ra = parseFloat(p.get('ra') ?? ''), dec = parseFloat(p.get('dec') ?? '')
  const name = p.get('target')
  if (Number.isFinite(ra) && Number.isFinite(dec)) {
    loadField({ name: name ?? `${ra.toFixed(4)}, ${dec.toFixed(4)}`, ra, dec }, useStore.getState().fov)
  } else {
    goTo(name ?? "Barnard's Star")
  }

  let t: number | undefined
  useStore.subscribe((st, prev) => {
    if (st.target === prev.target && st.fov === prev.fov && st.band === prev.band && st.mode === prev.mode && st.mol === prev.mol && st.fps === prev.fps) return
    clearTimeout(t)
    t = window.setTimeout(() => {
      if (!st.target) return
      const q = new URLSearchParams()
      q.set('target', st.target.name)
      q.set('ra', st.target.ra.toFixed(6))
      q.set('dec', st.target.dec.toFixed(6))
      q.set('fov', String(st.fov))
      if (st.band !== 'all') q.set('band', st.band)
      if (st.mode !== 'blink') q.set('mode', st.mode)
      if (st.mode === 'molecule') q.set('mol', st.mol)
      if (st.embed) q.set('embed', '1')
      history.replaceState(null, '', `${location.pathname}?${q.toString()}`)
    }, 250)
  })
}
