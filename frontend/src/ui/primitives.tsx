import * as RSlider from '@radix-ui/react-slider'
import * as RTooltip from '@radix-ui/react-tooltip'
import { motion } from 'motion/react'
import clsx from 'clsx'
import type { ReactNode } from 'react'

export function Section({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="border-b border-line px-5 py-5">
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="font-display text-[16px] font-medium text-ink">{title}</h3>
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
    <div className="relative flex rounded-md border border-line bg-panel-2 p-0.5">
      {options.map((o) => (
        <button key={o.value} title={o.title} disabled={o.disabled} onClick={() => onChange(o.value)}
          className={clsx('relative z-10 flex-1 rounded px-2 py-1.5 text-[13px] font-medium transition-colors',
            value === o.value ? 'text-void' : 'text-muted hover:text-ink', o.disabled && 'cursor-not-allowed opacity-40')}>
          {value === o.value && (
            <motion.span layoutId={`seg-${id}`} className="absolute inset-0 -z-10 rounded bg-accent"
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
  return <kbd className="whitespace-nowrap rounded border border-line-2 bg-panel-2 px-1.5 py-0.5 font-mono text-[11.5px] text-muted">{children}</kbd>
}

/** Logo: where the object was (dashed ring) and where it is now (filled dot). */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="10.5" cy="19.5" r="4.2" fill="none" stroke="var(--color-sky)" strokeWidth="1.8" strokeDasharray="2.2 2" />
      <circle cx="21.5" cy="12.5" r="4.6" fill="var(--color-accent)" />
      <circle cx="26" cy="6.5" r="1" fill="var(--color-ink)" />
    </svg>
  )
}
