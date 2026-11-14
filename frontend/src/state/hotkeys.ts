import { useEffect } from 'react'
import { useStore } from './store'
import { step } from '../panels/Timeline'
import { GROUPS } from '../lib/types'

export function useHotkeys() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        if (e.key === 'Escape') el.blur()
        return
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const s = useStore.getState()
      const k = e.key
      if (k === ' ') { e.preventDefault(); s.set({ playing: !s.playing }) }
      else if (k === 'ArrowRight') step(1)
      else if (k === 'ArrowLeft') step(-1)
      else if (/^[0-6]$/.test(k)) s.set({ band: GROUPS[+k].id })
      else if (k === 'b' || k === 'B') s.set({ mode: 'blink' })
      else if (k === 'd' || k === 'D') s.set({ mode: 'diff' })
      else if (k === 'm' || k === 'M') s.set({ mode: 'molecule' })
      else if (k === 's' || k === 'S') s.set({ mode: 'stack' })
      else if (k === 'f' || k === 'F') s.set({ crossfade: !s.crossfade })
      else if (k === '+' || k === '=') s.set({ fps: Math.min(8, s.fps + 0.5) })
      else if (k === '-' || k === '_') s.set({ fps: Math.max(0.5, s.fps - 0.5) })
      else if (k === '?') s.set({ helpOpen: !s.helpOpen })
      else if (k === '/') { e.preventDefault(); document.getElementById('target-search')?.focus() }
      else if (k === 'Escape') s.set({ helpOpen: false, inspectorOpen: false, pick: null })
      else return
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
