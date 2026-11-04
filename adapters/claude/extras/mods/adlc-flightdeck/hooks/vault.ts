// Pure readers of what the vault already writes: hot.md lines, records, pipeline-state
// notes, and the map from a phase to the files and sections that belong to it. No `$`,
// no state; everything here is unit-tested.
import type { FlightGateAsk, FlightItem, FlightOption, FlightReq, FlightStripEntry } from '../types'
import { BUG_PHASES, ID_SRC, REQ_PHASES, idOf, type PipelineState } from './model'

/** Every name a phase goes by in hot.md events, gate names and notes — skills are not uniform. */
const ALIASES: Record<'req' | 'bug', string[][]> = {
  req: [
    ['spec', 'req-created', 'reframe'],
    ['architect', 'work-path-set', 'adr-accepted', 'adr-proposed', 'task-plan-cleared'],
    ['implement', 'task'],
    ['review', 'verify'],
    ['ship', 'wrapup', 'wrap-up', 'req-merged', 'req-ready-to-merge', 'req-cleaned', 'req-archived', 'lesson', 'gotcha', 'knowledge-retracted'],
  ],
  bug: [
    ['report', 'bug-created', 'bug-reported'],
    ['plan', 'investigate', 'investigation'],
    ['fix', 'task'],
    ['verify', 'review'],
    ['ship', 'wrapup', 'wrap-up', 'bug-merged', 'req-merged', 'req-ready-to-merge', 'req-cleaned', 'req-archived', 'lesson', 'gotcha'],
  ],
}

export const phaseNames = (kind: 'req' | 'bug') => (kind === 'bug' ? BUG_PHASES : REQ_PHASES)

/** The phase (1–5) an event or gate name belongs to, or null for REQ-wide events (revert, cancel, recover). */
export function phaseOf(kind: 'req' | 'bug', name: string): number | null {
  const n = name.toLowerCase()
  const table = ALIASES[kind]
  for (let i = 0; i < table.length; i++) {
    const row = table[i] ?? []
    if (row.some(a => n === a || n.startsWith(`${a}-`) || n.startsWith(`${a} `))) return i + 1
  }
  return null
}

// ---------- hot.md ----------

export type HotEvent = { date: string; event: string; req: string | null; rest: string }

const HOT_LINE = /^##\s*\[(\d{4}-\d{2}-\d{2})\]\s*([a-z][\w-]*)\s*(?:\|\s*(.*))?$/

/** `## [2026-06-21] verify-gate-cleared | REQ-001-priorities | findings …` → one event per line, file order kept (newest first). */
export function parseHot(text: string): HotEvent[] {
  const out: HotEvent[] = []
  for (const raw of text.split('\n')) {
    const m = HOT_LINE.exec(raw.trim())
    if (!m) continue
    const rest = (m[3] ?? '').trim()
    const req = idOf(rest)
    out.push({ date: m[1] ?? '', event: m[2] ?? '', req, rest })
  }
  return out
}

/** The events about one REQ, optionally only those of one phase (REQ-wide events ride along with every phase). */
export function hotFor(events: HotEvent[], id: string, kind: 'req' | 'bug', phase?: number): HotEvent[] {
  return events.filter(ev => {
    if (ev.req !== id) return false
    if (phase === undefined) return true
    const p = phaseOf(kind, ev.event)
    return p === null || p === phase
  })
}

/** Strips the REQ id from an event's tail so a row reads `findings: C0/M3/m9 …`, not the id twice. */
const HOT_TAIL = new RegExp(`^${ID_SRC}[\\w-]*\\s*\\|?\\s*`)
export const hotTail = (ev: HotEvent) => ev.rest.replace(HOT_TAIL, '')

// ---------- pipeline-state.json: notes[] and the 1.10 `phases` block ----------

export type VaultRound = { at?: string; decision?: string; note?: string; by?: string; viewed?: string; card?: { transcript?: string; verdict?: string } }
export type VaultAgent = { id?: string; type?: string; task?: string; startedAt?: string; endedAt?: string; verdict?: string; transcript?: string }
export type VaultFinding = { id?: string; severity?: string; decision?: string; reason?: string }
export type VaultPhase = { startedAt?: string; sessions?: string[]; agents?: VaultAgent[]; gates?: VaultRound[]; findings?: VaultFinding[] }

