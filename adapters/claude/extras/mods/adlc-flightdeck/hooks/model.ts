// Pure helpers: no `$`, no state. Everything here is unit-tested.
import type { FlightFuel, FlightHit, FlightKind, FlightPhase, FlightReq, FlightSettings } from '../types'
import type { VaultPhase } from './vault'

export const REQ_PHASES = ['spec', 'architect', 'implement', 'review', 'ship']
export const BUG_PHASES = ['report', 'plan', 'fix', 'verify', 'ship']

const GATE_TO_PHASE: Record<string, number> = {
  spec: 1, report: 1, architect: 2, plan: 2, implement: 3, fix: 3, review: 4, verify: 4, ship: 5,
}

/** A work item id as a skill mints it: REQ-042, REQ-sf-033, BUG-7.
 *  The prefix (req.prefix) starts with a letter so a slug that starts with
 *  a digit never reads as one. Not preceded by a word char or a hyphen, so
 *  L-REQ-035-1 (a lesson) never yields REQ-035. */
export const ID_SRC = '(?:REQ|BUG)-(?:[a-z][a-z0-9]{0,7}-)?\\d+'
export const ID = new RegExp(`(?<![\\w-])(${ID_SRC})`)
export const idOf = (s: string) => ID.exec(s)?.[1] ?? null
const FOLDER = new RegExp(`^(${ID_SRC})-?(.*)$`)

export type PipelineState = {
  currentPhase?: number
  currentPhaseGate?: string
  gateState?: string
  completedPhases?: number[]
  taskStatus?: Record<string, string>
  prState?: string
  aborted?: boolean
  createdAt?: string
  branch?: string
  workPath?: string
  notes?: string[]
  /** 1.10: per-phase sessions, agents, gate rounds and findings decisions, written by the trail hook and the skills. */
  phases?: Record<string, VaultPhase>
}

export const isLanded = (status: string) => /^(complete|done)/.test(status)

/** The REQ/BUG folder name → `{ id, title, kind }`. `REQ-042-payment-retries` → id `REQ-042`; `REQ-sf-033-gate-turn` → `REQ-sf-033`. */
export function splitFolder(name: string): { id: string; title: string; kind: 'req' | 'bug' } {
  const m = FOLDER.exec(name)
  if (!m) return { id: name, title: '', kind: 'req' }
  return { id: m[1] ?? name, title: (m[2] ?? '').replace(/-/g, ' '), kind: (m[1] ?? '').slice(0, 3) === 'BUG' ? 'bug' : 'req' }
}

