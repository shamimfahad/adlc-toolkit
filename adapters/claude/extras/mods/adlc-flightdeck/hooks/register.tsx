// ADLC Flight Deck — the cockpit: one REQ, phase by phase, pinned beside the transcript.
//
// Why a mod and not the statusline script: the script is polled on Claude Code's own
// schedule and sees only pipeline-state.json, which changes at phase boundaries. This
// mod is pushed every subagent spawn, tool call and turn the moment they happen, and it
// reads what the vault already writes (records, hot.md, the working set) for the rest.
//
// Three surfaces:
//   the band     — one line above the prompt about the REQ this session is flying
//   gate cards   — GATE-PROTOCOL's text card, redrawn as a card (the stored message is
//                  untouched; the model, other tools and ctrl+o still see the text)
//   /flight      — the pane: tabs for the five phases, History and Settings. A phase tab
//                  is the evidence behind the gate: the plan against the tree, every file
//                  a link and a diff, findings as a grid, the acceptance criteria, what
//                  approving sets in motion — and the recommendation last. Pinned: Esc
//                  hands the keys back to the prompt and the pane stays.
//
// Read-only toward the vault, by design: it never writes .adlc/. Git is asked, never told
// (status, diff, log, hash-object). Its write paths are $.state (what is drawn) and $.store:
// fuel, phase clocks, settings, viewed marks, and the trail — gate rounds, agent verdicts
// and cards this machine saw. The vault's own `phases` block (1.10.1, written by the trail
// hook and the skills) wins wherever both exist. A gate reply the grid composes goes into
// the prompt box for the user to send; the skill stays the only writer.
import { atom, read, update } from 'claude-code'
import type { Hook, Register } from 'claude-code'

import type {
  FlightCount, FlightDeck, FlightFuel, FlightFuelRow, FlightGit, FlightItem, FlightLane, FlightPicks, FlightReq, FlightRound,
  FlightRun, FlightSettings, FlightSince, FlightSub, FlightTab, FlightTouched, FlightTrail, FlightView, FlightViewed,
} from '../types'
import {
  EDITOR_PRESETS, absPath, acCheckOf, acceptanceOf, addFuel, asFuelRow, baseName, behaviourOf, blastRadius, bulletsOf,
  consequences, editorHref, findingsOf, hasPointer, knowledgeHits, mermaidFences, mergeTouched, parseNameStatus,
  parseNumstat, parsePorcelain, parseTable, parseTask, pathKey, planVsActual, pointerSpans, rails, roundOf, rosterOf, severityRank,
  sumFuel, summaryGaps, tiersOf, VIEWED_TRAILER, viewedTrailer, type PlanRow, type TaskDoc,
} from './evidence'
import {
  bar, buildReq, clip, clock, describeTool, isActive, isLanded, kindOf, markSpans, parseDispatch, parseGateCard, pulse,
  spinFrame, splitFolder, tokens, typicalCost, type PipelineState,
} from './model'
import {
  age, artifactsFor, dateOf, decisionOf, filterItems, firstLine, hotFor, hotTail, notesFor, parseHot, parseRecord,
  partsOf, phaseNames, phaseOf, recordDecisionsFor, recordSectionsFor, sectionOf, timeOf, type HotEvent, type Record_,
  type VaultPhase,
} from './vault'

const deckA = atom({ plugin: 'adlc-flightdeck', key: 'deck' } as const, { vault: null, reqs: [], scannedAt: 0 } as FlightDeck)
const lanesA = atom({ plugin: 'adlc-flightdeck', key: 'lanes' } as const, [] as FlightLane[])
const nowA = atom({ plugin: 'adlc-flightdeck', key: 'now' } as const, 0)
const fuelA = atom({ plugin: 'adlc-flightdeck', key: 'fuel' } as const, {} as FlightFuel)
const agentsA = atom({ plugin: 'adlc-flightdeck', key: 'agents' } as const, {} as FlightCount)
const focusA = atom({ plugin: 'adlc-flightdeck', key: 'focus' } as const, null as string | null)
const viewA = atom({ plugin: 'adlc-flightdeck', key: 'view' } as const, { req: null, tab: 1, sub: { kind: 'page' } } as FlightView)
const itemsA = atom({ plugin: 'adlc-flightdeck', key: 'items' } as const, [] as FlightItem[])
const trailA = atom({ plugin: 'adlc-flightdeck', key: 'trail' } as const, {} as FlightTrail)
const DEFAULTS: FlightSettings = { openOnStart: false, band: true, cards: true, columns: 0, history: 'all', editorUri: EDITOR_PRESETS[0]?.value ?? 'vscode://file/{path}:{line}:{col}' }
const settingsA = atom({ plugin: 'adlc-flightdeck', key: 'settings' } as const, DEFAULTS)
const filtersA = atom({ plugin: 'adlc-flightdeck', key: 'filters' } as const, { author: null, text: '' } as { author: string | null; text: string })
const gitA = atom({ plugin: 'adlc-flightdeck', key: 'git' } as const, {} as Record<string, FlightGit>)
const viewedA = atom({ plugin: 'adlc-flightdeck', key: 'viewed' } as const, {} as FlightViewed)
const picksA = atom({ plugin: 'adlc-flightdeck', key: 'picks' } as const, {} as FlightPicks)

const PANE = 'adlc-flight'
const LINGER_MS = 9000 // a landed lane stays on the live list this long
const SPAN_MS = 60_000 // the live time axis
const GIT_EVERY_MS = 8000 // git is asked about a REQ at most this often
const MAX_DEPTH = 4
const CARD_MAX = 8000
const DOC_MAX = 60_000
const DIFF_MAX = 90_000
const AUTHORS_LOG = 400 // commits scanned for "last edited by"
const WRITE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit'])

// One palette, theme keys only, so light and dark themes both hold.
const ACCENT = 'suggestion'
const TONE = { write: 'suggestion', run: 'warning', read: 'subtle', agent: 'permission', err: 'error', idle: 'inactive', void: 'inactive' } as const
const MARK_TONE = { ok: 'success', warn: 'warning', ask: ACCENT, crit: 'error', plain: undefined } as const

const norm = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '')
const parent = (p: string) => (p.lastIndexOf('/') > 0 ? p.slice(0, p.lastIndexOf('/')) : p)
const argsOf = (e: unknown) => e as Record<string, unknown>
const sumN = (row: Record<string, number> | undefined) => Object.values(row ?? {}).reduce((a, b) => a + b, 0)
type Usage = { input_tokens: number; output_tokens: number; cache_read_input_tokens: number; cache_creation_input_tokens: number }
/** Three counts, not one: the cache is re-read whole on every call, so summing it reports context, not work. */
const usageOf = (u?: Usage): FlightFuelRow =>
  u ? { fresh: u.input_tokens + u.output_tokens + u.cache_creation_input_tokens, read: u.cache_read_input_tokens, wrote: u.output_tokens } : { fresh: 0, read: 0, wrote: 0 }
const kb = (n: number) => (n >= 1024 ? `${(n / 1024).toFixed(n >= 10240 ? 0 : 1)}KB` : `${n}B`)
const sev = (s: string) => (/crit/.test(s) ? 'error' : /major/.test(s) ? 'warning' : 'subtle')

// Module-local, rebuilt on reload; everything drawn lives in $.state.
let vault: string | null = null
let scanQueued = false
let since: FlightSince = {}
const lastPhase = new Map<string, number>() // id → phase at the previous scan, so the pane follows a phase change
const stateOf = new Map<string, PipelineState>() // id → pipeline-state.json as last read
const folderOf = new Map<string, string>() // id → working-set folder
const recordOf = new Map<string, string>() // id → record path
const recordCache = new Map<string, { mtime: number; rec: Record_ }>()
const textCache = new Map<string, { mtime: number; text: string }>()
const gitBusy = new Set<string>()
const mermaidCache = new Map<string, string | null>()

type Dollar = Parameters<Hook<'session.start'>>[0]

// ---------- disk: the source of truth ----------

async function findVault($: Dollar): Promise<string | null> {
  let dir = norm(await $.session.cwd())
  for (let i = 0; i < 6; i++) {
    if (await $.fs.exists(`${dir}/.adlc`)) return `${dir}/.adlc`
    const up = parent(dir)
    if (up === dir) break
    dir = up
  }
  return null
}

/** A file read cached by mtime, capped so a runaway log never floods the pane. */
async function cached($: Dollar, path: string): Promise<string | null> {
  let mtime = 0
  try { mtime = (await $.fs.stat(path)).mtimeMs } catch { return null }
  const hit = textCache.get(path)
  if (hit && hit.mtime === mtime) return hit.text
  try {
    let text = await $.fs.read(path)
    if (text.length > DOC_MAX) text = text.slice(0, DOC_MAX) + `\n\n… ${kb(text.length - DOC_MAX)} more not shown`
    textCache.set(path, { mtime, text })
    return text
  } catch { return null }
}

async function record($: Dollar, id: string): Promise<Record_ | null> {
  const path = recordOf.get(id)
  if (!path) return null
  let mtime = 0
  try { mtime = (await $.fs.stat(path)).mtimeMs } catch { return null }
  const hit = recordCache.get(path)
  if (hit && hit.mtime === mtime) return hit.rec
  try {
    const rec = parseRecord(await $.fs.read(path))
    recordCache.set(path, { mtime, rec })
    return rec
  } catch { return null }
}

/** Every `tasks/TASK-*.md` of a REQ folder, parsed. */
async function tasksOf($: Dollar, folder: string | null): Promise<TaskDoc[]> {
  if (!folder) return []
  let names: string[] = []
  try { names = (await $.fs.list(`${folder}/tasks`)).filter(f => f.kind === 'file' && /^TASK-\d+.*\.md$/.test(f.name)).map(f => f.name).sort() } catch { return [] }
  const out: TaskDoc[] = []
  for (const name of names) {
    const md = await cached($, `${folder}/tasks/${name}`)
    if (md !== null) out.push(parseTask(md, name.replace(/\.md$/, '')))
  }
  return out
}

type Found = { kind: 'dir' | 'file'; name: string; path: string; rel: string }

async function walk($: Dollar, root: string, rel: string, depth: number, out: Found[]) {
  let entries
  try { entries = await $.fs.list(root) } catch { return }
  for (const en of entries) {
    const path = `${root}/${en.name}`
    const r = `${rel}/${en.name}`
    if (en.kind === 'dir') {
      if (/^(REQ|BUG)-/.test(en.name)) out.push({ kind: 'dir', name: en.name, path, rel: r })
      else if (depth < MAX_DEPTH && en.name !== 'tasks') await walk($, path, r, depth + 1, out)
    } else if (en.kind === 'file' && /^(REQ|BUG)-.*\.md$/.test(en.name)) {
      out.push({ kind: 'file', name: en.name.replace(/\.md$/, ''), path, rel: r })
    }
  }
}

async function scan($: Dollar): Promise<void> {
  vault ??= await findVault($)
  if (!vault) return
  const found: Found[] = []
  for (const shelf of ['specs', 'bugs']) await walk($, `${vault}/${shelf}`, shelf, 1, found)
  const now = await $.clock.now()
  const reqs: FlightReq[] = []
  const items = new Map<string, FlightItem>()
  let sinceChanged = false

  for (const f of found) {
    const { id, title, kind } = splitFolder(f.name)
    const { month, author, archived } = partsOf(f.rel)
    const have = items.get(id)
    if (f.kind === 'file') {
      recordOf.set(id, f.path)
      let rec: Record_ | null = null
      try { rec = await record($, id) } catch {}
      let touchedAt = 0
      try { touchedAt = (await $.fs.stat(f.path)).mtimeMs } catch {}
      const status = (rec?.fields.status ?? '').toLowerCase()
      const names = phaseNames(kind)
      const it: FlightItem = {
        id, title: rec?.title || title, kind,
        state: /cancel/.test(status) ? 'cancelled' : archived ? 'archived' : 'merged',
        phase: 5, phaseName: names[4] ?? 'ship', author, month, touchedAt,
        folder: have?.folder ?? null, record: f.path,
      }
      items.set(id, have ? { ...have, record: f.path, title: it.title, state: have.state === 'flying' || have.state === 'gate' ? have.state : it.state } : it)
      continue
    }
    folderOf.set(id, f.path)
    let st: PipelineState | null = null
    let touchedAt = 0
    try {
      st = JSON.parse(await $.fs.read(`${f.path}/pipeline-state.json`)) as PipelineState
      touchedAt = (await $.fs.stat(`${f.path}/pipeline-state.json`)).mtimeMs
    } catch {
      try { touchedAt = (await $.fs.stat(f.path)).mtimeMs } catch {}
    }
    if (st) stateOf.set(id, st)
    const active = !!st && isActive(st) && !archived
    let waitingSince: number | null = null
    if (active) { try { waitingSince = (await $.fs.stat(`${f.path}/.awaiting-approval`)).mtimeMs } catch {} }
    const r = buildReq(f.name, st ?? {}, waitingSince !== null, waitingSince, Math.max(touchedAt, waitingSince ?? 0))
    if (active) {
      const prev = since[r.id]
      if (!prev || prev.phase !== r.phaseName) {
        since[r.id] = { phase: r.phaseName, at: prev ? now : touchedAt }
        sinceChanged = true
      }
      reqs.push({ ...r, phaseSince: since[r.id]?.at ?? touchedAt })
    }
    const it: FlightItem = {
      id, title: have?.title || title, kind,
      state: active ? (r.waiting ? 'gate' : 'flying') : st?.aborted || have?.state === 'cancelled' ? 'cancelled' : archived ? 'archived' : 'merged',
      phase: active ? r.phase : 5, phaseName: active ? r.phaseName : (phaseNames(kind)[4] ?? 'ship'),
      author, month, touchedAt: Math.max(touchedAt, have?.touchedAt ?? 0), folder: f.path, record: have?.record ?? null,
    }
    items.set(id, it)
  }

  reqs.sort((a, b) => b.touchedAt - a.touchedAt)
  if (sinceChanged) void $.store.set(`since:${vault}`, since).catch(() => {})
  const deck: FlightDeck = { vault, reqs, scannedAt: now }
  await update($, deckA, () => deck)
  // The pane follows the REQ it shows: when its phase moves on and the pane was on the old one, turn the page.
  for (const r of reqs) {
    const was = lastPhase.get(r.id)
    lastPhase.set(r.id, r.phase)
    if (was !== undefined && was !== r.phase) {
      const v = await read($, viewA)
      if (v.req === r.id && v.tab === was) await update($, viewA, (): FlightView => ({ req: r.id, tab: r.phase as FlightTab, sub: { kind: 'page' } }))
    }
  }
  await update($, itemsA, () => [...items.values()].sort((a, b) => b.touchedAt - a.touchedAt))
  $.ui.status(undefined) // the band says it; a status line left by an older version of this mod goes away
  // Git facts for the REQs on screen: the one the pane shows and the one this session flies.
  const view = await read($, viewA)
  const focus = await read($, focusA)
  for (const id of new Set([view.req, focus])) if (id && reqs.some(r => r.id === id)) void refreshGit($, id).catch(() => {})
}

