// ADLC Flight Deck — the cockpit: one REQ, phase by phase, pinned beside the transcript.
//
// Why a mod and not the statusline script: the script is polled on Claude Code's own
// schedule and sees only pipeline-state.json, which changes at phase boundaries. This
// mod is pushed every subagent spawn, tool call and turn the moment they happen, and it
// reads what the vault already writes (records, hot.md, the working set) for the rest.
//
// Two surfaces:
//   the band     — the flightdeck, above the prompt. One row about the REQ you are flying;
//                  opened (⤢), the cockpit: the in-flight REQs as chips with history and
//                  settings, the five phase tabs (a list when narrow) and the phase page —
//                  the evidence behind the gate: the plan against the tree, every file a link
//                  and a diff, findings as a grid, the acceptance criteria, what approving
//                  sets in motion, and the gate's options to answer from.
//   gate cards   — GATE-PROTOCOL's text card, redrawn as a card (the stored message is
//                  untouched; the model, other tools and ctrl+o still see the text)
//
// Read-only toward the vault, by design: it never writes .adlc/. Git is asked, never told
// (status, diff, log, hash-object). Its write paths are $.state (what is drawn) and $.store:
// fuel, phase clocks, settings, viewed marks, and the trail — gate rounds, agent verdicts
// and cards this machine saw. The vault's own `phases` block (1.10.1, written by the trail
// hook and the skills) wins wherever both exist.
//
// 0.6.0 — the gate is the turn. The skill writes the marker (with its options), emits the
// card and ends its turn; the user's next message is the answer. The pane draws the options
// as an action bar beside the evidence and sends the chosen one as the user's own words
// ($.prompt.submit asUser), with `[flightdeck] viewed n/m files` in plain sight at implement
// and review. The mod answers no tool call: the AskUserQuestion branch of 0.5.0 is gone.
//
// 0.7.0 — no pane. The engine docks a pane beside the transcript from 110 columns and its
// placement is read-only, so the cockpit lives in the AbovePrompt band at three heights:
// band (one row), open (a 14-row tree) and max (the whole tree; the engine caps the band at
// half the terminal and scrolls the rest). Only REQs in flight ride the strip: a running
// sprint's members, a gate marker, now.md, this session's stamp, the REQ being flown.
import { atom, read, update } from 'claude-code'
import type { Hook, Register, RenderInput } from 'claude-code'

import type {
  FlightCount, FlightDeck, FlightFuel, FlightFuelRow, FlightGateAsk, FlightGit, FlightHeight, FlightItem, FlightLane, FlightLayout, FlightOption,
  FlightPicks, FlightReq, FlightRound, FlightRun, FlightSettings, FlightSince, FlightStripEntry, FlightSub, FlightTab, FlightTouched,
  FlightTrail, FlightView, FlightViewed,
} from '../types'
import {
  EDITOR_PRESETS, absPath, acCheckOf, acceptanceOf, addFuel, asFuelRow, baseName, behaviourOf, blastRadius, bulletsOf,
  consequences, criterionTitle, editorHref, findingsOf, plainMd, type Finding, gitPlan, hasPointer, knowledgeHits, mermaidFences, mergeTouched, parseLsTree, parseNameStatus,
  parseNumstat, parsePorcelain, parseTable, parseTask, pathKey, planVsActual, pointerSpans, rails, roundOf, rosterOf, severityRank,
  sumFuel, summaryGaps, tiersOf, type PlanRow, type TaskDoc,
} from './evidence'
import {
  ID_SRC, bar, buildReq, clip, clock, describeTool, idOf, isActive, isLanded, kindOf, markSpans, parseDispatch, parseGateCard, pulse,
  spinFrame, splitFolder, tokens, typicalCost, type PipelineState,
} from './model'
import {
  age, artifactsFor, compactBrief, dateOf, filterItems, firstLine, hotFor, hotTail, notesFor, optionHead, optionsFromDecision, standardOptions, idOrder, flyingTarget,
  inFlight, parseHot, parseMarker, parseRecord, partsOf, phaseLine, phaseNames, phaseOf, recordDecisionsFor, recordSectionsFor, replyFor, replyOf,
  sectionOf, sprintMembers, stripOf, timeOf, trailerFor, type HotEvent, type Record_, type VaultPhase,
} from './vault'

const deckA = atom({ plugin: 'adlc-flightdeck', key: 'deck' } as const, { vault: null, reqs: [], scannedAt: 0 } as FlightDeck)
const lanesA = atom({ plugin: 'adlc-flightdeck', key: 'lanes' } as const, [] as FlightLane[])
const nowA = atom({ plugin: 'adlc-flightdeck', key: 'now' } as const, 0)
const fuelA = atom({ plugin: 'adlc-flightdeck', key: 'fuel' } as const, {} as FlightFuel)
const agentsA = atom({ plugin: 'adlc-flightdeck', key: 'agents' } as const, {} as FlightCount)
const focusA = atom({ plugin: 'adlc-flightdeck', key: 'focus' } as const, null as string | null)
const viewA = atom({ plugin: 'adlc-flightdeck', key: 'view' } as const, { req: null, tab: 1, sub: { kind: 'page' }, home: true } as FlightView)
const itemsA = atom({ plugin: 'adlc-flightdeck', key: 'items' } as const, [] as FlightItem[])
const trailA = atom({ plugin: 'adlc-flightdeck', key: 'trail' } as const, {} as FlightTrail)
const DEFAULTS: FlightSettings = { openOnStart: false, band: true, cards: true, narrowAt: 84, showAll: false, history: 'all', editorUri: EDITOR_PRESETS[0]?.value ?? 'vscode://file/{path}:{line}:{col}', compact: 'button', compactAt: 70 }
const settingsA = atom({ plugin: 'adlc-flightdeck', key: 'settings' } as const, DEFAULTS)
const filtersA = atom({ plugin: 'adlc-flightdeck', key: 'filters' } as const, { author: null, text: '' } as { author: string | null; text: string })
const gitA = atom({ plugin: 'adlc-flightdeck', key: 'git' } as const, {} as Record<string, FlightGit>)
const viewedA = atom({ plugin: 'adlc-flightdeck', key: 'viewed' } as const, {} as FlightViewed)
const picksA = atom({ plugin: 'adlc-flightdeck', key: 'picks' } as const, {} as FlightPicks)
const gateA = atom({ plugin: 'adlc-flightdeck', key: 'gate' } as const, {} as Record<string, FlightGateAsk>)
const stripA = atom({ plugin: 'adlc-flightdeck', key: 'strip' } as const, [] as FlightStripEntry[])
const layoutA = atom({ plugin: 'adlc-flightdeck', key: 'layout' } as const, { height: 'band', narrow: false } as FlightLayout)
const pendingA = atom({ plugin: 'adlc-flightdeck', key: 'pending' } as const, null as { req: string; at: number } | null)

const LINGER_MS = 9000 // a landed lane stays on the live list this long
const SPAN_MS = 60_000 // the live time axis
const GIT_EVERY_MS = 8000 // git is asked about a REQ at most this often
const MAX_DEPTH = 4
const CARD_MAX = 8000
const DOC_MAX = 60_000
const DIFF_MAX = 90_000
const AUTHORS_LOG = 400 // commits scanned for "last edited by"
const WRITE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit'])
const MARKER_MAX = 4096
const NARROW_AT = 84 // default: band body columns below which chips shrink and the tab row becomes the list home
const STATUS_AT = 110 // band body columns from which each phase tab carries its one-line status
const USAGE_EVERY_MS = 5000
/**
 * Keys the pane binds. `Button.hotkey` takes one digit or one lowercase letter and refuses
 * anything else (claude-code types, ButtonProps.hotkey), so the plan's `[` / `]` and its
 * `,` / `.` fallback cannot be bound; j / k step the tabs (j sits left of k, as [ of ]),
 * w / e step the REQ strip in narrow mode. Change them here, and only here.
 */
// Keys live only in the page body. The terminal draws a plain Button that has a hotkey as `k: label`, so a header
// control with a letter key would carry its hint; headers are click (or ctrl+x tab, then Tab / Enter) only.
// Digits: the gate's options, and the narrow list's rows — they also press from an empty prompt.
const KEYS = { mermaid: 'm', compose: 'c' } as const
const OPTION_KEYS = ['1', '2', '3', '4', '5', '6'] // the action bar's options, on the open gate's page only
const APPROVE_LIKE = /^(approve|fix|merge|ship|accept all)/i

// One palette, theme keys only, so light and dark themes both hold.
const ACCENT = 'autoAccept'
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
let busy = false // a main-loop turn is running: set on turn.start, cleared on its turn.complete ($.session.compact rejects mid-turn)
let usageSeen: { at: number; percent: number | null } = { at: 0, percent: null }

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
  const asks: Record<string, FlightGateAsk> = {}
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
    if (waitingSince !== null) {
      // 1.12: the marker carries the gate's options. Read through the mtime cache, capped; a 1.11 marker yields none.
      const text = await cached($, `${f.path}/.awaiting-approval`)
      if (text !== null) asks[id] = parseMarker(text.slice(0, MARKER_MAX))
    }
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
  await update($, gateA, () => asks) // a marker gone → its entry gone
  // A reply sent whose turn never completed (dropped, the session restarted): let the bar go after the gate moved or 10 min.
  const pend = await read($, pendingA)
  if (pend && (!reqs.some(r => r.id === pend.req && r.waiting) || now - pend.at > 600_000)) await update($, pendingA, () => null)
  const members: { id: string; sprint: string }[] = []
  for (const reg of await sprintFiles($)) { const text = await cached($, reg); if (text) members.push(...sprintMembers(text)) }
  // 0.7.0: the strip and the band's counts take the REQs in flight — started, not yet at their last phase — not every
  // unshipped folder; the rest is history. Sprint members ride the strip only when they are in flight themselves.
  const showAll = (await read($, settingsA)).showAll
  const flying = showAll ? reqs : inFlight(reqs)
  await update($, stripA, () => stripOf(flying, members.filter(m => flying.some(r => r.id === (idOf(m.id) ?? m.id))), () => null))
  // The pane follows the REQ it shows: when its phase moves on and the pane was on the old one, turn the page.
  for (const r of reqs) {
    const was = lastPhase.get(r.id)
    lastPhase.set(r.id, r.phase)
    if (was !== undefined && was !== r.phase) {
      const v = await read($, viewA)
      if (v.req === r.id && v.tab === was) await update($, viewA, (cur): FlightView => ({ ...cur, req: r.id, tab: r.phase as FlightTab, sub: { kind: 'page' } }))
    }
  }
  await update($, itemsA, () => [...items.values()].sort((a, b) => b.touchedAt - a.touchedAt))
  $.ui.status(undefined) // the band says it; a status line left by an older version of this mod goes away
  // Git facts for the REQs on screen: the one the pane shows and the one this session flies.
  const view = await read($, viewA)
  const focus = await read($, focusA)
  for (const id of new Set([view.req, focus])) if (id && reqs.some(r => r.id === id)) void refreshGit($, id).catch(() => {})
}

