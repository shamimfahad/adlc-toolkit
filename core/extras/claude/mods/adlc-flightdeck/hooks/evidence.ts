// Pure readers for the evidence pages: the tables the vault's templates mandate (blast radius,
// task files, findings, acceptance criteria), git's plain-text answers (porcelain, numstat),
// and the derivations the pages draw — plan vs actual, task tiers as rails, path pointers as
// links, the ship gate's consequences. No `$`, no state; everything here is unit-tested.
import { sectionOf } from './vault'

// ---------- paths ----------

/** Forward slashes, no leading `./`, no trailing slash. Keeps case: the display path. */
export const normPath = (p: string) => p.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '').trim()
/** The key two paths are compared on: normalised and lower-cased (Windows checkouts mix case). */
export const pathKey = (p: string) => normPath(p).toLowerCase()
export const baseName = (p: string) => normPath(p).split('/').pop() ?? p
const isAbs = (p: string) => /^(?:[A-Za-z]:\/|\/)/.test(normPath(p))
/** `<root>/<rel>` unless `rel` is already absolute. */
export const absPath = (root: string, rel: string) => (isAbs(rel) ? normPath(rel) : `${normPath(root)}/${normPath(rel)}`)

/**
 * An editor link from the settings template: `{path}`, `{line}`, `{col}` substituted,
 * the path percent-encoded where a terminal would choke (spaces), never the slashes or
 * the drive colon.
 */
export function editorHref(template: string, path: string, line?: number, col?: number): string {
  const p = normPath(path).replace(/ /g, '%20')
  return template
    .replace('{path}', p)
    .replace('{line}', String(line ?? 1))
    .replace('{col}', String(col ?? 1))
    .replace(/:(\{line\}|\{col\})/g, '')
}

export const EDITOR_PRESETS: { value: string; label: string }[] = [
  { value: 'vscode://file/{path}:{line}:{col}', label: 'VS Code' },
  { value: 'cursor://file/{path}:{line}:{col}', label: 'Cursor' },
  { value: 'jetbrains://rider/navigate/reference?path={path}:{line}', label: 'Rider' },
  { value: 'file:///{path}', label: 'file://' },
]

// ---------- markdown tables ----------

export type Table = { header: string[]; rows: string[][] }

const cell = (s: string) => s.trim().replace(/^`(.*)`$/, '$1').trim()

/** The first pipe table in `md`: header cells lower-cased, every row's cells unquoted. */
export function parseTable(md: string | null): Table | null {
  if (!md) return null
  const lines = md.split('\n').map(l => l.trim()).filter(l => /^\|.*\|$/.test(l))
  if (lines.length < 2) return null
  const split = (l: string) => l.slice(1, -1).split('|').map(cell)
  const header = split(lines[0] ?? '').map(h => h.toLowerCase())
  const body = lines.slice(1).filter(l => !/^\|[\s:|-]+\|$/.test(l))
  return { header, rows: body.map(split) }
}

const col = (t: Table, ...names: string[]) => {
  for (const n of names) { const i = t.header.findIndex(h => h.includes(n)); if (i >= 0) return i }
  return -1
}
const at = (row: string[], i: number) => (i >= 0 ? row[i] ?? '' : '')

// ---------- architecture.md ----------

export type Planned = { path: string; why: string; risk: string }

/** `## Blast radius` rows → `{ path, why, risk }`. Rows without a path-looking first cell are skipped. */
export function blastRadius(archMd: string | null): Planned[] {
  const t = parseTable(sectionOf(archMd ?? '', 'Blast radius'))
  if (!t) return []
  const ip = col(t, 'path', 'file'), iw = col(t, 'why', 'reason', 'change'), ir = col(t, 'risk')
  return t.rows
    .map(r => ({ path: normPath(at(r, ip >= 0 ? ip : 0)), why: at(r, iw), risk: at(r, ir).toLowerCase() }))
    .filter(r => r.path && /[./]/.test(r.path))
}

/** Every ` ```mermaid ` fence in a document, source only. */
export function mermaidFences(md: string | null): string[] {
  const out: string[] = []
  const re = /```mermaid[^\n]*\n([\s\S]*?)```/g
  for (let m = re.exec(md ?? ''); m; m = re.exec(md ?? '')) { const src = (m[1] ?? '').trim(); if (src) out.push(src) }
  return out
}

