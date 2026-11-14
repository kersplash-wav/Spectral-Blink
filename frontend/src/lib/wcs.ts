// Gnomonic (TAN) projection matching the backend grid: north up, east left, centre pixel = target.
const D2R = Math.PI / 180

export interface Grid { ra0: number; dec0: number; npx: number; scaleDeg: number }

export function pixToWorld(g: Grid, px: number, py: number): { ra: number; dec: number } {
  const c = (g.npx - 1) / 2
  const xi = -(px - c) * g.scaleDeg * D2R
  const eta = (py - c) * g.scaleDeg * D2R
  const d0 = g.dec0 * D2R
  const rho = Math.hypot(xi, eta)
  if (rho === 0) return { ra: g.ra0, dec: g.dec0 }
  const cc = Math.atan(rho)
  const dec = Math.asin(Math.cos(cc) * Math.sin(d0) + (eta * Math.sin(cc) * Math.cos(d0)) / rho)
  const ra = g.ra0 * D2R + Math.atan2(xi * Math.sin(cc), rho * Math.cos(d0) * Math.cos(cc) - eta * Math.sin(d0) * Math.sin(cc))
  return { ra: ((ra / D2R) % 360 + 360) % 360, dec: dec / D2R }
}

export function worldToPix(g: Grid, ra: number, dec: number): { px: number; py: number } {
  const c = (g.npx - 1) / 2
  const a = ra * D2R, d = dec * D2R, a0 = g.ra0 * D2R, d0 = g.dec0 * D2R
  const cosc = Math.sin(d0) * Math.sin(d) + Math.cos(d0) * Math.cos(d) * Math.cos(a - a0)
  const xi = (Math.cos(d) * Math.sin(a - a0)) / cosc
  const eta = (Math.cos(d0) * Math.sin(d) - Math.sin(d0) * Math.cos(d) * Math.cos(a - a0)) / cosc
  return { px: c - xi / D2R / g.scaleDeg, py: c + eta / D2R / g.scaleDeg }
}

export function fmtRA(ra: number): string {
  const h = ra / 15
  const hh = Math.floor(h), mm = Math.floor((h - hh) * 60), ss = ((h - hh) * 60 - mm) * 60
  return `${String(hh).padStart(2, '0')}h${String(mm).padStart(2, '0')}m${ss.toFixed(2).padStart(5, '0')}s`
}

export function fmtDec(dec: number): string {
  const s = dec < 0 ? '−' : '+'
  const a = Math.abs(dec)
  const dd = Math.floor(a), mm = Math.floor((a - dd) * 60), ss = ((a - dd) * 60 - mm) * 60
  return `${s}${String(dd).padStart(2, '0')}°${String(mm).padStart(2, '0')}′${ss.toFixed(1).padStart(4, '0')}″`
}