/** `notes[]` lines that belong to a phase: `spec-gate-cleared …`, `TASK-003 done …` (implement/fix), `verify …`. */
export function notesFor(kind: 'req' | 'bug', phase: number, notes: readonly string[] | undefined): string[] {
  if (!notes) return []
  return notes.filter(n => {
    const head = /^([A-Za-z][\w-]*)/.exec(n.trim())?.[1] ?? ''
    if (/^TASK$/i.test(head) || /^TASK-\d+/i.test(n.trim())) return phase === 3
    const p = phaseOf(kind, head)
    return p === phase
  })
}

// ---------- the record (<REQ_PATH>.md): title, header table, sections ----------

export type Record_ = { id: string; title: string; fields: Record<string, string>; sections: Record<string, string> }

const RECORD_H1 = new RegExp(`^#\\s+(${ID_SRC})\\s*[—–-]+\\s*(.*)$`)

export function parseRecord(text: string): Record_ {
  const lines = text.split('\n')
  const h1 = lines.find(l => /^#\s+/.test(l)) ?? ''
  const hm = RECORD_H1.exec(h1.trim())
  const id = hm?.[1] ?? idOf(h1) ?? ''
  const title = (hm?.[2] ?? h1.replace(/^#\s+/, '')).trim()
  const fields: Record<string, string> = {}
  const sections: Record<string, string> = {}
  let current: string | null = null
  let buf: string[] = []
  const flush = () => { if (current !== null) sections[current] = buf.join('\n').trim(); buf = [] }
  for (const l of lines) {
    const sm = /^##\s+(.+?)\s*$/.exec(l)
    if (sm) { flush(); current = (sm[1] ?? '').trim().toLowerCase(); continue }
    if (current === null) {
      const fm = /^\|\s*([^|]+?)\s*\|\s*(.*?)\s*\|\s*$/.exec(l)
      if (fm && !/^-+$/.test(fm[2] ?? '') && !/^Field$/i.test(fm[1] ?? '')) fields[(fm[1] ?? '').toLowerCase()] = fm[2] ?? ''
    } else buf.push(l)
  }
  flush()
  return { id, title, fields, sections }
}

/** Which record sections tell the story of a phase. */
export function recordSectionsFor(phase: number): string[] {
  return [['goal', 'acceptance criteria'], ['decisions', 'what changed'], ['what changed'], ['verification'], ['knowledge', 'follow-ups', 'later']][phase - 1] ?? []
}

/** Record `## Decisions` lines that name a phase (`Spec gate: …`, `Review gate: …`); ADR lines land on architect. */
export function recordDecisionsFor(kind: 'req' | 'bug', phase: number, decisions: string | undefined): string[] {
  if (!decisions) return []
  const names = phaseNames(kind)
  return decisions.split('\n').map(l => l.replace(/^\s*[-*]\s*/, '').trim()).filter(l => {
    if (!l) return false
    const gate = /^([A-Za-z-]+)\s+gate\b/i.exec(l)?.[1]
    if (gate) return phaseOf(kind, gate.toLowerCase()) === phase
    if (/^ADR-\d+/i.test(l)) return phase === 2
    return names.some((n, i) => i + 1 === phase && new RegExp(`\\b${n}\\b`, 'i').test(l))
  })
}

/** The body under `## <heading>` of a markdown file, or null. Case-insensitive on the heading. */
export function sectionOf(md: string, heading: string): string | null {
  const re = new RegExp(`^##\\s+${heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'im')
  const m = re.exec(md)
  if (!m || m.index === undefined) return null
  const rest = md.slice(m.index + m[0].length)
  const end = /^##\s+/m.exec(rest)
  return (end && end.index !== undefined ? rest.slice(0, end.index) : rest).trim()
}

// ---------- artifacts: which working-set files belong to a phase ----------

export type Artifact = { file: string; label: string }

const REQ_FILES: Artifact[][] = [
  [{ file: 'requirement.md', label: 'requirement' }],
  [{ file: 'architecture.md', label: 'architecture' }, { file: 'exploration.md', label: 'exploration' }, { file: 'revert-plan.md', label: 'revert plan' }],
  [{ file: 'tasks', label: 'tasks' }, { file: 'commits-draft.md', label: 'commit drafts' }, { file: 'code-revert-plan.md', label: 'code revert plan' }],
  [{ file: 'verification.md', label: 'verification' }, { file: 'review-log.md', label: 'review log' }, { file: 'verify-output.md', label: 'verify output' }, { file: 'review-packet.md', label: 'review packet' }, { file: 'lesson-candidates.md', label: 'lesson candidates' }],
  [{ file: 'pr-draft.md', label: 'PR draft' }, { file: 'merge-checklist.md', label: 'merge checklist' }, { file: 'source-writeback.md', label: 'source write-back' }, { file: 'usage.json', label: 'usage' }],
]
const BUG_FILES: Artifact[][] = [
  [{ file: 'bug.md', label: 'bug report' }],
  [{ file: 'investigation.md', label: 'investigation' }],
  [{ file: 'commits-draft.md', label: 'commit drafts' }, { file: 'tasks', label: 'tasks' }],
  [{ file: 'verification.md', label: 'verification' }, { file: 'review-log.md', label: 'review log' }, { file: 'verify-output.md', label: 'verify output' }, { file: 'lesson-candidates.md', label: 'lesson candidates' }],
  [{ file: 'bug-fix-pr-draft.md', label: 'PR draft' }, { file: 'merge-checklist.md', label: 'merge checklist' }, { file: 'source-writeback.md', label: 'source write-back' }],
]

export const artifactsFor = (kind: 'req' | 'bug', phase: number): Artifact[] => (kind === 'bug' ? BUG_FILES : REQ_FILES)[phase - 1] ?? []

// ---------- paths: month and author from a partitioned vault ----------

/** `specs/2026-08/sf/REQ-042-slug` → month `2026-08`, author `sf`; flat vaults give nulls; `_archive/` is skipped. */
export function partsOf(rel: string): { month: string | null; author: string | null; archived: boolean } {
  const segs = rel.replace(/\\/g, '/').split('/').filter(Boolean)
  const archived = segs.includes('_archive')
  const mid = segs.slice(1, -1).filter(s => s !== '_archive')
  const month = mid.find(s => /^\d{4}-\d{2}$/.test(s)) ?? null
  const author = mid.find(s => !/^\d{4}-\d{2}$/.test(s)) ?? null
  return { month, author, archived }
}

/** History rows, newest first, filtered the way the Settings tab asks. */
export function filterItems(items: FlightItem[], mode: 'all' | 'flying' | 'done', author: string | null, text: string): FlightItem[] {
  const q = text.trim().toLowerCase()
  return items
    .filter(it => (mode === 'all' ? true : mode === 'flying' ? it.state === 'flying' || it.state === 'gate' : it.state === 'merged' || it.state === 'archived' || it.state === 'cancelled'))
    .filter(it => (author ? it.author === author : true))
    .filter(it => (q ? `${it.id} ${it.title}`.toLowerCase().includes(q) : true))
    .sort((a, b) => b.touchedAt - a.touchedAt)
}

// ---------- small text helpers ----------

/** The first line worth quoting: body text before a heading, a heading if that is all there is; fences and bold stripped. */
export const firstLine = (s: string, max = 160) => {
  const lines = s.split('\n').map(l => l.trim()).filter(l => l && !/^[`>*|-]+$/.test(l) && !/^```/.test(l))
  const line = lines.find(l => !/^#/.test(l)) ?? lines[0] ?? ''
  const clean = line.replace(/^#+\s*/, '').replace(/\*\*/g, '').replace(/^[-*]\s+/, '')
  return clean.length > max ? clean.slice(0, max - 1) + '…' : clean
}

// ---------- the gate: its options, and the reply that answers it ----------

export type GateOption = FlightOption
export type GateAsk = FlightGateAsk

/** The head of an option's label: `fix <ids|all-major>` → `fix`, `fix all` → `fix all`. */
export const optionHead = (label: string) => label.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().toLowerCase()
/** One option from `label — consequence` or `label (consequence)`; `(recommended …)` lifted out. */
function optionOf(part: string): GateOption | null {
  let s = part.trim().replace(/^[-*]\s+/, '')
  if (!s) return null
  let recommended = false
  s = s.replace(/\s*\((?:recommended|my read)\b\s*(?:[—–:-]\s*)?([^)]*)\)/i, (_m, rest: string) => { recommended = true; return rest.trim() ? ` — ${rest.trim()}` : '' })
  const paren = /^(.*?)\s*\(([^)]*)\)\s*$/.exec(s)
  const dash = /^(.*?)\s+[—–]\s+(.*)$/.exec(s)
  const [label, consequence] = dash ? [dash[1] ?? '', dash[2] ?? ''] : paren && !/<[^>]*$/.test(paren[1] ?? '') ? [paren[1] ?? '', paren[2] ?? ''] : [s, '']
  const l = label.trim()
  if (!l || l.length > 60) return null
  return { label: l, consequence: consequence.trim(), needsArg: /<[^>]+>/.test(l), recommended }
}
/** Marks the option `MY READ` names (its first words), when nothing is marked yet. Longest head wins: `fix all` over `fix`. */
function recommend(options: GateOption[], hint: string): GateOption[] {
  if (options.some(o => o.recommended)) return options
  const read = hint.trim().toLowerCase()
  let best = -1, len = 0
  options.forEach((o, i) => {
    const h = optionHead(o.label)
    if (h && read.startsWith(h) && !/[a-z0-9]/.test(read.charAt(h.length)) && h.length > len) { best = i; len = h.length }
  })
  return options.map((o, i) => ({ ...o, recommended: i === best }))
}

/** .awaiting-approval → the ask and its options (1.12 marker). A 1.11 marker has no Options: block and yields options: []. */
export function parseMarker(text: string): GateAsk {
  const out: GateAsk = { phase: '', req: '', ask: '', options: [], files: [], source: 'marker' }
  let block: 'options' | 'files' | null = null
  let rec = ''
  for (const raw of text.replace(/\r\n/g, '\n').split('\n')) {
    const item = /^\s+[-*]\s+(.*)$/.exec(raw)
    if (item && block) {
      if (block === 'options') { const o = optionOf(item[1] ?? ''); if (o) out.options.push(o) }
      else out.files.push((item[1] ?? '').replace(/\s+\(.*\)\s*$/, '').trim())
      continue
    }
    const kv = /^([A-Za-z][\w ]*?):\s*(.*)$/.exec(raw.trim())
    if (!kv) continue
    const key = (kv[1] ?? '').toLowerCase(), val = (kv[2] ?? '').trim()
    block = key === 'options' ? 'options' : key === 'files' ? 'files' : null
    if (key === 'phase') out.phase = val
    else if (key === 'req') out.req = val
    else if (key === 'ask' || (key === 'awaiting' && !out.ask)) out.ask = val
    else if (key === 'recommended') rec = val
  }
  out.options = recommend(out.options.slice(0, 8), rec)
  return out
}

/** Fallback for a 1.11 toolkit: the card's `Decision →` line split on ' · ', each part `label (consequence)` or `label — consequence`. */
export function optionsFromDecision(line: string | null, myRead: string): GateOption[] {
  if (!line) return []
  const parts = line.split(/\s+·\s+/).map(optionOf).filter((o): o is GateOption => o !== null)
  return recommend(parts.slice(0, 8), myRead)
}

/**
 * The gate's own options as each phase skill defines them, for a marker that lists none and a card this
 * machine never saw (a gate opened in another session by an older toolkit). `MY READ`, when known, marks one.
 */
const STANDARD: Record<string, string[]> = {
  review: [
    'fix all — every actionable finding gets fixed; reviewers re-run and the gate comes back',
    'fix <ids|all-major> — the same loop, scoped to the findings you name',
    'approve — accept the findings as they are and move on to wrapup',
    'revise <what> — other changes to the review',
    'abort — escalate and halt this REQ',
  ],
  verify: [
    'approve — the fix is verified; move on to ship',
    'revise <what> — change the fix first',
    'abort — halt this bug',
  ],
  ship: [
    'approve — gate cleared; run the merge checklist',
    'revise <what> — adjust the PR draft or the vault updates',
    'merged — after you merge: finalize state and log it to hot.md',
    'abort — halt without merging',
  ],
}
const NEXT: Record<string, string> = { spec: 'architect', architect: 'implement', implement: 'review', report: 'plan', plan: 'fix', fix: 'verify' }
export function standardOptions(phase: string, myRead: string): GateOption[] {
  const lines = STANDARD[phase] ?? [
    `approve — gate cleared; ${NEXT[phase] ? `ready for ${NEXT[phase]}` : 'move on'}`,
    'revise <what> — describe what to change first',
    `abort — stop ${phase === 'spec' || phase === 'report' ? 'and discard this item' : `here; ${phase === 'implement' || phase === 'fix' ? 'the work tree needs cleaning up' : 'the earlier phases stay'}`}`,
  ]
  return recommend(lines.map(optionOf).filter((o): o is GateOption => o !== null), myRead)
}

/** The cockpit's trailer on a reply it sent: the viewed count at implement and review, `pane` elsewhere. */
export const REPLY_TRAILER = /\s*\[flightdeck\](?: viewed (\d{1,3})\/(\d{1,3}) files?| pane)\s*$/
export const trailerFor = (phase: number, v: { n: number; m: number } | null) =>
  (phase === 3 || phase === 4) && v && v.m > 0 ? `\n\n[flightdeck] viewed ${v.n}/${v.m} files` : '\n\n[flightdeck] pane'

/** The text the pane submits for an option: the label (an argument the
 *  user typed substituted for its <…>), then the viewed trailer at
 *  implement and review when files changed. */
export function replyFor(o: GateOption, arg: string | null, phase: number, v: { n: number; m: number } | null): string {
  const a = (arg ?? '').trim()
  const text = o.needsArg ? (a ? o.label.replace(/<[^>]*>/, a) : optionHead(o.label)) : o.label
  return `${text.replace(/\s+/g, ' ').trim()}${trailerFor(phase, v)}`
}

/** The words a gate understands when the marker lists no options (a 1.11 toolkit, a gate never captured here). */
const VERBS = ['approve', 'fix all', 'fix', 'revise', 'abort', 'merged', 'reframe', 'escalate', 'skip']

/** A user turn → { decision, note, viewed } — the first word or two that
 *  name an option, the rest as the note, the trailer lifted out. */
export function replyOf(text: string, options: GateOption[]): { decision: string; note: string; viewed: string | null } {
  const t = REPLY_TRAILER.exec(text)
  const viewed = t && t[1] ? `${t[1]}/${t[2]}` : null
  const body = text.replace(REPLY_TRAILER, '').trim()
  const low = body.toLowerCase()
  const heads = [...new Set([...options.map(o => optionHead(o.label)), ...(options.length ? [] : VERBS)])].filter(Boolean).sort((a, b) => b.length - a.length)
  const head = heads.find(h => low.startsWith(h) && !/[a-z0-9]/.test(low.charAt(h.length))) ?? ''
  const note = head ? body.slice(head.length).replace(/^[\s:,—–-]+/, '').trim() : ''
  return { decision: head, note: note.slice(0, 200), viewed }
}

/**
 * The REQ strip: the in-flight REQs (see `inFlight`), plus the members of a running sprint,
 * matched by full id — one that finished here rides along done, one with nothing here is
 * kept, dim. At a gate first (oldest wait first), then the most recently stamped.
 */
export function stripOf(
  reqs: readonly FlightReq[],
  members: readonly { id: string; sprint: string }[],
  endedHere: (id: string) => string | false | null | undefined,
): FlightStripEntry[] {
  const out: FlightStripEntry[] = reqs.map(r => ({ id: r.id, phase: r.phase, phaseName: r.phaseName, waiting: r.waiting, sprint: null, here: true }))
  const at = new Map(reqs.map(r => [r.id, r] as const))
  for (const m of members) {
    const id = idOf(m.id) ?? m.id
    const have = out.find(x => x.id === id)
    if (have) { have.sprint ??= m.sprint; continue }
    const ended = endedHere(id)
    // A member with a folder or record here that is no longer flying finished in this sprint: it rides the strip, done.
    if (ended === 'merged' || ended === 'archived' || ended === 'cancelled') {
      out.push({ id, phase: 5, phaseName: 'ship', waiting: false, sprint: m.sprint, here: true, ended: ended === 'cancelled' ? 'cancelled' : 'merged' })
      continue
    }
    if (ended) continue
    out.push({ id, phase: 0, phaseName: '', waiting: false, sprint: m.sprint, here: false })
  }
  // Waiting first, then flying, then finished, then members with nothing here.
  const rank = (s: FlightStripEntry) => (!s.here ? 3 : s.ended ? 2 : s.waiting ? 0 : 1)
  return out.sort((a, b) => {
    if (rank(a) !== rank(b)) return rank(a) - rank(b)
    const ra = at.get(a.id), rb = at.get(b.id)
    if (a.waiting) return (ra?.waitingSince ?? 0) - (rb?.waitingSince ?? 0)
    return (rb?.touchedAt ?? 0) - (ra?.touchedAt ?? 0)
  })
}

/** By ID number: REQs before BUGs, then the number (`REQ-sf-011` before `REQ-sf-026`), then the text. */
export function idOrder(a: string, b: string): number {
  const kind = (id: string) => (/^BUG/.test(id) ? 1 : 0)
  const num = (id: string) => Number(/(\d+)$/.exec(id)?.[1] ?? Number.MAX_SAFE_INTEGER)
  return kind(a) - kind(b) || num(a) - num(b) || a.localeCompare(b)
}

/**
 * Where ✈ takes you: while a sprint runs, its first member still in flight (by ID); else the REQ this
 * session is flying, when it is in flight; else the first one at a gate; else the first in flight.
 */
export function flyingTarget(strip: readonly FlightStripEntry[], focus: string | null): string | null {
  const live = strip.filter(s => s.here && !s.ended).slice().sort((a, b) => idOrder(a.id, b.id))
  const sprint = live.find(s => s.sprint)
  if (sprint) return sprint.id
  if (focus && live.some(s => s.id === focus)) return focus
  return (live.find(s => s.waiting) ?? live[0])?.id ?? null
}

/** A sprint registry (`sprints/<month>/SPRINT-*.json`, or flat) → its members, finished ones too; none once the sprint is complete. */
export function sprintMembers(json: string): { id: string; sprint: string }[] {
  let reg: { sprint?: string; status?: string; reqs?: { id?: string; status?: string }[] }
  try { reg = JSON.parse(json) as typeof reg } catch { return [] }
  if (reg.status && reg.status !== 'running') return []
  const sprint = reg.sprint ?? 'sprint'
  return (reg.reqs ?? []).filter(r => r.id).map(r => ({ id: r.id as string, sprint }))
}

/**
 * Which REQs are in flight: started (past phase 0) and not merged or aborted (the deck holds only those), and
 * either not yet at their last phase or waiting at a gate. 0.8.1: a REQ waiting at the ship gate is in flight —
 * it is the one gate left to answer; 0.7.0 dropped it, and with it the band. A REQ at ship with no marker, or
 * one that has not begun, is history.
 */
export function inFlight(reqs: readonly FlightReq[]): FlightReq[] {
  return reqs.filter(r => r.phase >= 1 && (r.phase < r.phases.length || r.waiting))
}

/**
 * One row of the narrow list home: the gate state, the last round's decision and how many
 * rounds, findings that need a call at review, the viewed count at implement and review,
 * whether the predict (architect) or summary (ship) ask was answered, and the wait.
 */
export function phaseLine(c: {
  n: number
  state: 'done' | 'now' | 'gate' | 'todo' | string
  rounds: readonly { decision: string; note: string }[]
  needCall?: number
  findings?: number
  viewed?: { n: number; m: number } | null
  waiting?: string | null
}): string {
  const parts: string[] = []
  const gates = c.rounds.filter(r => r.decision !== 'predict' && r.decision !== 'summary')
  const last = gates[gates.length - 1]
  if (c.n === 4 && c.findings) parts.push(`${c.findings} finding${c.findings > 1 ? 's' : ''}`)
  if (c.n === 4 && c.needCall) parts.push(`${c.needCall} need${c.needCall > 1 ? '' : 's'} a call`)
  if (last && c.state !== 'gate') parts.push(`${last.decision} · ${gates.length} round${gates.length > 1 ? 's' : ''}`)
  else if (last) parts.push(`last: ${last.decision}`)
  const ask = c.n === 2 ? c.rounds.find(r => r.decision === 'predict') : c.n === 5 ? c.rounds.find(r => r.decision === 'summary') : undefined
  if (ask) parts.push(`${c.n === 2 ? 'predict' : 'summary'} ${!ask.note || /^skip\b/i.test(ask.note) ? 'skipped' : 'answered'}`)
  if ((c.n === 3 || c.n === 4) && c.viewed && c.viewed.m > 0) parts.push(`viewed ${c.viewed.n}/${c.viewed.m}`)
  if (c.state === 'gate' && c.waiting) parts.push(`waiting ${c.waiting}`)
  if (!parts.length) parts.push(c.state === 'todo' ? '' : c.state === 'now' ? 'in progress' : c.state === 'gate' ? 'at the gate' : 'cleared')
  return parts.join(' · ')
}

const SKILL_OF: Record<number, string> = { 1: 'spec', 2: 'architect', 3: 'implement', 4: 'review', 5: 'wrapup' }

/** The instructions the cockpit hands `$.session.compact` at a gate: what to keep, what is on disk, what to re-read. ≤1,200 characters. */
export function compactBrief(r: FlightReq, st: PipelineState | undefined, ask: GateAsk | undefined, folder: string | undefined, vault: string | null, digestIds: readonly string[] = []): string {
  const rel = folder && vault && folder.startsWith(vault) ? folder.slice(vault.length).replace(/^\/+/, '') : (folder ?? r.id)
  const skill = r.kind === 'bug' ? 'bugfix' : SKILL_OF[r.phase] ?? 'proceed'
  const vp = st?.phases?.[String(r.phase)]
  const open = (st?.phases?.['4']?.findings ?? []).filter(f => f.id && f.decision !== 'accept').map(f => f.id as string)
  const ids = (open.length ? open : [...digestIds]).slice(0, 12)
  const tasks = Object.entries(st?.taskStatus ?? {}).sort(([a], [b]) => a.localeCompare(b)).slice(0, 12).map(([k, v]) => `${k} ${v}`)
  const words = (vp?.gates ?? []).map(g => g.note ?? '').filter(Boolean).slice(-3).map(n => `“${n.slice(0, 80)}”`)
  const since = r.waitingSince != null ? ` waiting since ${timeOf(r.waitingSince)}` : ''
  const files = (ask?.files ?? []).slice(0, 4).map(f => `  ${f.startsWith('.adlc/') ? f : `.adlc/${f}`}`)
  const lines = [
    `ADLC gate compaction. Resuming ${r.id} (${rel}) at phase ${r.phase} ${r.phaseName}, gate ${st?.currentPhaseGate ?? r.phaseName},${since}. The vault is the record; the summary is not.`,
    `Keep verbatim: the gate's options and MY READ; open finding ids (${ids.join(', ') || 'none'}); the task list and status (${tasks.join(', ') || 'none'}); the user's own words from this phase's rounds${words.length ? ` (${words.join(' ')})` : ''}.`,
    'Drop: tool output, file contents, reviewer narratives — all on disk.',
    'After compaction, re-read in full before acting:',
    `  $TOOLKIT_PATH/core/skills/${skill}.md`,
    '  $TOOLKIT_PATH/core/GATE-PROTOCOL.md',
    `  .adlc/${rel}/pipeline-state.json`,
    `  .adlc/${rel}/.awaiting-approval`,
    ...files,
  ]
  let s = lines.join('\n')
  // Over budget: the quoted words go first, then the task list shortens; the re-read list is never cut.
  if (s.length > 1200 && words.length) { lines[1] = (lines[1] ?? '').replace(/ \(“.*”\)\.$/, '.'); s = lines.join('\n') }
  if (s.length > 1200) { lines[1] = (lines[1] ?? '').replace(/\(TASK-[^)]*\)/, `(${tasks.slice(0, 4).join(', ')}${tasks.length > 4 ? ', …' : ''})`); s = lines.join('\n') }
  return s.length > 1200 ? s.slice(0, 1199) + '…' : s
}

export const dateOf = (ms: number) => new Date(ms).toISOString().slice(0, 10)
export const timeOf = (ms: number) => new Date(ms).toTimeString().slice(0, 5)
export const age = (ms: number) => (ms < 3_600_000 ? `${Math.max(1, Math.round(ms / 60_000))}m` : ms < 86_400_000 ? `${Math.round(ms / 3_600_000)}h` : `${Math.round(ms / 86_400_000)}d`)