/** `## Related` lines that name a lesson, gotcha, ADR or concept: `L-REQ-042-1 — why`, `ADR-009 …`. */
export function knowledgeHits(archMd: string | null): { id: string; text: string }[] {
  const body = sectionOf(archMd ?? '', 'Related') ?? ''
  const out: { id: string; text: string }[] = []
  for (const raw of body.split('\n')) {
    const l = raw.replace(/^\s*[-*]\s*/, '').trim()
    const m = /^((?:L-|LESSON-)?(?:REQ|BUG)-\d+-\d+|L\d+|ADR-\d+|g\d+|G-\d+|\[\[[^\]]+\]\])/i.exec(l)
    if (m) out.push({ id: (m[1] ?? '').replace(/^\[\[|\]\]$/g, ''), text: l })
  }
  return out
}

// ---------- tasks/TASK-NNN.md ----------

export type TaskDoc = {
  id: string
  title: string
  tier: number | null
  status: string
  dependsOn: string[]
  goal: string
  files: { path: string; action: string }[]
  acceptance: { text: string; done: boolean }[]
}

export function parseTask(md: string, fallbackId = ''): TaskDoc {
  const h1 = /^#\s+(TASK-\d+)\s*[—–-]+\s*(.*)$/m.exec(md)
  const fields: Record<string, string> = {}
  for (const l of md.split('\n')) {
    const fm = /^\|\s*([^|]+?)\s*\|\s*(.*?)\s*\|\s*$/.exec(l)
    if (fm && !/^-+$/.test(fm[2] ?? '') && !/^Field$/i.test(fm[1] ?? '')) fields[(fm[1] ?? '').toLowerCase()] = fm[2] ?? ''
  }
  const dep = (fields['depends on'] ?? '').match(/TASK-\d+/g) ?? []
  const tierM = /\d+/.exec(fields.tier ?? '')
  const ft = parseTable(sectionOf(md, 'Files to touch'))
  const files = ft ? ft.rows.map(r => ({ path: normPath(at(r, 0)), action: at(r, 1).toLowerCase() })).filter(f => f.path && /[./]/.test(f.path)) : []
  return {
    id: h1?.[1] ?? fallbackId,
    title: (h1?.[2] ?? '').trim(),
    tier: tierM && !/\|/.test(fields.tier ?? '') ? Number(tierM[0]) : null,
    status: (fields.status ?? '').split('|')[0]?.trim().toLowerCase() ?? '',
    dependsOn: dep.filter(d => d !== (h1?.[1] ?? fallbackId)),
    goal: (sectionOf(md, 'Goal') ?? '').split('\n').map(l => l.trim()).find(l => l && !/^One sentence/.test(l)) ?? '',
    files,
    acceptance: checklist(sectionOf(md, 'Acceptance')),
  }
}

/** `- [ ] …` / `- [x] …` lines, or plain bullets, of a section. */
export function checklist(body: string | null): { text: string; done: boolean }[] {
  if (!body) return []
  const out: { text: string; done: boolean }[] = []
  for (const raw of body.split('\n')) {
    const m = /^\s*[-*]\s*(?:\[([ xX])\]\s*)?(.+)$/.exec(raw)
    if (!m) continue
    const text = (m[2] ?? '').trim()
    if (!text || /^Criterion \d$/.test(text)) continue
    out.push({ text, done: /[xX]/.test(m[1] ?? '') })
  }
  return out
}

/** Tasks in dependency tiers: tier 0 depends on nothing; a task sits one past its deepest dependency. The `Tier` field wins when present. */
export function tiersOf(tasks: TaskDoc[]): TaskDoc[][] {
  const byId = new Map(tasks.map(t => [t.id, t]))
  const depth = new Map<string, number>()
  const seen = new Set<string>()
  const d = (t: TaskDoc): number => {
    if (t.tier !== null) return t.tier
    const hit = depth.get(t.id)
    if (hit !== undefined) return hit
    if (seen.has(t.id)) return 0
    seen.add(t.id)
    const deps = t.dependsOn.map(id => byId.get(id)).filter((x): x is TaskDoc => !!x)
    const v = deps.length ? Math.max(...deps.map(d)) + 1 : 0
    depth.set(t.id, v)
    return v
  }
  const tiers: TaskDoc[][] = []
  for (const t of tasks) { const n = d(t); (tiers[n] ??= []).push(t) }
  return tiers.map(t => t ?? []).filter(t => t.length > 0)
}