/** Builds the phase rail from pipeline-state.json. A cleared gate means the next phase is live. */
export function buildReq(
  folder: string,
  st: PipelineState,
  waiting: boolean,
  waitingSince: number | null,
  touchedAt: number,
  phaseSince = touchedAt,
): FlightReq {
  const { id, title, kind } = splitFolder(folder)
  const names = kind === 'bug' ? BUG_PHASES : REQ_PHASES
  const current = st.currentPhase ?? (st.currentPhaseGate ? GATE_TO_PHASE[st.currentPhaseGate] : undefined) ?? 1
  const cleared = st.gateState === 'cleared'
  const done = new Set((st.completedPhases ?? []).filter(n => n > 0))
  const phases: FlightPhase[] = names.map((name, i) => {
    const n = i + 1
    let state: FlightPhase['state'] = 'todo'
    // A skill may list the current phase as completed while its gate is still open: the marker wins.
    if (n < current || (n === current && cleared) || (done.has(n) && !(n === current && waiting))) state = 'done'
    else if (n === current) state = waiting ? 'gate' : 'now'
    if (cleared && n === current + 1) state = waiting ? 'gate' : 'now'
    return { n, name, state }
  })
  const live = phases.find(p => p.state === 'now' || p.state === 'gate')
  const tasks = Object.entries(st.taskStatus ?? {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([tid, status]) => ({ id: tid, status }))
  return {
    id, title, kind,
    phase: live?.n ?? current,
    phaseName: live?.name ?? names[current - 1] ?? `phase ${current}`,
    phases, phaseSince, waiting, waitingSince, tasks, touchedAt,
  }
}

export function isActive(st: PipelineState): boolean {
  return st.prState !== 'merged' && st.aborted !== true && st.currentPhase !== undefined
}

/** First REQ/BUG id and first TASK id mentioned in a dispatch prompt. */
export function parseDispatch(text: string): { req: string | null; task: string | null } {
  const req = idOf(text)
  const task = /\b(TASK-\d+)/.exec(text)?.[1] ?? null
  return { req, task }
}

const base = (p: string) => p.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? p
export const clip = (s: string, n: number) => (n <= 0 ? '' : s.length > n ? s.slice(0, Math.max(0, n - 1)) + '…' : s)

/** What a tool call is, for colour on the timeline. */
export function kindOf(tool: string): FlightKind {
  if (/^(Write|Edit|MultiEdit|NotebookEdit)$/.test(tool)) return 'write'
  if (/^(Bash|PowerShell)$/.test(tool)) return 'run'
  if (/^(Agent|Task)$/.test(tool)) return 'agent'
  return 'read'
}

/**
 * What an agent is doing, short: `Edit RetryPolicy.cs`, `Run the payment tests`. A shell call
 * reads as its own plain-words `description`; without one, as `$ dotnet test`.
 */
export function describeTool(tool: string, args: Record<string, unknown>): string {
  const s = (k: string) => (typeof args[k] === 'string' ? (args[k] as string) : '')
  switch (tool) {
    case 'Read': case 'Write': case 'Edit': case 'MultiEdit': case 'NotebookEdit':
      return `${tool} ${base(s('file_path') || s('notebook_path'))}`
    case 'Bash': case 'PowerShell':
      return s('description').replace(/\s+/g, ' ').trim() || `$ ${s('command').replace(/\s+/g, ' ').trim()}`
    case 'Grep': return `Grep ${s('pattern')}`
    case 'Glob': return `Glob ${s('pattern')}`
    case 'Agent': case 'Task': return `→ ${s('description') || s('subagent_type')}`
    case 'Skill': return `/${s('skill') || s('command')}`
    case 'AskUserQuestion': return 'asking you'
    default: return tool.replace(/^mcp__[^_]+__/, '')
  }
}

// ---------- the tower: lanes on one shared time axis ----------

const BARS = '▁▂▃▄▅▆▇█'
const RANK: Record<FlightKind, number> = { write: 3, run: 2, agent: 1, read: 0 }

/** One column of a lane's timeline. `void` is before the lane took off or after it landed. */
export type Cell =
  | { kind: 'void' }
  | { kind: 'idle' }
  | { kind: FlightKind; level: number; err: boolean }

/**
 * Buckets a lane's tool calls into `width` columns covering the last `spanMs` up to `now`.
 * Height is calls per column against `scale` (shared across lanes, so lanes compare);
 * colour is the weightiest kind in the column (write > run > agent > read); a failed
 * call marks the column.
 */
export function timeline(
  trail: FlightHit[], startedAt: number, endedAt: number | null, now: number,
  width: number, spanMs: number, scale: number,
): Cell[] {
  const step = spanMs / width
  const from = now - spanMs
  const cols: { n: number; k: FlightKind | null; err: boolean }[] = Array.from({ length: width }, () => ({ n: 0, k: null, err: false }))
  for (const h of trail) {
    const i = Math.floor((h.t - from) / step)
    const c = cols[i]
    if (!c) continue
    c.n += 1
    if (c.k === null || RANK[h.k] > RANK[c.k]) c.k = h.k
    c.err ||= h.err
  }
  return cols.map((c, i) => {
    const t0 = from + i * step
    const t1 = t0 + step
    if (t1 <= startedAt || (endedAt !== null && t0 > endedAt)) return { kind: 'void' }
    if (c.n === 0 || c.k === null) return { kind: 'idle' }
    return { kind: c.k, level: Math.min(7, Math.max(0, Math.ceil((c.n / Math.max(1, scale)) * 8) - 1)), err: c.err }
  })
}

/** The busiest column across lanes, so every lane is drawn on one scale. */
export function sharedScale(trails: FlightHit[][], now: number, width: number, spanMs: number): number {
  const step = spanMs / width
  let max = 1
  for (const trail of trails) {
    const counts = new Map<number, number>()
    for (const h of trail) {
      const i = Math.floor((h.t - (now - spanMs)) / step)
      if (i >= 0 && i < width) counts.set(i, (counts.get(i) ?? 0) + 1)
    }
    for (const n of counts.values()) max = Math.max(max, n)
  }
  return max
}

export const cellGlyph = (c: Cell) =>
  c.kind === 'void' ? ' ' : c.kind === 'idle' ? '·' : c.err ? '✗' : BARS[c.level] ?? '▁'

/** Runs of cells that share a colour key, so a lane draws as a handful of Text spans. */
export function runs(cells: Cell[]): { key: string; text: string }[] {
  const out: { key: string; text: string }[] = []
  for (const c of cells) {
    const key = c.kind === 'void' || c.kind === 'idle' ? c.kind : c.err ? 'err' : c.kind
    const last = out[out.length - 1]
    if (last && last.key === key) last.text += cellGlyph(c)
    else out.push({ key, text: cellGlyph(c) })
  }
  return out
}

// ---------- numbers ----------

export function clock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60
  return h > 0 ? `${h}h${String(m).padStart(2, '0')}m` : `${m}:${String(sec).padStart(2, '0')}`
}

