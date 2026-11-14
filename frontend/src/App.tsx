import { AnimatePresence } from 'motion/react'
import * as RTooltip from '@radix-ui/react-tooltip'
import { Toaster } from 'sonner'
import { HelpCircle, Satellite } from 'lucide-react'
import { useStore } from './state/store'
import { useHotkeys } from './state/hotkeys'
import { SkyCanvas } from './viewer/SkyCanvas'
import { TargetPanel } from './panels/TargetPanel'
import { DisplayPanel } from './panels/DisplayPanel'
import { Timeline } from './panels/Timeline'
import { Inspector } from './panels/Inspector'
import { HelpSheet } from './panels/HelpSheet'
import { useMoleculeLoader } from './viewer/useRendered'

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
      <div className="flex h-full flex-col">
        {!embed && (
          <header className="flex h-12 shrink-0 items-center justify-between border-b border-line bg-panel px-4">
            <div className="flex items-center gap-2.5">
              <div className="grid h-7 w-7 place-items-center rounded-lg bg-amber/15 text-amber"><Satellite className="h-4 w-4" /></div>
              <span className="font-display text-[16px] font-semibold tracking-tight">{APP_NAME}</span>
              <span className="hidden text-[12.5px] text-muted md:inline">· watch the infrared sky change with NASA’s SPHEREx</span>
            </div>
            <div className="flex items-center gap-3">
              {manifest && (
                <span className="hidden rounded-full border border-line px-2.5 py-1 font-mono text-[10.5px] text-muted sm:inline">
                  {manifest.exposures.length} exposures · {manifest.collections.join(' + ')}
                </span>
              )}
              <button onClick={() => set({ helpOpen: true })} className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[12.5px] text-muted hover:bg-panel-2 hover:text-ink">
                <HelpCircle className="h-4 w-4" /> Help <span className="font-mono text-faint">?</span>
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
      <Toaster theme="dark" position="top-center" toastOptions={{ style: { background: 'var(--color-panel-2)', border: '1px solid var(--color-line-2)' } }} />
    </RTooltip.Provider>
  )
}
