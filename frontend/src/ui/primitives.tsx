import * as RSlider from '@radix-ui/react-slider'
import * as RTooltip from '@radix-ui/react-tooltip'
import { motion } from 'motion/react'
import clsx from 'clsx'
import type { ReactNode } from 'react'

export function Section({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="border-b border-line px-4 py-4">
      <div className="mb-2.5 flex items-center justify-between">
        <h3 className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-faint">{title}</h3>
        {right}
      </div>
      {children}
    </section>
  )
}

export function Slider({ value, min, max, step, onChange, onCommit, label }: {
  value: number; min: number; max: number; step: number; label: string
  onChange: (v: number) => void; onCommit?: (v: number) => void
}) {
  return (
    <RSlider.Root className="slider-root" value={[value]} min={min} max={max} step={step}
      onValueChange={(v) => onChange(v[0])} onValueCommit={(v) => onCommit?.(v[0])} aria-label={label}>
      <RSlider.Track className="slider-track"><RSlider.Range className="slider-range" /></RSlider.Track>
      <RSlider.Thumb className="slider-thumb" />
    </RSlider.Root>
  )
}

/** Segmented control with a sliding highlight. */
export function Segmented<T extends string>({ value, options, onChange, id }: {
  value: T; id: string; onChange: (v: T) => void
  options: { value: T; label: ReactNode; title?: string; disabled?: boolean }[]
}) {
  return (
    <div className="relative flex rounded-lg border border-line bg-panel-2 p-0.5">
      {options.map((o) => (
        <button key={o.value} title={o.title} disabled={o.disabled} onClick={() => onChange(o.value)}
          className={clsx('relative z-10 flex-1 rounded-md px-2 py-1.5 text-[12.5px] font-medium transition-colors',
            value === o.value ? 'text-void' : 'text-muted hover:text-ink', o.disabled && 'cursor-not-allowed opacity-40')}>
          {value === o.value && (
            <motion.span layoutId={`seg-${id}`} className="absolute inset-0 -z-10 rounded-md bg-amber"
              transition={{ type: 'spring', stiffness: 500, damping: 38 }} />
          )}
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Tip({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <RTooltip.Root delayDuration={250}>
      <RTooltip.Trigger asChild>{children}</RTooltip.Trigger>
      <RTooltip.Portal>
        <RTooltip.Content sideOffset={6}
          className="z-50 max-w-60 rounded-md border border-line-2 bg-panel-2 px-2.5 py-1.5 text-[12px] text-ink shadow-xl">
          {label}
        </RTooltip.Content>
      </RTooltip.Portal>
    </RTooltip.Root>
  )
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-line-2 bg-panel-2 px-1.5 py-0.5 font-mono text-[10.5px] text-muted">{children}</kbd>
}