export type RailRow = { rail: string; task: TaskDoc; tier: number }

/**
 * The DAG as rails, one task per row: `│ ├─` glyphs show the tier, so the eye reads
 * what can run together without a boxed diagram that would not fit the pane.
 */
export function rails(tiers: TaskDoc[][]): RailRow[] {
  const out: RailRow[] = []
  tiers.forEach((tier, i) => {
    tier.forEach((task, j) => {
      const first = j === 0, last = j === tier.length - 1
      const lead = i === 0 ? (first ? '┬' : '│') : first ? '├' : '│'
      const glyph = tier.length === 1 ? (i === 0 ? '●' : '├─●') : first ? `${lead}─┬●` : last ? '│ └●' : '│ ├●'
      out.push({ rail: glyph, task, tier: i })
    })
  })
  return out
}

// ---------- requirement.md ----------

export const acceptanceOf = (reqMd: string | null) => checklist(sectionOf(reqMd ?? '', 'Acceptance criteria') ?? sectionOf(reqMd ?? '', 'Acceptance'))

/** Bullet lines of a section, placeholders dropped. */
export function bulletsOf(md: string | null, heading: string): string[] {
  return checklist(sectionOf(md ?? '', heading)).map(c => c.text).filter(t => !/^\{\{|^…$/.test(t))
}

/** `## Behaviour` → `Today` / `After` bullet lists (toolkit 1.11.1); both empty when the section is absent. */
export function behaviourOf(reqMd: string | null): { today: string[]; after: string[] } {
  const body = sectionOf(reqMd ?? '', 'Behaviour') ?? sectionOf(reqMd ?? '', 'Behavior') ?? ''
  const parts: Record<string, string[]> = {}
  let cur = ''
  for (const raw of body.split('\n')) {
    const h = /^#{3,4}\s*(.+?)\s*$/.exec(raw)
    if (h) { cur = (h[1] ?? '').toLowerCase(); continue }
    if (cur) (parts[cur] ??= []).push(raw)
  }
  const list = (name: string) => checklist((parts[name] ?? []).join('\n')).map(c => c.text)
  return { today: list('today'), after: list('after') }
}

// ---------- verification.md ----------

export type Finding = {
  id: string
  severity: 'critical' | 'major' | 'minor' | 'trivial' | string
  text: string
  where: string
  effort: string
  fix: string
  reviewer: string
  disagreement: string
  needsDecision: boolean
}

/** `## Findings at a glance` rows; the `Disagreement` column is the 1.11.1 addition and reads empty before it. */
export function findingsOf(verificationMd: string | null): Finding[] {
  const t = parseTable(sectionOf(verificationMd ?? '', 'Findings at a glance'))
  if (!t) return []
  const ii = col(t, 'id'), is = col(t, 'severity'), it = col(t, 'finding'), iw = col(t, 'where', 'file', 'location'),
    ie = col(t, 'effort'), ifx = col(t, 'fix', 'disposition'), ir = col(t, 'reviewer', 'by'), id = col(t, 'disagree', 'dispute')
  return t.rows
    .map(r => {
      const fix = at(r, ifx).toLowerCase()
      return {
        id: at(r, ii), severity: at(r, is).toLowerCase(), text: at(r, it), where: at(r, iw), effort: at(r, ie), fix,
        reviewer: at(r, ir), disagreement: at(r, id),
        needsDecision: /your call|needs?[- ]decision|decide/.test(fix) || /needs?[- ]decision|unsure|disagree/i.test(at(r, id)),
      }
    })
    .filter(f => f.id)
}

export const severityRank = (s: string) => (/crit/.test(s) ? 0 : /major/.test(s) ? 1 : /minor/.test(s) ? 2 : 3)

/** `## Acceptance criteria check` as rows: a checklist, or a table whose first two cells are criterion and status. */
export function acCheckOf(verificationMd: string | null): { text: string; status: 'pass' | 'partial' | 'fail' | 'unknown'; evidence: string }[] {
  const body = sectionOf(verificationMd ?? '', 'Acceptance criteria check')
  if (!body) return []
  const t = parseTable(body)
  const grade = (s: string): 'pass' | 'partial' | 'fail' | 'unknown' =>
    /✓|pass|met|yes|delivered|done/i.test(s) ? 'pass' : /partial|some/i.test(s) ? 'partial' : /✗|fail|missing|no\b|not /i.test(s) ? 'fail' : 'unknown'
  if (t && t.rows.length) {
    const ic = col(t, 'criter', 'ac'), is = col(t, 'status', 'result', 'met'), ie = col(t, 'evidence', 'where', 'test')
    return t.rows.map(r => ({ text: at(r, ic >= 0 ? ic : 0), status: grade(at(r, is >= 0 ? is : 1)), evidence: at(r, ie) }))
  }
  return checklist(body).map(c => ({ text: c.text.replace(/\s*[—–-]\s*(✓|✗|pass|fail).*$/i, ''), status: c.done ? 'pass' : grade(c.text), evidence: '' }))
}

/** The `Reviewed by:` roster line, if the consolidation wrote one. */
export const rosterOf = (verificationMd: string | null) => /^Reviewed by:\s*(.+)$/im.exec(verificationMd ?? '')?.[1]?.trim() ?? ''

// ---------- git's plain text ----------

export type Touched = { path: string; status: 'A' | 'M' | 'D' | 'R' | '?'; add: number; del: number; from?: string }

/** `git status --porcelain` → one row per path; renames keep `from`. */
export function parsePorcelain(text: string): Touched[] {
  const out: Touched[] = []
  for (const raw of text.split('\n')) {
    if (raw.length < 4) continue
    const x = raw[0] ?? ' ', y = raw[1] ?? ' '
    let p = raw.slice(3).trim()
    let from: string | undefined
    if (/^R/.test(x + y) && p.includes(' -> ')) { const [a, b] = p.split(' -> '); from = normPath(a ?? ''); p = b ?? p }
    p = normPath(p.replace(/^"(.*)"$/, '$1'))
    const s: Touched['status'] = x === '?' ? '?' : /D/.test(x + y) ? 'D' : /A/.test(x + y) || x === '?' ? 'A' : from ? 'R' : 'M'
    out.push({ path: p, status: s, add: 0, del: 0, ...(from ? { from } : {}) })
  }
  return out
}

/** `git diff --numstat` → `{ path, add, del }`; binary files count 0/0. */
export function parseNumstat(text: string): { path: string; add: number; del: number }[] {
  const out: { path: string; add: number; del: number }[] = []
  for (const raw of text.split('\n')) {
    const m = /^(\d+|-)\t(\d+|-)\t(.+)$/.exec(raw)
    if (!m) continue
    let p = m[3] ?? ''
    if (p.includes(' => ')) p = p.replace(/\{([^}]*) => ([^}]*)\}/, '$2').replace(/^.* => /, '')
    out.push({ path: normPath(p), add: m[1] === '-' ? 0 : Number(m[1]), del: m[2] === '-' ? 0 : Number(m[2]) })
  }
  return out
}

