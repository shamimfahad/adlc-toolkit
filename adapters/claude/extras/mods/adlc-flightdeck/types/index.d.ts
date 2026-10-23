export type FlightPhase = { n: number; name: string; state: 'done' | 'now' | 'gate' | 'todo' }

export type FlightReq = {
  id: string
  title: string
  kind: 'req' | 'bug'
  phase: number
  phaseName: string
  phases: FlightPhase[]
  phaseSince: number
  waiting: boolean
  waitingSince: number | null
  tasks: { id: string; status: string }[]
  touchedAt: number
}

export type FlightDeck = { vault: string | null; reqs: FlightReq[]; scannedAt: number }

/** What a tool call was, for colour on the timeline. */
export type FlightKind = 'write' | 'run' | 'read' | 'agent'

/** One tool call a lane made: when, what kind, whether it failed, and a short description. */
export type FlightHit = { t: number; k: FlightKind; err: boolean; d: string }

export type FlightLane = {
  id: string
  agent: string
  label: string
  req: string | null
  task: string | null
  phase: string | null
  startedAt: number
  doing: string
  trail: FlightHit[]
  endedAt: number | null
  /** Fresh tokens (input + output + cache writes) the lane has burned; null until its first turn lands. */
  tokens: number | null
  /** Output tokens: what the agent wrote. */
  wrote: number
  isFailed: boolean
}

/**
 * Tokens per phase, three ways: `fresh` = input + output + cache writes (the band's number),
 * `read` = cache reads (the whole context, every call — context re-read, not work), `wrote` = output.
 */
export type FlightFuelRow = { fresh: number; read: number; wrote: number }
/** fuel[req][phase]. */
export type FlightFuel = Record<string, Record<string, FlightFuelRow>>
/** agents[req][phase] counts landed subagents. */
export type FlightCount = Record<string, Record<string, number>>

export type FlightSince = Record<string, { phase: string; at: number }>

// ---------- the cockpit: what the pane shows ----------

/** A phase number, or one of the two fixed tabs. */
export type FlightTab = 1 | 2 | 3 | 4 | 5 | 'history' | 'settings'

/** What the phase page is showing below the tab row: the page, or one thing opened from it. */
export type FlightSub =
  | { kind: 'page' }
  | { kind: 'doc'; path: string; title: string }
  | { kind: 'card'; phase: string }
  | { kind: 'lane'; id: string }
  | { kind: 'diff'; path: string }
  | { kind: 'mermaid'; n: number }

export type FlightView = { req: string | null; tab: FlightTab; sub: FlightSub }

/** One row of the History tab: a folder in flight, a kept folder, or a record of finished work. */
export type FlightItem = {
  id: string
  title: string
  kind: 'req' | 'bug'
  state: 'flying' | 'gate' | 'merged' | 'cancelled' | 'archived'
  phase: number
  phaseName: string
  author: string | null
  month: string | null
  touchedAt: number
  folder: string | null
  record: string | null
}

export type FlightSettings = {
  openOnStart: boolean
  band: boolean
  cards: boolean
  /** Body columns the pane asks for when docked; 0 = the engine's share. */
  columns: number
  history: 'all' | 'flying' | 'done'
  /** The editor link template: `{path}`, `{line}`, `{col}` substituted. */
  editorUri: string
}

/** A gate round the mod saw: what was chosen, what was typed. */
export type FlightRound = { at: number; decision: string; note: string; /** `4/7`: files viewed of files touched when the answer landed. */ viewed?: string }

/** A subagent that landed, with its last line. */
export type FlightRun = {
  id: string
  agent: string
  task: string | null
  startedAt: number
  endedAt: number
  /** Fresh tokens. */
  tokens: number
  /** Output tokens; absent on runs an older version recorded. */
  wrote?: number
  verdict: string
  isFailed: boolean
}

/** What this machine captured per REQ per phase; kept in $.store per vault. The vault's own `phases` block wins where both exist. */
export type FlightTrail = Record<string, Record<string, { rounds: FlightRound[]; runs: FlightRun[]; card: { at: number; text: string } | null }>>

/** A file git says changed under the REQ's work path. */
export type FlightTouched = { path: string; status: 'A' | 'M' | 'D' | 'R' | '?'; add: number; del: number; from?: string }

/** What git said about one REQ's work path, as last asked. */
export type FlightGit = {
  at: number
  cwd: string
  /** The merge-base the branch is compared against, or null when none resolved (then diffs are against HEAD). */
  base: string | null
  baseName: string | null
  branch: string | null
  touched: FlightTouched[]
  /** Blob hash per touched path, the key the viewed marks are checked against. */
  hashes: Record<string, string>
  /** Last author and age per touched path (`sf · 7 months ago`), capped. */
  authors: Record<string, string>
  me: string | null
  error: string | null
}

/** viewed[req][path] = the blob hash when it was marked; a hash that moved on clears the mark. */
export type FlightViewed = Record<string, Record<string, string>>

/** picks[req][findingId] = what the grid composes into the gate reply. */
export type FlightPicks = Record<string, Record<string, 'fix' | 'accept' | 'defer'>>

declare module 'claude-code' {
  interface PluginState {
    'adlc-flightdeck': {
      deck: FlightDeck
      lanes: FlightLane[]
      now: number
      fuel: FlightFuel
      agents: FlightCount
      focus: string | null
      view: FlightView
      items: FlightItem[]
      settings: FlightSettings
      trail: FlightTrail
      filters: { author: string | null; text: string }
      git: Record<string, FlightGit>
      viewed: FlightViewed
      picks: FlightPicks
    }
  }
}
