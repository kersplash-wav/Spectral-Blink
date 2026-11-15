import * as RSlider from '@radix-ui/react-slider'
import * as RTooltip from '@radix-ui/react-tooltip'
import clsx from 'clsx'
import type { ReactNode } from 'react'

export function Section({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="border-b border-line px-4 py-4">
      <div className="mb-2.5 flex items-center justify-between">
        <h3 className="text-[11px] text-faint">{title.toLowerCase()}</h3>
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
    <div className="relative flex border border-line">
      {options.map((o) => (
        <button key={o.value} title={o.title} disabled={o.disabled} onClick={() => onChange(o.value)}
          className={clsx('relative z-10 flex-1 px-2 py-1.5 text-[11.5px]',
            value === o.value ? 'text-void' : 'text-muted hover:text-ink', o.disabled && 'cursor-not-allowed opacity-40')}>
          {value === o.value && <span data-seg={id} className="absolute inset-0 -z-10 bg-accent" />}
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
          className="z-50 max-w-60 border border-line-2 bg-panel px-2.5 py-1.5 text-[11.5px] text-ink">
          {label}
        </RTooltip.Content>
      </RTooltip.Portal>
    </RTooltip.Root>
  )
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="border border-line-2 px-1.5 py-0.5 text-[10.5px] text-muted">{children}</kbd>
}