/** `git diff --name-status` → status per path (committed-on-branch changes). */
export function parseNameStatus(text: string): Touched[] {
  const out: Touched[] = []
  for (const raw of text.split('\n')) {
    const m = /^([AMDRT])\d*\t([^\t]+)(?:\t(.+))?$/.exec(raw)
    if (!m) continue
    const s = (m[1] === 'T' ? 'M' : m[1]) as Touched['status']
    const from = m[3] ? normPath(m[2] ?? '') : undefined
    out.push({ path: normPath(m[3] ?? m[2] ?? ''), status: s, add: 0, del: 0, ...(from ? { from } : {}) })
  }
  return out
}

/** Merges what git said three ways into one row per path: status from name-status/porcelain, counts from numstat. */
export function mergeTouched(porcelain: Touched[], committed: Touched[], numstat: { path: string; add: number; del: number }[]): Touched[] {
  const by = new Map<string, Touched>()
  for (const t of [...committed, ...porcelain]) {
    const k = pathKey(t.path)
    const have = by.get(k)
    by.set(k, have ? { ...have, status: t.status === '?' ? have.status : t.status, ...(t.from ? { from: t.from } : {}) } : { ...t })
  }
  for (const n of numstat) {
    const k = pathKey(n.path)
    const have = by.get(k)
    if (have) { have.add = n.add; have.del = n.del } else by.set(k, { path: n.path, status: 'M', add: n.add, del: n.del })
  }
  return [...by.values()].sort((a, b) => a.path.localeCompare(b.path))
}

