const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function mjdToDate(mjd: number): Date {
  return new Date((mjd - 40587) * 86400000)
}

export function fmtMonth(mjd: number): string {
  const d = mjdToDate(mjd)
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

export function fmtRange(a: number, b: number): string {
  const da = mjdToDate(a), db = mjdToDate(b)
  if (da.getUTCFullYear() === db.getUTCFullYear()) {
    if (da.getUTCMonth() === db.getUTCMonth()) return fmtMonth(a)
    return `${MONTHS[da.getUTCMonth()]}–${MONTHS[db.getUTCMonth()]} ${db.getUTCFullYear()}`
  }
  return `${fmtMonth(a)} – ${fmtMonth(b)}`
}

export function fmtDate(mjd: number): string {
  return mjdToDate(mjd).toISOString().slice(0, 10)
}

export function fmtArcsec(a: number): string {
  if (a >= 60) return `${(a / 60).toFixed(a >= 600 ? 0 : 1)}′`
  return `${a.toFixed(a >= 10 ? 0 : 1)}″`
}