export function tokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1000) return `${Math.round(n / 1000)}k`
  return String(n)
}

/** Fuel bar for the pane: `██████▍` scaled to `max`. */
export function bar(n: number, max: number, width = 24): string {
  const eighths = Math.round((n / Math.max(1, max)) * width * 8)
  const full = Math.floor(eighths / 8)
  const rest = eighths % 8
  return '█'.repeat(full) + (rest ? '▏▎▍▌▋▊▉'[rest - 1] : '')
}

/**
 * Remaining time for the implement phase at the pace seen so far: average landed-task
 * duration × tasks not yet landed ÷ parallelism. Null until two tasks have landed —
 * one sample is a guess, and a guess on the band reads as a promise.
 */
export function eta(durationsMs: number[], remaining: number, parallel: number): number | null {
  if (durationsMs.length < 2 || remaining <= 0) return null
  const avg = durationsMs.reduce((a, b) => a + b, 0) / durationsMs.length
  return (avg * remaining) / Math.max(1, parallel)
}

/** What the next phase usually costs in this vault: mean over REQs that ran it. */
export function typicalCost(fuel: FlightFuel, phase: string, exclude: string): { mean: number; n: number } | null {
  const xs = Object.entries(fuel).filter(([id, row]) => id !== exclude && (row[phase]?.fresh ?? 0) > 0).map(([, row]) => row[phase]?.fresh ?? 0)
  if (xs.length === 0) return null
  return { mean: xs.reduce((a, b) => a + b, 0) / xs.length, n: xs.length }
}

const SPIN = '◐◓◑◒'
export const spinFrame = (now: number) => SPIN[Math.floor(now / 250) % 4] ?? '◐'
export const pulse = (now: number) => Math.floor(now / 600) % 2 === 0

// ---------- compaction: the context ring and the auto-compact rule ----------

/** The context ring for a window percent: ○ 0–12 · ◔ 13–37 · ◑ 38–62 · ◕ 63–87 · ● 88+. */
export function ringGlyph(pct: number): string {
  return pct < 13 ? '○' : pct < 38 ? '◔' : pct < 63 ? '◑' : pct < 88 ? '◕' : '●'
}

/** The reply is a plain approve and nothing else: `approve`, or `approve, reject ADR-NNN`, optionally followed by
 *  the pane's `[flightdeck] …` trailer line. A note after it (`approve, but rename X first`, `approve — looks right`)
 *  is rework the next phase needs its context for, so it is not. Nor `approved`, `revise`, `fix …`, `abort`,
 *  `merged`. Case and spacing ignored. Placeholders (`<…>`) are dropped from an option's label only: typed, a
 *  bracketed part is the person's own note (`approve <but rename X first>`), so it is not approve-like. */
export function isApproveLike(text: string, from: 'label' | 'typed' = 'label'): boolean {
  const bare = text.replace(/\n\s*\[flightdeck\][^\n]*\s*$/, '')
  const body = (from === 'label' ? bare.replace(/<[^>]*>/g, '') : bare).replace(/\s+/g, ' ').trim().toLowerCase()
  return /^approve(?: ?, ?reject adr-\d+)?$/.test(body)
}

/** A compaction still running after this is given up on: a held reply goes back in the box. */
export const COMPACT_TIMEOUT_MS = 60_000

/** The ship gate: nothing follows it, so nothing is worth compacting for. */
const LAST_PHASE = 5

/** Whether an answer at a gate compacts before it is sent. `past` needs a known percent at or above `compactAt`. */
export function autoCompactApplies(
  settings: Pick<FlightSettings, 'compact' | 'compactAt' | 'autoCompact'>,
  pct: number | null,
  label: string,
  phase: number,
  from: 'label' | 'typed' = 'label',
): boolean {
  if (settings.compact === 'never' || settings.autoCompact === 'off') return false
  if (phase >= LAST_PHASE || !isApproveLike(label, from)) return false
  if (settings.autoCompact === 'past') return pct !== null && pct >= settings.compactAt
  return true
}

