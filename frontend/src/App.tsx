import { AnimatePresence } from 'motion/react'
import * as RTooltip from '@radix-ui/react-tooltip'
import { Toaster } from 'sonner'
import { useStore } from './state/store'
import { useHotkeys } from './state/hotkeys'
import { SkyCanvas } from './viewer/SkyCanvas'
import { TargetPanel } from './panels/TargetPanel'
import { DisplayPanel } from './panels/DisplayPanel'
import { Timeline } from './panels/Timeline'
import { Inspector } from './panels/Inspector'
import { HelpSheet } from './panels/HelpSheet'
import { useMoleculeLoader } from './viewer/useRendered'
import { Starfield } from './ui/Starfield'

export const APP_NAME = 'Spectral Blink'

export default function App() {
  useHotkeys()
  useMoleculeLoader()
  const inspectorOpen = useStore((s) => s.inspectorOpen)
  const helpOpen = useStore((s) => s.helpOpen)
  const embed = useStore((s) => s.embed)
  const manifest = useStore((s) => s.manifest)
  const set = useStore((s) => s.set)

  return (
    <RTooltip.Provider>
      <Starfield />
      <div className="relative flex h-full flex-col">
        {!embed && (
          <header className="flex h-10 shrink-0 items-center justify-between border-b border-line bg-panel px-4">
            <div className="flex items-baseline gap-3">
              <span className="text-[13px] text-ink">{APP_NAME.toLowerCase()}</span>
              <span className="hidden text-[11.5px] text-faint md:inline">infrared sky viewer · NASA SPHEREx</span>
            </div>
            <div className="flex items-center gap-3">
              {manifest && (
                <span className="hidden text-[11px] text-faint sm:inline">
                  {manifest.exposures.length} exposures · {manifest.collections.join(' + ')}
                </span>
              )}
              <button onClick={() => set({ helpOpen: true })} className="text-[11.5px] text-muted hover:text-ink">
                help [?]
              </button>
            </div>
          </header>
        )}

        <div className="flex min-h-0 flex-1">
          {!embed && (
            <aside className="scroll-thin w-[300px] shrink-0 overflow-y-auto border-r border-line bg-panel">
              <TargetPanel />
              <DisplayPanel />
            </aside>
          )}
          <main className="relative min-w-0 flex-1"><SkyCanvas /></main>
          <AnimatePresence>{inspectorOpen && !embed && <Inspector key="insp" />}</AnimatePresence>
        </div>

        <Timeline />
      </div>
      <AnimatePresence>{helpOpen && <HelpSheet key="help" />}</AnimatePresence>
      <Toaster theme="dark" position="top-center" toastOptions={{ style: { background: 'var(--color-panel)', border: '1px solid var(--color-line-2)', borderRadius: 0, fontFamily: 'var(--font-sans)', fontSize: 12 } }} />
    </RTooltip.Provider>
  )
}
