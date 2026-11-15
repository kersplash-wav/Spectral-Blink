import { useEffect, useRef } from 'react'

interface Star { x: number; y: number; r: number; a: number; tw: number; ph: number }

// Small seeded PRNG so the sky looks the same on every load.
function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function makeStars(w: number, h: number): Star[] {
  const rnd = mulberry32(20261115)
  const n = Math.round((w * h) / 1300)
  const stars: Star[] = []
  for (let i = 0; i < n; i++) {
    const m = rnd()
    // magnitude-like distribution: lots of faint stars, few bright ones
    const bright = m > 0.975
    stars.push({
      x: rnd() * w,
      y: rnd() * h,
      r: bright ? 0.9 + rnd() * 0.6 : 0.35 + rnd() * 0.5,
      a: bright ? 0.75 + rnd() * 0.25 : 0.18 + Math.pow(rnd(), 1.6) * 0.55,
      tw: rnd() < 0.12 ? 0.4 + rnd() * 1.2 : 0, // ~12% twinkle
      ph: rnd() * Math.PI * 2,
    })
  }
  return stars
}

/** Fixed, full-page starfield behind the app (monochrome). */
export function Starfield() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const cv = ref.current!
    const ctx = cv.getContext('2d')!
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let stars: Star[] = []
    let w = 0, h = 0, dpr = 1

    const resize = () => {
      dpr = window.devicePixelRatio || 1
      w = window.innerWidth
      h = window.innerHeight
      cv.width = Math.round(w * dpr)
      cv.height = Math.round(h * dpr)
      stars = makeStars(w, h)
      draw(performance.now())
    }

    const draw = (t: number) => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.fillStyle = '#0a0a0a'
      ctx.fillRect(0, 0, w, h)
      for (const s of stars) {
        const a = s.tw && !reduce ? s.a * (0.55 + 0.45 * Math.sin(t / 1000 * s.tw + s.ph)) : s.a
        ctx.fillStyle = `rgba(255,255,255,${a.toFixed(3)})`
        if (s.r < 0.8) {
          ctx.fillRect(s.x, s.y, s.r * 2, s.r * 2)
        } else {
          ctx.beginPath()
          ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2)
          ctx.fill()
        }
      }
    }

    resize()
    window.addEventListener('resize', resize)

    // gentle twinkle at ~12 fps (cheap), skipped for reduced motion
    let raf = 0, last = 0
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop)
      if (t - last < 80) return
      last = t
      draw(t)
    }
    if (!reduce) raf = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return <canvas ref={ref} aria-hidden className="pointer-events-none fixed inset-0 h-full w-full" />
}
