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
/** A phase number, or one of the fixed views: history, settings, and the in-flight list `+n more` opens. */
export type FlightTab = 1 | 2 | 3 | 4 | 5 | 'history' | 'settings' | 'reqs'

/** What the phase page is showing below the tab row: the page, or one thing opened from it. */
export type FlightSub =
  | { kind: 'page' }
  | { kind: 'doc'; path: string; title: string }
  | { kind: 'card'; phase: string }
  | { kind: 'lane'; id: string }
  | { kind: 'diff'; path: string }
  | { kind: 'mermaid'; n: number }

export type FlightView = {
  req: string | null
  tab: FlightTab
  sub: FlightSub
  /** Narrow mode: the list home (one row per phase) is showing instead of a phase page. Ignored when wide; absent on a view 0.5.0 stored. */
  home?: boolean
  /** History: the row whose first or last state is unfolded. */
  hist?: { id: string; which: 'first' | 'last' } | null
}

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
  /** Body columns below which the cockpit turns narrow: chips shrink and the tab row becomes the list home. */
  narrowAt: number
  /** The REQ strip and the band's counts take every unshipped REQ, not only the in-flight ones. */
  showAll: boolean
  history: 'all' | 'flying' | 'done'
  /** The editor link template: `{path}`, `{line}`, `{col}` substituted. */
  editorUri: string
  /** Compaction at an open gate: a button, a button highlighted past `compactAt`, or not offered. */
  compact: 'button' | 'suggest' | 'never'
  /** Context-window percent from which `suggest` highlights the compact buttons. */
  compactAt: number
  /** An approve answer at a gate compacts first: never, on every approve, or only once the context is past `compactAt`. `compact: 'never'` turns it off too. */
  autoCompact: 'off' | 'approve' | 'past'
}

/** A gate round the mod saw: what was chosen, what was typed. */
export type FlightRound = {
  at: number
  decision: string
  note: string
  /** `4/7`: files viewed of files touched when the answer landed. */
  viewed?: string
  /** Sent from the pane's action bar, or typed in the prompt. */
  via?: 'pane' | 'typed'
}

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
  /** What the tree is diffed to: the REQ's branch when it resolves, else `HEAD`. */
  tip: string
  /** True when `tip` is what the work path has checked out; false means the matrix is committed-only. */
  checkedOut: boolean
}

/** viewed[req][path] = the blob hash when it was marked; a hash that moved on clears the mark. */
export type FlightViewed = Record<string, Record<string, string>>

/** picks[req][findingId] = what the grid composes into the gate reply. */
export type FlightPicks = Record<string, Record<string, 'fix' | 'accept' | 'defer'>>

/** One option of an open gate, from the marker (1.12) or the card's Decision line (1.11). */
export type FlightOption = { label: string; consequence: string; needsArg: boolean; recommended: boolean }
export type FlightGateAsk = {
  phase: string
  req: string
  ask: string
  options: FlightOption[]
  /** The marker's `Files:` entries, as written (vault-relative). */
  files: string[]
  source: 'marker' | 'card'
}

/** One chip of the REQ strip: an in-flight REQ, or a sprint member (`here` false when it has no folder on this machine). */
export type FlightStripEntry = {
  id: string; phase: number; phaseName: string; waiting: boolean; sprint: string | null; here: boolean
  /** 0.7.0: a sprint member that has finished here (merged or cancelled) still rides the strip while its sprint runs. */
  ended?: 'merged' | 'cancelled'
}

/** The cockpit lives in the above-prompt band: one row, a 14-row tree, or the whole tree (the engine caps it at half the terminal). */
export type FlightHeight = 'band' | 'open' | 'max'

export type FlightLayout = {
  height: FlightHeight
  /** body columns below `settings.narrowAt`. 0.8.1: no longer written — the cockpit derives it while drawing, and a render never writes. */
  narrow?: boolean
  /** The gate's `[⟳ compact first]` toggle: the next option sent compacts first. */
  compactFirst?: boolean
}

/** 0.8.1: the diff the cockpit shows, read by the press that opened it (git is never asked while drawing). */
export type FlightDiff = { req: string; path: string; source: string | null; isNew: boolean }

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
      gate: Record<string, FlightGateAsk>
      strip: FlightStripEntry[]
      layout: FlightLayout
      pending: { req: string; at: number } | null
      diff: FlightDiff | null
    }
  }
}
