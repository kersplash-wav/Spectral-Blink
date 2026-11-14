export interface Preset {
  id: string
  name: string
  query: string
  blurb: string
  tag: 'mover' | 'brown dwarf' | 'variable'
  band?: string
}

// The five NASA Space Apps test targets. Positions are resolved live (with proper motion applied).
export const PRESETS: Preset[] = [
  { id: 'barnard', name: "Barnard's Star", query: "Barnard's Star", blurb: 'Fastest-moving star in our sky, 10.4″ per year', tag: 'mover' },
  { id: 'wise0855', name: 'WISE 0855', query: 'WISE J085510.83-071442.5', blurb: 'Coldest known brown dwarf, about as cold as the North Pole', tag: 'brown dwarf', band: 'D6' },
  { id: 'eps-indi-b', name: 'ε Indi B', query: 'eps Ind B', blurb: 'A pair of brown dwarfs orbiting a nearby star', tag: 'brown dwarf' },
  { id: 'rw-aur', name: 'RW Aurigae', query: 'RW Aur', blurb: 'Young star whose dusty disk makes it flicker', tag: 'variable' },
  { id: 'r-dra', name: 'R Draconis', query: 'R Dra', blurb: 'Pulsating red giant, brightens every ~8 months', tag: 'variable' },
]