// ---------- plan vs actual ----------

export type PlanRow = { path: string; planned: boolean; touched: Touched | null; why: string; tasks: string[] }

/**
 * One row per path the plan or the tree names. `planned && !touched` and `!planned && touched`
 * are the two kinds of surprise the implement and review pages colour.
 */
export function planVsActual(planned: Planned[], tasks: TaskDoc[], touched: Touched[]): PlanRow[] {
  const rows = new Map<string, PlanRow>()
  const want = (p: string, why: string) => {
    const k = pathKey(p)
    const have = rows.get(k)
    if (have) { if (why && !have.why) have.why = why; have.planned = true }
    else rows.set(k, { path: normPath(p), planned: true, touched: null, why, tasks: [] })
  }
  for (const b of planned) want(b.path, b.why)
  for (const t of tasks) for (const f of t.files) {
    want(f.path, '')
    const r = rows.get(pathKey(f.path))
    if (r && !r.tasks.includes(t.id)) r.tasks.push(t.id)
  }
  for (const t of touched) {
    const k = pathKey(t.path)
    const have = rows.get(k)
    if (have) have.touched = t
    else rows.set(k, { path: t.path, planned: false, touched: t, why: '', tasks: [] })
  }
  const rank = (r: PlanRow) => (!r.planned ? 0 : !r.touched ? 1 : 2)
  return [...rows.values()].sort((a, b) => rank(a) - rank(b) || a.path.localeCompare(b.path))
}

// ---------- pointers: `path:line` in prose, so a claim becomes a link ----------

export type Span = { text: string; path?: string; line?: number }

const POINTER = /((?:[A-Za-z]:)?[\w./\\-]+\.[A-Za-z]{1,8})(?::(\d+))?(?::(\d+))?/g

/**
 * Splits a line at every `path.ext[:line[:col]]`; spans with `path` draw as links. A bare
 * word with a dot (`e.g.`, `v1.10`) does not count: the extension must be letters and the
 * path must contain a slash or be a known artifact name.
 */
export function pointerSpans(line: string, known: readonly string[] = []): Span[] {
  const out: Span[] = []
  let last = 0
  const ok = (p: string) => /[\\/]/.test(p) || known.some(k => pathKey(k) === pathKey(p)) || /\.(cs|ts|tsx|js|mjs|py|md|json|yml|yaml|sql|cshtml|razor|tsx|jsx|java|go|rs|css|scss|html)$/i.test(p)
  for (let m = POINTER.exec(line); m; m = POINTER.exec(line)) {
    const p = m[1] ?? ''
    if (!ok(p) || /^\d/.test(p)) continue
    if (m.index > last) out.push({ text: line.slice(last, m.index) })
    out.push({ text: m[0], path: normPath(p), ...(m[2] ? { line: Number(m[2]) } : {}) })
    last = m.index + m[0].length
  }
  if (last < line.length) out.push({ text: line.slice(last) })
  return out.length ? out : [{ text: line }]
}

/** Whether a card line carries evidence: a pointer, a finding id, or a count a file could verify. */
export const hasPointer = (line: string) => pointerSpans(line).some(s => s.path !== undefined) || /\b[CMm]\d+\b|\bTASK-\d+\b|\bADR-\d+\b/.test(line)

// ---------- the ship gate: consequences ----------

export type Consequence = { tone: 'warn' | 'plain'; text: string }

/**
 * What approving ship sets in motion, from the drafts and the tree: commits to run, the PR's
 * target, migrations and other hard-to-undo files, and files that ship outside the plan.
 */
