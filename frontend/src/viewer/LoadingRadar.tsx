import { motion } from 'motion/react'
import { useStore } from '../state/store'

export function LoadingRadar() {
  const status = useStore((s) => s.status)
  const error = useStore((s) => s.error)
  const progress = useStore((s) => s.progress)
  const target = useStore((s) => s.target)

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, scale: 1.04 }} transition={{ duration: 0.35 }}
      className="absolute inset-0 flex flex-col items-center justify-center gap-6">
      {!error ? (
        <div className="relative h-44 w-44">
          {[0, 1, 2].map((i) => (
            <div key={i} className="absolute rounded-full border border-line-2" style={{ inset: `${i * 22}px` }} />
          ))}
          <div className="absolute inset-0 rounded-full" style={{
            background: 'conic-gradient(from 0deg, rgba(160,139,255,0.4), rgba(160,139,255,0) 70deg, transparent 360deg)',
            animation: 'sweep 2.2s linear infinite',
          }} />
          <div className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent" />
        </div>
      ) : (
        <div className="grid h-20 w-20 place-items-center rounded-full border border-bloom/40 text-3xl text-bloom">!</div>
      )}
      <div className="max-w-sm text-center">
        <div className="font-display text-xl font-medium">{error ? 'Nothing to show here' : target ? `Looking at ${target.name}` : 'Pick a target'}</div>
        <div className="mt-1 text-sm text-muted">{error ?? status ?? 'Choose a target on the left, or type a name or coordinates.'}</div>
        {progress && !error && (
          <div className="mx-auto mt-4 h-1 w-56 overflow-hidden rounded-full bg-line">
            <motion.div className="h-full bg-accent" animate={{ width: `${(100 * progress.done) / progress.total}%` }} transition={{ ease: 'easeOut' }} />
          </div>
        )}
      </div>
    </motion.div>
  )
}
