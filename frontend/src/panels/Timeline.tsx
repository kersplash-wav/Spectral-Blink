import { useEffect, useRef } from 'react'
import { motion } from 'motion/react'
import { Pause, Play, SkipBack, SkipForward, Blend } from 'lucide-react'
import clsx from 'clsx'
import { useStore } from '../state/store'
import { useRendered } from '../viewer/useRendered'
import { fmtRange } from '../lib/format'
import { Slider, Tip } from '../ui/primitives'

function Thumb({ canvas }: { canvas: HTMLCanvasElement | null }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current
    if (!c) return
    const ctx = c.getContext('2d')!
    ctx.clearRect(0, 0, c.width, c.height)
    if (canvas) {
      ctx.imageSmoothingEnabled = false
      ctx.drawImage(canvas, 0, 0, c.width, c.height)
    }
  }, [canvas])
  return canvas ? <canvas ref={ref} width={96} height={96} className="h-12 w-12 rounded-md" style={{ imageRendering: 'pixelated' }} />
    : <div className="shimmer h-12 w-12 rounded-md" />
}

export function step(dir: 1 | -1) {
  const s = useStore.getState()
  const n = s.manifest?.epochs.length ?? 0
  if (!n) return
  s.set({ playing: false, frameIdx: (s.frameIdx + dir + n) % n })
}

export function Timeline() {
  const manifest = useStore((s) => s.manifest)
  const frameIdx = useStore((s) => s.frameIdx)
  const playing = useStore((s) => s.playing)
  const fps = useStore((s) => s.fps)
  const crossfade = useStore((s) => s.crossfade)
  const loading = useStore((s) => s.loading)
  const progress = useStore((s) => s.progress)
  const set = useStore((s) => s.set)
  const { canvases, frames } = useRendered()
  const epochs = manifest?.epochs ?? []

  return (
    <div className="relative border-t border-line bg-panel">
      {/* data-loading bar */}
      <div className="absolute inset-x-0 top-0 h-[2px] overflow-hidden">
        {loading && (
          <motion.div className="h-full bg-gradient-to-r from-accent/0 via-accent to-accent/0"
            initial={{ width: '0%' }} animate={{ width: progress ? `${(100 * progress.done) / progress.total}%` : '15%' }} transition={{ ease: 'easeOut' }} />
        )}
      </div>

      <div className="flex items-center gap-4 px-4 py-3">
        <div className="flex items-center gap-1">
          <Tip label="Previous survey (←)"><button onClick={() => step(-1)} className="grid h-9 w-9 place-items-center rounded-full text-muted transition hover:bg-panel-2 hover:text-ink"><SkipBack className="h-4 w-4" /></button></Tip>
          <Tip label={playing ? 'Pause (Space)' : 'Play (Space)'}>
            <motion.button whileTap={{ scale: 0.92 }} onClick={() => set({ playing: !playing })}
              className="grid h-11 w-11 place-items-center rounded-full bg-accent text-void hover:bg-ink">
              {playing ? <Pause className="h-5 w-5" fill="currentColor" /> : <Play className="ml-0.5 h-5 w-5" fill="currentColor" />}
            </motion.button>
          </Tip>
          <Tip label="Next survey (→)"><button onClick={() => step(1)} className="grid h-9 w-9 place-items-center rounded-full text-muted transition hover:bg-panel-2 hover:text-ink"><SkipForward className="h-4 w-4" /></button></Tip>
        </div>

        <div className="scroll-thin flex flex-1 gap-2 overflow-x-auto py-0.5">
          {epochs.length === 0 && [0, 1, 2].map((i) => <div key={i} className="shimmer h-[60px] w-48 shrink-0 rounded-lg" />)}
          {epochs.map((e, i) => (
            <button key={e.epoch} onClick={() => set({ frameIdx: i, playing: false })}
              className={clsx('relative flex shrink-0 items-center gap-3 rounded-lg border p-1.5 pr-4 text-left transition-colors',
                i === frameIdx ? 'border-transparent' : 'border-line hover:border-line-2')}>
              {i === frameIdx && <motion.span layoutId="epoch-hl" className="absolute inset-0 rounded-lg border border-accent/70 bg-accent/[0.07]"
                transition={{ type: 'spring', stiffness: 600, damping: 40 }} />}
              <span className="relative"><Thumb canvas={canvases[i]} /></span>
              <span className="relative">
                <span className="block text-[12.5px] font-medium">Survey {i + 1}</span>
                <span className="block font-mono text-[11px] text-muted">{fmtRange(e.mjd_start, e.mjd_end)}</span>
                <span className="block font-mono text-[11.5px] text-faint">{frames[i]?.nexp ?? 0}/{e.n} exp{frames[i]?.partial ? ' · loading' : ''}</span>
              </span>
            </button>
          ))}
        </div>

        <div className="flex w-56 shrink-0 items-center gap-3">
          <Tip label="Cross-fade between frames">
            <button onClick={() => set({ crossfade: !crossfade })}
              className={clsx('grid h-8 w-8 place-items-center rounded-md border transition', crossfade ? 'border-accent/60 text-accent' : 'border-line text-muted hover:text-ink')}>
              <Blend className="h-4 w-4" />
            </button>
          </Tip>
          <div className="flex-1">
            <div className="mb-1 flex justify-between text-[11px] text-muted"><span>Speed</span><span className="font-mono">{fps.toFixed(1)} fps</span></div>
            <Slider label="Speed" value={fps} min={0.5} max={8} step={0.5} onChange={(v) => set({ fps: v })} />
          </div>
        </div>
      </div>
    </div>
  )
}
