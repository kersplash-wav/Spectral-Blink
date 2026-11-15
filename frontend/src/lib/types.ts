export type Group = 'all' | 'D1' | 'D2' | 'D3' | 'D4' | 'D5' | 'D6'
export type Mode = 'blink' | 'diff' | 'molecule' | 'stack'
export type Mol = 'CH4' | 'H2O' | 'CO2' | 'CO'
export type StretchKind = 'asinh' | 'linear' | 'log'
export type Cmap = 'grey' | 'nebula' | 'cobalt'

export interface Exposure {
  id: string
  det: number
  mjd: number
  epoch: number
  lam: number | null
  bw: number | null
  flag_center: number | null
  collection: string
}

export interface Epoch {
  epoch: number
  mjd_start: number
  mjd_end: number
  mjd_mid: number
  n: number
}

export interface Manifest {
  job: string
  ra: number
  dec: number
  fov: number
  npx: number
  pixel_arcsec: number
  collections: string[]
  epochs: Epoch[]
  exposures: Exposure[]
}

export interface Frame {
  epoch: number
  group: Group
  w: number
  h: number
  nexp: number
  lam: [number, number] | null
  data: Float32Array
  partial: boolean
}

export interface Target {
  name: string
  ra: number
  dec: number
  type?: string | null
  sptype?: string | null
  moved_arcsec?: number
  pm?: { pmra: number; pmdec: number; plx: number | null } | null
}

export interface Pick {
  px: number // grid pixel (array coords, x right, y up)
  py: number
  ra: number
  dec: number
}

export const GROUPS: { id: Group; label: string; range: string; color: string }[] = [
  { id: 'all', label: 'All', range: '0.75–5.0 µm', color: 'var(--color-ink)' },
  { id: 'D1', label: 'D1', range: '0.75–1.09 µm', color: 'var(--color-d1)' },
  { id: 'D2', label: 'D2', range: '1.10–1.62 µm', color: 'var(--color-d2)' },
  { id: 'D3', label: 'D3', range: '1.63–2.41 µm', color: 'var(--color-d3)' },
  { id: 'D4', label: 'D4', range: '2.42–3.82 µm', color: 'var(--color-d4)' },
  { id: 'D5', label: 'D5', range: '3.83–4.41 µm', color: 'var(--color-d5)' },
  { id: 'D6', label: 'D6', range: '4.42–5.00 µm', color: 'var(--color-d6)' },
]

export interface MolData {
  mol: Mol
  label: string
  band: [number, number]
  cont: [number, number]
  note: string
  frames: { epoch: number | 'all'; w: number; h: number; n_on: number; n_cont: number; data: Float32Array }[]
}

export const MOLECULES: { id: Mol; label: string; sub: string; hint: string }[] = [
  { id: 'CH4', label: 'CH₄', sub: 'Methane', hint: 'Brown dwarfs (T & Y types) glow; ordinary stars vanish.' },
  { id: 'H2O', label: 'H₂O', sub: 'Water', hint: 'Cool stars and brown dwarfs with steam in their atmospheres.' },
  { id: 'CO2', label: 'CO₂', sub: 'Carbon dioxide', hint: 'Coldest brown dwarfs & icy dust. Comets show up as dark (emission).' },
  { id: 'CO', label: 'CO', sub: 'Carbon monoxide', hint: 'Brown dwarf atmospheres; some comets glow (dark).' },
]

export interface GaiaStar { id: string; ra: number; dec: number; pmra: number; pmdec: number; plx: number | null; g: number; bp_rp: number | null }
export interface Detection { ra: number; dec: number; px: number; py: number; snr: number; gaia: string | null; sep: number | null }
export interface Overlays { gaia: GaiaStar[]; gaia_epoch: number; gaia_error: string | null; detections: Detection[]; n_gaia_dark: number }