/** The sprint registries: `sprints/SPRINT-*.json`, flat or one month folder down. */
async function sprintFiles($: Dollar): Promise<string[]> {
  if (!vault) return []
  const out: string[] = []
  const look = async (dir: string, depth: number) => {
    let entries
    try { entries = await $.fs.list(dir) } catch { return }
    for (const en of entries) {
      if (en.kind === 'file' && /^SPRINT-.*\.json$/.test(en.name)) out.push(`${dir}/${en.name}`)
      else if (en.kind === 'dir' && depth < 1 && en.name !== '_archive') await look(`${dir}/${en.name}`, depth + 1)
    }
  }
  await look(`${vault}/sprints`, 0)
  return out.sort().slice(-6)
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
 * What the tree says about one REQ: the files changed on the REQ's own branch against its
 * base (and, when that branch is checked out in the work path, the uncommitted changes too),
 * their blob hashes (the key the viewed marks hold), and who last touched each one. The
 * branch tip comes from pipeline-state.json, so a checkout sitting on another branch does
 * not describe this REQ (`gitPlan`). Throttled; a failure leaves the last answer with `error` set.
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
    const head = (await git($, cwd, ['rev-parse', '--abbrev-ref', 'HEAD']))?.trim() ?? null
    const resolves = !!st?.branch && (await git($, cwd, ['rev-parse', '--verify', '--quiet', `${st.branch}^{commit}`])) !== null
    const plan = gitPlan(st ?? {}, head, resolves)
    const branch = st?.branch ?? head
    const hot = parseHot((await cached($, `${vault}/hot.md`)) ?? '')
    const rides = ridesOf(hot, id)
    const originHead = (await git($, cwd, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD']))?.trim()
    let base: string | null = null, baseName: string | null = null
    for (const cand of [rides, originHead, 'origin/main', 'main', 'origin/master', 'master', 'develop'].filter((c): c is string => !!c)) {
      if (cand === branch || cand === plan.tip) continue
      const mb = (await git($, cwd, plan.mergeBase(cand)))?.trim()
      if (mb) { base = mb; baseName = cand; break }
    }
    const porcelain = plan.porcelain ? parsePorcelain((await git($, cwd, plan.porcelain)) ?? '') : []
    const committed = base ? parseNameStatus((await git($, cwd, plan.committed(base))) ?? '') : []
    const numArgs = plan.numstat(base)
    const numstat = numArgs ? parseNumstat((await git($, cwd, numArgs)) ?? '') : []
    const touched = mergeTouched(porcelain, committed, numstat)
    const live = touched.filter(t => t.status !== 'D').map(t => t.path)
    const hashes: Record<string, string> = {}
    if (live.length && plan.checkedOut) {
      const out = (await git($, cwd, plan.hashes(live), live.join('\n') + '\n')) ?? ''
      out.split('\n').map(l => l.trim()).filter(Boolean).forEach((h, i) => { const p = live[i]; if (p) hashes[pathKey(p)] = h })
    } else if (live.length) {
      Object.assign(hashes, parseLsTree((await git($, cwd, plan.hashes(live.slice(0, 200)))) ?? ''))
    }
    const authors: Record<string, string> = {}
    if (touched.length) {
      const log = (await git($, cwd, ['log', `-n${AUTHORS_LOG}`, '--format=%x01%an%x09%ar', '--name-only', plan.tip, '--', ...touched.slice(0, 60).map(t => t.path)])) ?? ''
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
    const facts: FlightGit = { at: now, cwd, base, baseName, branch, touched, hashes, authors, me, tip: plan.tip, checkedOut: plan.checkedOut, error: porcelain.length === 0 && numstat.length === 0 && !(await git($, cwd, ['rev-parse', '--git-dir'])) ? 'not a git checkout' : null }
    await update($, gitA, g => ({ ...g, [id]: facts }))
  } catch (err) {
    await update($, gitA, g => ({ ...g, [id]: { ...(g[id] ?? { at: 0, cwd: '', base: null, baseName: null, branch: null, touched: [], hashes: {}, authors: {}, me: null, tip: 'HEAD', checkedOut: true }), at: now, error: String(err) } }))
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

/**
 * 0.7.0 — the cockpit is the above-prompt band, never a pane: the engine docks a pane beside the transcript from 110
 * columns (its placement is read-only), and the band always sits on the prompt. Three heights: `band` (one row),
 * `open` (a 14-row tree) and `max` (the whole tree; the engine caps the band at half the terminal and scrolls the rest).
 * Collapsing never removes the band; the engine's own `[-]` (ctrl+x ctrl+a) and `/flight band` do.
 */
async function setHeight($: Dollar, height: FlightHeight) {
  await update($, layoutA, l => (l.height === height ? l : { ...l, height }))
}

/** Opening from the band lands on the focus REQ's live phase (or the one at a gate); the narrow list home first. */
async function openOn($: Dollar, height: FlightHeight = 'open') {
  if ((await read($, layoutA)).height === 'band') {
    const focus = await read($, focusA)
    const strip = await read($, stripA)
    const deck = await read($, deckA)
    const id = focus && deck.reqs.some(r => r.id === focus) ? focus : strip.find(x => x.here && x.waiting)?.id ?? strip.find(x => x.here && !x.ended)?.id
    const r = deck.reqs.find(x => x.id === id)
    if (r) await setView($, v => ({ ...v, req: r.id, tab: r.phase as FlightTab, sub: { kind: 'page' }, home: true }))
  }
  await setHeight($, height)
}

async function contextPercent($: Dollar): Promise<number | null> {
  const now = await $.clock.now()
  if (now - usageSeen.at < USAGE_EVERY_MS && usageSeen.at > 0) return usageSeen.percent
  usageSeen = { at: now, percent: usageSeen.percent }
  try { usageSeen = { at: now, percent: (await $.session.usage()).context.percent ?? null } } catch {}
  return usageSeen.percent
}

/**
 * Sends a gate reply as the user's own words. One click, one reply: `pending` holds until the
 * next main-loop turn completes. The session must be idle for the turn to start; a reply sent
 * while a background agent runs waits for it, and the bar says so.
 */
async function sendReply($: Dollar, r: FlightReq, text: string, options: FlightOption[]): Promise<boolean> {
  if (await read($, pendingA)) return false
  const at = await $.clock.now()
  await update($, pendingA, () => ({ req: r.id, at }))
  await touch($, r.id)
  try {
    await $.prompt.submit({ text, asUser: true })
    // Recorded here; the prompt.submit observer skips this plugin's own submits so it is never counted twice.
    await recordRound($, r, text, options, 'pane').catch(() => {})
    return true
  } catch {
    await update($, pendingA, () => null)
    $.ui.toast('could not send — type it in the prompt')
    return false
  }
}

/** Compacts at a gate with instructions built from the REQ's state. Rejects mid-turn; resolves `{ skip }` when a hook vetoes. */
async function compactNow($: Dollar, r: FlightReq): Promise<{ ok: boolean; why?: string }> {
  if (busy) return { ok: false, why: 'Claude is working — compact when the turn ends' }
  const ask = (await read($, gateA))[r.id]
  try {
    const res = await $.session.compact({ instructions: compactBrief(r, stateOf.get(r.id), ask, folderOf.get(r.id), vault) })
    if ('skip' in res && res.skip) return { ok: false, why: res.skip }
    return { ok: true }
  } catch (err) { return { ok: false, why: String(err instanceof Error ? err.message : err) } }
}

/** The options of a REQ's open gate, as the pane would draw them. */
async function gateOptions($: Dollar, r: FlightReq): Promise<FlightOption[]> {
  const ask = (await read($, gateA))[r.id]
  const card = (await read($, trailA))[r.id]?.[r.phaseName]?.card
  const parsed = card ? parseGateCard(card.text) : null
  return optionsOf(ask, parsed?.decision ?? null, parsed?.sections.find(s => /MY READ/.test(s.label))?.lines.join(' ') ?? '', r.phaseName).options
}

/** The mod's own round for a gate reply, typed or sent from the pane. A reply that names no option is not one. */
async function recordRound($: Dollar, r: FlightReq, text: string, options: FlightOption[], via: 'pane' | 'typed') {
  const { decision, note, viewed } = replyOf(text, options)
  if (!decision) return
  const round: FlightRound = { at: await $.clock.now(), decision, note, via, ...(viewed ? { viewed } : {}) }
  await trailAdd($, r.id, r.phaseName, t => ({ ...t, rounds: [...t.rounds, round].slice(-12) }))
}

/** The options a gate offers: the marker's (1.12), else the captured card's `Decision →` line (1.11). */
function optionsOf(ask: FlightGateAsk | undefined, decision: string | null, myRead: string, phase = ''): { options: FlightOption[]; source: 'marker' | 'card' | 'standard' } {
  if (ask && ask.options.length) return { options: ask.options, source: 'marker' }
  const fromCard = optionsFromDecision(decision, myRead)
  if (fromCard.length || !phase) return { options: fromCard, source: 'card' }
  return { options: standardOptions(phase, myRead), source: 'standard' }
}

async function setView($: Dollar, fn: (v: FlightView) => FlightView) { await update($, viewA, fn) }
async function setSettings($: Dollar, fn: (s: FlightSettings) => FlightSettings) {
  const s = await update($, settingsA, fn)
  void $.store.set('settings', s).catch(() => {})
  queueScan($, 0) // `showAll` changes what the strip holds
}

export const register: Register = on => {
  // ---------- lifecycle ----------

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'flight',
      description: 'ADLC flightdeck above the prompt: the REQs in flight, phase by phase — the plan against the tree, every file a link and a diff, findings as a grid, what approving sets in motion, and the gate\'s options to answer from. `/flight REQ-042` opens one; `history`, `settings`, `max`, `toggle`, `close` (to its one row), `band` (hide or show it).',
      argumentHint: '[REQ-NNN [phase] | history | settings | max | toggle | close | band]',
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
      if (settings.openOnStart && (await read($, stripA)).some(x => x.here && !x.ended)) void openOn($).catch(() => {})
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

  // `busy`: a main-loop turn is running. Set when it starts (a typed or sent prompt, not a local
  // command that never starts one), cleared on its turn.complete.
  on('turn.start', async ($, e, next) => {
    if (!e.agentId) busy = true
    return next(e)
  }).catch(($, e, next) => next(e))

  on('prompt.submit', async ($, e, next) => {
    // Focus moves only to an id this vault holds, matched whole: a lesson id (L-REQ-035-1)
    // or a stray number in a pasted log never steals it from the REQ being flown.
    const named = idOf(e.text)
    const deck = await read($, deckA)
    if (named && (deck.reqs.some(r => r.id === named) || (await read($, itemsA)).some(i => i.id === named))) await touch($, named)
    // The gate is the turn: a reply to an open gate is this prompt. Record the mod's own round
    // (the vault's `phases` block, written by `trail gate`, wins where both exist).
    const own = e.origin.kind === 'plugin' && e.origin.name === 'adlc-flightdeck' // sendReply records its own
    if (!e.command && !own) {
      const focus = await read($, focusA)
      const r = deck.reqs.find(x => x.id === named && x.waiting) ?? deck.reqs.find(x => x.id === focus && x.waiting)
      if (r) await recordRound($, r, e.text, await gateOptions($, r), /\[flightdeck\]/.test(e.text) ? 'pane' : 'typed')
    }
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
    // The mod answers no tool call and rewrites none: an AskUserQuestion dialog passes through
    // untouched (0.5.0 replaced its `response` with the viewed trailer, and the answer was lost).
    const ran = await next(e)
    if (id) {
      const t = await $.clock.now()
      const err = (ran as { isError?: boolean }).isError === true
      void update($, lanesA, ls => ls.map(l => (l.id === id
        ? { ...l, trail: [...l.trail.filter(h => t - h.t < SPAN_MS * 3), { t, k: kindOf(tool), err, d }].slice(-120) }
        : l))).catch(() => {})
    }
    const path = typeof args.file_path === 'string' ? args.file_path : ''
    if (WRITE_TOOLS.has(tool) || tool === 'Skill') {
      const where = tool === 'Skill' ? `${String(args.skill ?? '')} ${String(args.args ?? '')}` : path
      await touch($, idOf(where))
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
      if (!id) {
        busy = false // the main loop's turn is over: compact can run, and a reply the pane sent has been picked up
        if (await read($, pendingA)) await update($, pendingA, () => null)
      }
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

  // ---------- the band: one row about the REQ you're flying; opened, the whole cockpit ----------

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || e.props.view.agentId || !(await read($, settingsA)).band) return next(e)
    const deck = await read($, deckA)
    if (!deck.vault) return next(e)
    const layout = await read($, layoutA)
    if (layout.height !== 'band') return cockpit($, e, layout.height)
    // In flight: the strip's REQs (started, not at their last phase), plus the one this session flies if it is too.
    const strip = await read($, stripA)
    const focus = await read($, focusA)
    const flying = strip.filter(x => x.here && !x.ended).map(x => x.id)
    const showAll = (await read($, settingsA)).showAll
    if (focus && !flying.includes(focus) && (showAll ? deck.reqs : inFlight(deck.reqs)).some(r => r.id === focus)) flying.unshift(focus)
    const flyingReqs = flying.map(id => deck.reqs.find(r => r.id === id)).filter((r): r is FlightReq => !!r)
    const r = flyingReqs.find(x => x.id === focus) ?? flyingReqs.find(x => x.waiting) ?? flyingReqs[0]
    if (!r) return next(e)
    const lanes = await read($, lanesA)
    const now = (await read($, nowA)) || (await $.clock.now())
    const { Box, Text, Button } = $.ui.resolve(e)
    const busyLanes = lanes.filter(l => l.endedAt === null && (l.req === r.id || l.req === null)).length
    const done = r.tasks.filter(t => isLanded(t.status)).length
    const atGate = flyingReqs.filter(x => x.waiting).length
    // Resume only for a gate this session has no card for (opened elsewhere, or the card is older than the
    // marker): /proceed re-emits it. A gate this session just emitted is answered in the prompt or the cockpit.
    const card = (await read($, trailA))[r.id]?.[r.phaseName]?.card
    const seen = !!card && (r.waitingSince == null || card.at >= r.waitingSince)
    const pending = await read($, pendingA)
    const ask = (await read($, gateA))[r.id]?.ask ?? ''
    const rec = r.waiting ? (await gateOptions($, r)).find(o => o.recommended) : undefined
    const status = r.waiting
      ? pending?.req === r.id ? 'sent' : `gate: ${rec ? `${optionHead(rec.label)}?` : ask ? clip(ask, 28) : 'waiting on you'}`
      : [r.tasks.length > 0 && r.phase === 3 ? `${done}/${r.tasks.length} tasks` : '', busyLanes ? `${spinFrame(now)} ${busyLanes} flying` : ''].filter(Boolean).join(' · ')
    const open = () => void openOn($).catch(() => {})
    return (
      <Box flexDirection="row" justifyContent="space-between" paddingX={1} height={1} overflow="hidden">
        <Box flexDirection="row" flexShrink={1} overflow="hidden">
          <Button key="band-open" plain onPress={open}>
            <Text color={r.waiting ? 'warning' : ACCENT} bold>✈ {r.id}</Text>
            <Text> · {r.phaseName}</Text>
            {status ? <Text color={r.waiting ? 'warning' : undefined} dimColor={!r.waiting}> · {status}</Text> : null}
            <Text dimColor> · {flyingReqs.length} in flight</Text>
            {atGate > 0 ? <Text color="warning"> · {atGate} at gate</Text> : null}
          </Button>
        </Box>
        <Box flexDirection="row" flexShrink={0}>
          {r.waiting && !seen && !e.props.isWorking && <Text> </Text>}
          {r.waiting && !seen && !e.props.isWorking && (
            <Button key={`resume-${r.id}`} plain label="resume"
              onPress={() => void $.prompt.submit({ text: `/${r.kind === 'bug' ? 'bugfix' : 'proceed'} ${r.id}` })} />
          )}
          <Text> </Text>
          <Button key="expand" plain label="⤢" onPress={open} />
          <Text dimColor> ×</Text>
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
        {isOpen && <Text color="warning">  ↓ your call — reply in the prompt, or pick in the flightdeck above it</Text>}
        {card.after ? <Markdown key="after" text={card.after} /> : null}
      </Box>
    )
  })

  // ---------- /flight ----------

  on('command.run', { command: 'flight' }, async ($, e) => {
    const args = (e.args ?? '').trim()
    if (/^band\b/.test(args)) {
      await setSettings($, s => ({ ...s, band: !s.band }))
      return { text: (await read($, settingsA)).band ? 'Flightdeck on.' : 'Flightdeck hidden. `/flight band` brings it back.' }
    }
    if (/^close\b/.test(args)) {
      await setHeight($, 'band')
      return { text: 'Flightdeck collapsed to its one row.' }
    }
    if (/^toggle\b/.test(args)) {
      if ((await read($, layoutA)).height === 'band') await openOn($)
      else await setHeight($, 'band')
      return { text: (await read($, layoutA)).height === 'band' ? 'Flightdeck collapsed.' : 'Flightdeck open.' }
    }
    if (/^max\b/.test(args)) {
      await openOn($, 'max')
      return { text: 'Flightdeck at full height.' }
    }
    const m = new RegExp(`(?<![\\w-])(${ID_SRC})`).exec(args)
    // A phase named after the id (`/flight REQ-042 review`, or its number) opens that tab instead of the live one.
    const named = /\b(spec|architect|implement|review|ship|report|plan|fix|verify|[1-5])\s*$/.exec(m ? args.slice((m.index ?? 0) + (m[1]?.length ?? 0)) : '')?.[1]
    const phaseTab = named ? (/^\d$/.test(named) ? Number(named) : (phaseOf(m?.[1]?.startsWith('BUG') ? 'bug' : 'req', named) ?? null)) as FlightTab | null : null
    const tab: FlightTab | null = /^history\b/.test(args) ? 'history' : /^settings\b/.test(args) ? 'settings' : phaseTab
    if (m) await touch($, m[1] ?? null)
    queueScan($, 0)
    const deck = await read($, deckA)
    const strip = await read($, stripA)
    const focus = m?.[1] ?? (await read($, focusA)) ?? strip.find(x => x.here && x.waiting)?.id ?? strip.find(x => x.here && !x.ended)?.id ?? null
    const live = deck.reqs.find(r => r.id === focus)
    // `/flight` alone means "show me my REQ": its live phase, unless the cockpit already sits on one of its phases.
    await setView($, v => ({
      req: focus ?? v.req,
      tab: tab ?? (typeof v.tab === 'number' && focus === v.req ? v.tab : ((live?.phase ?? 5) as FlightTab)),
      sub: { kind: 'page' },
      home: !phaseTab, // narrow: the list home first, unless a phase was named
    }))
    if (focus) void refreshGit($, focus, true).catch(() => {})
    // History opens on the REQ in view: scroll its row into the band's window once it is drawn.
    if (tab === 'history' && focus) $.clock.after(120, () => { void $.ui.scroll({ to: { key: `hist-${focus}` }, block: 'center' }).catch(() => {}) })
    if ((await read($, layoutA)).height === 'band') await setHeight($, 'open')
    return { text: 'Flightdeck open above the prompt.' }
  })
}


// ---------- the cockpit: the band, opened ----------
// One tree in the AbovePrompt band, laid out as the flightdeck mockup draws it:
//   level 1   ✈ the in-flight REQs as chips · history · settings · ⤢ · ×
//   level 2   the five phase tabs, a one-line status under each from 110 columns, a rule (narrow: the list home)
//   the page  GATE first — its state, and at an open gate the summary, the options, the consequence of the
//             recommended one and compact first — then the phase's evidence, one titled block each, a blank row apart.
// Called by the band's render hook when the height is open or max.

/** The mockup's palette, as theme keys so light and dark themes both hold. */
const C = { v: 'autoAccept', amber: 'warning', ok: 'success', link: 'suggestion', red: 'error', faint: 'inactive', dim: 'subtle' } as const

async function cockpit($: Dollar, e: RenderInput<'AbovePrompt'>, height: 'open' | 'max') {
  const deck = await read($, deckA)
  const items = await read($, itemsA)
  const lanes = await read($, lanesA)
  const focus = await read($, focusA)
  const trail = await read($, trailA)
  const settings = { ...DEFAULTS, ...(await read($, settingsA)) }
  const view = await read($, viewA)
  const gitAll = await read($, gitA)
  const viewedAll = await read($, viewedA)
  const picksAll = await read($, picksA)
  const gateAll = await read($, gateA)
  const strip = await read($, stripA)
  const layout = await read($, layoutA)
  const pending = await read($, pendingA)
  const now = (await read($, nowA)) || (await $.clock.now())
  const els = $.ui.resolve(e)
  const { Box, Text, Button, Markdown, Code, Link } = els
  const Select = 'Select' in els ? els.Select : null // the phone has neither
  const Input = 'Input' in els ? els.Input : null
  if (!deck.vault) return <Text dimColor>No .adlc vault above this folder.</Text>
  // The band's own width (its column less the engine's five), never the viewport: a docked pane narrows it.
  const W = Math.max(30, e.props.bodyColumns - 2)
  const narrow = e.props.bodyColumns < (settings.narrowAt || NARROW_AT)
  const statusLines = !narrow && e.props.bodyColumns >= STATUS_AT
  const isTerminal = e.surface === 'terminal'
  if (layout.narrow !== narrow) void update($, layoutA, l => ({ ...l, narrow })).catch(() => {})

  // Which REQ the cockpit shows: the one chosen (a chip, history, /flight), else the one at a gate, else the in-flight one.
  const reqId = view.req ?? strip.find(s => s.here && s.waiting)?.id ?? strip.find(s => s.here && !s.ended)?.id ?? focus ?? null
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
  const go = (tab: FlightTab, home = false) => void setView($, v => ({ ...v, tab, sub: { kind: 'page' }, home }))
  const sub = (s: FlightSub) => void setView($, v => ({ ...v, sub: s }))
  const back = () => sub({ kind: 'page' })
  const goHome = () => void setView($, v => ({ ...v, sub: { kind: 'page' }, home: true }))
  const pickReq = (id: string) => {
    const r = deck.reqs.find(x => x.id === id)
    void setView($, v => ({ ...v, req: id, tab: (r?.phase ?? (typeof v.tab === 'number' ? v.tab : 1)) as FlightTab, sub: { kind: 'page' }, home: true }))
  }
  // The gate's options take the digits whenever an open gate's page is on screen; the narrow list home takes them otherwise.
  const gateOnScreen = !!live?.waiting && view.sub.kind === 'page' && (view.tab === live.phase) && !(narrow && view.home !== false)
  // First look at a REQ: ask git once now; the scan (events, 15 s heartbeat) keeps it fresh after that.
  if (reqId && live && !g) void refreshGit($, reqId).catch(() => {})
  const usagePct = settings.compact !== 'never' && live?.waiting ? await contextPercent($) : null
  const showHome = narrow && view.home !== false && view.sub.kind === 'page' && typeof view.tab === 'number'
  const verification = folder ? await cached($, `${folder}/verification.md`) : null
  const allFindings = findingsOf(verification).sort((a, b) => severityRank(a.severity) - severityRank(b.severity))
  const needCall = (f: Finding) => f.needsDecision || !!f.disagreement
  const reviewNeeds = { total: allFindings.length, calls: allFindings.filter(needCall).length }

  // Phase states for a REQ with no live state (a record): everything done.
  const phases = live?.phases ?? names.map((name, i) => ({ n: i + 1, name, state: 'done' as const }))
  const tabN = typeof view.tab === 'number' ? view.tab : 0

  // ----- small drawing pieces -----
  const Cell = ({ w, children }: { w: number; children?: unknown }) => <Box width={w} flexShrink={0}>{children as never}</Box>
  const dim = (s: string) => <Text dimColor>{s}</Text>
  const faint = (s: string) => <Text color={C.faint}>{s}</Text>
  const rule = () => <Text color={C.faint}>{'─'.repeat(W)}</Text>
  /** A titled block: the title bold and dim, its count faint, the body two columns in. */
  const Sec = (title: string, count: string | null, ...children: unknown[]) => (
    <Box flexDirection="column" marginTop={1}>
      <Text><Text bold color={C.dim}>{title}</Text>{count ? <Text color={C.faint}> · {count}</Text> : null}</Text>
      <Box flexDirection="column" paddingLeft={2}>{children as never}</Box>
    </Box>
  )
  const glyphOf = (state: string) =>
    state === 'done' ? { g: '✓', c: C.ok } : state === 'gate' ? { g: '●', c: C.amber } : state === 'now' ? { g: '○', c: C.link } : state === 'abort' ? { g: '×', c: C.red } : { g: '○', c: C.faint }

  /** A path as a link that opens the editor at a line; on a surface whose links are https-only, a button that runs `code -g`. */
  const ref = (path: string, line?: number, label?: string, key?: string) => {
    const abs = absPath(root, path)
    const text = label ?? (line ? `${path}:${line}` : path)
    if (isTerminal) return <Link href={editorHref(settings.editorUri, abs, line)}>{text}</Link>
    return <Button key={key ?? `ref-${abs}-${line ?? 0}`} plain label={text}
      onPress={() => void $.process.run(['code', '-g', `${abs}:${line ?? 1}`], { timeoutMs: 8000 }).catch(() => {})} />
  }
  /**
   * A list row's path, clipped to `room`; while the pointer rests on it, a card above shows the whole
   * path. A desktop's button clips its own label, so there the card is drawn for every path.
   */
  const pathCell = (path: string, room: number) => {
    const shown = clip(path, room)
    return (
      <Box key={`path-${pathKey(path)}`} flexGrow={1}>
        <Box flexGrow={1} overflow="hidden">{ref(path, undefined, shown)}</Box>
        {shown === path && isTerminal ? null : (
          <Box position="absolute" top={-3} left={0} width={path.length + 4} display="none" hover={{ display: 'flex' }}
            borderStyle="round" borderColor={C.faint} paddingX={1}>
            <Text>{path}</Text>
          </Box>
        )}
      </Box>
    )
  }
  /** `+12 −3`, `new`, `deleted`; pressed, the file's diff (which marks it viewed). */
  const diffCell = (t: FlightTouched | null, path: string) => {
    if (!t) return faint('—')
    const body = t.status === '?' || (t.status === 'A' && !t.add) ? [<Text color={C.ok}>new</Text>]
      : t.status === 'D' ? [<Text color={C.red}>deleted</Text>]
      : [<Text color={C.ok}>+{t.add}</Text>, <Text> </Text>, <Text color={C.red}>−{t.del}</Text>]
    return <Button key={`diff-${pathKey(path)}`} plain onPress={() => sub({ kind: 'diff', path })}>{body as never}</Button>
  }
  /** ◉ viewed (the blob still matches), ~ changed since, ○ not yet; pressed, toggles the mark. */
  const viewedMark = (path: string) => {
    const k = pathKey(path)
    const hash = g?.hashes[k]
    const mark = marks?.[k]
    const seen = !!mark && mark === hash
    const stale = !!mark && !seen
    return (
      <Button key={`seen-${k}`} plain onPress={() => void (seen ? unmarkViewed($, reqId ?? '', path) : markViewed($, reqId ?? '', path, hash))}>
        <Text color={seen ? C.ok : stale ? C.amber : C.faint}>{seen ? '◉' : stale ? '~' : '○'}</Text>
      </Button>
    )
  }

  // ----- level 1: ✈ the in-flight REQs as chips, then history · settings · ⤢/⤡ · × -----
  /** `REQ-sf-034` → `034`: what a chip keeps when narrow. */
  const shortId = (id: string) => /(\d+)$/.exec(id)?.[1] ?? id
  const chipState = (s: FlightStripEntry) => (s.ended === 'cancelled' ? 'abort' : s.ended ? 'done' : s.waiting ? 'gate' : s.here ? 'now' : 'todo')
  /** Brings one of this plugin's elements into the band's window once the redraw that drew it has landed. */
  const scrollTo = (key: string) => $.clock.after(80, () => { void $.ui.scroll({ to: { key }, block: 'center' }).catch(() => {}) })
  /** The REQs in flight, by ID number; the one shown rides along even when it is not in flight (opened from history). */
  const inFlightAll = (): FlightStripEntry[] => {
    const base: FlightStripEntry[] = strip.some(s => s.id === reqId) || !reqId ? [...strip]
      : [{ id: reqId, phase: live?.phase ?? 5, phaseName: live?.phaseName ?? '', waiting: !!live?.waiting, sprint: null, here: true }, ...strip]
    return base.sort((a, b) => idOrder(a.id, b.id))
  }
  /** ✈: to the REQ in flight — a running sprint's first member still flying, else the one this session flies, else a gate. */
  const flyNow = () => { const id = flyingTarget(strip, focus); if (id) pickReq(id) }
  /** `+n more`: the whole in-flight list, scrolled to the one shown; pressed again, back to its phases. */
  const toggleReqs = () => {
    if (view.tab === 'reqs') { go((live?.phase ?? 1) as FlightTab, true); return }
    go('reqs')
    if (reqId) scrollTo(`reqs-${reqId}`)
  }
  const level1 = () => {
    const all = inFlightAll()
    // A chip never shrinks (a squeezed chip wraps its label down the rows): as many as fit the width, the selected one
    // always among them, then `+n more` — which opens the whole list.
    const label = (s: FlightStripEntry) => (narrow ? shortId(s.id) : `${s.id} ${s.here ? (s.ended ? 'ship' : s.phaseName) : 'not on this machine'}`)
    const room = W - 2 - (narrow ? 14 : 30) - (narrow ? 7 : 12) // ✈, the right-hand controls, the `+n more ▾` chip
    const widthOf = (s: FlightStripEntry) => label(s).length + 4
    const sel = Math.max(0, all.findIndex(s => s.id === reqId))
    let start = 0
    const fits = (from: number) => { let w = 0, n = 0; for (let i = from; i < all.length; i++) { w += widthOf(all[i] as FlightStripEntry); if (w > room && n > 0) break; n++ } return n }
    while (start < sel && sel >= start + fits(start)) start++
    const shown = all.slice(start, start + fits(start))
    const hidden = all.length - shown.length
    const onPhases = typeof view.tab === 'number'
    const navOn = (t: 'history' | 'settings') => view.tab === t
    const nav = (t: 'history' | 'settings') => () => {
      if (navOn(t)) { const r = live ?? deck.reqs.find(x => x.id === reqId); go((r?.phase ?? 1) as FlightTab, true); return }
      go(t)
      if (t === 'history' && reqId) scrollTo(`hist-${reqId}`)
    }
    return (
      <Box flexDirection="row" justifyContent="space-between">
        <Box flexDirection="row" flexShrink={1} overflow="hidden">
          <Box flexShrink={0} marginRight={1}>
            <Button key="fly" plain onPress={flyNow}><Text color={C.v}>✈</Text></Button>
          </Box>
          {shown.map(s => {
            const { g: glyph, c } = glyphOf(chipState(s))
            const cur = onPhases && s.id === reqId
            return (
              <Box flexDirection="row" flexShrink={0} marginRight={1}>
                <Button key={`strip-${s.id}`} plain dimColor={!cur} onPress={() => { if (s.here) pickReq(s.id) }}>
                  <Text color={cur ? C.v : undefined} bold={cur}>{narrow ? shortId(s.id) : s.id}</Text>
                  <Text color={c}> {glyph}</Text>
                  {narrow ? null : <Text color={cur ? C.v : undefined}> {s.here ? (s.ended ? 'ship' : s.phaseName) : 'not on this machine'}</Text>}
                </Button>
              </Box>
            )
          })}
          {hidden > 0 || view.tab === 'reqs' ? (
            <Box flexShrink={0}>
              <Button key="strip-more" plain dimColor={view.tab !== 'reqs'} onPress={toggleReqs}>
                <Text color={view.tab === 'reqs' ? C.v : undefined}>{hidden > 0 ? `+${hidden}${narrow ? '' : ' more'}` : 'all'} {view.tab === 'reqs' ? '▴' : '▾'}</Text>
              </Button>
            </Box>
          ) : null}
          {all.length === 0 ? dim('nothing in flight') : null}
        </Box>
        <Box flexDirection="row" flexShrink={0}>
          <Button key="tab-history" plain label={narrow ? 'h' : 'history'} dimColor={!navOn('history')} onPress={nav('history')} />
          {faint(' · ')}
          <Button key="tab-settings" plain label={narrow ? 's' : 'settings'} dimColor={!navOn('settings')} onPress={nav('settings')} />
          {faint(' · ')}
          <Button key="size" plain label={height === 'max' ? '⤡' : '⤢'} onPress={() => void setHeight($, height === 'max' ? 'open' : 'max').catch(() => {})} />
          {faint(' · ')}
          <Button key="collapse" plain label="×" onPress={() => void setHeight($, 'band').catch(() => {})} />
        </Box>
      </Box>
    )
  }

  /** `+n more`, opened: every REQ in flight by ID number, the one shown marked; a row opens that REQ's phases. */
  const reqsPage = () => {
    const all = inFlightAll()
    return Sec('IN FLIGHT', `${all.length} · by ID`,
      ...all.map(s => {
        const { g: glyph, c } = glyphOf(chipState(s))
        const cur = s.id === reqId
        const title = items.find(i => i.id === s.id)?.title ?? ''
        const status = s.ended ? (s.ended === 'cancelled' ? 'aborted' : 'shipped') : !s.here ? 'not on this machine' : s.waiting ? `at the ${s.phaseName} gate` : s.phaseName
        return (
          <Button key={`reqs-${s.id}`} plain dimColor={!cur} onPress={() => { if (s.here) pickReq(s.id) }}>
            <Text color={cur ? C.v : C.faint}>{cur ? '▸ ' : '  '}</Text>
            <Text color={cur ? C.v : undefined} bold={cur}>{narrow ? shortId(s.id) : s.id}</Text>
            <Text color={c}> {glyph}</Text>
            <Text color={cur ? C.v : undefined}> {clip(title, Math.max(10, W - 46))}</Text>
            <Text color={C.faint}> · {status}{s.sprint ? ` · ${s.sprint}` : ''}</Text>
          </Button>
        )
      }),
      all.length === 0 ? dim('nothing in flight') : null)
  }

  // ----- what every phase page shares -----
  type PhaseCtx = {
    n: number; phase: string; p: { state: string } | undefined; vp: VaultPhase | null
    t: FlightTrail[string][string]; rounds: { at: string; decision: string; note: string; by?: string; viewed?: string }[]
    card: ReturnType<typeof parseGateCard>; myRead: string; verdict: string
  }
  const ctxOf = (n: number): PhaseCtx => {
    const phase = names[n - 1] ?? `phase ${n}`
    const vp: VaultPhase | null = st?.phases?.[String(n)] ?? null
    const t = trail[reqId ?? '']?.[phase] ?? { rounds: [], runs: [], card: null }
    const rounds = (vp?.gates?.length
      ? vp.gates.map(gg => ({ at: gg.at ?? '', decision: gg.decision ?? '', note: gg.note ?? '', by: gg.by, ...(gg.viewed ? { viewed: gg.viewed } : {}) }))
      : t.rounds.map(r => ({ at: `${dateOf(r.at)} ${timeOf(r.at)}`, decision: r.decision, note: r.note, ...(r.viewed ? { viewed: r.viewed } : {}) })))
    const card = t.card ? parseGateCard(t.card.text) : null
    return {
      n, phase, p: phases[n - 1], vp, t, rounds, card,
      myRead: card?.sections.find(s => /MY READ/.test(s.label))?.lines.join(' ') ?? '',
      verdict: card?.verdict ?? '',
    }
  }
  const gateRounds = (c: PhaseCtx) => c.rounds.filter(r => r.decision !== 'predict' && r.decision !== 'summary')
  /** `2026-10-22T14:05…` or `2026-10-22 14:05` → `10-22 14:05`. */
  const when = (at: string) => { const m = /\d{4}-(\d\d-\d\d)[T ](\d\d:\d\d)/.exec(at); return m ? `${m[1]} ${m[2]}` : clip(at, 16) }

  // ----- level 2, wide: the five phase tabs, each with its one-line status from 110 columns, then a rule -----
  const statusOf = (n: number, state: string) => {
    if (state === 'todo') {
      const prev = phases[n - 2]
      return prev && prev.state !== 'todo' && prev.state !== 'done' ? `opens after ${prev.name}` : 'not started'
    }
    const c = ctxOf(n)
    return phaseLine({
      n, state, rounds: c.rounds,
      needCall: n === 4 ? reviewNeeds.calls : 0, findings: n === 4 ? reviewNeeds.total : 0,
      viewed: n === 3 || n === 4 ? viewedOf(g, marks) : null,
      waiting: state === 'gate' && live?.waitingSince != null ? clock(now - live.waitingSince) : null,
    })
  }
  const tabs = () => {
    const cellW = Math.floor(W / 5)
    return (
      <Box flexDirection="column">
        <Box flexDirection="row">
          {phases.map(p => {
            const { g: glyph, c } = glyphOf(p.state)
            const sel = p.n === tabN && view.sub.kind === 'page'
            return (
              <Box width={cellW} flexShrink={0} paddingRight={2}>
                <Button key={`tab-${p.n}`} plain dimColor={!sel} onPress={() => go(p.n as FlightTab)}>
                  <Text color={sel ? C.v : undefined} underline={sel}>{p.n} {p.name}</Text>
                  <Text color={c}> {glyph}</Text>
                </Button>
              </Box>
            )
          })}
        </Box>
        {statusLines ? (
          <Box flexDirection="row">
            {phases.map(p => (
              <Box width={cellW} flexShrink={0} paddingRight={2}>
                <Text color={p.n === tabN ? C.dim : C.faint} wrap="truncate">{statusOf(p.n, p.state) || ' '}</Text>
              </Box>
            ))}
          </Box>
        ) : null}
        {rule()}
      </Box>
    )
  }

  // ----- level 2, narrow: the list home — one row per phase with its status line; the page opens in its place -----
  const listHome = () => (
    <Box flexDirection="column">
      {phases.map(p => {
        const { g: glyph, c } = glyphOf(p.state)
        return (
          <Box flexDirection="row">
            <Cell w={14}>
              <Button key={`home-${p.n}`} plain {...(!gateOnScreen ? { hotkey: String(p.n) } : {})} dimColor={p.n !== tabN} {...(p.state === 'gate' ? { autoFocus: true as const } : {})}
                onPress={() => go(p.n as FlightTab)}>
                <Text color={p.n === tabN ? C.v : undefined}>{gateOnScreen ? `${p.n} ` : ''}{p.name}</Text>
              </Button>
            </Cell>
            <Cell w={2}><Text color={c}>{glyph}</Text></Cell>
            <Text color={C.faint} wrap="truncate">{statusOf(p.n, p.state)}</Text>
          </Box>
        )
      })}
    </Box>
  )

  // ----- GATE: first on every page -----
  /**
   * The gate's options inline, `1: fix all (recommended)`, the recommended one in the accent; under them the
   * consequence of the recommended one, then `[ ⟳ compact first ]` with the context fill. An option that takes
   * an argument (`fix <ids>`, `revise <what>`) fills the prompt with its head for you to finish.
   */
  const gateCard = (c: PhaseCtx) => {
    if (!live) return null
    const { options, source } = optionsOf(gateAll[live.id], c.card?.decision ?? null, c.myRead, c.phase)
    const v = viewedOf(g, marks)
    const viewedArg = v.m > 0 ? { n: v.n, m: v.m } : null
    const ask = gateAll[live.id]?.ask ?? ''
    const summary = [
      c.n === 4 && reviewNeeds.total ? `${reviewNeeds.total} finding${reviewNeeds.total > 1 ? 's' : ''} · ${reviewNeeds.calls} need${reviewNeeds.calls === 1 ? 's' : ''} a call` : '',
      (c.n === 3 || c.n === 4) && v.m > 0 && v.n < v.m ? `${v.m - v.n} of ${v.m} changed files not viewed` : '',
      ask || c.myRead || c.verdict,
    ].filter(Boolean).join(' · ')
    const mode = settings.compact
    const pct = mode === 'never' ? null : usagePct
    const hotCtx = pct !== null && pct >= settings.compactAt
    const compactFirst = !!layout.compactFirst
    const dimAll = busy
    const choose = (o: FlightOption) => {
      if (dimAll || pending) return
      if (o.needsArg) { void $.prompt.fill({ text: `${optionHead(o.label)} `, mode: 'replace' }).catch(() => {}); return }
      const text = replyFor(o, null, c.n, viewedArg)
      void (async () => {
        if (compactFirst && mode !== 'never') {
          const res = await compactNow($, live)
          if (!res.ok) { $.ui.toast(`not compacted — nothing sent${res.why ? ` (${clip(res.why, 60)})` : ''}`); return }
          await update($, layoutA, l => ({ ...l, compactFirst: false })).catch(() => {}) // the reply goes out regardless
        }
        await sendReply($, live, text, options)
      })().catch(() => {})
    }
    const recI = Math.max(0, options.findIndex(o => o.recommended))
    const shownCons = options[recI]
    return (
      <Box flexDirection="column" paddingLeft={2}>
        {summary ? <Text wrap="wrap">{plainMd(summary)}</Text> : null}
        {options.length === 0 ? dim('no options captured — reply in the prompt (approve · revise <what> · abort)') : (
          <Box flexDirection="row" flexWrap="wrap">
            {options.map((o, i) => {
              const hotkey = gateOnScreen ? OPTION_KEYS[i] : undefined
              return (
                <Box marginRight={2} flexShrink={0}>
                  <Button key={`opt-${optionHead(o.label)}`} plain {...(hotkey ? { hotkey } : {})} dimColor={dimAll || !!pending} onPress={() => choose(o)}>
                    <Text color={o.recommended ? C.v : undefined}>{o.label}{o.recommended ? ' (recommended)' : ''}</Text>
                  </Button>
                </Box>
              )
            })}
          </Box>
        )}
        {shownCons?.consequence ? <Text color={C.dim} wrap="truncate"><Text color={C.faint}>{recI + 1} →</Text> {shownCons.consequence}</Text> : null}
        {source === 'standard' ? faint('the phase’s standard options — this gate’s marker lists none') : null}
        {mode !== 'never' && options.length ? (
          <Box flexDirection="row" flexWrap="wrap">
            <Button key="compact-first" plain dimColor={dimAll || (mode === 'suggest' && !hotCtx && !compactFirst)}
              onPress={() => void update($, layoutA, l => ({ ...l, compactFirst: !l.compactFirst })).catch(() => {})}>
              <Text color={C.faint}>[</Text><Text color={compactFirst ? C.v : undefined}>⟳ compact first</Text><Text color={C.faint}>]</Text>
            </Button>
            <Text color={C.faint}>
              {'  '}{pct !== null ? <Text>context <Text color={hotCtx ? C.amber : undefined}>{Math.round(pct)}%</Text> · </Text> : null}
              {mode === 'suggest' && hotCtx ? 'compacting first is suggested; ' : ''}compacting keeps the gate decision and open finding IDs{busy ? ' · Claude is working' : ''}
            </Text>
          </Box>
        ) : null}
      </Box>
    )
  }

  /** The GATE line — awaiting, sent, cleared, in progress or not reached — and, at an open gate, its card. */
  const gateBlock = (c: PhaseCtx) => {
    const st_ = c.p?.state ?? 'todo'
    const rounds = gateRounds(c)
    const last = rounds[rounds.length - 1]
    const line = (glyph: string, color: string, text: string) => (
      <Text wrap="truncate"><Text bold>GATE</Text> <Text color={color}>{glyph}</Text> <Text color={st_ === 'gate' ? undefined : C.dim}>{text}</Text></Text>
    )
    if (st_ === 'gate' && live) {
      if (pending?.req === live.id) {
        const v = viewedOf(g, marks)
        return (
          <Box flexDirection="column">
            {line('✓', C.ok, `sent${(c.n === 3 || c.n === 4) && v.m ? ` · viewed ${v.n}/${v.m}` : ''}`)}
            <Box paddingLeft={2}>{dim('Sent to Claude. The flightdeck reopens at the next gate for this REQ.')}</Box>
          </Box>
        )
      }
      return (
        <Box flexDirection="column">
          {line('●', C.amber, `awaiting — ${c.phase} · round ${rounds.length + 1}${live.waitingSince != null ? ` · ${clock(now - live.waitingSince)}` : ''}`)}
          {gateCard(c)}
        </Box>
      )
    }
    if (st_ === 'done') return line('✓', C.ok, last ? `cleared · ${last.decision} · round ${rounds.length}${last.at ? ` · ${when(last.at)}` : ''}${last.viewed ? ` · viewed ${last.viewed}` : ''}` : 'cleared')
    if (st_ === 'now') return line('○', C.link, `in progress — ${c.phase}${live ? ` · ${clock(now - live.phaseSince)}` : ''}`)
    const prev = names[c.n - 2]
    return line('○', C.faint, prev ? `not reached — opens after ${prev} clears` : 'not reached')
  }

  /** While a phase is in progress: the agents flying for it, what each is doing. */
  const soFar = (c: PhaseCtx) => {
    const flying = lanes.filter(l => l.req === reqId && l.endedAt === null && (l.phase === c.phase || live?.phase === c.n))
    const tasks = live?.tasks ?? []
    const done = tasks.filter(t => isLanded(t.status)).length
    if (!flying.length && !(c.n === 3 && tasks.length)) return null
    return Sec('SO FAR', c.n === 3 && tasks.length ? `${done}/${tasks.length} tasks` : null,
      ...flying.map(l => (
        <Text wrap="truncate"><Text color={C.link}>{spinFrame(now)}</Text> {l.agent}{l.task ? ` · ${l.task}` : ''} <Text color={C.faint}>· {clock(now - l.startedAt)} ·</Text> {l.doing}</Text>
      )),
      flying.length ? null : dim('no agent flying right now'))
  }

  // ----- the five pages -----

  const acRows = (rows: { text: string }[]) => rows.map((r, i) => (
    <Box flexDirection="row"><Cell w={2}>{faint('·')}</Cell><Cell w={3}>{faint(String(i + 1))}</Cell><Box flexGrow={1}><Text wrap="wrap">{criterionTitle(r.text)}</Text></Box></Box>
  ))

  const specPage = async (c: PhaseCtx) => {
    const md = folder ? await cached($, `${folder}/${kind === 'bug' ? 'bug.md' : 'requirement.md'}`) : null
    const ac = acceptanceOf(md)
    const beh = behaviourOf(md)
    const behRow = (label: string, lines: string[]) => lines.length ? (
      <Box flexDirection="row"><Cell w={7}>{faint(label)}</Cell><Box flexGrow={1} flexDirection="column">{lines.map(l => <Text wrap="wrap">{plainMd(l)}</Text>)}</Box></Box>
    ) : null
    return [
      beh.today.length || beh.after.length ? Sec('BEHAVIOUR', null, behRow('today', beh.today), behRow('after', beh.after)) : null,
      Sec('ACCEPTANCE CRITERIA', String(ac.length), ac.length ? acRows(ac) : dim(md ? 'none written' : 'no requirement on disk yet')),
    ]
  }

  const architectPage = async (c: PhaseCtx) => {
    const arch = folder ? await cached($, `${folder}/${kind === 'bug' ? 'investigation.md' : 'architecture.md'}`) : null
    const tasks = await tasksOf($, folder)
    const tiers = tiersOf(tasks)
    const predict = roundOf(c.t.rounds, 'predict')
    const approach = (sectionOf(arch ?? '', 'Approach') ?? sectionOf(arch ?? '', 'Overview') ?? '').split('\n').map(l => l.trim()).filter(Boolean).slice(0, 4).map(plainMd).join(' ')
    const said = Sec('YOU SAID', null, predict ? <Text wrap="wrap">{predict}</Text> : dim('nothing captured — the predict ask was skipped or answered elsewhere'))
    const found = Sec('CLAUDE FOUND', null, approach ? <Text wrap="wrap">{clip(approach, 600)}</Text> : dim(arch ? 'no Approach section' : 'no architecture on disk yet'))
    return [
      narrow ? [said, found] : (
        <Box flexDirection="row">
          <Box width={Math.floor(W / 2) - 2} flexShrink={0} marginRight={3} flexDirection="column">{said}</Box>
          <Box flexGrow={1} flexDirection="column">{found}</Box>
        </Box>
      ),
      Sec('TASKS', tasks.length ? `${tasks.length} · ${tiers.length} tier${tiers.length === 1 ? '' : 's'}${tiers.some(t => t.length > 1) ? ` · ${Math.max(...tiers.map(t => t.length))} parallel lanes` : ''}` : '0',
        tasks.length === 0 ? dim('no task files yet') : null,
        ...rails(tiers).map(r => {
          const status = live?.tasks.find(t => t.id === r.task.id)?.status ?? r.task.status
          const tone = isLanded(status) ? C.ok : /fail|block/.test(status) ? C.red : /progress/.test(status) ? C.link : C.faint
          return (
            <Box flexDirection="row">
              <Cell w={7}>{faint(r.rail)}</Cell>
              <Cell w={10}><Button key={`task-${r.task.id}`} plain onPress={() => sub({ kind: 'doc', path: `${folder}/tasks/${r.task.id}.md`, title: r.task.id })}><Text color={tone}>{r.task.id}</Text></Button></Cell>
              <Box flexGrow={1}><Text wrap="truncate">{plainMd(r.task.title || r.task.goal)}</Text></Box>
            </Box>
          )
        })),
    ]
  }

  /** `TASK-003` → `T3`. */
  const tShort = (id: string) => `T${Number(/(\d+)$/.exec(id)?.[1] ?? 0) || id}`

  const implementPage = async () => {
    const arch = folder ? await cached($, `${folder}/${kind === 'bug' ? 'investigation.md' : 'architecture.md'}`) : null
    const tasks = await tasksOf($, folder)
    const rows = planVsActual(blastRadius(arch), tasks, g?.touched ?? []).filter(r => r.touched)
    const v = viewedOf(g, marks)
    const fit = Math.max(0, Math.floor((W - 2 - 3 - 28 - 12) / 4))
    const cols = tasks.slice(0, fit)
    const sorted = rows.slice().sort((a, b) => (a.tasks.length ? 0 : 1) - (b.tasks.length ? 0 : 1) || (a.tasks[0] ?? '').localeCompare(b.tasks[0] ?? '') || a.path.localeCompare(b.path))
    return [
      Sec('FILES', `${tasks.length} task${tasks.length === 1 ? '' : 's'} · ${rows.length} file${rows.length === 1 ? '' : 's'} · viewed ${v.n}/${v.m}${v.stale.length ? ` · ${v.stale.length} changed since viewed` : ''}`,
        g && g.checkedOut === false ? <Text color={C.amber}>committed only — {g.tip} is not checked out here</Text> : null,
        !g ? dim('asking git…') : g.error ? <Text color={C.red}>{g.error}</Text> : rows.length === 0 ? dim('the tree matches the base') : (
          <Box flexDirection="row">
            <Cell w={3}><Text> </Text></Cell>
            <Box flexGrow={1}>{faint('file')}</Box>
            {cols.map(t => <Cell w={4}>{faint(tShort(t.id))}</Cell>)}
            <Cell w={12}>{faint('diff')}</Cell>
          </Box>
        ),
        ...sorted.map(r => (
          <Box flexDirection="row">
            <Cell w={3}>{viewedMark(r.path)}</Cell>
            {pathCell(r.path, W - 20 - cols.length * 4)}
            {cols.map(t => <Cell w={4}><Text color={r.tasks.includes(t.id) ? C.link : C.faint}>{r.tasks.includes(t.id) ? '●' : '·'}</Text></Cell>)}
            <Cell w={12}>{diffCell(r.touched, r.path)}</Cell>
          </Box>
        )),
        rows.length ? faint(`◉ viewed  ○ not yet  ~ changed since${tasks.length > cols.length ? ` · ${tasks.length - cols.length} more task columns at a wider width` : ''}`) : null),
    ]
  }

  const reviewPage = async (c: PhaseCtx) => {
    const arch = folder ? await cached($, `${folder}/${kind === 'bug' ? 'investigation.md' : 'architecture.md'}`) : null
    const tasks = await tasksOf($, folder)
    const rows = planVsActual(blastRadius(arch), tasks, g?.touched ?? [])
    const ac = acCheckOf(verification)
    const met = ac.filter(a => a.status === 'pass').length
    const reply = (() => {
      const by: Record<string, string[]> = { fix: [], accept: [], defer: [] }
      for (const [id, d] of Object.entries(picks)) by[d]?.push(id)
      return ['fix', 'accept', 'defer'].filter(k => by[k]?.length).map(k => `${k} ${by[k]?.join(',')}`).join(' · ')
    })()
    const setPick = (id: string, cur: string | undefined) =>
      void update($, picksA, p => ({ ...p, [reqId ?? '']: { ...(p[reqId ?? ''] ?? {}), [id]: (cur === 'fix' ? 'accept' : cur === 'accept' ? 'defer' : 'fix') as 'fix' | 'accept' | 'defer' } }))
    const sevTone = (s: string) => (/crit|major/.test(s) ? C.red : /minor/.test(s) ? C.amber : C.faint)
    const wW = Math.min(26, Math.floor(W * 0.24))
    const ordered = [...allFindings.filter(needCall), ...allFindings.filter(f => !needCall(f))]
    const findingRow = (f: Finding) => {
      const m = /^(.*?):(\d+)/.exec(f.where)
      const where = f.where ? (m ? ref(m[1] ?? f.where, Number(m[2]), clip(f.where, wW - 2)) : ref(f.where, undefined, clip(f.where, wW - 2))) : faint('—')
      const picked = picks[f.id]
      const pickLabel = picked ?? (needCall(f) ? 'call' : 'fix')
      const pickBtn = (
        <Button key={`pick-${f.id}`} plain onPress={() => setPick(f.id, picked)}>
          <Text color={C.faint}>[</Text><Text color={!picked && needCall(f) ? C.amber : picked ? undefined : C.dim}>{pickLabel} ▾</Text><Text color={C.faint}>]</Text>
        </Button>
      )
      const text = (
        <Box flexDirection="column" flexGrow={1}>
          <Text wrap="wrap">{plainMd(f.text)}</Text>
          {f.disagreement ? <Text color={C.amber} wrap="wrap">split: {f.disagreement}</Text> : null}
        </Box>
      )
      return narrow ? (
        <Box flexDirection="column">
          <Box flexDirection="row">
            <Cell w={4}><Text color={sevTone(f.severity)}>{f.id}</Text></Cell>
            <Cell w={8}>{faint(clip(f.severity, 7))}</Cell>
            <Box flexGrow={1} overflow="hidden">{where}</Box>
            <Cell w={10}>{pickBtn}</Cell>
          </Box>
          <Box paddingLeft={12}>{text}</Box>
        </Box>
      ) : (
        <Box flexDirection="row">
          <Cell w={5}><Text color={sevTone(f.severity)}>{f.id}</Text></Cell>
          <Cell w={9}>{faint(clip(f.severity, 8))}</Cell>
          <Cell w={wW}>{where}</Cell>
          {text}
          <Cell w={11}><Box paddingLeft={1}>{pickBtn}</Box></Cell>
        </Box>
      )
    }
    const planned = rows.filter(r => r.planned).length, touched = rows.filter(r => r.touched).length
    const surprises = rows.filter(r => r.planned !== !!r.touched).length
    return [
      Sec('FINDINGS', String(allFindings.length),
        allFindings.length === 0 ? dim(verification ? 'no findings table yet' : 'no verification.md yet') : (
          narrow ? null : (
            <Box flexDirection="row">
              <Cell w={5}>{faint('id')}</Cell><Cell w={9}>{faint('sev')}</Cell><Cell w={wW}>{faint('where')}</Cell>
              <Box flexGrow={1}>{faint('finding · disagreement')}</Box><Cell w={11}><Box paddingLeft={1}>{faint('pick')}</Box></Cell>
            </Box>
          )
        ),
        ...ordered.map(findingRow),
        reply ? (
          <Box flexDirection="row" marginTop={1}>
            <Button key="compose" plain hotkey={KEYS.compose} label={`send “${clip(reply, 48)}”`} dimColor={!!pending || busy || c.p?.state !== 'gate'}
              onPress={() => {
                if (!live || pending || busy || c.p?.state !== 'gate') { void $.prompt.fill({ text: reply, mode: 'replace' }).catch(() => {}); return }
                const v = viewedOf(g, marks)
                void sendReply($, live, `${reply}${trailerFor(c.n, v.m > 0 ? { n: v.n, m: v.m } : null)}`, optionsOf(gateAll[live.id], c.card?.decision ?? null, c.myRead, c.phase).options).catch(() => {})
              }} />
            <Text>  </Text>
            <Button key="compose-edit" plain dimColor label="edit first" onPress={() => void $.prompt.fill({ text: reply, mode: 'replace' }).catch(() => {})} />
          </Box>
        ) : null),
      Sec('ACCEPTANCE CRITERIA', ac.length ? `${met}/${ac.length} met` : '0',
        ac.length === 0 ? dim('no acceptance check in verification.md yet') : null,
        ...ac.map((a, i) => {
          const glyph = a.status === 'pass' ? '✓' : a.status === 'fail' ? '✗' : a.status === 'partial' ? '◐' : '○'
          const tone = a.status === 'pass' ? C.ok : a.status === 'fail' ? C.red : a.status === 'partial' ? C.amber : C.faint
          return (
            <Box flexDirection="row">
              <Cell w={2}><Text color={tone}>{glyph}</Text></Cell><Cell w={3}>{faint(String(i + 1))}</Cell>
              <Box flexGrow={1}><Text wrap="wrap">{criterionTitle(a.text)}{a.status !== 'pass' && a.evidence ? <Text color={a.status === 'fail' ? C.red : C.amber}> · {a.evidence}</Text> : null}</Text></Box>
            </Box>
          )
        })),
      planBlock(rows, `${planned} planned · ${touched} touched${g?.baseName ? ` · vs ${g.baseName}` : ''}${surprises ? ` · ${surprises} surprise${surprises > 1 ? 's' : ''}` : ''}`),
    ]
  }

  /** Plan vs actual: one row per file the plan names or the tree changed; a file nobody planned, or planned and untouched, is a surprise. */
  const planBlock = (rows: PlanRow[], count: string) => Sec('PLAN VS ACTUAL', count,
    g && g.checkedOut === false ? <Text color={C.amber}>committed only — {g.tip} is not checked out here</Text> : null,
    !g ? dim('asking git…') : g.error ? <Text color={C.red}>{g.error}</Text> : rows.length === 0 ? dim('nothing planned and nothing changed') : (
      <Box flexDirection="row"><Cell w={3}><Text> </Text></Cell><Box flexGrow={1}>{faint('file')}</Box><Cell w={12}>{faint('plan')}</Cell><Cell w={12}>{faint('diff')}</Cell></Box>
    ),
    ...rows.map(r => (
      <Box flexDirection="row">
        <Cell w={3}>{r.touched ? viewedMark(r.path) : faint(' ')}</Cell>
        {pathCell(r.path, W - 32)}
        <Cell w={12}><Text color={r.planned && r.touched ? C.faint : C.amber}>{!r.planned ? 'surprise' : !r.touched ? 'not touched' : 'planned'}</Text></Cell>
        <Cell w={12}>{diffCell(r.touched, r.path)}</Cell>
      </Box>
    )))

  const shipPage = async () => {
    const arch = folder ? await cached($, `${folder}/${kind === 'bug' ? 'investigation.md' : 'architecture.md'}`) : null
    const tasks = await tasksOf($, folder)
    const rows = planVsActual(blastRadius(arch), tasks, g?.touched ?? [])
    const commits = folder ? await cached($, `${folder}/commits-draft.md`) : null
    const pr = folder ? await cached($, `${folder}/${kind === 'bug' ? 'bug-fix-pr-draft.md' : 'pr-draft.md'}`) : null
    const checklistMd = folder ? await cached($, `${folder}/merge-checklist.md`) : null
    const cons = consequences(commits, pr, checklistMd, g?.branch ?? st?.branch ?? null, rows)
    const touched = rows.filter(r => r.touched).sort((a, b) => ((b.touched?.add ?? 0) + (b.touched?.del ?? 0)) - ((a.touched?.add ?? 0) + (a.touched?.del ?? 0)))
    const adds = touched.reduce((a, r) => a + (r.touched?.add ?? 0), 0), dels = touched.reduce((a, r) => a + (r.touched?.del ?? 0), 0)
    const maxN = Math.max(1, ...touched.map(r => (r.touched?.add ?? 0) + (r.touched?.del ?? 0)))
    const barW = Math.min(22, Math.max(8, Math.floor(W * 0.2)))
    const plusMinus = (a: number, d: number) => {
      const t = Math.max(a + d > 0 ? 1 : 0, Math.round(((a + d) / maxN) * barW))
      const p = a + d ? Math.round((t * a) / (a + d)) : 0
      return <Text><Text color={C.ok}>{'+'.repeat(p)}</Text><Text color={C.red}>{'-'.repeat(t - p)}</Text></Text>
    }
    return [
      Sec('WHAT APPROVING SETS IN MOTION', null,
        cons.length === 0 ? dim('no drafts on disk yet — wrapup writes commits-draft.md, pr-draft.md and merge-checklist.md') : null,
        ...cons.map((x, i) => (
          <Box flexDirection="row"><Cell w={3}>{faint(String(i + 1))}</Cell><Box flexGrow={1}><Text color={x.tone === 'warn' ? C.amber : undefined} wrap="wrap">{x.text}</Text></Box></Box>
        ))),
      Sec('DIFFSTAT', `${touched.length} file${touched.length === 1 ? '' : 's'} · +${adds} −${dels}${g?.baseName ? ` · vs ${g.baseName}` : ''}`,
        touched.length === 0 ? dim(g ? 'the tree matches the base' : 'asking git…') : null,
        ...touched.map(r => (
          <Box flexDirection="row">
            <Box flexGrow={1} overflow="hidden">{ref(r.path, undefined, clip(r.path, W - barW - 12))}</Box>
            <Cell w={6}>{faint(String((r.touched?.add ?? 0) + (r.touched?.del ?? 0)))}</Cell>
            <Cell w={barW}><Button key={`bar-${pathKey(r.path)}`} plain onPress={() => sub({ kind: 'diff', path: r.path })}>{plusMinus(r.touched?.add ?? 0, r.touched?.del ?? 0)}</Button></Cell>
          </Box>
        ))),
    ]
  }

  const phasePage = async (n: number) => {
    if (!reqId) return <Text dimColor>Not flying a REQ in this session. Name one (`/proceed REQ-042`), or pick one under history.</Text>
    const c = ctxOf(n)
    const state = c.p?.state ?? 'todo'
    if (state === 'todo') {
      const prev = names[n - 2]
      return (
        <Box flexDirection="column">
          {gateBlock(c)}
          <Box marginTop={1} paddingLeft={2}>{dim(prev ? `Nothing to review yet. This page fills in when ${prev} clears.` : 'Nothing to review yet.')}</Box>
        </Box>
      )
    }
    if (height === 'open') {
      // The summary: GATE (and what is flying). ⤢ — or this line — adds the phase's evidence, and the band scrolls.
      const blocks = ['BEHAVIOUR · ACCEPTANCE CRITERIA', 'YOU SAID · CLAUDE FOUND · TASKS', 'FILES', 'FINDINGS · ACCEPTANCE CRITERIA · PLAN VS ACTUAL', 'WHAT APPROVING SETS IN MOTION · DIFFSTAT'][n - 1] ?? ''
      return (
        <Box flexDirection="column">
          {gateBlock(c)}
          {state === 'now' ? soFar(c) : null}
          <Box marginTop={1} paddingLeft={2}>
            <Button key="evidence" plain dimColor onPress={() => void setHeight($, 'max').catch(() => {})}>
              <Text color={C.faint}>⤢ </Text><Text>{blocks}</Text>
            </Button>
          </Box>
        </Box>
      )
    }
    const evidence = n === 1 ? await specPage(c) : n === 2 ? await architectPage(c) : n === 3 ? await implementPage() : n === 4 ? await reviewPage(c) : await shipPage()
    return (
      <Box flexDirection="column">
        {gateBlock(c)}
        {state === 'now' ? soFar(c) : null}
        {evidence as never}
      </Box>
    )
  }

  // ----- one thing opened from a phase page: a back control, then the thing -----
  const header = (title: string, right: unknown = null) => (
    <Box flexDirection="row" justifyContent="space-between">
      <Box flexDirection="row" flexShrink={1}><Button key="back" plain label="‹ back" onPress={back} /><Text>  </Text><Text bold color={C.v} wrap="truncate">{title}</Text></Box>
      <Box flexDirection="row" flexShrink={0}>{right as never}</Box>
    </Box>
  )

  const docView = async (path: string, title: string) => {
    let text: string | null = null
    let listing: string[] | null = null
    try {
      if ((await $.fs.stat(path)).kind === 'dir') listing = (await $.fs.list(path)).filter(f => f.kind === 'file').map(f => f.name).sort()
      else text = await cached($, path)
    } catch {}
    return (
      <Box flexDirection="column">
        {header(title, text !== null ? ref(path, undefined, 'open in editor ↗') : null)}
        <Box marginTop={1} flexDirection="column" paddingLeft={2}>
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
    const detached = !!g && g.checkedOut === false // the REQ's branch is not what this checkout has: read it from git, not disk
    if (t && (t.status === '?' || t.status === 'A') && !g?.base && !detached) {
      isNew = true
      try { source = await $.fs.read(absPath(cwd, path)) } catch { source = null }
    } else {
      source = await git($, cwd, gitPlan({ branch: g?.tip }, detached ? null : g?.tip ?? 'HEAD', true).diff(g?.base ?? null, path))
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
        {header(clip(path, W - 40), <Box flexDirection="row">{ref(path, undefined, 'open in editor ↗')}<Text>  </Text><Text color={seen ? C.ok : C.amber}>{seen ? '◉ viewed' : 'marking viewed'}</Text></Box>)}
        <Box paddingLeft={2}>{faint(`${isNew ? 'new file' : `vs ${g?.baseName ?? 'HEAD'}`}${g?.authors[k] ? ` · last: ${g.authors[k]}` : ''}${source && source.length >= DIFF_MAX ? ' · cut at 90KB' : ''}`)}</Box>
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
        {header(`diagram ${n + 1} of ${fences.length} · source`)}
        <Box marginTop={1}>{src ? <Code source={src} language="mermaid" /> : dim('no diagram')}</Box>
      </Box>
    )
  }

  const cardView = (phase: string) => {
    const c = reqId ? trail[reqId]?.[phase]?.card : null
    return (
      <Box flexDirection="column">
        {header(`gate card · ${phase}`, c ? faint(`seen ${dateOf(c.at)} ${timeOf(c.at)}`) : null)}
        <Box marginTop={1}>{c ? <Markdown key={`card-${reqId}-${phase}`} text={c.text} /> : dim('no card captured on this machine for that phase')}</Box>
      </Box>
    )
  }

  const laneView = (id: string) => {
    const l = lanes.find(x => x.id === id)
    const r = reqId ? Object.values(trail[reqId] ?? {}).flatMap(p => p.runs).find(x => x.id === id) : undefined
    const room = Math.max(5, e.props.maxRows - 8)
    return (
      <Box flexDirection="column">
        {header(l?.agent ?? r?.agent ?? id)}
        <Box flexDirection="column" paddingLeft={2}>
          {l ? faint(`${l.label} · ${clock((l.endedAt ?? now) - l.startedAt)}${l.tokens ? ` · ${tokens(l.tokens)} fresh · ${tokens(l.wrote)} wrote` : ''}`) : null}
          {r && !l ? faint(`${r.task ?? ''} · ${clock(r.endedAt - r.startedAt)} · ${tokens(r.tokens)} fresh · ${r.isFailed ? 'failed' : 'landed'} ${dateOf(r.endedAt)} ${timeOf(r.endedAt)}`) : null}
          {r ? <Box marginTop={1}><Text wrap="wrap">{r.verdict || '(no last line)'}</Text></Box> : null}
          {l ? l.trail.slice(-room).reverse().map(h => (
            <Box flexDirection="row">
              <Cell w={8}>{faint(`-${clock(now - h.t)}`)}</Cell>
              <Text color={h.err ? TONE.err : TONE[h.k]}>{h.err ? '✗ ' : '▆ '}</Text>
              <Text wrap="truncate">{h.d}</Text>
            </Box>
          )) : null}
          {!l && !r ? dim('That agent is not on this machine’s trail.') : null}
        </Box>
      </Box>
    )
  }

  // ----- history: past REQs, each with its first and last state from hot.md -----
  const historyPage = () => {
    // By ID number, every row a press that opens that REQ's phases; the one shown is marked, and opening history scrolls to it.
    const list = filterItems(items, settings.history, null, '').sort((a, b) => idOrder(a.id, b.id))
    const HIST_MAX = 200
    const rows = list.length > HIST_MAX ? [...list.slice(0, HIST_MAX), ...list.slice(HIST_MAX).filter(it => it.id === reqId)] : list
    const stateText = (it: FlightItem) =>
      it.state === 'flying' ? `${it.phaseName}` : it.state === 'gate' ? `at the ${it.phaseName} gate` : it.state === 'merged' ? 'shipped' : it.state === 'cancelled' ? 'aborted' : it.state
    const open = (it: FlightItem) => void setView($, () => ({ req: it.id, tab: (it.state === 'flying' || it.state === 'gate' ? it.phase : 5) as FlightTab, sub: { kind: 'page' }, home: true }))
    const showing = view.hist ?? null
    const toggle = (id: string, which: 'first' | 'last') =>
      void setView($, v => ({ ...v, hist: v.hist?.id === id && v.hist.which === which ? null : { id, which } }))
    const detail = (it: FlightItem, which: 'first' | 'last') => {
      const evs = hotFor(hot, it.id, it.kind)
      const ev = which === 'first' ? evs[evs.length - 1] : evs[0]
      return ev ? `${which} state · ${ev.date} · ${ev.event}${hotTail(ev) ? ` · ${hotTail(ev)}` : ''}` : `${which} state · nothing in hot.md for ${it.id}`
    }
    return Sec('HISTORY', `${list.length} REQ${list.length === 1 ? '' : 's'}`,
      <Box flexDirection="row">
        {Select ? (
          <Select key="hist-mode" label="show" value={settings.history}
            options={[{ value: 'all', label: 'all' }, { value: 'flying', label: 'in flight' }, { value: 'done', label: 'done' }]}
            onSelect={(v: string) => void setSettings($, s => ({ ...s, history: v as FlightSettings['history'] }))} />
        ) : (
          <Button key="hist-mode" plain label={`show: ${settings.history}`}
            onPress={() => void setSettings($, s => ({ ...s, history: s.history === 'all' ? 'flying' : s.history === 'flying' ? 'done' : 'all' }))} />
        )}
      </Box>,
      ...rows.map(it => {
        const cur = it.id === reqId
        return (
        <Box flexDirection="column">
          <Box flexDirection="row">
            <Box flexGrow={1} flexShrink={1} overflow="hidden">
              <Button key={`hist-${it.id}`} plain dimColor={!cur} onPress={() => open(it)}>
                <Text color={cur ? C.v : C.faint}>{cur ? '▸ ' : '  '}</Text>
                <Text color={cur ? C.v : undefined} bold={cur}>{narrow ? shortId(it.id) : it.id}</Text>
                <Text color={cur ? C.v : undefined}> {clip(it.title, Math.max(10, W - (narrow ? 34 : 50)))}</Text>
                <Text color={C.faint}> · {stateText(it)}{it.touchedAt ? ` ${dateOf(it.touchedAt).slice(5)}` : ''}{it.author ? ` · ${it.author}` : ''}</Text>
              </Button>
            </Box>
            <Box flexDirection="row" flexShrink={0}>
              {(['first', 'last'] as const).map(w => (
                <Box marginLeft={1}>
                  <Button key={`hist-${it.id}-${w}`} plain onPress={() => toggle(it.id, w)}>
                    <Text color={C.faint}>[</Text><Text color={showing?.id === it.id && showing.which === w ? C.v : undefined}>{w}</Text><Text color={C.faint}>]</Text>
                  </Button>
                </Box>
              ))}
            </Box>
          </Box>
          {showing?.id === it.id ? <Box paddingLeft={4}><Text color={C.dim} wrap="wrap">{detail(it, showing.which)}</Text></Box> : null}
        </Box>
        )
      }),
      list.length > rows.length ? faint(`+ ${list.length - rows.length} more — narrow the filter`) : null,
      items.length === 0 ? dim('No REQ or BUG under specs/ or bugs/.') : null)
  }

  // ----- settings -----
  const settingsPage = () => {
    const lw = narrow ? W : 16
    const row = (label: string, control: unknown, hint = '') => (
      <Box flexDirection={narrow ? 'column' : 'row'}>
        <Cell w={lw}><Text color={narrow ? C.faint : undefined}>{label}</Text></Cell>
        <Box flexDirection="row" flexGrow={1}>{control as never}{hint ? <Text color={C.faint} wrap="truncate">  {hint}</Text> : null}</Box>
      </Box>
    )
    const seg = <T extends string,>(key: string, values: readonly T[], cur: T, set: (v: T) => void) => (
      <Box flexDirection="row">
        {values.map(v => (
          <Box marginRight={1}>
            <Button key={`${key}-${v}`} plain onPress={() => set(v)}>
              <Text color={C.faint}>[</Text><Text color={v === cur ? C.v : undefined}>{v}</Text><Text color={C.faint}>]</Text>
            </Button>
          </Box>
        ))}
      </Box>
    )
    const onOff = (key: string, on: boolean, set: (v: boolean) => void) => seg(key, ['on', 'off'] as const, on ? 'on' : 'off', v => set(v === 'on'))
    const preset = EDITOR_PRESETS.find(p => p.value === settings.editorUri)
    return [
      Sec('SETTINGS', null,
        row('editor link', Select ? (
          <Select key="set-editor" value={preset ? settings.editorUri : 'custom'}
            options={[...EDITOR_PRESETS, { value: 'custom', label: 'custom…' }]}
            onSelect={(v: string) => { if (v !== 'custom') void setSettings($, s => ({ ...s, editorUri: v })) }} />
        ) : (
          <Button key="set-editor" plain label={preset?.label ?? settings.editorUri}
            onPress={() => void setSettings($, s => ({ ...s, editorUri: EDITOR_PRESETS[(EDITOR_PRESETS.findIndex(p => p.value === s.editorUri) + 1) % EDITOR_PRESETS.length]?.value ?? s.editorUri }))} />
        ), preset ? '' : settings.editorUri),
        Input ? row('', <Input key="set-editor-custom" placeholder={settings.editorUri} value="" submitLabel="set"
          onSubmit={(v: string) => { if (v.trim()) void setSettings($, s => ({ ...s, editorUri: v.trim() })) }} />, '{path} {line} {col}') : null,
        row('compact mode', seg('set-compact', ['button', 'suggest', 'never'] as const, settings.compact, v => void setSettings($, s => ({ ...s, compact: v })))),
        row('compact at', seg('set-compact-at', ['60', '70', '80', '90'] as const, String(settings.compactAt) as '60', v => void setSettings($, s => ({ ...s, compactAt: Number(v) }))), '% context'),
        row('narrow below', seg('set-narrow', ['72', '84', '96', '110'] as const, String(settings.narrowAt || NARROW_AT) as '84', v => void setSettings($, s => ({ ...s, narrowAt: Number(v) }))), 'cols of flightdeck width'),
        row('open on start', onOff('set-open', settings.openOnStart, v => void setSettings($, s => ({ ...s, openOnStart: v }))), 'when a REQ is in flight'),
        row('gate cards', onOff('set-cards', settings.cards, v => void setSettings($, s => ({ ...s, cards: v }))), 'gate text drawn as a card'),
        row('show unshipped', onOff('set-show-all', settings.showAll, v => void setSettings($, s => ({ ...s, showAll: v }))), 'every unshipped REQ rides the strip'),
        row('forget', (
          <Box flexDirection="row">
            <Button key="set-forget" plain onPress={() => void (async () => { await update($, trailA, () => ({})); if (vault) await $.store.delete(`trail:${vault}`).catch(() => {}) })()}>
              <Text color={C.faint}>[</Text><Text>this vault’s trail</Text><Text color={C.faint}>]</Text>
            </Button>
            <Text> </Text>
            <Button key="set-forget-viewed" plain onPress={() => void (async () => { await update($, viewedA, () => ({})); if (vault) await $.store.delete(`viewed:${vault}`).catch(() => {}) })()}>
              <Text color={C.faint}>[</Text><Text>viewed marks</Text><Text color={C.faint}>]</Text>
            </Button>
          </Box>
        ))),
      Sec('KEYS', null, <Text color={C.dim} wrap="wrap"><Text color={undefined}>1–6</Text> gate options · <Text color={undefined}>{KEYS.compose}</Text> send your finding picks · <Text color={undefined}>ctrl+x tab</Text> focus the flightdeck, then Tab / Enter</Text>),
    ]
  }

  const body = view.tab === 'reqs' ? reqsPage()
    : view.tab === 'history' ? historyPage()
    : view.tab === 'settings' ? settingsPage()
    : view.sub.kind === 'doc' ? await docView(view.sub.path, view.sub.title)
    : view.sub.kind === 'card' ? cardView(view.sub.phase)
    : view.sub.kind === 'lane' ? laneView(view.sub.id)
    : view.sub.kind === 'diff' ? await diffView(view.sub.path)
    : view.sub.kind === 'mermaid' ? await mermaidView(view.sub.n)
    : await phasePage(tabN || 1)

  // Nothing is cut: a tree taller than the band scrolls in the engine's window (wheel, keys). Open and max differ in
  // what a phase page holds (the summary, or the evidence too), never in a height the band could not take anyway.
  const frame = (...children: unknown[]) => (
    <Box flexDirection="column" paddingX={1}><Box flexDirection="column" flexShrink={0}>{children as never}</Box></Box>
  )

  if (typeof view.tab !== 'number') return frame(level1(), rule(), body)
  if (showHome) return frame(level1(), rule(), listHome())
  if (narrow) {
    const p = phases[(tabN || 1) - 1]
    const { g: glyph, c } = glyphOf(p?.state ?? 'todo')
    return frame(
      level1(),
      rule(),
      view.sub.kind === 'page' ? (
        <Box flexDirection="row">
          <Button key="home" plain label="‹ back" onPress={goHome} />
          <Text color={C.dim}>  {tabN || 1} {names[(tabN || 1) - 1] ?? ''} </Text>
          <Text color={c}>{glyph}</Text>
        </Box>
      ) : null,
      body,
    )
  }
  return frame(level1(), tabs(), body)
}