/** Coalesces bursts of triggers into one scan. */
function queueScan($: Dollar, delayMs = 150) {
  if (scanQueued) return
  scanQueued = true
  $.clock.after(delayMs, () => { scanQueued = false; void scan($).catch(() => {}) })
}

// ---------- git: asked, never told ----------

async function git($: Dollar, cwd: string, args: string[], stdin?: string): Promise<string | null> {
  try {
    const r = await $.process.run(['git', '--no-optional-locks', ...args], { cwd, timeoutMs: 20_000, ...(stdin !== undefined ? { stdin } : {}) })
    return r.exitCode === 0 ? r.stdout : null
  } catch { return null }
}

/** The branch a REQ rides, from hot.md's `work-path-set … (rides <branch>, …)` line. */
const ridesOf = (events: HotEvent[], id: string) => {
  for (const ev of events) if (ev.req === id && /work-path-set/.test(ev.event)) { const m = /rides\s+([^\s,)]+)/.exec(ev.rest); if (m) return m[1] ?? null }
  return null
}

/**
 * What the tree says about one REQ: the files changed against the branch's base (committed
 * and not), their blob hashes (the key the viewed marks hold), and who last touched each one.
 * Throttled; a failure leaves the last answer with `error` set.
 */
async function refreshGit($: Dollar, id: string, force = false): Promise<void> {
  if (!vault || gitBusy.has(id)) return
  const now = await $.clock.now()
  const have = (await read($, gitA))[id]
  if (have && !force && now - have.at < GIT_EVERY_MS) return
  gitBusy.add(id)
  try {
    const st = stateOf.get(id)
    let cwd = norm(st?.workPath ?? '')
    if (!cwd || !(await $.fs.exists(cwd))) cwd = parent(vault)
    const branch = st?.branch ?? (await git($, cwd, ['rev-parse', '--abbrev-ref', 'HEAD']))?.trim() ?? null
    const hot = parseHot((await cached($, `${vault}/hot.md`)) ?? '')
    const rides = ridesOf(hot, id)
    const originHead = (await git($, cwd, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD']))?.trim()
    let base: string | null = null, baseName: string | null = null
    for (const cand of [rides, originHead, 'origin/main', 'main', 'origin/master', 'master', 'develop'].filter((c): c is string => !!c)) {
      if (cand === branch) continue
      const mb = (await git($, cwd, ['merge-base', 'HEAD', cand]))?.trim()
      if (mb) { base = mb; baseName = cand; break }
    }
    const porcelain = parsePorcelain((await git($, cwd, ['status', '--porcelain', '--untracked-files=all'])) ?? '')
    const committed = base ? parseNameStatus((await git($, cwd, ['diff', '--name-status', base, 'HEAD'])) ?? '') : []
    const numstat = parseNumstat((await git($, cwd, ['diff', '--numstat', base ?? 'HEAD'])) ?? '')
    const touched = mergeTouched(porcelain, committed, numstat)
    const live = touched.filter(t => t.status !== 'D').map(t => t.path)
    const hashes: Record<string, string> = {}
    if (live.length) {
      const out = (await git($, cwd, ['hash-object', '--stdin-paths'], live.join('\n') + '\n')) ?? ''
      out.split('\n').map(l => l.trim()).filter(Boolean).forEach((h, i) => { const p = live[i]; if (p) hashes[pathKey(p)] = h })
    }
    const authors: Record<string, string> = {}
    if (touched.length) {
      const log = (await git($, cwd, ['log', `-n${AUTHORS_LOG}`, '--format=%x01%an%x09%ar', '--name-only', '--', ...touched.slice(0, 60).map(t => t.path)])) ?? ''
      let cur = ''
      for (const raw of log.split('\n')) {
        const l = raw.trim()
        if (!l) continue
        if (l.startsWith('\x01')) { const [an, ar] = l.slice(1).split('\t'); cur = `${an ?? '?'} · ${ar ?? ''}`; continue }
        const k = pathKey(l)
        if (!(k in authors)) authors[k] = cur
      }
    }
    const me = (await git($, cwd, ['config', 'user.name']))?.trim() ?? null
    const facts: FlightGit = { at: now, cwd, base, baseName, branch, touched, hashes, authors, me, error: porcelain.length === 0 && numstat.length === 0 && !(await git($, cwd, ['rev-parse', '--git-dir'])) ? 'not a git checkout' : null }
    await update($, gitA, g => ({ ...g, [id]: facts }))
  } catch (err) {
    await update($, gitA, g => ({ ...g, [id]: { ...(g[id] ?? { at: 0, cwd: '', base: null, baseName: null, branch: null, touched: [], hashes: {}, authors: {}, me: null }), at: now, error: String(err) } }))
  } finally { gitBusy.delete(id) }
}

/** `n/m`: touched files whose viewed mark still matches their blob. */
function viewedOf(g: FlightGit | undefined, marks: Record<string, string> | undefined): { n: number; m: number; stale: string[] } {
  const files = g?.touched.filter(t => t.status !== 'D') ?? []
  const stale: string[] = []
  let n = 0
  for (const f of files) {
    const k = pathKey(f.path)
    const mark = marks?.[k]
    if (!mark) continue
    if (mark === g?.hashes[k]) n += 1
    else stale.push(f.path)
  }
  return { n, m: files.length, stale }
}

async function markViewed($: Dollar, req: string, path: string, hash: string | undefined) {
  const v = await update($, viewedA, m => ({ ...m, [req]: { ...(m[req] ?? {}), [pathKey(path)]: hash ?? 'seen' } }))
  if (vault) void $.store.set(`viewed:${vault}`, v).catch(() => {})
}

async function unmarkViewed($: Dollar, req: string, path: string) {
  const v = await update($, viewedA, m => { const row = { ...(m[req] ?? {}) }; delete row[pathKey(path)]; return { ...m, [req]: row } })
  if (vault) void $.store.set(`viewed:${vault}`, v).catch(() => {})
}

/** A Mermaid fence as Unicode boxes, via mermaid-ascii when it is on PATH; null when it is not. Cached by source. */
async function renderMermaid($: Dollar, src: string, width: number): Promise<string | null> {
  const key = `${width}:${src}`
  const hit = mermaidCache.get(key)
  if (hit !== undefined) return hit
  let out: string | null = null
  try {
    const r = await $.process.run(['mermaid-ascii', '--max-width', String(Math.max(40, width))], { stdin: src, timeoutMs: 10_000 })
    out = r.exitCode === 0 && r.stdout.trim() ? r.stdout.replace(/\s+$/, '') : null
  } catch { out = null }
  mermaidCache.set(key, out)
  return out
}

// ---------- fuel: tokens (and landed agents) per REQ per phase, kept across sessions ----------

async function burn($: Dollar, req: string | null, phase: string | null, amount: FlightFuelRow, isAgent: boolean) {
  if (!amount.fresh && !amount.read && !amount.wrote && !isAgent) return
  const deck = await read($, deckA)
  const target = (req && deck.reqs.find(r => r.id === req)) || (deck.reqs.length === 1 ? deck.reqs[0] : undefined)
  if (!target) return
  const ph = phase ?? target.phaseName
  if (amount.fresh || amount.read || amount.wrote) {
    const fuel = await update($, fuelA, f => ({ ...f, [target.id]: { ...(f[target.id] ?? {}), [ph]: addFuel((f[target.id] ?? {})[ph], amount) } }))
    if (vault) void $.store.set(`fuel:${vault}`, fuel).catch(() => {})
  }
  if (isAgent) {
    const agents = await update($, agentsA, f => ({ ...f, [target.id]: { ...(f[target.id] ?? {}), [ph]: ((f[target.id] ?? {})[ph] ?? 0) + 1 } }))
    if (vault) void $.store.set(`agents:${vault}`, agents).catch(() => {})
  }
}

/** A stored fuel table of any vintage → rows. */
const migrateFuel = (raw: unknown): FlightFuel => {
  const out: FlightFuel = {}
  for (const [id, row] of Object.entries((raw ?? {}) as Record<string, Record<string, unknown>>)) {
    out[id] = {}
    for (const [ph, v] of Object.entries(row ?? {})) out[id][ph] = asFuelRow(v)
  }
  return out
}

// ---------- the trail: rounds, runs and cards this machine saw, per REQ per phase ----------

async function trailAdd($: Dollar, req: string, phase: string, fn: (t: FlightTrail[string][string]) => FlightTrail[string][string]) {
  const trail = await update($, trailA, t => {
    const forReq = t[req] ?? {}
    const cur = forReq[phase] ?? { rounds: [], runs: [], card: null }
    return { ...t, [req]: { ...forReq, [phase]: fn(cur) } }
  })
  if (vault) void $.store.set(`trail:${vault}`, trail).catch(() => {})
}

/** The REQ this session is flying: the last one it named, dispatched to, or wrote into. */
async function touch($: Dollar, req: string | null) {
  if (!req) return
  const was = await read($, focusA)
  if (was !== req) await update($, focusA, () => req)
}

async function openPane($: Dollar) {
  const s = await read($, settingsA)
  await $.ui.open({ id: PANE, title: 'ADLC', focus: true, ...(s.columns > 0 ? { columns: s.columns } : {}) })
}

async function setView($: Dollar, fn: (v: FlightView) => FlightView) { await update($, viewA, fn) }
async function setSettings($: Dollar, fn: (s: FlightSettings) => FlightSettings) {
  const s = await update($, settingsA, fn)
  void $.store.set('settings', s).catch(() => {})
}

type AskQuestion = { question: string; header: string; options: { label: string; description?: string; preview?: string }[]; multiSelect: boolean }

export const register: Register = on => {
  // ---------- lifecycle ----------

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'flight',
      description: 'ADLC cockpit: the REQ you are flying, phase by phase — the plan against the tree, every file a link and a diff, findings as a grid, what approving sets in motion. `/flight REQ-042` opens one; `history`, `settings`, `band` (toggle the line), `close`.',
      argumentHint: '[REQ-NNN | history | settings | band | close]',
    })
    const saved = (await $.store.get('settings').catch(() => undefined)) as Partial<FlightSettings> | undefined
    if (saved) await update($, settingsA, () => ({ ...DEFAULTS, ...saved }))
    await scan($).catch(() => {})
    if (vault) {
      const got = async (k: string) => $.store.get(`${k}:${vault}`).catch(() => undefined)
      const fuel = await got('fuel')
      const agents = (await got('agents')) as FlightCount | undefined
      const trail = (await got('trail')) as FlightTrail | undefined
      const viewed = (await got('viewed')) as FlightViewed | undefined
      const s = (await got('since')) as FlightSince | undefined
      if (fuel) await update($, fuelA, () => migrateFuel(fuel))
      if (agents) await update($, agentsA, () => agents)
      if (trail) await update($, trailA, () => trail)
      if (viewed) await update($, viewedA, () => viewed)
      if (s) { since = { ...s, ...since }; queueScan($, 0) }
      const settings = await read($, settingsA)
      if (settings.openOnStart && (await read($, deckA)).reqs.length > 0) void openPane($).catch(() => {}) // unasked: the engine seats it only where it can dock
    }
    // The heartbeat: 4 Hz while something moves (lanes, a waiting gate), silent otherwise.
    // A 15 s rescan also catches edits made outside Claude (VS Code, a git checkout).
    let beats = 0
    $.clock.every(250, () => {
      beats += 1
      void (async () => {
        const lanes = await read($, lanesA)
        const deck = await read($, deckA)
        if (lanes.length > 0 || deck.reqs.some(r => r.waiting)) {
          const now = await $.clock.now()
          await update($, nowA, () => now)
          if (lanes.some(l => l.endedAt !== null && now - l.endedAt > LINGER_MS)) {
            await update($, lanesA, ls => ls.filter(l => l.endedAt === null || now - l.endedAt <= LINGER_MS))
          }
        }
        if (beats % 60 === 0) queueScan($)
      })().catch(() => {})
    })
    return next(e)
  })

  // ---------- the live layer: agents and their tool calls ----------

  on('prompt.submit', async ($, e, next) => {
    await touch($, /\b((?:REQ|BUG)-\d+)/.exec(e.text)?.[1] ?? null)
    return next(e)
  }).catch(($, e, next) => next(e)) // an observer: a failure never touches the prompt

  on('agent.spawn', async ($, e, next) => {
    const res = await next(e)
    const agentId = (res as { agentId?: string }).agentId
    if (!agentId) return res
    const { req, task } = parseDispatch(`${e.description}\n${e.prompt}`)
    const deck = await read($, deckA)
    const target = (req && deck.reqs.find(r => r.id === req)) || (deck.reqs.length === 1 ? deck.reqs[0] : undefined)
    const lane: FlightLane = {
      id: agentId,
      agent: e.subagentType.replace(/^[^:]+:/, ''),
      label: e.description,
      req: req ?? target?.id ?? null, task, phase: target?.phaseName ?? null,
      startedAt: await $.clock.now(), doing: 'boarding', trail: [], endedAt: null, tokens: null, wrote: 0, isFailed: false,
    }
    await update($, lanesA, ls => [...ls.filter(l => l.id !== agentId), lane].slice(-9))
    if (req) await touch($, req)
    return res
  }).catch(($, e, next) => next(e)) // an observer: if it fails, the spawn goes on untouched

  on('tool.call', async ($, e, next) => {
    const args = argsOf(e)
    const tool = String(e.tool)
    const id = e.agentId
    const d = describeTool(tool, args)
    if (id) void update($, lanesA, ls => ls.map(l => (l.id === id ? { ...l, doing: d } : l))).catch(() => {})
    // A gate's dialog: remember which REQ was waiting before the answer lands, and say on the
    // approve option how much of the tree has been looked at (implement and review gates).
    const gateFor = tool === 'AskUserQuestion' && !id
      ? await (async () => { const deck = await read($, deckA); const f = await read($, focusA); return deck.reqs.find(r => r.id === f && r.waiting) ?? deck.reqs.find(r => r.waiting) ?? null })()
      : null
    let viewedNow: { n: number; m: number } | null = null
    let input: typeof e = e
    if (gateFor && (gateFor.phase === 3 || gateFor.phase === 4)) {
      const g = (await read($, gitA))[gateFor.id]
      const v = viewedOf(g, (await read($, viewedA))[gateFor.id])
      if (v.m > 0) {
        viewedNow = { n: v.n, m: v.m }
        if (v.n < v.m && Array.isArray(args.questions)) {
          const questions = (args.questions as AskQuestion[]).map(q => ({
            ...q,
            options: q.options.map(o => (/^(approve|fix|merge|ship|accept all)/i.test(o.label)
              ? { ...o, description: `${o.description ?? ''}${o.description ? ' · ' : ''}${v.m - v.n} of ${v.m} changed files not viewed` }
              : o)),
          }))
          input = { ...e, questions } as typeof e
        }
      }
    }
    let ran = await next(input)
    // Tell the skill how much of the tree was looked at: a trailer on the dialog answer, which `trail gate`
    // records as `--viewed` and strips from `--note` (GATE-PROTOCOL → The trail). Only on a dialog answer.
    if (gateFor && viewedNow) {
      const res = (ran as { result?: { answers?: Record<string, string>; response?: string } }).result
      if (res && typeof res === 'object' && res.answers && Object.keys(res.answers).length > 0) {
        ran = { ...(ran as object), result: { ...res, response: `${(res.response ?? '').replace(VIEWED_TRAILER, '')}${viewedTrailer(viewedNow.n, viewedNow.m)}` } } as typeof ran
      }
    }
    if (id) {
      const t = await $.clock.now()
      const err = (ran as { isError?: boolean }).isError === true
      void update($, lanesA, ls => ls.map(l => (l.id === id
        ? { ...l, trail: [...l.trail.filter(h => t - h.t < SPAN_MS * 3), { t, k: kindOf(tool), err, d }].slice(-120) }
        : l))).catch(() => {})
    }
    if (gateFor) {
      const res = (ran as { result?: { answers?: Record<string, string>; response?: string } }).result
      const { decision, note } = decisionOf(res?.answers, res?.response)
      if (decision) {
        const round: FlightRound = { at: await $.clock.now(), decision, note, ...(viewedNow ? { viewed: `${viewedNow.n}/${viewedNow.m}` } : {}) }
        await trailAdd($, gateFor.id, gateFor.phaseName, t => ({ ...t, rounds: [...t.rounds, round].slice(-12) }))
      }
    }
    const path = typeof args.file_path === 'string' ? args.file_path : ''
    if (WRITE_TOOLS.has(tool) || tool === 'Skill') {
      const where = tool === 'Skill' ? `${String(args.skill ?? '')} ${String(args.args ?? '')}` : path
      await touch($, /\b((?:REQ|BUG)-\d+)/.exec(where)?.[1] ?? null)
    }
    // Anything that might have moved the vault or the tree → rescan (debounced).
    const cmd = typeof args.command === 'string' ? args.command : ''
    if (
      WRITE_TOOLS.has(tool) ||
      (/^(Bash|PowerShell)$/.test(tool) && /\.adlc|awaiting-approval|pipeline-state|\bgit\b|dotnet|npm|pnpm|yarn/.test(cmd)) ||
      tool === 'Skill' || tool === 'AskUserQuestion'
    ) queueScan($)
    return ran
  }).catch(($, e, next) => next(e)) // an observer: if it fails, the tool call goes on untouched

  on('turn.complete', async ($, e, next) => {
    const amount = usageOf(e.usage)
    const id = e.agentId
    const lane = id ? (await read($, lanesA)).find(l => l.id === id) : undefined
    if (id && lane) {
      const now = await $.clock.now()
      const isFailed = e.isAborted || e.reason === 'error'
      await update($, lanesA, ls => ls.map(l => (l.id === id
        ? { ...l, endedAt: now, tokens: (l.tokens ?? 0) + amount.fresh, wrote: l.wrote + amount.wrote, isFailed, doing: e.isAborted ? 'aborted' : 'landed' }
        : l)))
      await burn($, lane.req, lane.phase, amount, true)
      if (lane.req && lane.phase) {
        const run: FlightRun = {
          id, agent: lane.agent, task: lane.task, startedAt: lane.startedAt, endedAt: now,
          tokens: (lane.tokens ?? 0) + amount.fresh, wrote: lane.wrote + amount.wrote, verdict: firstLine(e.answer ?? '', 200), isFailed,
        }
        await trailAdd($, lane.req, lane.phase, t => ({ ...t, runs: [...t.runs.filter(r => r.id !== id), run].slice(-60) }))
      }
    } else {
      await burn($, null, null, amount, false)
      // The main loop's gate card: keep it, so a phase tab can show it after it scrolled away.
      const answer = e.answer ?? ''
      if (/GATE \d+\/\d+ · /.test(answer)) {
        const card = parseGateCard(answer)
        if (card) {
          const kind = card.req.startsWith('BUG') ? 'bug' : 'req'
          const n = phaseOf(kind, card.phase.toLowerCase().replace(/\s+/g, '-')) ?? card.n
          const phase = phaseNames(kind)[n - 1] ?? card.phase.toLowerCase()
          const text = answer.length > CARD_MAX ? answer.slice(0, CARD_MAX) + '\n\n… card cut here' : answer
          const at = await $.clock.now()
          await trailAdd($, card.req, phase, t => ({ ...t, card: { at, text } }))
          await touch($, card.req)
        }
      }
    }
    queueScan($)
    return next(e)
  }).catch(($, e, next) => next(e))

  // ---------- spinner: say who the main loop is waiting on ----------

  on('ui.render', { component: 'Spinner' }, async ($, e, next) => {
    const flying = (await read($, lanesA)).filter(l => l.endedAt === null)
    if (flying.length === 0) return next(e)
    const kinds = new Map<string, number>()
    for (const l of flying) kinds.set(l.agent, (kinds.get(l.agent) ?? 0) + 1)
    const who = [...kinds].map(([k, n]) => (n > 1 ? `${n}× ${k}` : k)).join(', ')
    return next({ ...e, props: { ...e.props, suffix: ` · flying: ${who}…` } })
  })

  // ---------- the band: one line about the REQ you're flying, or nothing ----------

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || e.props.view.agentId || !(await read($, settingsA)).band) return next(e)
    const focus = await read($, focusA)
    if (!focus) return next(e)
    const deck = await read($, deckA)
    const r = deck.reqs.find(x => x.id === focus)
    if (!r) return next(e)
    const lanes = await read($, lanesA)
    const fuel = await read($, fuelA)
    const now = (await read($, nowA)) || (await $.clock.now())
    const { Box, Text, Button } = $.ui.resolve(e)
    const flying = lanes.filter(l => l.endedAt === null && (l.req === r.id || l.req === null)).length
    const done = r.tasks.filter(t => isLanded(t.status)).length
    const burned = sumFuel(fuel[r.id]).fresh
    const details = () => void (async () => {
      await setView($, v => ({ req: r.id, tab: r.phase as FlightTab, sub: { kind: 'page' } }))
      await openPane($)
    })()
    return (
      <Box flexDirection="row" justifyContent="space-between" paddingX={1}>
        <Box flexDirection="row">
          {r.waiting ? (
            <Text color="warning" bold>◆ {r.id} · gate {r.phase}/5 {r.phaseName} · waiting {r.waitingSince != null ? clock(now - r.waitingSince) : ''}</Text>
          ) : (
            <Box flexDirection="row">
              <Text color={ACCENT} bold>✈ {r.id}</Text>
              <Text> · {r.phaseName} {flying ? spinFrame(now) : ''}</Text>
              {r.tasks.length > 0 && r.phase === 3 ? <Text dimColor> · {done}/{r.tasks.length} tasks</Text> : null}
              {flying ? <Text dimColor> · {flying} flying</Text> : null}
            </Box>
          )}
          {burned ? <Text dimColor> · {tokens(burned)} tok</Text> : null}
        </Box>
        <Box flexDirection="row">
          {r.waiting && !e.props.isWorking && (
            <Button key={`resume-${r.id}`} plain hotkey="r" label="resume"
              onPress={() => void $.prompt.submit({ text: `/${r.kind === 'bug' ? 'bugfix' : 'proceed'} ${r.id}` })} />
          )}
          <Text> </Text>
          <Button key="details" plain hotkey="f" label="cockpit" onPress={details} />
        </Box>
      </Box>
    )
  })

  // ---------- gate cards: GATE-PROTOCOL's text card, drawn as a card ----------
  // Only the drawing changes. The stored message, what the model reads, ctrl+o and
  // every other tool keep the plain text card — it stays the protocol.

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    if (e.props.isSummary || !/GATE \d+\/\d+ · /.test(e.props.text) || !(await read($, settingsA)).cards) return next(e)
    const card = parseGateCard(e.props.text)
    if (!card) return next(e)
    const deck = await read($, deckA)
    const fuel = await read($, fuelA)
    const agents = await read($, agentsA)
    const now = (await read($, nowA)) || (await $.clock.now())
    const { Box, Text, Markdown } = $.ui.resolve(e)
    const W = Math.min(110, Math.max(50, (e.viewport?.columns ?? 100) - 4))
    const live = deck.reqs.find(r => r.id === card.req)
    const phase = card.phase.toLowerCase()
    const isOpen = !!live && live.waiting && live.phaseName === phase
    const isPast = !!live && !isOpen && live.phase > card.n
    const border = isOpen ? 'warning' : isPast ? 'success' : 'inactive'
    const nextPhase = live?.phases[card.n]?.name
    const typical = nextPhase ? typicalCost(fuel, nextPhase, card.req) : null
    const spent = (fuel[card.req] ?? {})[phase]?.fresh
    const flew = (agents[card.req] ?? {})[phase]

    const spans = (line: string) => (
      <Box flexDirection="row" flexWrap="wrap">
        {markSpans(line).map(s => <Text color={MARK_TONE[s.tone]} bold={s.tone === 'crit'}>{s.text}</Text>)}
      </Box>
    )
    const labelTone = (label: string) =>
      /NEEDS|FINDINGS|BLOCK/.test(label) ? 'warning' : /MY READ/.test(label) ? ACCENT : 'subtle'

    return (
      <Box flexDirection="column">
        {card.before ? <Markdown key="before" text={card.before} /> : null}
        <Box flexDirection="column" borderStyle="round" borderColor={border} paddingX={1} width={W}>
          <Box flexDirection="row" justifyContent="space-between">
            <Box flexDirection="row">
              <Text color={isOpen ? 'warning' : isPast ? 'success' : 'subtle'} bold>{isPast ? '✓' : '◆'} GATE {card.n}/{card.of}</Text>
              <Text bold> · {card.phase} · {card.req}</Text>
              <Text dimColor>  {clip(card.title, Math.max(6, W - 48))}</Text>
            </Box>
            <Text dimColor>{isOpen && live?.waitingSince != null ? `waiting ${clock(now - live.waitingSince)}` : isPast ? 'cleared' : ''}</Text>
          </Box>
          {live && (
            <Box flexDirection="row">
              {live.phases.map((p, i) => {
                const atCard = p.n === card.n
                const mark = p.n < card.n || (isPast && atCard) ? '✓' : atCard ? '◆' : '○'
                const color = mark === '✓' ? 'success' : mark === '◆' ? 'warning' : 'inactive'
                return (
                  <Box flexDirection="row">
                    {i > 0 && <Text color="inactive">{p.n <= card.n ? ' ━ ' : ' ─ '}</Text>}
                    <Text color={color} bold={atCard}>{mark} {p.name}</Text>
                  </Box>
                )
              })}
            </Box>
          )}
          <Box marginTop={1}><Text bold>{card.verdict}</Text></Box>
          {card.sections.map(s => (
            <Box flexDirection="row" marginTop={/MY READ/.test(s.label) ? 1 : 0}>
              <Box width={12} flexShrink={0}><Text color={labelTone(s.label)} bold>{s.label}</Text></Box>
              <Box flexDirection="column" flexGrow={1}>
                {s.lines.length === 0 ? <Text> </Text> : s.lines.map(spans)}
              </Box>
            </Box>
          ))}
          {(spent || typical) && (
            <Box flexDirection="column" marginTop={1}>
              <Text color="inactive">{'─'.repeat(W - 4)}</Text>
              <Box flexDirection="row" justifyContent="space-between">
                <Text dimColor>
                  {spent ? `this phase ${tokens(spent)} tok` : ''}
                  {flew ? ` · ${flew} agent${flew > 1 ? 's' : ''}` : ''}
                  {live && isOpen ? ` · ${clock((live.waitingSince ?? now) - live.phaseSince)} of work` : ''}
                </Text>
                <Text dimColor>{typical && nextPhase ? `next: ${nextPhase} ≈ ${tokens(typical.mean)} tok (avg of ${typical.n})` : ''}</Text>
              </Box>
            </Box>
          )}
        </Box>
        {isOpen && <Text color="warning">  ↓ your call — the dialog below has the options and what each one does · the evidence is under /flight</Text>}
        {card.after ? <Markdown key="after" text={card.after} /> : null}
      </Box>
    )
  })

  // ---------- /flight ----------

  on('command.run', { command: 'flight' }, async ($, e) => {
    const args = (e.args ?? '').trim()
    if (/^band\b/.test(args)) {
      await setSettings($, s => ({ ...s, band: !s.band }))
      return { text: (await read($, settingsA)).band ? 'Flight line on.' : 'Flight line hidden. `/flight band` brings it back.' }
    }
    if (/^close\b/.test(args)) { await $.ui.close({ id: PANE }); return { text: 'Cockpit closed.' } }
    const m = /\b((?:REQ|BUG)-\d+)/.exec(args)
    const tab: FlightTab | null = /^history\b/.test(args) ? 'history' : /^settings\b/.test(args) ? 'settings' : null
    if (m) await touch($, m[1] ?? null)
    queueScan($, 0)
    const deck = await read($, deckA)
    const focus = m?.[1] ?? (await read($, focusA)) ?? deck.reqs[0]?.id ?? null
    const live = deck.reqs.find(r => r.id === focus)
    // `/flight` alone means "show me my REQ": its live phase, unless the pane already sits on one of its phases.
    await setView($, v => ({
      req: focus ?? v.req,
      tab: tab ?? (typeof v.tab === 'number' && focus === v.req ? v.tab : ((live?.phase ?? 5) as FlightTab)),
      sub: { kind: 'page' },
    }))
    if (focus) void refreshGit($, focus, true).catch(() => {})
    await openPane($)
    return { text: 'Cockpit open. 1–5 phases · h history · s settings · Esc returns to the prompt, the pane stays.' }
  })

  // ---------- the pane ----------

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const deck = await read($, deckA)
    const items = await read($, itemsA)
    const lanes = await read($, lanesA)
    const focus = await read($, focusA)
    const fuel = await read($, fuelA)
    const trail = await read($, trailA)
    const settings = { ...DEFAULTS, ...(await read($, settingsA)) }
    const view = await read($, viewA)
    const filters = await read($, filtersA)
    const gitAll = await read($, gitA)
    const viewedAll = await read($, viewedA)
    const picksAll = await read($, picksA)
    const now = (await read($, nowA)) || (await $.clock.now())
    const els = $.ui.resolve(e)
    const { Box, Text, Button, Markdown, Code, Link } = els
    const Select = 'Select' in els ? els.Select : null // the phone has neither
    const Input = 'Input' in els ? els.Input : null
    if (!deck.vault) return <Text dimColor>No .adlc vault above this folder.</Text>
    const W = Math.max(40, e.props.bodyColumns - 2)
    const narrow = W < 84
    const isTerminal = e.surface === 'terminal'

    const reqId = view.req ?? focus ?? deck.reqs[0]?.id ?? null
    const live = reqId ? deck.reqs.find(r => r.id === reqId) ?? null : null
    const item = reqId ? items.find(i => i.id === reqId) ?? null : null
    const kind: 'req' | 'bug' = live?.kind ?? item?.kind ?? (reqId?.startsWith('BUG') ? 'bug' : 'req')
    const names = phaseNames(kind)
    const st = reqId ? stateOf.get(reqId) ?? null : null
    const rec = reqId ? await record($, reqId) : null
    const folder = reqId ? folderOf.get(reqId) ?? item?.folder ?? null : null
    const hot = parseHot((await cached($, `${deck.vault}/hot.md`)) ?? '')
    const g = reqId ? gitAll[reqId] : undefined
    const marks = reqId ? viewedAll[reqId] : undefined
    const picks = reqId ? picksAll[reqId] ?? {} : {}
    const root = g?.cwd || norm(st?.workPath ?? '') || parent(deck.vault)
    const go = (tab: FlightTab) => void setView($, v => ({ ...v, tab, sub: { kind: 'page' } }))
    const sub = (s: FlightSub) => void setView($, v => ({ ...v, sub: s }))
    const back = () => sub({ kind: 'page' })
    // First look at a REQ: ask git once now; the scan (events, 15 s heartbeat) keeps it fresh after that.
    if (reqId && live && !g) void refreshGit($, reqId).catch(() => {})

    // Phase states for a REQ with no live state (a record): everything done.
    const phases = live?.phases ?? names.map((name, i) => ({ n: i + 1, name, state: 'done' as const }))
    const tabN = typeof view.tab === 'number' ? view.tab : 0

    // ----- small drawing helpers -----
    const H = (s: string) => <Box marginTop={1}><Text bold color="subtle">{s}</Text></Box>
    const dim = (s: string) => <Text dimColor>{s}</Text>
    const Cell = ({ w, children }: { w: number; children?: unknown }) => <Box width={w} flexShrink={0}>{children as never}</Box>

    /** A path as a link that opens the editor at a line; on a surface whose links are https-only, a button that runs `code -g`. */
    const ref = (path: string, line?: number, label?: string, key?: string) => {
      const abs = absPath(root, path)
      const text = label ?? (line ? `${path}:${line}` : path)
      if (isTerminal) return <Link href={editorHref(settings.editorUri, abs, line)}>{text}</Link>
      return <Button key={key ?? `ref-${abs}-${line ?? 0}`} plain label={text}
        onPress={() => void $.process.run(['code', '-g', `${abs}:${line ?? 1}`], { timeoutMs: 8000 }).catch(() => {})} />
    }
    /** A line of prose with its `path:line` pointers drawn as links. */
    const pointed = (line: string, known: readonly string[] = []) => (
      <Box flexDirection="row" flexWrap="wrap">
        {pointerSpans(line, known).map((s, i) => (s.path ? <Box key={`p${i}`}>{ref(s.path, s.line, s.text)}</Box> : <Text>{s.text}</Text>))}
      </Box>
    )
    const plusMinus = (t: FlightTouched | null) =>
      !t ? <Text dimColor>—</Text>
        : t.status === '?' || t.status === 'A' ? <Text color="success">new</Text>
        : t.status === 'D' ? <Text color="error">deleted</Text>
        : <Box flexDirection="row"><Text color="success">+{t.add}</Text><Text> </Text><Text color="error">−{t.del}</Text></Box>
    const fuelBars = (phase: string) => {
      const row = (fuel[reqId ?? ''] ?? {})[phase]
      if (!row || (!row.fresh && !row.read && !row.wrote)) return null
      const max = Math.max(row.fresh, row.read, row.wrote, 1)
      const line = (label: string, n: number, tone: string | undefined) => (
        <Box flexDirection="row">
          <Cell w={16}><Text dimColor>{label}</Text></Cell>
          <Cell w={8}><Text>{tokens(n)}</Text></Cell>
          <Text color={tone}>{bar(n, max, narrow ? 12 : 20)}</Text>
        </Box>
      )
      return (
        <Box flexDirection="column">
          {line('fresh', row.fresh, ACCENT)}
          {line('wrote', row.wrote, 'success')}
          {line('context re-read', row.read, 'inactive')}
        </Box>
      )
    }

    // ----- header -----
    const header = () => {
      const title = live?.title || item?.title || rec?.title || ''
      const right = live
        ? live.waiting
          ? <Text color="warning" bold={pulse(now)}>◆ waiting on you {live.waitingSince != null ? clock(now - live.waitingSince) : ''}</Text>
          : <Text dimColor>{live.phaseName} · {clock(now - live.phaseSince)} in phase</Text>
        : <Text dimColor>{item ? item.state : 'not in this vault'}{item?.author ? ` · ${item.author}` : ''}</Text>
      const total = reqId ? sumFuel(fuel[reqId]).fresh : 0
      const v = viewedOf(g, marks)
      return (
        <Box flexDirection="row" justifyContent="space-between">
          <Box flexDirection="row">
            <Text color={live?.waiting ? 'warning' : ACCENT} bold>✈ {reqId ?? '—'}</Text>
            <Text>  {clip(title, Math.max(8, W - 72))}</Text>
            {reqId && focus && reqId !== focus ? <Text dimColor>  (browsing · flying {focus})</Text> : null}
          </Box>
          <Box flexDirection="row">
            {right}
            {total ? <Text dimColor> · {tokens(total)} tok</Text> : null}
            {v.m > 0 && live && live.phase >= 3 ? <Text color={v.n < v.m ? 'warning' : 'success'}> · viewed {v.n}/{v.m}</Text> : null}
          </Box>
        </Box>
      )
    }

    // ----- tabs -----
    const tabs = () => {
      const cellW = Math.max(12, Math.floor(Math.min(W - 24, 90) / 5))
      const mark = (p: { state: string; name: string }) =>
        p.state === 'done' ? `${p.name} ✓` : p.state === 'gate' ? `◆ ${p.name}` : p.state === 'now' ? `${p.name} ${spinFrame(now)}` : `${p.name} ○`
      return (
        <Box flexDirection="column">
          <Box flexDirection="row" justifyContent="space-between">
            <Box flexDirection="row">
              {phases.map(p => (
                <Box width={cellW}>
                  <Button key={`tab-${p.n}`} plain hotkey={String(p.n)} label={clip(mark(p), cellW - 4)} dimColor={p.state === 'todo'} onPress={() => go(p.n as FlightTab)} />
                </Box>
              ))}
            </Box>
            <Box flexDirection="row">
              <Button key="tab-history" plain hotkey="h" label="history" onPress={() => go('history')} />
              <Text>  </Text>
              <Button key="tab-settings" plain hotkey="s" label="settings" onPress={() => go('settings')} />
            </Box>
          </Box>
          <Box flexDirection="row" justifyContent="space-between">
            <Box flexDirection="row">
              {phases.map(p => {
                const w = cellW - 2
                const isTab = p.n === tabN
                const color = isTab ? ACCENT : p.state === 'done' ? 'subtle' : p.state === 'todo' ? 'inactive' : 'warning'
                return <Box width={cellW}><Text color={color}>{(isTab || p.state !== 'todo' ? '━' : '─').repeat(w)}</Text></Box>
              })}
            </Box>
            <Box flexDirection="row">
              <Text color={view.tab === 'history' ? ACCENT : 'inactive'}>{'━'.repeat(10)}</Text>
              <Text>  </Text>
              <Text color={view.tab === 'settings' ? ACCENT : 'inactive'}>{'━'.repeat(11)}</Text>
            </Box>
          </Box>
        </Box>
      )
    }

    // ----- what every phase page shares -----
    type PhaseCtx = {
      n: number; phase: string; p: { state: string } | undefined; vp: VaultPhase | null
      t: FlightTrail[string][string]; rounds: { at: string; decision: string; note: string; by?: string; viewed?: string }[]
      events: HotEvent[]; notes: string[]; decisions: string[]
      card: ReturnType<typeof parseGateCard>; myRead: string; verdict: string; needs: string[]
    }
    const ctxOf = (n: number): PhaseCtx => {
      const phase = names[n - 1] ?? `phase ${n}`
      const vp: VaultPhase | null = st?.phases?.[String(n)] ?? null
      const t = trail[reqId ?? '']?.[phase] ?? { rounds: [], runs: [], card: null }
      const rounds = vp?.gates?.length
        ? vp.gates.map(gg => ({ at: gg.at ?? '', decision: gg.decision ?? '', note: gg.note ?? '', by: gg.by, ...(gg.viewed ? { viewed: gg.viewed } : {}) }))
        : t.rounds.map(r => ({ at: `${dateOf(r.at)} ${timeOf(r.at)}`, decision: r.decision, note: r.note, ...(r.viewed ? { viewed: r.viewed } : {}) }))
      const card = t.card ? parseGateCard(t.card.text) : null
      return {
        n, phase, p: phases[n - 1], vp, t, rounds,
        events: reqId ? hotFor(hot, reqId, kind, n) : [], notes: notesFor(kind, n, st?.notes),
        decisions: recordDecisionsFor(kind, n, rec?.sections.decisions), card,
        myRead: card?.sections.find(s => /MY READ/.test(s.label))?.lines.join(' ') ?? '',
        verdict: card?.verdict ?? '',
        needs: card?.sections.find(s => /NEEDS YOU/.test(s.label))?.lines ?? [],
      }
    }

    /** The gate's state, the rounds (what was chosen, what was typed), the dated trail. First on every page. */
    const gateBlock = (c: PhaseCtx) => {
      const stateLine = !c.p ? null
        : c.p.state === 'gate' ? <Text color="warning" bold>◆ gate {c.n}/5 · waiting on you {live?.waitingSince != null ? clock(now - live.waitingSince) : ''}</Text>
        : c.p.state === 'now' ? <Text color={ACCENT}>{spinFrame(now)} in progress · {live ? clock(now - live.phaseSince) : ''} in phase</Text>
        : c.p.state === 'done' ? <Text color="success">✓ cleared</Text>
        : <Text dimColor>○ not reached</Text>
      return (
        <Box flexDirection="column">
          <Box flexDirection="row" justifyContent="space-between">
            <Box flexDirection="row"><Text bold color="subtle">GATE </Text>{stateLine}</Box>
            <Box flexDirection="row">
              {c.t.card ? <Button key={`card-${c.n}`} plain label="card" onPress={() => sub({ kind: 'card', phase: c.phase })} /> : dim('no card captured here')}
            </Box>
          </Box>
          {c.rounds.map((r, i) => (
            <Box flexDirection="row">
              <Cell w={4}><Text dimColor>#{i + 1}</Text></Cell>
              <Cell w={17}><Text dimColor>{clip(r.at, 16)}</Text></Cell>
              <Cell w={10}><Text color={/abort|cancel/.test(r.decision) ? 'error' : /revise|fix/.test(r.decision) ? 'warning' : /predict|summary/.test(r.decision) ? ACCENT : 'success'} bold>{clip(r.decision, 9)}</Text></Cell>
              <Text wrap="truncate">{r.note ? `“${r.note}”` : ''}{r.viewed ? `  viewed ${r.viewed}` : ''}{r.by ? `  — ${r.by}` : ''}</Text>
            </Box>
          ))}
          {c.events.map(ev => (
            <Box flexDirection="row">
              <Cell w={12}><Text dimColor>{ev.date}</Text></Cell>
              <Cell w={24}><Text color={/aborted|cancel|revert/.test(ev.event) ? 'error' : 'subtle'}>{clip(ev.event, 23)}</Text></Cell>
              <Text dimColor wrap="truncate">{hotTail(ev)}</Text>
            </Box>
          ))}
          {c.notes.map(nt => <Text dimColor wrap="truncate">  · {nt}</Text>)}
          {c.rounds.length === 0 && c.events.length === 0 && c.notes.length === 0 && c.p?.state !== 'todo' ? dim('nothing recorded for this gate yet') : null}
        </Box>
      )
    }

    /** Agents that flew for this phase; a lane still flying after the REQ moved on draws under the current phase, origin noted. */
    const agentsBlock = (c: PhaseCtx, tasks: TaskDoc[] = []) => {
      const liveLanes = lanes.filter(l => l.req === reqId && (l.phase === c.phase || (l.endedAt === null && live?.phase === c.n)))
      const runsHere: FlightRun[] = c.vp?.agents?.length
        ? c.vp.agents.map(a => ({
          id: a.id ?? '', agent: a.type ?? '?', task: a.task ?? null,
          startedAt: Date.parse(a.startedAt ?? '') || 0, endedAt: Date.parse(a.endedAt ?? '') || 0, tokens: 0,
          verdict: a.verdict ?? '', isFailed: false,
        }))
        : c.t.runs
      const landed = runsHere.filter(r => !liveLanes.some(l => l.id === r.id))
      const groups = new Map<string, { lanes: FlightLane[]; runs: FlightRun[] }>()
      const key = (task: string | null) => task ?? ''
      for (const l of liveLanes) { const gk = key(l.task); const gr = groups.get(gk) ?? { lanes: [], runs: [] }; gr.lanes.push(l); groups.set(gk, gr) }
      for (const r of landed) { const gk = key(r.task); const gr = groups.get(gk) ?? { lanes: [], runs: [] }; gr.runs.push(r); groups.set(gk, gr) }
      const order = [...groups.keys()].sort((a, b) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b)))
      const laneRow = (l: FlightLane) => (
        <Box flexDirection="row">
          <Cell w={3}><Text color={l.endedAt === null ? ACCENT : l.isFailed ? 'error' : 'inactive'}>{l.endedAt === null ? spinFrame(now) : l.isFailed ? '✗' : '✓'}</Text></Cell>
          <Cell w={22}><Button key={`lane-${l.id}`} plain label={clip(l.agent, 21)} onPress={() => sub({ kind: 'lane', id: l.id })} /></Cell>
          <Cell w={7}><Text dimColor>{clock((l.endedAt ?? now) - l.startedAt)}</Text></Cell>
          <Cell w={7}><Text dimColor>{l.wrote ? tokens(l.wrote) : ''}</Text></Cell>
          <Text wrap="truncate">{l.phase && l.phase !== c.phase ? `from ${l.phase} · ` : ''}{l.doing}</Text>
        </Box>
      )
      const runRow = (r: FlightRun) => (
        <Box flexDirection="row">
          <Cell w={3}><Text color={r.isFailed ? 'error' : 'inactive'}>{r.isFailed ? '✗' : '✓'}</Text></Cell>
          <Cell w={22}><Button key={`run-${r.id}`} plain dimColor label={clip(r.agent, 21)} onPress={() => sub({ kind: 'lane', id: r.id })} /></Cell>
          <Cell w={7}><Text dimColor>{r.endedAt && r.startedAt ? clock(r.endedAt - r.startedAt) : ''}</Text></Cell>
          <Cell w={7}><Text dimColor>{r.wrote ? tokens(r.wrote) : ''}</Text></Cell>
          <Text dimColor wrap="truncate">{r.verdict}</Text>
        </Box>
      )
      return (
        <Box flexDirection="column">
          {H(`AGENTS · ${liveLanes.length + landed.length}`)}
          {liveLanes.length + landed.length === 0 ? dim(c.p?.state === 'todo' ? '—' : 'none seen on this machine') : null}
          {order.map(gk => {
            const gr = groups.get(gk) ?? { lanes: [], runs: [] }
            const task = tasks.find(t => t.id === gk)
            return (
              <Box flexDirection="column">
                {gk ? <Box flexDirection="row"><Text color="subtle" bold>{gk}</Text><Text dimColor>{task ? `  ${clip(task.title || task.goal, W - 14)}` : ''}</Text></Box> : null}
                {gr.lanes.map(laneRow)}
                {gr.runs.slice().reverse().map(runRow)}
              </Box>
            )
          })}
        </Box>
      )
    }

    /** The recommendation and the decision, last — everything above it is the evidence. */
    const readBlock = (c: PhaseCtx, extra?: unknown) => (
      <Box flexDirection="column" marginTop={1}>
        <Text color="inactive">{'─'.repeat(Math.min(W, 60))}</Text>
        {c.verdict ? <Text>{clip(c.verdict, W - 2)}</Text> : null}
        {c.needs.length ? <Box flexDirection="column">{c.needs.map(l => pointed(`  ${l}`))}</Box> : null}
        {c.myRead ? <Box flexDirection="row"><Cell w={9}><Text color={ACCENT} bold>MY READ</Text></Cell><Text wrap="wrap">{c.myRead}</Text></Box> : null}
        {extra as never}
        {c.p?.state === 'gate' && live && (
          <Box flexDirection="row" marginTop={1}>
            <Button key={`resume-${live.id}`} label="resume — the dialog in the transcript has the options" variant="primary" hotkey="r"
              onPress={() => void $.prompt.submit({ text: `/${live.kind === 'bug' ? 'bugfix' : 'proceed'} ${live.id}` })} />
          </Box>
        )}
        {!c.verdict && !c.myRead && c.p?.state !== 'todo' ? dim('no recommendation captured on this machine') : null}
      </Box>
    )

    const recordBlock = (n: number) => {
      const recSections = rec ? recordSectionsFor(n).map(h => ({ h, body: rec.sections[h] })).filter((x): x is { h: string; body: string } => !!x.body) : []
      if (!recSections.length) return null
      return (
        <Box flexDirection="column">
          {H('RECORD')}
          {recSections.map(s => (
            <Box flexDirection="column">
              <Text color="subtle" bold>{s.h}</Text>
              <Markdown key={`rec-${reqId}-${s.h}`} text={clip(s.body, 2400)} dimColor />
            </Box>
          ))}
        </Box>
      )
    }

    const filesBlock = async (n: number) => {
      const artifacts = folder ? await Promise.all(artifactsFor(kind, n).map(async a => {
        const path = `${folder}/${a.file}`
        try {
          const s = await $.fs.stat(path)
          if (s.kind === 'dir') {
            const files = (await $.fs.list(path)).filter(f => f.kind === 'file' && /\.md$/.test(f.name)).map(f => f.name).sort()
            return { ...a, path, size: files.length, files }
          }
          return { ...a, path, size: s.size, files: null as string[] | null }
        } catch { return null }
      })) : []
      const present = artifacts.filter((a): a is NonNullable<typeof a> => a !== null)
      const recPath = reqId ? recordOf.get(reqId) ?? null : null
      return (
        <Box flexDirection="column">
          {H('FILES')}
          {!folder ? dim(rec ? 'working set cleaned — the record is what remains' : 'no working set on this clone') : null}
          {folder && present.length === 0 ? dim('nothing written for this phase yet') : null}
          <Box flexDirection="row" flexWrap="wrap">
            {present.map(a => (
              <Box marginRight={2} flexDirection="row">
                <Button key={`doc-${n}-${a.file}`} plain label={`${a.label} ${a.files ? `(${a.size})` : kb(a.size)}`}
                  onPress={() => sub(a.files ? { kind: 'doc', path: a.path, title: a.label } : { kind: 'doc', path: a.path, title: a.file })} />
                {!a.files ? <Text dimColor> {ref(a.path, undefined, '↗')}</Text> : null}
              </Box>
            ))}
            {rec && n === 5 && recPath ? (
              <Button key="doc-record" plain label="record" onPress={() => sub({ kind: 'doc', path: recPath, title: `${reqId} record` })} />
            ) : null}
          </Box>
        </Box>
      )
    }

    /** Plan vs actual: the files the plan names beside the files the tree changed; surprises in amber. */
    const planBlock = (rows: PlanRow[], title: string) => {
      const surprises = rows.filter(r => r.planned !== !!r.touched)
      const planned = rows.filter(r => r.planned).length, touched = rows.filter(r => r.touched).length
      return (
        <Box flexDirection="column">
          <Box flexDirection="row" justifyContent="space-between">
            {H(title)}
            <Box marginTop={1}><Text dimColor>{planned} planned · {touched} touched{g?.baseName ? ` · vs ${g.baseName}` : g ? ' · vs HEAD' : ''}{surprises.length ? ` · ` : ''}{surprises.length ? <Text color="warning">{surprises.length} surprise{surprises.length > 1 ? 's' : ''}</Text> : null}</Text></Box>
          </Box>
          {!g ? dim('asking git…') : g.error ? <Text color="error">{g.error}</Text> : null}
          {g && rows.length === 0 ? dim('nothing planned and nothing changed') : null}
          <Box flexDirection="row">
            <Cell w={Math.floor(W * 0.5)}><Text dimColor>planned</Text></Cell>
            <Text dimColor>touched</Text>
          </Box>
          {rows.map(r => {
            const tone = !r.planned ? 'warning' : !r.touched ? 'warning' : undefined
            const left = r.planned ? <Box flexDirection="row"><Text color={tone}>{r.touched ? '  ' : '○ '}</Text>{ref(r.path, undefined, clip(r.path, Math.floor(W * 0.5) - 4))}</Box> : <Text dimColor>{'  —'}</Text>
            const right = r.touched
              ? <Box flexDirection="row"><Text color={tone}>{r.planned ? '  ' : '⚠ '}</Text>{plusMinus(r.touched)}<Text dimColor>{r.tasks.length ? `  ${r.tasks.join(',')}` : ''}{!r.planned ? '  outside the plan' : ''}</Text></Box>
              : <Text color="warning">  not touched{r.why ? ` — ${clip(r.why, 30)}` : ''}</Text>
            return (
              <Box flexDirection="row">
                <Cell w={Math.floor(W * 0.5)}>{left}</Cell>
                <Box flexGrow={1}>{right}</Box>
              </Box>
            )
          })}
        </Box>
      )
    }

    /** One row per changed file: the viewed mark, the link, +/−, the task, the test that names it, who last touched it. */
    const matrixBlock = (rows: PlanRow[], tasks: TaskDoc[], testsFor: Map<string, string[]>) => {
      const touched = rows.filter(r => r.touched)
      const v = viewedOf(g, marks)
      const me = g?.me?.toLowerCase() ?? ''
      const sorted = touched.slice().sort((a, b) => {
        const fa = (g?.authors[pathKey(a.path)] ?? '').toLowerCase(), fb = (g?.authors[pathKey(b.path)] ?? '').toLowerCase()
        const ua = me && fa && !fa.startsWith(me) ? 0 : 1, ub = me && fb && !fb.startsWith(me) ? 0 : 1
        return ua - ub || (b.touched?.add ?? 0) + (b.touched?.del ?? 0) - ((a.touched?.add ?? 0) + (a.touched?.del ?? 0))
      })
      return (
        <Box flexDirection="column">
          <Box flexDirection="row" justifyContent="space-between">
            {H('FILES CHANGED')}
            <Box marginTop={1}><Text color={v.n < v.m ? 'warning' : 'success'}>viewed {v.n}/{v.m}</Text>{v.stale.length ? <Text color="warning"> · {v.stale.length} changed since you viewed</Text> : null}</Box>
          </Box>
          {touched.length === 0 ? dim(g ? 'the tree matches the base' : 'asking git…') : null}
          {sorted.map(r => {
            const k = pathKey(r.path)
            const hash = g?.hashes[k]
            const mark = marks?.[k]
            const seen = !!mark && mark === hash
            const stale = !!mark && !seen
            const author = g?.authors[k] ?? ''
            const mine = !me || !author || author.toLowerCase().startsWith(me)
            const tests = testsFor.get(k) ?? []
            return (
              <Box flexDirection="column">
                <Box flexDirection="row">
                  <Cell w={4}><Button key={`seen-${k}`} plain label={seen ? '[✓]' : stale ? '[~]' : '[ ]'} onPress={() => void (seen ? unmarkViewed($, reqId ?? '', r.path) : markViewed($, reqId ?? '', r.path, hash))} /></Cell>
                  <Box flexGrow={1}><Box flexDirection="row">{ref(r.path, undefined, clip(r.path, narrow ? W - 30 : W - 48))}{stale ? <Text color="warning"> changed since you viewed</Text> : null}</Box></Box>
                  <Cell w={12}>{plusMinus(r.touched)}</Cell>
                  {!narrow ? <Cell w={10}><Text dimColor>{clip(r.tasks.join(','), 9)}</Text></Cell> : null}
                  <Cell w={6}><Button key={`diff-${k}`} plain label="diff" onPress={() => sub({ kind: 'diff', path: r.path })} /></Cell>
                </Box>
                {(!mine || tests.length || (!r.planned)) ? (
                  <Box flexDirection="row" marginLeft={4}>
                    <Text dimColor wrap="truncate">
                      {!r.planned ? '⚠ outside the plan · ' : ''}
                      {tests.length ? `tests: ${tests.map(baseName).join(', ')} · ` : ''}
                      {author ? `last: ${author}` : ''}
                    </Text>
                    {!mine ? <Text color="warning"> · not yours lately</Text> : null}
                  </Box>
                ) : null}
              </Box>
            )
          })}
        </Box>
      )
    }

    /** Which test files reference a changed source file, by stem: `RetryPolicy.cs` ← `RetryPolicyTests.cs`. */
    const testsFor = (rows: PlanRow[]) => {
      const out = new Map<string, string[]>()
      const all = rows.map(r => r.path)
      const isTest = (p: string) => /test|spec/i.test(p)
      for (const p of all) {
        if (isTest(p)) continue
        const stem = baseName(p).replace(/\.[^.]+$/, '').toLowerCase()
        if (stem.length < 3) continue
        const hits = all.filter(q => isTest(q) && baseName(q).toLowerCase().includes(stem))
        if (hits.length) out.set(pathKey(p), hits)
      }
      return out
    }

    const acBlock = (title: string, rows: { text: string; status?: 'pass' | 'partial' | 'fail' | 'unknown'; done?: boolean; evidence?: string }[], known: readonly string[]) => (
      <Box flexDirection="column">
        {H(title)}
        {rows.length === 0 ? dim('none written') : null}
        {rows.map((r, i) => {
          const s = r.status ?? (r.done ? 'pass' : 'unknown')
          const glyph = s === 'pass' ? '✓' : s === 'partial' ? '◐' : s === 'fail' ? '✗' : '○'
          const tone = s === 'pass' ? 'success' : s === 'partial' ? 'warning' : s === 'fail' ? 'error' : 'inactive'
          return (
            <Box flexDirection="row">
              <Cell w={4}><Text color={tone}>{glyph} {i + 1}</Text></Cell>
              <Box flexGrow={1} flexDirection="column">
                {pointed(r.text, known)}
                {r.evidence ? <Box marginLeft={2}>{pointed(`↳ ${r.evidence}`, known)}</Box> : null}
              </Box>
            </Box>
          )
        })}
      </Box>
    )

    const mermaidBlock = async (md: string | null, title: string) => {
      const fences = mermaidFences(md)
      if (fences.length === 0) return null
      const first = fences[0] ?? ''
      const drawn = await renderMermaid($, first, W - 2)
      return (
        <Box flexDirection="column">
          <Box flexDirection="row" justifyContent="space-between">
            {H(title)}
            <Box marginTop={1} flexDirection="row">
              {fences.length > 1 ? <Text dimColor>{fences.length} diagrams · </Text> : null}
              <Button key="mermaid-src" plain hotkey="m" label={drawn ? 'source' : 'open'} onPress={() => sub({ kind: 'mermaid', n: 0 })} />
            </Box>
          </Box>
          {drawn ? <Text>{drawn}</Text> : <Code source={clip(first, 1200)} language="mermaid" />}
          {!drawn ? dim('mermaid-ascii is not on PATH — the source is shown instead') : null}
        </Box>
      )
    }

    // ----- the five pages -----

    const specPage = async (c: PhaseCtx) => {
      const md = folder ? await cached($, `${folder}/${kind === 'bug' ? 'bug.md' : 'requirement.md'}`) : null
      const ac = acceptanceOf(md)
      const beh = behaviourOf(md)
      const nonGoals = bulletsOf(md, 'Non-goals')
      const outOfScope = bulletsOf(md, 'Out of scope \\(for now\\)')
      const open = bulletsOf(md, 'Open questions')
      const half = Math.floor(W / 2) - 1
      const col2 = (a: string[], b: string[], ha: string, hb: string) => (
        <Box flexDirection="column">
          <Box flexDirection="row"><Cell w={half}><Text dimColor>{ha}</Text></Cell><Text dimColor>{hb}</Text></Box>
          {Array.from({ length: Math.max(a.length, b.length) }).map((_, i) => (
            <Box flexDirection="row">
              <Cell w={half}><Text wrap="truncate">{a[i] ? `· ${a[i]}` : ''}</Text></Cell>
              <Box flexGrow={1}><Text wrap="truncate" color={b[i] ? ACCENT : undefined}>{b[i] ? `· ${b[i]}` : ''}</Text></Box>
            </Box>
          ))}
        </Box>
      )
      return (
        <Box flexDirection="column">
          {gateBlock(c)}
          {beh.today.length || beh.after.length ? <Box flexDirection="column">{H('BEHAVIOUR')}{col2(beh.today, beh.after, 'today', 'after')}</Box> : null}
          {acBlock('ACCEPTANCE CRITERIA', ac, [])}
          {nonGoals.length || outOfScope.length ? (
            <Box flexDirection="column">{H('OUT')}{col2(nonGoals, outOfScope, 'non-goals', 'out of scope for now')}</Box>
          ) : null}
          {open.length ? <Box flexDirection="column">{H('OPEN QUESTIONS')}{open.map(q => <Text wrap="truncate">  ? {q}</Text>)}</Box> : null}
          {await mermaidBlock(md, 'FLOW')}
          {agentsBlock(c)}
          {await filesBlock(c.n)}
          {recordBlock(c.n)}
          {readBlock(c)}
        </Box>
      )
    }

    const architectPage = async (c: PhaseCtx) => {
      const arch = folder ? await cached($, `${folder}/${kind === 'bug' ? 'investigation.md' : 'architecture.md'}`) : null
      const tasks = await tasksOf($, folder)
      const planned = blastRadius(arch)
      const tiers = tiersOf(tasks)
      const railRows = rails(tiers)
      const hits = knowledgeHits(arch)
      const predict = roundOf(c.t.rounds, 'predict')
      const approach = (sectionOf(arch ?? '', 'Approach') ?? '').split('\n').map(l => l.trim()).filter(Boolean).slice(0, 3).join(' ')
      const testStrategy = parseTable(sectionOf(arch ?? '', 'Test strategy'))
      const risks = bulletsOf(arch, 'Risks')
      const half = Math.floor(W / 2) - 1
      const youSaid = predict ? (
        <Box flexDirection="column">
          {H('YOU SAID / CLAUDE FOUND')}
          <Box flexDirection="row">
            <Cell w={half}><Text dimColor>you, before the design</Text></Cell>
            <Text dimColor>the design</Text>
          </Box>
          <Box flexDirection="row">
            <Cell w={half}><Text wrap="wrap">{predict}</Text></Cell>
            <Box flexGrow={1} flexDirection="column">
              <Text wrap="wrap">{clip(approach, 400)}</Text>
              <Text dimColor>{planned.length} files in the blast radius</Text>
            </Box>
          </Box>
          {(() => {
            const low = predict.toLowerCase()
            const matched = planned.filter(b => low.includes(baseName(b.path).toLowerCase().replace(/\.[^.]+$/, '')))
            const missed = planned.filter(b => !matched.includes(b))
            return (
              <Box flexDirection="row" marginTop={1}>
                <Cell w={half}><Text color="success">{matched.length ? `you named: ${matched.map(b => baseName(b.path)).join(', ')}` : 'none of the blast radius named'}</Text></Cell>
                <Box flexGrow={1}><Text color={missed.length ? 'warning' : 'success'}>{missed.length ? `you did not name: ${missed.slice(0, 6).map(b => baseName(b.path)).join(', ')}${missed.length > 6 ? '…' : ''}` : 'everything in the radius was named'}</Text></Box>
              </Box>
            )
          })()}
        </Box>
      ) : null
      return (
        <Box flexDirection="column">
          {gateBlock(c)}
          {youSaid}
          <Box flexDirection="column">
            {H(`BLAST RADIUS · ${planned.length}`)}
            {planned.length === 0 ? dim(arch ? 'no blast radius table' : 'no architecture on disk') : null}
            {planned.map(b => {
              const author = g?.authors[pathKey(b.path)] ?? ''
              const me = g?.me?.toLowerCase() ?? ''
              const notMine = !!me && !!author && !author.toLowerCase().startsWith(me)
              return (
                <Box flexDirection="row">
                  <Cell w={Math.floor(W * 0.45)}>{ref(b.path, undefined, clip(b.path, Math.floor(W * 0.45) - 2))}</Cell>
                  <Cell w={8}><Text color={/high/.test(b.risk) ? 'error' : /med/.test(b.risk) ? 'warning' : 'subtle'}>{clip(b.risk, 7)}</Text></Cell>
                  <Box flexGrow={1}><Text dimColor wrap="truncate">{b.why}{author ? `  · last: ${author}` : ''}</Text></Box>
                  {notMine ? <Text color="warning"> not yours lately</Text> : null}
                </Box>
              )
            })}
          </Box>
          <Box flexDirection="column">
            {H(`TASKS · ${tasks.length}${tiers.length > 1 ? ` in ${tiers.length} tiers` : ''}`)}
            {tasks.length === 0 ? dim('no task files yet') : null}
            {railRows.map(r => {
              const status = live?.tasks.find(t => t.id === r.task.id)?.status ?? r.task.status
              const glyph = isLanded(status) ? '●' : /progress/.test(status) ? spinFrame(now) : /fail|block/.test(status) ? '✗' : '○'
              return (
                <Box flexDirection="row">
                  <Cell w={7}><Text color="inactive">{r.rail}</Text></Cell>
                  <Cell w={3}><Text color={isLanded(status) ? 'success' : /fail|block/.test(status) ? 'error' : 'inactive'}>{glyph}</Text></Cell>
                  <Cell w={10}><Button key={`task-${r.task.id}`} plain label={r.task.id} onPress={() => sub({ kind: 'doc', path: `${folder}/tasks/${r.task.id}.md`, title: r.task.id })} /></Cell>
                  <Box flexGrow={1}><Text wrap="truncate">{r.task.title || r.task.goal}</Text></Box>
                  {!narrow ? <Cell w={Math.min(30, Math.floor(W * 0.3))}><Text dimColor wrap="truncate">{r.task.files.map(f => baseName(f.path)).join(', ')}</Text></Cell> : null}
                </Box>
              )
            })}
          </Box>
          {await mermaidBlock(arch, 'KEY FLOW')}
          {hits.length ? (
            <Box flexDirection="column">
              {H(`KNOWLEDGE · ${hits.length}`)}
              {hits.map(h => <Box flexDirection="row"><Cell w={16}><Text color={ACCENT}>{clip(h.id, 15)}</Text></Cell><Text dimColor wrap="truncate">{h.text.replace(h.id, '').replace(/^\s*[—–-]\s*/, '')}</Text></Box>)}
            </Box>
          ) : null}
          {testStrategy && testStrategy.rows.length ? (
            <Box flexDirection="column">
              {H('TEST STRATEGY')}
              {testStrategy.rows.map(r => <Box flexDirection="row"><Cell w={14}><Text color="subtle">{clip(r[0] ?? '', 13)}</Text></Cell><Text dimColor wrap="truncate">{r.slice(1).join(' · ')}</Text></Box>)}
            </Box>
          ) : null}
          {risks.length ? <Box flexDirection="column">{H('RISKS')}{risks.map(r => <Text wrap="truncate">  ⚠ {r}</Text>)}</Box> : null}
          {agentsBlock(c, tasks)}
          {await filesBlock(c.n)}
          {recordBlock(c.n)}
          {readBlock(c)}
        </Box>
      )
    }

    const implementPage = async (c: PhaseCtx) => {
      const arch = folder ? await cached($, `${folder}/${kind === 'bug' ? 'investigation.md' : 'architecture.md'}`) : null
      const tasks = await tasksOf($, folder)
      const rows = planVsActual(blastRadius(arch), tasks, g?.touched ?? [])
      const known = rows.map(r => r.path)
      return (
        <Box flexDirection="column">
          {gateBlock(c)}
          {planBlock(rows, 'PLAN VS ACTUAL')}
          {matrixBlock(rows, tasks, testsFor(rows))}
          {tasks.length ? acBlock('TASK ACCEPTANCE', tasks.flatMap(t => t.acceptance.map(a => ({ text: `${t.id} · ${a.text}`, done: a.done }))), known) : null}
          {agentsBlock(c, tasks)}
          {await filesBlock(c.n)}
          {fuelBars(c.phase)}
          {recordBlock(c.n)}
          {readBlock(c)}
        </Box>
      )
    }

    const reviewPage = async (c: PhaseCtx) => {
      const ver = folder ? await cached($, `${folder}/verification.md`) : null
      const arch = folder ? await cached($, `${folder}/${kind === 'bug' ? 'investigation.md' : 'architecture.md'}`) : null
      const tasks = await tasksOf($, folder)
      const rows = planVsActual(blastRadius(arch), tasks, g?.touched ?? [])
      const known = rows.map(r => r.path)
      const findings = findingsOf(ver).sort((a, b) => severityRank(a.severity) - severityRank(b.severity))
      const first = findings.filter(f => f.needsDecision || f.disagreement)
      const roster = rosterOf(ver)
      const ac = acCheckOf(ver)
      const claims = c.card?.sections.filter(s => /CHECKS|READY|FINDINGS|VERIFIED|TESTS/.test(s.label)).flatMap(s => s.lines) ?? []
      const picked = Object.entries(picks)
      const reply = (() => {
        const by: Record<string, string[]> = { fix: [], accept: [], defer: [] }
        for (const [id, d] of picked) by[d]?.push(id)
        return ['fix', 'accept', 'defer'].filter(k => by[k]?.length).map(k => `${k} ${by[k]?.join(',')}`).join(' · ')
      })()
      const pick = (id: string, v: string) => void update($, picksA, p => ({ ...p, [reqId ?? '']: { ...(p[reqId ?? ''] ?? {}), [id]: v as 'fix' | 'accept' | 'defer' } }))
      const findingRow = (f: typeof findings[number]) => {
        const m = /^(.*?):(\d+)/.exec(f.where)
        return (
          <Box flexDirection="column">
            <Box flexDirection="row">
              <Cell w={5}><Text bold>{f.id}</Text></Cell>
              <Cell w={9}><Text color={sev(f.severity)}>{clip(f.severity, 8)}</Text></Cell>
              <Box flexGrow={1}><Text wrap="truncate">{f.text}</Text></Box>
              {Select ? (
                <Cell w={10}><Select key={`pick-${f.id}`} value={picks[f.id] ?? ''} options={[{ value: '', label: '—' }, { value: 'fix', label: 'fix' }, { value: 'accept', label: 'accept' }, { value: 'defer', label: 'defer' }]} onSelect={(v: string) => pick(f.id, v)} /></Cell>
              ) : (
                <Cell w={10}><Button key={`pick-${f.id}`} plain label={picks[f.id] ?? '—'} onPress={() => pick(f.id, picks[f.id] === 'fix' ? 'accept' : picks[f.id] === 'accept' ? 'defer' : 'fix')} /></Cell>
              )}
            </Box>
            <Box flexDirection="row" marginLeft={5}>
              {f.where ? <Box>{m ? ref(m[1] ?? f.where, Number(m[2]), f.where) : pointed(f.where, known)}</Box> : <Text dimColor>no location</Text>}
              <Text dimColor>{f.reviewer ? ` · ${f.reviewer}` : ''}{f.effort ? ` · ${f.effort}` : ''}{f.fix && !/^yes$/i.test(f.fix) ? ` · ${f.fix}` : ''}</Text>
              {f.disagreement ? <Text color="warning"> · {f.disagreement}</Text> : null}
            </Box>
          </Box>
        )
      }
      return (
        <Box flexDirection="column">
          {gateBlock(c)}
          {first.length ? (
            <Box flexDirection="column">
              {H(`NEEDS A DECISION · ${first.length}`)}
              {first.map(findingRow)}
            </Box>
          ) : null}
          <Box flexDirection="column">
            <Box flexDirection="row" justifyContent="space-between">
              {H(`FINDINGS · ${findings.length}`)}
              <Box marginTop={1}><Text dimColor>{roster ? clip(`reviewed by ${roster}`, Math.floor(W * 0.5)) : ''}</Text></Box>
            </Box>
            {findings.length === 0 ? dim(ver ? 'no findings table yet' : 'no verification.md yet') : null}
            {findings.filter(f => !first.includes(f)).map(findingRow)}
            {findings.length ? (
              <Box flexDirection="row" marginTop={1}>
                <Button key="compose" plain hotkey="c" label={reply ? `put “${clip(reply, 48)}” in the prompt` : 'pick fix / accept / defer per row, then compose the reply'}
                  dimColor={!reply} onPress={() => { if (reply) void $.prompt.fill({ text: reply, mode: 'replace' }).catch(() => {}) }} />
              </Box>
            ) : null}
          </Box>
          {claims.length ? (
            <Box flexDirection="column">
              {H('CLAIMS')}
              {claims.map(l => (
                <Box flexDirection="row">
                  <Cell w={3}><Text color={hasPointer(l) ? 'success' : 'inactive'}>{hasPointer(l) ? '↗' : '·'}</Text></Cell>
                  <Box flexGrow={1}>{hasPointer(l) ? pointed(l, known) : <Text dimColor wrap="truncate">{l}  (no evidence named)</Text>}</Box>
                </Box>
              ))}
            </Box>
          ) : null}
          {acBlock('ACCEPTANCE CRITERIA CHECK', ac, known)}
          {planBlock(rows, 'PLAN VS ACTUAL')}
          {agentsBlock(c, tasks)}
          {await filesBlock(c.n)}
          {fuelBars(c.phase)}
          {recordBlock(c.n)}
          {readBlock(c)}
        </Box>
      )
    }

    const shipPage = async (c: PhaseCtx) => {
      const arch = folder ? await cached($, `${folder}/${kind === 'bug' ? 'investigation.md' : 'architecture.md'}`) : null
      const tasks = await tasksOf($, folder)
      const rows = planVsActual(blastRadius(arch), tasks, g?.touched ?? [])
      const commits = folder ? await cached($, `${folder}/commits-draft.md`) : null
      const pr = folder ? await cached($, `${folder}/${kind === 'bug' ? 'bug-fix-pr-draft.md' : 'pr-draft.md'}`) : null
      const checklistMd = folder ? await cached($, `${folder}/merge-checklist.md`) : null
      const cons = consequences(commits, pr, checklistMd, g?.branch ?? st?.branch ?? null, rows)
      const summary = roundOf(c.t.rounds, 'summary')
      const gaps = summary ? summaryGaps(summary, rows) : null
      const lessons = (rec?.sections.knowledge ?? '').split('\n').map(l => l.trim()).filter(l => /LESSON-|L-REQ|^- /.test(l)).slice(0, 8)
      const checks = checklistMd ? checklistMd.split('\n').filter(l => /^\s*-\s*\[[ xX]\]/.test(l)).map(l => ({ text: l.replace(/^\s*-\s*\[[ xX]\]\s*/, ''), done: /\[[xX]\]/.test(l) })) : []
      const half = Math.floor(W / 2) - 1
      const touched = rows.filter(r => r.touched)
      const adds = touched.reduce((a, r) => a + (r.touched?.add ?? 0), 0), dels = touched.reduce((a, r) => a + (r.touched?.del ?? 0), 0)
      return (
        <Box flexDirection="column">
          {gateBlock(c)}
          <Box flexDirection="column">
            {H('WHAT APPROVING SETS IN MOTION')}
            {cons.length === 0 ? dim('no drafts on disk yet') : null}
            {cons.map(x => <Box flexDirection="row"><Cell w={3}><Text color={x.tone === 'warn' ? 'warning' : 'subtle'}>{x.tone === 'warn' ? '⚠' : '→'}</Text></Cell><Box flexGrow={1}>{pointed(x.text, touched.map(r => r.path))}</Box></Box>)}
          </Box>
          <Box flexDirection="column">
            <Box flexDirection="row" justifyContent="space-between">
              {H(`DIFFSTAT · ${touched.length} files`)}
              <Box marginTop={1} flexDirection="row"><Text color="success">+{adds}</Text><Text> </Text><Text color="error">−{dels}</Text><Text dimColor>{g?.baseName ? ` vs ${g.baseName}` : ''}</Text></Box>
            </Box>
            {touched.map(r => (
              <Box flexDirection="row">
                <Box flexGrow={1}>{ref(r.path, undefined, clip(r.path, W - 30))}</Box>
                <Cell w={12}>{plusMinus(r.touched)}</Cell>
                <Cell w={6}><Button key={`diff-${pathKey(r.path)}`} plain label="diff" onPress={() => sub({ kind: 'diff', path: r.path })} /></Cell>
              </Box>
            ))}
          </Box>
          {summary ? (
            <Box flexDirection="column">
              {H('YOUR REVIEW SUMMARY')}
              <Box flexDirection="row">
                <Cell w={half}><Text wrap="wrap">{summary}</Text></Cell>
                <Box flexGrow={1} flexDirection="column">
                  <Text color="success">{gaps?.mentioned.length ? `names ${gaps.mentioned.length} of ${touched.length} changed files` : 'names none of the changed files'}</Text>
                  {gaps?.missed.length ? <Text color="warning" wrap="wrap">not mentioned: {gaps.missed.slice(0, 8).map(baseName).join(', ')}{gaps.missed.length > 8 ? '…' : ''}</Text> : null}
                </Box>
              </Box>
            </Box>
          ) : null}
          {lessons.length ? <Box flexDirection="column">{H('LESSONS CAPTURED')}{lessons.map(l => <Text dimColor wrap="truncate">  {l.replace(/^- /, '')}</Text>)}</Box> : null}
          {checks.length ? acBlock('MERGE CHECKLIST', checks, []) : null}
          {agentsBlock(c, tasks)}
          {await filesBlock(c.n)}
          {fuelBars(c.phase)}
          {recordBlock(c.n)}
          {readBlock(c)}
        </Box>
      )
    }

    const phasePage = async (n: number) => {
      if (!reqId) return <Text dimColor>Not flying a REQ in this session. Name one (`/proceed REQ-042`), or pick one under history.</Text>
      const c = ctxOf(n)
      switch (n) {
        case 1: return specPage(c)
        case 2: return architectPage(c)
        case 3: return implementPage(c)
        case 4: return reviewPage(c)
        default: return shipPage(c)
      }
    }

    // ----- one thing opened from a phase page -----
    const docView = async (path: string, title: string) => {
      let text: string | null = null
      let listing: string[] | null = null
      try {
        if ((await $.fs.stat(path)).kind === 'dir') listing = (await $.fs.list(path)).filter(f => f.kind === 'file').map(f => f.name).sort()
        else text = await cached($, path)
      } catch {}
      return (
        <Box flexDirection="column">
          <Box flexDirection="row" justifyContent="space-between">
            <Box flexDirection="row"><Text bold color={ACCENT}>{title}</Text><Text>  </Text>{text !== null ? ref(path, undefined, 'open in editor ↗') : null}</Box>
            <Button key="back" plain hotkey="b" label="back" onPress={back} />
          </Box>
          <Text dimColor wrap="truncate">{path}</Text>
          <Box marginTop={1} flexDirection="column">
            {listing ? listing.map(f => <Button key={`doc-${f}`} plain label={f} onPress={() => sub({ kind: 'doc', path: `${path}/${f}`, title: f })} />) : null}
            {text !== null ? <Markdown key={`doc-${path}`} text={text} /> : listing ? null : dim('could not read that file')}
          </Box>
        </Box>
      )
    }

    /** One file's change against the base, unified; opening it is what marks the file viewed. */
    const diffView = async (path: string) => {
      const k = pathKey(path)
      const t = g?.touched.find(x => pathKey(x.path) === k)
      const cwd = g?.cwd ?? root
      let source: string | null = null
      let isNew = false
      if (t && (t.status === '?' || t.status === 'A') && !g?.base) {
        isNew = true
        try { source = await $.fs.read(absPath(cwd, path)) } catch { source = null }
      } else {
        source = await git($, cwd, ['diff', g?.base ?? 'HEAD', '--', path])
        if (source !== null && !source.trim() && t?.status === '?') { isNew = true; try { source = await $.fs.read(absPath(cwd, path)) } catch { source = null } }
      }
      if (source && source.length > DIFF_MAX) {
        const cut = source.lastIndexOf('\n@@', DIFF_MAX)
        source = source.slice(0, cut > 0 ? cut : DIFF_MAX) + '\n'
      }
      // Opening the diff is what marks the file viewed — once per hash, or this render would mark, redraw and mark again.
      if (reqId && g && marks?.[k] !== (g.hashes[k] ?? 'seen')) void markViewed($, reqId, path, g.hashes[k])
      const seen = !!marks?.[k] && marks[k] === g?.hashes[k]
      return (
        <Box flexDirection="column">
          <Box flexDirection="row" justifyContent="space-between">
            <Box flexDirection="row"><Text bold color={ACCENT}>{clip(path, W - 40)}</Text><Text>  </Text>{ref(path, undefined, 'open in editor ↗')}</Box>
            <Box flexDirection="row">
              {t ? plusMinus(t) : null}
              <Text>  </Text>
              <Text color={seen ? 'success' : 'warning'}>{seen ? '✓ viewed' : 'marking viewed'}</Text>
              <Text>  </Text>
              <Button key="back" plain hotkey="b" label="back" onPress={back} />
            </Box>
          </Box>
          <Text dimColor>{isNew ? 'new file' : `vs ${g?.baseName ?? 'HEAD'}`}{g?.authors[k] ? ` · last: ${g.authors[k]}` : ''}{source && source.length >= DIFF_MAX ? ' · cut at 90KB' : ''}</Text>
          <Box marginTop={1}>
            {source === null ? dim('git could not show that file') : isNew ? <Code source={source} path={path} startLine={1} /> : source.trim() ? <Code source={source} format="diff" path={path} /> : dim('no difference against the base')}
          </Box>
        </Box>
      )
    }

    const mermaidView = async (n: number) => {
      const md = folder ? await cached($, `${folder}/${kind === 'bug' ? 'investigation.md' : 'architecture.md'}`) ?? await cached($, `${folder}/requirement.md`) : null
      const fences = mermaidFences(md)
      const src = fences[n] ?? ''
      return (
        <Box flexDirection="column">
          <Box flexDirection="row" justifyContent="space-between">
            <Text bold color={ACCENT}>diagram {n + 1} of {fences.length} · source</Text>
            <Button key="back" plain hotkey="b" label="back" onPress={back} />
          </Box>
          <Box marginTop={1}>{src ? <Code source={src} language="mermaid" /> : dim('no diagram')}</Box>
        </Box>
      )
    }

    const cardView = (phase: string) => {
      const c = reqId ? trail[reqId]?.[phase]?.card : null
      return (
        <Box flexDirection="column">
          <Box flexDirection="row" justifyContent="space-between">
            <Text bold color={ACCENT}>gate card · {phase}</Text>
            <Button key="back" plain hotkey="b" label="back" onPress={back} />
          </Box>
          {c ? <Text dimColor>seen {dateOf(c.at)} {timeOf(c.at)}</Text> : null}
          <Box marginTop={1}>{c ? <Markdown key={`card-${reqId}-${phase}`} text={c.text} /> : dim('no card captured on this machine for that phase')}</Box>
        </Box>
      )
    }

    const laneView = (id: string) => {
      const l = lanes.find(x => x.id === id)
      const r = reqId ? Object.values(trail[reqId] ?? {}).flatMap(p => p.runs).find(x => x.id === id) : undefined
      const room = Math.max(5, (e.viewport?.rows ?? 30) - 10)
      return (
        <Box flexDirection="column">
          <Box flexDirection="row" justifyContent="space-between">
            <Text bold color={ACCENT}>{l?.agent ?? r?.agent ?? id}</Text>
            <Button key="back" plain hotkey="b" label="back" onPress={back} />
          </Box>
          {l ? <Text dimColor wrap="truncate">{l.label} · {clock((l.endedAt ?? now) - l.startedAt)}{l.tokens ? ` · ${tokens(l.tokens)} fresh · ${tokens(l.wrote)} wrote` : ''}</Text> : null}
          {r && !l ? <Text dimColor>{r.task ?? ''} · {clock(r.endedAt - r.startedAt)} · {tokens(r.tokens)} fresh{r.wrote ? ` · ${tokens(r.wrote)} wrote` : ''} · {r.isFailed ? 'failed' : 'landed'} {dateOf(r.endedAt)} {timeOf(r.endedAt)}</Text> : null}
          {r ? <Box marginTop={1}><Text wrap="wrap">{r.verdict || '(no last line)'}</Text></Box> : null}
          {l && (
            <Box marginTop={1} flexDirection="column">
              {l.trail.length === 0 && dim('No tool calls yet.')}
              {l.trail.slice(-room).reverse().map(h => (
                <Box flexDirection="row">
                  <Cell w={8}><Text dimColor>-{clock(now - h.t)}</Text></Cell>
                  <Text color={h.err ? TONE.err : TONE[h.k]}>{h.err ? '✗ ' : '▆ '}</Text>
                  <Text wrap="truncate">{h.d}</Text>
                </Box>
              ))}
            </Box>
          )}
          {!l && !r ? dim('That agent is not on this machine’s trail. Raw rows come in 1.10.2.') : null}
          {l && l.endedAt === null ? <Box marginTop={1}>{dim('raw rows: the tasks list (ctrl+t) opens this agent’s transcript; a reader for landed ones comes in 1.10.2')}</Box> : null}
        </Box>
      )
    }

    // ----- history -----
    const historyPage = () => {
      const authors = [...new Set(items.map(i => i.author).filter((a): a is string => !!a))].sort()
      const list = filterItems(items, settings.history, filters.author, filters.text)
      const stateTone = (s: FlightItem['state']) => (s === 'gate' ? 'warning' : s === 'flying' ? ACCENT : s === 'cancelled' ? 'error' : s === 'archived' ? 'inactive' : 'subtle')
      const stateText = (it: FlightItem) => (it.state === 'flying' ? `${it.phaseName} ${spinFrame(now)}` : it.state === 'gate' ? `◆ gate ${it.phase}/5 ${it.phaseName}` : it.state)
      const open = (it: FlightItem, tab: FlightTab) => void setView($, () => ({ req: it.id, tab, sub: { kind: 'page' } }))
      return (
        <Box flexDirection="column">
          <Box flexDirection="row" justifyContent="space-between">
            <Box flexDirection="row">
              {Select ? (
                <Select key="hist-mode" label="show" value={settings.history}
                  options={[{ value: 'all', label: 'all' }, { value: 'flying', label: 'in flight' }, { value: 'done', label: 'done' }]}
                  onSelect={(v: string) => void setSettings($, s => ({ ...s, history: v as FlightSettings['history'] }))} />
              ) : (
                <Button key="hist-mode" plain label={`show: ${settings.history}`}
                  onPress={() => void setSettings($, s => ({ ...s, history: s.history === 'all' ? 'flying' : s.history === 'flying' ? 'done' : 'all' }))} />
              )}
              <Text>  </Text>
              {authors.length > 1 && Select && (
                <Select key="hist-author" label="by" value={filters.author ?? ''}
                  options={[{ value: '', label: 'anyone' }, ...authors.map(a => ({ value: a, label: a }))]}
                  onSelect={(v: string) => void update($, filtersA, f => ({ ...f, author: v || null }))} />
              )}
            </Box>
            {Input ? (
              <Input key="hist-text" placeholder="filter" value={filters.text} submitLabel="go"
                onSubmit={(v: string) => void update($, filtersA, f => ({ ...f, text: v }))} />
            ) : null}
          </Box>
          <Text dimColor>{list.length} of {items.length} · pick one, then ⇤ f first phase · ⇥ l last</Text>
          {list.slice(0, 60).map(it => (
            <Box flexDirection="row">
              <Cell w={9}><Button key={`hist-${it.id}`} plain label={it.id} dimColor={it.state === 'archived'} onPress={() => open(it, (it.state === 'flying' || it.state === 'gate' ? it.phase : 5) as FlightTab)} /></Cell>
              <Cell w={22}><Text color={stateTone(it.state)}>{clip(stateText(it), 21)}</Text></Cell>
              <Box flexGrow={1}><Text dimColor wrap="truncate">{it.title}</Text></Box>
              <Cell w={8}><Text dimColor>{it.author ?? ''}</Text></Cell>
              <Cell w={8}><Text dimColor>{it.month ?? ''}</Text></Cell>
              <Box width={12} justifyContent="flex-end"><Text dimColor>{it.touchedAt ? `${age(now - it.touchedAt)} ago` : ''}</Text></Box>
            </Box>
          ))}
          {list.length > 60 && dim(`+${list.length - 60} more — narrow the filter`)}
          {items.length === 0 && dim('No REQ or BUG under specs/ or bugs/.')}
        </Box>
      )
    }

    // ----- settings -----
    const settingsPage = () => {
      const row = (label: string, value: string, hint: string, onPress: () => void, key: string) => (
        <Box flexDirection="row">
          <Cell w={22}><Text>{label}</Text></Cell>
          <Cell w={10}><Button key={key} plain label={value} onPress={onPress} /></Cell>
          <Text dimColor wrap="truncate">{hint}</Text>
        </Box>
      )
      const toggle = (k: 'openOnStart' | 'band' | 'cards') => () => void setSettings($, s => ({ ...s, [k]: !s[k] }))
      const preset = EDITOR_PRESETS.find(p => p.value === settings.editorUri)
      return (
        <Box flexDirection="column">
          {row('open on session start', settings.openOnStart ? 'on' : 'off', 'when a REQ is in flight; only where the pane can dock (wide terminal)', toggle('openOnStart'), 'set-open')}
          {row('flight line', settings.band ? 'on' : 'off', 'the one line above the prompt', toggle('band'), 'set-band')}
          {row('gate cards', settings.cards ? 'on' : 'off', 'redraw GATE-PROTOCOL text as a card in the transcript', toggle('cards'), 'set-cards')}
          <Box flexDirection="row">
            <Cell w={22}><Text>pane width</Text></Cell>
            {Select ? (
              <Select key="set-columns" value={String(settings.columns)}
                options={[{ value: '0', label: 'share' }, { value: '80', label: '80' }, { value: '100', label: '100' }, { value: '120', label: '120' }, { value: '140', label: '140' }]}
                onSelect={(v: string) => void (async () => { await setSettings($, s => ({ ...s, columns: Number(v) })); await openPane($) })()} />
            ) : (
              <Button key="set-columns" plain label={settings.columns ? String(settings.columns) : 'share'}
                onPress={() => void setSettings($, s => ({ ...s, columns: [0, 80, 100, 120, 140][([0, 80, 100, 120, 140].indexOf(s.columns) + 1) % 5] ?? 0 }))} />
            )}
            <Text dimColor>  columns when docked; a width you drag wins</Text>
          </Box>
          <Box flexDirection="row">
            <Cell w={22}><Text>file links open in</Text></Cell>
            {Select ? (
              <Select key="set-editor" value={preset ? settings.editorUri : 'custom'}
                options={[...EDITOR_PRESETS, { value: 'custom', label: 'custom…' }]}
                onSelect={(v: string) => { if (v !== 'custom') void setSettings($, s => ({ ...s, editorUri: v })) }} />
            ) : (
              <Button key="set-editor" plain label={preset?.label ?? 'custom'}
                onPress={() => void setSettings($, s => ({ ...s, editorUri: EDITOR_PRESETS[(EDITOR_PRESETS.findIndex(p => p.value === s.editorUri) + 1) % EDITOR_PRESETS.length]?.value ?? s.editorUri }))} />
            )}
            <Text dimColor>  Ctrl+click a path; `{'{path}'}` `{'{line}'}` `{'{col}'}` fill the template</Text>
          </Box>
          {Input ? (
            <Box flexDirection="row" marginLeft={22}>
              <Input key="set-editor-custom" placeholder={settings.editorUri} value="" submitLabel="set"
                onSubmit={(v: string) => { if (v.trim()) void setSettings($, s => ({ ...s, editorUri: v.trim() })) }} />
            </Box>
          ) : null}
          <Box marginTop={1}><Text dimColor>Kept per user on this machine, never in the vault. The trail (gate rounds, agent lines, cards) and the viewed marks are per vault in the same store.</Text></Box>
          <Box marginTop={1} flexDirection="row">
            <Button key="set-forget" plain label="forget this vault’s trail" onPress={() => void (async () => {
              await update($, trailA, () => ({}))
              if (vault) await $.store.delete(`trail:${vault}`).catch(() => {})
            })()} />
            <Text>  </Text>
            <Button key="set-forget-viewed" plain label="forget viewed marks" onPress={() => void (async () => {
              await update($, viewedA, () => ({}))
              if (vault) await $.store.delete(`viewed:${vault}`).catch(() => {})
            })()} />
          </Box>
        </Box>
      )
    }

    const body = view.tab === 'history' ? historyPage()
      : view.tab === 'settings' ? settingsPage()
      : view.sub.kind === 'doc' ? await docView(view.sub.path, view.sub.title)
      : view.sub.kind === 'card' ? cardView(view.sub.phase)
      : view.sub.kind === 'lane' ? laneView(view.sub.id)
      : view.sub.kind === 'diff' ? await diffView(view.sub.path)
      : view.sub.kind === 'mermaid' ? await mermaidView(view.sub.n)
      : await phasePage(tabN || 1)

    const keys = () => (
      <Box flexDirection="row" justifyContent="space-between" marginTop={1}>
        <Text dimColor>{view.sub.kind === 'page' ? '1–5 phases · h history · s settings' : 'b back'}{live?.waiting ? ' · r resume' : ''} · esc → prompt (pane stays) · /flight close</Text>
        {typeof view.tab === 'number' && reqId ? (
          <Box flexDirection="row">
            <Button key="first" plain hotkey="f" label="⇤ first" onPress={() => go(1)} />
            <Text>  </Text>
            <Button key="last" plain hotkey="l" label="last ⇥" onPress={() => go((live?.phase ?? 5) as FlightTab)} />
          </Box>
        ) : null}
      </Box>
    )

    return (
      <Box flexDirection="column" paddingX={1}>
        {header()}
        <Text> </Text>
        {tabs()}
        <Text> </Text>
        {body}
        {keys()}
      </Box>
    )
  })
}