export function taskGlyphs(tasks: { id: string; status: string }[], running: Set<string>, now: number): string {
  return tasks
    .map(t => (isLanded(t.status) ? '●' : running.has(t.id) ? spinFrame(now) : /fail|block/.test(t.status) ? '✗' : '○'))
    .join(' ')
}

// ---------- the gate card: GATE-PROTOCOL's text card, parsed ----------

export type GateSection = { label: string; lines: string[] }
export type GateCard = {
  n: number
  of: number
  phase: string
  req: string
  title: string
  verdict: string
  sections: GateSection[]
  decision: string | null
  before: string
  after: string
}

const HEADER = new RegExp(`^[ \\t]*(?:#+\\s*|\\*\\*)?GATE (\\d+)\\/(\\d+) · ([^·\\n]+?) · (${ID_SRC})([\\w-]*)(?:\\s+[—–-]\\s+(.*?))?(?:\\*\\*)?[ \\t]*$`, 'm')
const SECTION = /^([A-Z][A-Z'’ ]{1,22}[A-Z])(?:\s{2,}|\s*$)(.*)$/
const DECISION = /^Decision\s*(?:→|->|:)\s*(.*)$/i

/**
 * Finds a GATE-PROTOCOL card in an assistant message and splits it into its spine.
 * Anything it can't place is kept verbatim (`before` / `after`), so a card the parser
 * half-understands never loses text — and one it doesn't understand returns null,
 * leaving the engine's own drawing.
 */
export function parseGateCard(text: string): GateCard | null {
  const m = HEADER.exec(text)
  if (!m || m.index === undefined) return null
  let before = text.slice(0, m.index)
  let rest = text.slice(m.index + m[0].length)
  const fenced = /```[\w-]*$/.test(before.trimEnd())
  if (fenced) before = before.trimEnd().replace(/```[\w-]*$/, '')
  let after = ''
  const close = fenced ? rest.indexOf('\n```') : -1
  if (close >= 0) { after = rest.slice(close + 4).replace(/^\s*\n/, ''); rest = rest.slice(0, close) }

  const card: GateCard = {
    n: Number(m[1]), of: Number(m[2]), phase: (m[3] ?? '').trim(), req: m[4] ?? '',
    title: (m[6] ?? '').trim() || (m[5] ?? '').replace(/^-/, '').replace(/-/g, ' '),
    verdict: '', sections: [], decision: null, before: before.trim(), after: after.trim(),
  }
  let current: GateSection | null = null
  for (const raw of rest.split('\n')) {
    const line = raw.replace(/\s+$/, '')
    if (!line.trim()) continue
    const d = DECISION.exec(line.trim())
    if (d) { card.decision = (d[1] ?? '').trim(); current = null; continue }
    const s = SECTION.exec(line)
    if (s && !/^\s/.test(line)) {
      current = { label: (s[1] ?? '').trim(), lines: s[2]?.trim() ? [s[2].trim()] : [] }
      card.sections.push(current)
      continue
    }
    if (current) current.lines.push(line.trim())
    else if (card.decision !== null) card.decision += ' ' + line.trim()
    else card.verdict = card.verdict ? `${card.verdict} ${line.trim()}` : line.trim()
  }
  if (!card.verdict && card.sections.length === 0) return null
  return card
}

/** Splits a card line into spans so the markers carry colour: ✓ ⚠ ? and the severities. */
export function markSpans(line: string): { text: string; tone: 'ok' | 'warn' | 'ask' | 'crit' | 'plain' }[] {
  const out: { text: string; tone: 'ok' | 'warn' | 'ask' | 'crit' | 'plain' }[] = []
  const re = /(✓|⚠|(?<=^|\s)\?(?=\s)|\bcritical\b|\bmajor\b)/g
  let last = 0
  for (let m = re.exec(line); m; m = re.exec(line)) {
    if (m.index > last) out.push({ text: line.slice(last, m.index), tone: 'plain' })
    const t = m[0]
    out.push({ text: t, tone: t === '✓' ? 'ok' : t === '⚠' || t === 'major' ? 'warn' : t === 'critical' ? 'crit' : 'ask' })
    last = m.index + t.length
  }
  if (last < line.length) out.push({ text: line.slice(last), tone: 'plain' })
  return out
}
