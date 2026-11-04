export type ProbeMeasure = {
  percent: number | null
  tokens: number | null
  window: number | null
  keys: string[]
  changed: string[]
}

declare module 'claude-code' {
  interface PluginState {
    'flightdeck-engine-probes': {
      mode: string | null
      presses: string[]
      bandOffset: number
      viewedMarks: number
      p5Open: string | null
      p8Submits: string[]
      p8Inputs: string[]
      measure: ProbeMeasure | null
    }
  }
}
