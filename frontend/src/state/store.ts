import { create } from 'zustand'
import type { Cmap, Frame, Group, Manifest, Mode, Mol, MolData, Overlays, Pick, StretchKind, Target } from '../lib/types'

export interface Progress { done: number; total: number; failed: number }

interface State {
  target: Target | null
  presetId: string | null
  fov: number
  manifest: Manifest | null
  frames: Record<string, Frame> // key `${epoch}|${group}`
  framesVersion: number
  loading: boolean
  status: string | null
  progress: Progress | null
  error: string | null
  cached: boolean

  band: Group
  mode: Mode
  playing: boolean
  fps: number
  crossfade: boolean
  frameIdx: number
  stretch: StretchKind
  contrast: number // upper percentile
  black: number // lower percentile
  cmap: Cmap

  mol: Mol
  molData: Record<string, MolData | 'loading' | 'error'>
  molPerSurvey: boolean
  stackPm: { ra: number; dec: number } // arcsec / yr

  overlays: Record<string, Overlays | 'loading' | 'error'>
  showGaia: boolean
  showDark: boolean

  pick: Pick | null
  inspectorOpen: boolean
  helpOpen: boolean
  embed: boolean

  set: (p: Partial<State>) => void
  beginLoad: (target: Target, fov: number) => void
  setManifest: (m: Manifest) => void
  putFrame: (f: Frame) => void
}

export const useStore = create<State>((set) => ({
  target: null,
  presetId: null,
  fov: 0.1,
  manifest: null,
  frames: {},
  framesVersion: 0,
  loading: false,
  status: null,
  progress: null,
  error: null,
  cached: false,

  band: 'all',
  mode: 'blink',
  playing: true,
  fps: 2,
  crossfade: false,
  frameIdx: 0,
  stretch: 'asinh',
  contrast: 99.6,
  black: 5,
  cmap: 'grey',

  mol: 'CH4',
  molData: {},
  molPerSurvey: false,
  stackPm: { ra: 0, dec: 0 },

  overlays: {},
  showGaia: true,
  showDark: true,

  pick: null,
  inspectorOpen: false,
  helpOpen: false,
  embed: false,

  set: (p) => set(p),
  beginLoad: (target, fov) =>
    set({ target, fov, manifest: null, frames: {}, framesVersion: 0, loading: true, status: 'Searching the SPHEREx archive…',
      progress: null, error: null, cached: false, frameIdx: 0, pick: null }),
  setManifest: (m) => set({ manifest: m }),
  putFrame: (f) => set((s) => ({ frames: { ...s.frames, [`${f.epoch}|${f.group}`]: f }, framesVersion: s.framesVersion + 1 })),
}))

export const frameKey = (epoch: number, group: Group) => `${epoch}|${group}`
