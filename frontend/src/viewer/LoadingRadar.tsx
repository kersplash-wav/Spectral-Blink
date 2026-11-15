import { useStore } from '../state/store'

export function LoadingRadar() {
  const status = useStore((s) => s.status)
  const error = useStore((s) => s.error)
  const progress = useStore((s) => s.progress)
  const target = useStore((s) => s.target)

  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="w-80 text-[12.5px] leading-relaxed">
        <div className="text-ink">{error ? 'error' : target ? target.name : 'no target'}</div>
        <div className="mt-1 text-muted">{error ?? status ?? 'Choose a target on the left, or type a name or coordinates.'}</div>
        {progress && !error && (
          <>
            <div className="mt-3 h-px w-full bg-line">
              <div className="h-px bg-ink" style={{ width: `${(100 * progress.done) / progress.total}%` }} />
            </div>
            <div className="mt-1 text-faint tabular">{progress.done}/{progress.total} exposures</div>
          </>
        )}
      </div>
    </div>
  )
}
