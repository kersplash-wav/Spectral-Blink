import { toast } from 'sonner'
import { useStore } from '../state/store'
import type { Frame, Manifest, Target } from '../lib/types'

let ctrl: AbortController | null = null

function decodeF32(b64: string): Float32Array {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Float32Array(bytes.buffer)
}

export async function resolveTarget(q: string): Promise<Target> {
  const r = await fetch(`/api/resolve?q=${encodeURIComponent(q)}`)
  if (!r.ok) {
    const j = await r.json().catch(() => ({}))
    throw new Error(j.detail || `Could not resolve “${q}”`)
  }
  return r.json()
}

/** Stream frames for a field. Frames arrive progressively and sharpen as more exposures land. */
export async function loadField(target: Target, fov: number) {
  ctrl?.abort()
  const my = new AbortController()
  ctrl = my
  const st = useStore.getState()
  st.beginLoad(target, fov)
  try {
    const res = await fetch(`/api/frames?ra=${target.ra.toFixed(6)}&dec=${target.dec.toFixed(6)}&fov=${fov}`, { signal: my.signal })
    if (!res.ok || !res.body) throw new Error(`Server error ${res.status}`)
    const reader = res.body.getReader()
    const dec = new TextDecoder()
    let buf = ''
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      buf += dec.decode(value, { stream: true })
      let nl: number
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl)
        buf = buf.slice(nl + 1)
        if (line.trim()) handle(JSON.parse(line))
      }
    }
  } catch (e) {
    if ((e as Error).name === 'AbortError') return
    useStore.getState().set({ error: (e as Error).message, loading: false, status: null })
    toast.error('Could not load SPHEREx data', { description: (e as Error).message })
  } finally {
    if (ctrl === my) useStore.getState().set({ loading: false })
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function handle(m: any) {
  const s = useStore.getState()
  switch (m.type) {
    case 'status':
      s.set({ status: m.msg })
      break
    case 'manifest':
      s.setManifest(m as Manifest)
      s.set({ status: `Found ${m.exposures.length} exposures in ${m.epochs.length} sky surveys. Fetching cutouts…` })
      break
    case 'manifest_update':
      if (s.manifest) s.setManifest({ ...s.manifest, exposures: m.exposures })
      break
    case 'progress':
      s.set({ progress: { done: m.done, total: m.total, failed: m.failed } })
      break
    case 'frame': {
      const f: Frame = { epoch: m.epoch, group: m.group, w: m.w, h: m.h, nexp: m.nexp, lam: m.lam, partial: !!m.partial, data: decodeF32(m.data) }
      s.putFrame(f)
      break
    }
    case 'error':
      s.set({ error: m.msg, status: null, loading: false })
      toast.error(m.msg)
      break
    case 'done':
      s.set({ status: null, loading: false, cached: !!m.cached })
      if (!m.cached && m.failed) toast.warning(`${m.failed} exposures could not be fetched from IRSA`)
      break
  }
}

/** Fetch the molecule-lens frames for the current field (cached per job+molecule). */
export async function fetchMolecule(job: string, mol: string) {
  const key = `${job}|${mol}`
  const s = useStore.getState()
  if (s.molData[key]) return
  s.set({ molData: { ...s.molData, [key]: 'loading' } })
  try {
    const r = await fetch(`/api/molecule?job=${job}&mol=${mol}`)
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail ?? `Error ${r.status}`)
    const d = await r.json()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    d.frames = d.frames.map((f: any) => ({ ...f, data: decodeF32(f.data) }))
    useStore.setState((st) => ({ molData: { ...st.molData, [key]: d } }))
  } catch (e) {
    useStore.setState((st) => ({ molData: { ...st.molData, [key]: 'error' } }))
    toast.error('Molecule lens failed', { description: (e as Error).message })
  }
}

export async function fetchOverlays(job: string) {
  const s = useStore.getState()
  if (s.overlays[job]) return
  s.set({ overlays: { ...s.overlays, [job]: 'loading' } })
  try {
    const r = await fetch(`/api/overlays?job=${job}`)
    if (!r.ok) throw new Error(`Error ${r.status}`)
    const d = await r.json()
    useStore.setState((st) => ({ overlays: { ...st.overlays, [job]: d } }))
    if (d.gaia_error) toast.warning('Gaia catalogue unavailable right now', { description: d.gaia_error })
  } catch (e) {
    useStore.setState((st) => ({ overlays: { ...st.overlays, [job]: 'error' } }))
  }
}