export function consequences(
  commitsDraft: string | null, prDraft: string | null, checklist_: string | null, branch: string | null,
  rows: PlanRow[],
): Consequence[] {
  const out: Consequence[] = []
  const commits = (commitsDraft ?? '').match(/^(?:###\s+|-\s+\[ \]\s+)?.*git commit\b/gm)?.length ?? ((commitsDraft ?? '').match(/^###\s+/gm)?.length ?? 0)
  if (commits) out.push({ tone: 'plain', text: `${commits} commit${commits > 1 ? 's' : ''} to run${branch ? ` on ${branch}` : ''} — commits-draft.md` })
  const base = /--base\s+(\S+)/.exec(prDraft ?? '')?.[1] ?? /\bBase(?: branch)?:\s*`?([\w./-]+)/i.exec(prDraft ?? '')?.[1] ?? /origin\/([\w./-]+)/.exec(checklist_ ?? '')?.[1]
  if (base) out.push({ tone: 'plain', text: `PR targets ${base} — pr-draft.md` })
  const touched = rows.filter(r => r.touched)
  const hard = touched.filter(r => /migration|migrations\/|\.sql$|seed|schema|\.csproj$|package\.json$|Directory\.Packages\.props$|appsettings|\.github\/|\.gitlab-ci|Dockerfile|infra\/|terraform|cdk/i.test(r.path))
  for (const r of hard) out.push({ tone: 'warn', text: `${/migration|\.sql$|schema|seed/i.test(r.path) ? 'data shape' : /csproj|package\.json|Packages\.props/i.test(r.path) ? 'dependencies' : 'config or pipeline'}: ${r.path}` })
  const unplanned = touched.filter(r => !r.planned)
  if (unplanned.length) out.push({ tone: 'warn', text: `${unplanned.length} file${unplanned.length > 1 ? 's' : ''} outside the plan ship with this: ${unplanned.slice(0, 3).map(r => baseName(r.path)).join(', ')}${unplanned.length > 3 ? '…' : ''}` })
  const deleted = touched.filter(r => r.touched?.status === 'D')
  if (deleted.length) out.push({ tone: 'warn', text: `${deleted.length} file${deleted.length > 1 ? 's' : ''} deleted: ${deleted.slice(0, 3).map(r => baseName(r.path)).join(', ')}` })
  return out
}

/** Compares the developer's review summary with the diff: files in the diff it never names. */
export function summaryGaps(summary: string, rows: PlanRow[]): { mentioned: string[]; missed: string[] } {
  const low = summary.toLowerCase()
  const mentioned: string[] = [], missed: string[] = []
  for (const r of rows.filter(x => x.touched)) {
    const b = baseName(r.path).toLowerCase()
    const stem = b.replace(/\.[^.]+$/, '')
    ;(stem.length >= 3 && (low.includes(b) || low.includes(stem)) ? mentioned : missed).push(r.path)
  }
  return { mentioned, missed }
}

// ---------- the trail's 1.11.1 rounds ----------

/** The prediction (`--decision predict`) and the review summary (`--decision summary`) among a phase's rounds. */
export function roundOf(rounds: readonly { decision: string; note: string }[], kind: 'predict' | 'summary'): string | null {
  const r = rounds.find(x => x.decision === kind)
  return r?.note?.trim() || null
}

// ---------- numbers for the pages ----------

export type FuelRow = { fresh: number; read: number; wrote: number }
export const ZERO: FuelRow = { fresh: 0, read: 0, wrote: 0 }
export const addFuel = (a: FuelRow | undefined, b: FuelRow): FuelRow => ({ fresh: (a?.fresh ?? 0) + b.fresh, read: (a?.read ?? 0) + b.read, wrote: (a?.wrote ?? 0) + b.wrote })
export const sumFuel = (rows: Record<string, FuelRow> | undefined): FuelRow => Object.values(rows ?? {}).reduce<FuelRow>((acc, r) => addFuel(acc, r), { ...ZERO })
/** Old stores held one number per phase; it was the cache-flooded total, so it reads as `fresh` and nothing else. */
export const asFuelRow = (v: unknown): FuelRow =>
  typeof v === 'number' ? { fresh: v, read: 0, wrote: 0 }
    : v && typeof v === 'object' ? { fresh: Number((v as FuelRow).fresh) || 0, read: Number((v as FuelRow).read) || 0, wrote: Number((v as FuelRow).wrote) || 0 }
    : { ...ZERO }

/** The AskUserQuestion result trailer the mod appends so the skill can record `--viewed`; stripped from the user's own words. */
export const VIEWED_TRAILER = /\s*\[flightdeck\] viewed \d+\/\d+ files?\s*$/
export const viewedTrailer = (n: number, m: number) => `\n\n[flightdeck] viewed ${n}/${m} files`
