import { useEffect, useRef } from 'react'
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
  return canvas ? <canvas ref={ref} width={96} height={96} className="h-11 w-11" style={{ imageRendering: 'pixelated' }} />
    : <div className="shimmer h-11 w-11" />
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

  const btn = 'grid h-8 w-8 place-items-center border border-line text-muted hover:border-line-2 hover:text-ink'
  return (
    <div className="relative border-t border-line bg-panel">
      {/* data-loading bar */}
      <div className="absolute inset-x-0 top-0 h-px">
        {loading && <div className="h-px bg-ink" style={{ width: progress ? `${(100 * progress.done) / progress.total}%` : '5%' }} />}
      </div>

      <div className="flex items-center gap-4 px-4 py-3">
        <div className="flex items-center gap-1">
          <Tip label="Previous survey (←)"><button onClick={() => step(-1)} className={btn}><SkipBack className="h-3.5 w-3.5" /></button></Tip>
          <Tip label={playing ? 'Pause (Space)' : 'Play (Space)'}>
            <button onClick={() => set({ playing: !playing })} className="grid h-8 w-8 place-items-center border border-ink bg-ink text-void">
              {playing ? <Pause className="h-3.5 w-3.5" fill="currentColor" /> : <Play className="h-3.5 w-3.5" fill="currentColor" />}
            </button>
          </Tip>
          <Tip label="Next survey (→)"><button onClick={() => step(1)} className={btn}><SkipForward className="h-3.5 w-3.5" /></button></Tip>
        </div>

        <div className="scroll-thin flex flex-1 gap-2 overflow-x-auto">
          {epochs.length === 0 && [0, 1, 2].map((i) => <div key={i} className="shimmer h-[58px] w-44 shrink-0" />)}
          {epochs.map((e, i) => (
            <button key={e.epoch} onClick={() => set({ frameIdx: i, playing: false })}
              className={clsx('flex shrink-0 items-center gap-3 border p-1.5 pr-4 text-left',
                i === frameIdx ? 'border-ink' : 'border-line hover:border-line-2')}>
              <Thumb canvas={canvases[i]} />
              <span className="text-[11.5px] leading-snug">
                <span className={clsx('block', i === frameIdx ? 'text-ink' : 'text-muted')}>survey {i + 1}</span>
                <span className="block text-muted">{fmtRange(e.mjd_start, e.mjd_end)}</span>
                <span className="block text-faint">{frames[i]?.nexp ?? 0}/{e.n} exp{frames[i]?.partial ? ' · loading' : ''}</span>
              </span>
            </button>
          ))}
        </div>

        <div className="flex w-56 shrink-0 items-center gap-3">
          <Tip label="Cross-fade between frames">
            <button onClick={() => set({ crossfade: !crossfade })}
              className={clsx('grid h-8 w-8 place-items-center border', crossfade ? 'border-ink text-ink' : 'border-line text-muted hover:text-ink')}>
              <Blend className="h-3.5 w-3.5" />
            </button>
          </Tip>
          <div className="flex-1">
            <div className="mb-1 flex justify-between text-[11px] text-muted"><span>speed</span><span>{fps.toFixed(1)} fps</span></div>
            <Slider label="Speed" value={fps} min={0.5} max={8} step={0.5} onChange={(v) => set({ fps: v })} />
          </div>
        </div>
      </div>
    </div>
  )
}
