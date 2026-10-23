// Pure readers of what the vault already writes: hot.md lines, records, pipeline-state
// notes, and the map from a phase to the files and sections that belong to it. No `$`,
// no state; everything here is unit-tested.
import type { FlightItem } from '../types'
import { BUG_PHASES, REQ_PHASES } from './model'

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
    const req = /\b((?:REQ|BUG)-\d+)/.exec(rest)?.[1] ?? null
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
export const hotTail = (ev: HotEvent) => ev.rest.replace(/^(?:REQ|BUG)-\d+[\w-]*\s*\|?\s*/, '')

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

export function parseRecord(text: string): Record_ {
  const lines = text.split('\n')
  const h1 = lines.find(l => /^#\s+/.test(l)) ?? ''
  const hm = /^#\s+((?:REQ|BUG)-\d+)\s*[—–-]+\s*(.*)$/.exec(h1.trim())
  const id = hm?.[1] ?? (/\b((?:REQ|BUG)-\d+)/.exec(h1)?.[1] ?? '')
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

/** The answer of an AskUserQuestion gate dialog: the first choice, and the free text if any. */
export function decisionOf(answers: Record<string, string> | undefined, response: string | undefined): { decision: string; note: string } {
  const first = answers ? Object.values(answers)[0] ?? '' : ''
  const typed = (response ?? '').replace(/\s*\[flightdeck\] viewed \d+\/\d+ files?\s*$/, '').trim() // the mod's own trailer is not the user's words
  const decision = first.split(/\s+[—–-]\s+/)[0]?.trim().toLowerCase() || (typed ? 'typed' : '')
  return { decision, note: typed.slice(0, 200) }
}

export const dateOf = (ms: number) => new Date(ms).toISOString().slice(0, 10)
export const timeOf = (ms: number) => new Date(ms).toTimeString().slice(0, 5)
export const age = (ms: number) => (ms < 3_600_000 ? `${Math.max(1, Math.round(ms / 60_000))}m` : ms < 86_400_000 ? `${Math.round(ms / 3_600_000)}h` : `${Math.round(ms / 86_400_000)}d`)
