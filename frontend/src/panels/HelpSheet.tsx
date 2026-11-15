import { motion } from 'motion/react'
import { useStore } from '../state/store'
import { Kbd } from '../ui/primitives'

const KEYS: [string, string][] = [
  ['Space', 'Play / pause'], ['← →', 'Step between surveys'], ['0–6', 'All bands / detector D1–D6'],
  ['B', 'Blink mode'], ['D', 'Difference mode'], ['M', 'Molecule lens'], ['S', 'Shift-and-stack'], ['F', 'Toggle cross-fade'], ['+ −', 'Faster / slower'],
  ['/', 'Search a target'], ['Scroll', 'Zoom'], ['Drag', 'Pan'], ['Double-click', 'Reset view'], ['Click', 'Inspect a source'], ['Esc', 'Close panels'],
]

export function HelpSheet() {
  const set = useStore((s) => s.set)
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-40 grid place-items-center bg-void/80" onClick={() => set({ helpOpen: false })}>
      <motion.div 
        onClick={(e) => e.stopPropagation()}
        className="w-[460px] border border-line-2 bg-panel p-5">
        <h2 className="text-[13px] text-ink">how to use</h2>
        <p className="mt-2 text-[12px] leading-relaxed text-muted">
          SPHEREx maps the whole sky every six months. Each “survey” below is one of those passes.
          Blink between them: anything that jumps is moving (a nearby star, brown dwarf or asteroid), anything that pulses is changing brightness.
        </p>
        <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-2">
          {KEYS.map(([k, d]) => (
            <div key={k} className="flex items-center justify-between gap-2 text-[11.5px]"><span className="text-muted">{d}</span><Kbd>{k}</Kbd></div>
          ))}
        </div>
      </motion.div>
    </motion.div>
  )
}
