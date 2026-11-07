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
//
// 0.8.1 — the record true. A render only reads: git, the diff and the viewed marks are written from the press
// or the event that asked (a write made while drawing is refused and was lost). A REQ at the ship gate is in
// flight. No band Button has a digit key. The band composes with what other plugins draw there (`next`).
import { atom, read, update } from 'claude-code'
import type { Hook, Register, RenderInput } from 'claude-code'

import type {
  FlightCount, FlightDeck, FlightDiff, FlightFuel, FlightFuelRow, FlightGateAsk, FlightGit, FlightHeight, FlightItem, FlightLane, FlightLayout, FlightOption,
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
  COMPACT_TIMEOUT_MS, DEBRIEF_LABELS, ID_SRC, autoCompactApplies, bar, buildReq, clip, clock, describeTool, idOf, isActive, isLanded, kindOf, markSpans, parseDebrief, parseDispatch, parseGateCard,
  pulse, ringGlyph, spinFrame, splitFolder, tokens, typicalCost, type Debrief, type DebriefReader, type PipelineState,
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
const DEFAULTS: FlightSettings = { openOnStart: false, band: true, cards: true, narrowAt: 84, showAll: false, history: 'all', editorUri: EDITOR_PRESETS[0]?.value ?? 'vscode://file/{path}:{line}:{col}', compact: 'button', compactAt: 70, autoCompact: 'off' }
const settingsA = atom({ plugin: 'adlc-flightdeck', key: 'settings' } as const, DEFAULTS)
const filtersA = atom({ plugin: 'adlc-flightdeck', key: 'filters' } as const, { author: null, text: '' } as { author: string | null; text: string })
const gitA = atom({ plugin: 'adlc-flightdeck', key: 'git' } as const, {} as Record<string, FlightGit>)
const viewedA = atom({ plugin: 'adlc-flightdeck', key: 'viewed' } as const, {} as FlightViewed)
const picksA = atom({ plugin: 'adlc-flightdeck', key: 'picks' } as const, {} as FlightPicks)
const gateA = atom({ plugin: 'adlc-flightdeck', key: 'gate' } as const, {} as Record<string, FlightGateAsk>)
const stripA = atom({ plugin: 'adlc-flightdeck', key: 'strip' } as const, [] as FlightStripEntry[])
const layoutA = atom({ plugin: 'adlc-flightdeck', key: 'layout' } as const, { height: 'band' } as FlightLayout)
const pendingA = atom({ plugin: 'adlc-flightdeck', key: 'pending' } as const, null as { req: string; at: number } | null)
const diffA = atom({ plugin: 'adlc-flightdeck', key: 'diff' } as const, null as FlightDiff | null)

const LINGER_MS = 9000 // a landed lane stays on the live list this long
const GATE_TICK_MS = 60_000 // while only gates wait, the clock the band draws moves this often
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
const AGENTS_EVERY_MS = 2000 // how long one `$.agent.list()` answer numbers the lanes
const RING_W = 9 // the header ring at its widest, `● 100%`, and the ` · ` after it
/**
 * Keys the pane binds. `Button.hotkey` takes one digit or one lowercase letter and refuses
 * anything else (claude-code types, ButtonProps.hotkey), so the plan's `[` / `]` and its
 * `,` / `.` fallback cannot be bound; j / k step the tabs (j sits left of k, as [ of ]),
 * w / e step the REQ strip in narrow mode. Change them here, and only here.
 */
// Keys live only in the page body. The terminal draws a plain Button that has a hotkey as `k: label`, so a header
// control with a letter key would carry its hint; headers are click (or ctrl+x tab, then Tab / Enter) only.
// 0.8.1: no digit on any band Button. A bare digit typed into an empty prompt presses a band Button keyed with it
// (live on 2.1.318), so a digit key answers a gate by accident; a letter fires only once the band has focus.
const KEYS = { mermaid: 'm', compose: 'c' } as const
/**
 * The gate's options, by position on the open gate's page: a b d e f g i j. Positional, so the same option keeps
 * its key across redraws and two options never share one. It skips every other letter this mod binds or shows in
 * the same view: `c` (compose, on the review page beside the options), `m` (KEYS.mermaid), `h` / `s` (the narrow
 * header's history / settings labels, click-only). The narrow list home's rows carry no key.
 */
const OPTION_KEYS = ['a', 'b', 'd', 'e', 'f', 'g', 'i', 'j']
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
// Agent numbers (#n): the place in `$.agent.list()`, worked out at draw. Never stored in state; a lane the list
// dropped keeps the last number it was drawn with, dimmed. Self-contained: agentPlaces + laneNo + two call sites.
let agentsSeen: { at: number; places: Map<string, number> | null } = { at: 0, places: null }
const lastPlace = new Map<string, number>() // lane id → the number it was last drawn with
let compacting = false // a reply is held for a compaction (compactThenSend): typed replies, buttons and the ring wait for it
let compactInFlight = false // the engine's compaction has not settled — it can outlive the give-up: no second one starts

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
  // 0.7.0: the strip and the band's counts take the REQs in flight — started, not yet at their last phase (0.8.1: or at its gate) — not every
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
  if (was === req) return
  await update($, focusA, () => req)
  // First look at a REQ: ask git now, from the event, so the cockpit's render only reads (0.8.1).
  if ((await read($, deckA)).reqs.some(r => r.id === req)) void refreshGit($, req).catch(() => {})
}

/**
 * Opens one file's diff in the cockpit, from the press that asked for it: the view turns to it, git is asked
 * for the diff here (never in render), and the file is marked viewed once its diff is in — the mark lands
 * from this handler, so it is never a write made while drawing (0.8.1).
 */
async function openDiff($: Dollar, req: string, path: string) {
  await setView($, v => ({ ...v, sub: { kind: 'diff', path } }))
  const g = (await read($, gitA))[req]
  const cwd = g?.cwd || (vault ? parent(vault) : '')
  const t = g?.touched.find(x => pathKey(x.path) === pathKey(path))
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
  await update($, diffA, () => ({ req, path, source, isNew }))
  if (g) await markViewed($, req, path, g.hashes[pathKey(path)])
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
async function sendReply($: Dollar, r: FlightReq, text: string, options: FlightOption[], via: 'pane' | 'typed' = 'pane'): Promise<boolean> {
  if (await read($, pendingA)) return false
  const at = await $.clock.now()
  await update($, pendingA, () => ({ req: r.id, at }))
  await touch($, r.id)
  try {
    await $.prompt.submit({ text, asUser: true })
    // Recorded here; the prompt.submit observer skips this plugin's own submits so it is never counted twice.
    await recordRound($, r, text, options, via).catch(() => {})
    return true
  } catch {
    await update($, pendingA, () => null)
    refill($, text) // never lost: whoever called, the reply goes back in the box
    $.ui.toast('not sent — your reply is back in the box')
    return false
  }
}

/**
 * Compacts: with instructions built from the REQ's state when one is given, a bare compact otherwise.
 * Rejects mid-turn; resolves `{ ok: false, why }` when a hook vetoes or the engine refuses.
 */
async function compactNow($: Dollar, r: FlightReq | null): Promise<{ ok: boolean; why?: string }> {
  if (busy) return { ok: false, why: 'Claude is working — compact when the turn ends' }
  try {
    const res = r
      ? await $.session.compact({ instructions: compactBrief(r, stateOf.get(r.id), (await read($, gateA))[r.id], folderOf.get(r.id), vault) })
      : await $.session.compact()
    if ('skip' in res && res.skip) return { ok: false, why: res.skip }
    usageSeen = { at: 0, percent: null } // the window just shrank: ask again on the next draw
    return { ok: true }
  } catch (err) { return { ok: false, why: String(err instanceof Error ? err.message : err) } }
}

/** Puts a reply back in the prompt box, after the drop that took it has settled. */
function refill($: Dollar, text: string) {
  $.clock.after(0, () => { void $.prompt.fill({ text, mode: 'replace' }).catch(() => {}) })
}

/** A gate reply waiting on a compaction: its text, the gate's options, and how it was given. Its REQ is compactThenSend's. */
type HeldReply = { text: string; options: FlightOption[]; via: 'pane' | 'typed' }

/**
 * The one compact-then-send path: a pressed answer (the toggle or auto compact), a held typed approve, and the
 * ring (no reply). One compaction at a time: none starts while `compactInFlight`, which clears only when the
 * engine's compaction settles. `compacting` (a reply is held) clears only once sendReply has returned — by then the
 * pending reply guards a double send, so no gap lets a second approve through — or after COMPACT_TIMEOUT_MS, when
 * the reply goes back in the box and is never sent on its own. Both flags are set inside the try, so a clock that
 * refuses the give-up timer never leaves them stuck: the compaction runs without a ceiling. A failed compaction
 * still sends; a failed send is put back by sendReply. Never loses the reply. Resolves whether it compacted, even
 * when it settles after the give-up.
 */
async function compactThenSend($: Dollar, r: FlightReq, reply: HeldReply): Promise<boolean>
async function compactThenSend($: Dollar, r: FlightReq | null, reply: null): Promise<boolean>
async function compactThenSend($: Dollar, r: FlightReq | null, reply: HeldReply | null): Promise<boolean> {
  if (compacting || compactInFlight) {
    if (reply?.via === 'typed') { refill($, reply.text); $.ui.toast('still compacting — your reply is back in the box') }
    else $.ui.toast('still compacting — try again when it ends')
    return false
  }
  const hold = { settled: false, gaveUp: false } // a box: the timer reads and writes it too
  let timer: { cancel: () => void } | null = null
  let res: { ok: boolean; why?: string }
  let done = false
  try {
    compacting = true
    compactInFlight = true
    try {
      timer = $.clock.after(COMPACT_TIMEOUT_MS, () => {
        if (hold.settled) return
        hold.gaveUp = true // the deck is free again for replies; the engine's compaction may still finish
        compacting = false
        if (reply) { refill($, reply.text); $.ui.toast('compaction is taking too long (it may still finish) — your reply is back in the box') }
        else $.ui.toast('compaction is taking too long — it may still finish')
      })
    } catch {} // no timer: the compaction still runs and the reply still goes out, just without the give-up
    res = await compactNow($, r)
    done = true
  } finally {
    hold.settled = true
    compactInFlight = false
    timer?.cancel()
    if (!done) compacting = false // nothing to send: never leave the hold up behind a throw
  }
  if (hold.gaveUp) return res.ok // a late settle: never sends, but says whether it compacted (compacting was cleared at the give-up)
  try {
    if (!reply || !r) {
      if (!res.ok) $.ui.toast(`not compacted${res.why ? ` (${clip(res.why, 60)})` : ''}`)
      return res.ok
    }
    if (!res.ok) $.ui.toast(`not compacted — sent as is${res.why ? ` (${clip(res.why, 60)})` : ''}`)
    await sendReply($, r, reply.text, reply.options, reply.via)
  } finally {
    compacting = false // the reply is pending (or back in the box): from here the pending reply guards a double send
  }
  return res.ok
}

type Els = ReturnType<Dollar['ui']['resolve']>

/** The header's context ring, `◔ 42%`: amber at or above *compact at*; a plain button, no key. Nothing while the percent is unknown. */
function ringOf($: Dollar, els: Els, pct: number | null, compactAt: number, r: FlightReq | null) {
  if (pct === null) return null
  const { Button, Text } = els
  return (
    <Button key="ring" plain onPress={() => void pressRing($, r).catch(() => {})}>
      <Text color={pct >= compactAt ? C.amber : undefined}>{`${ringGlyph(pct)} ${Math.round(pct)}%`}</Text>
    </Button>
  )
}

/**
 * The header's context ring, pressed: compact now, with the REQ's brief when one is flown, a bare compact otherwise.
 * Always the person's own choice, so `compact: never` does not stop it. Mid-turn the engine would reject it: say so.
 */
async function pressRing($: Dollar, r: FlightReq | null) {
  if (busy) { $.ui.toast('Claude is working — compact when the turn ends'); return }
  if (await read($, pendingA)) { $.ui.toast('a reply is on its way — compact when its turn ends'); return }
  await compactThenSend($, r, null)
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
    // The heartbeat: 4 Hz only while an agent lane is running (its spinner and clock move). While only
    // gates wait, `now` moves at most once a minute — enough for a `gate 2h` age; a landed lane is let go
    // after LINGER_MS, checked once a second. A 15 s rescan also catches edits made outside Claude.
    let beats = 0
    $.clock.every(250, () => {
      beats += 1
      void (async () => {
        const lanes = await read($, lanesA)
        const running = lanes.some(l => l.endedAt === null)
        if (running || beats % 4 === 0) {
          const now = await $.clock.now()
          const waiting = (await read($, deckA)).reqs.some(r => r.waiting)
          if (running || (waiting && now - (await read($, nowA)) >= GATE_TICK_MS)) await update($, nowA, () => now)
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
      if (r) {
        // A reply held for compaction is still waiting: nothing typed may overtake it. Put it back.
        if (compacting) {
          refill($, e.text)
          return { drop: 'still compacting — your reply is back in the box' }
        }
        const options = await gateOptions($, r)
        // Auto compact: hold a typed approve, compact, then send it ourselves. Only when the session
        // is idle (mid-turn the engine queues it) and no reply is pending. No round recorded here:
        // sendReply records the one round when it resends.
        if (!busy && !(await read($, pendingA))) {
          const settings = { ...DEFAULTS, ...(await read($, settingsA)) }
          const pct = settings.autoCompact === 'past' ? await contextPercent($) : null
          if (autoCompactApplies(settings, pct, e.text, r.phase, 'typed')) {
            // A compaction given up on may still be running in the engine: no second one on top of it.
            if (compactInFlight) {
              refill($, e.text)
              return { drop: 'still compacting — your reply is back in the box' }
            }
            const reply: HeldReply = { text: e.text, options, via: 'typed' }
            // `compacting` is set inside: a refused timer leaves nothing stuck.
            $.clock.after(0, () => { void compactThenSend($, r, reply).catch(() => {}) })
            return { drop: 'compacting first — your reply follows' }
          }
        }
        await recordRound($, r, e.text, options, /\[flightdeck\]/.test(e.text) ? 'pane' : 'typed')
      }
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
    // 0.8.1: the band composes. What the other plugins and the engine draw here comes back from `next` and is
    // drawn last, under the flightdeck: the flightdeck keeps its rows (the gate's options sit near the top of
    // the engine's window), and nothing another mod contributes to the band is dropped.
    const below = await next(e).catch(() => null) // nothing beneath (a test with no engine stand-in) draws nothing
    const layout = await read($, layoutA)
    if (layout.height !== 'band') return cockpit($, e, layout.height, below)
    // In flight: the strip's REQs (started, not at their last phase or waiting at a gate), plus the one this session flies if it is too.
    const strip = await read($, stripA)
    const focus = await read($, focusA)
    const flying = strip.filter(x => x.here && !x.ended).map(x => x.id)
    const showAll = (await read($, settingsA)).showAll
    if (focus && !flying.includes(focus) && (showAll ? deck.reqs : inFlight(deck.reqs)).some(r => r.id === focus)) flying.unshift(focus)
    const flyingReqs = flying.map(id => deck.reqs.find(r => r.id === id)).filter((r): r is FlightReq => !!r)
    const r = flyingReqs.find(x => x.id === focus) ?? flyingReqs.find(x => x.waiting) ?? flyingReqs[0]
    if (!r) { if (below) return below; const { Box: Empty } = $.ui.resolve(e); return <Empty /> } // nothing beneath, nothing in flight: an empty band
    const lanes = await read($, lanesA)
    const now = (await read($, nowA)) || (await $.clock.now())
    const els = $.ui.resolve(e)
    const { Box, Text, Button } = els
    const settings = { ...DEFAULTS, ...(await read($, settingsA)) }
    const pct = await contextPercent($) // the ring: every height, not only at a gate
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
    const row = (
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
          {pct !== null ? <Text> </Text> : null}
          {ringOf($, els, pct, settings.compactAt, r)}
          {r.waiting && !seen && !e.props.isWorking && <Text> </Text>}
          {r.waiting && !seen && !e.props.isWorking && (
            <Button key={`resume-${r.id}`} plain label="resume"
              onPress={() => void $.prompt.submit({ text: `/${r.kind === 'bug' ? 'bugfix' : 'proceed'} ${r.id}` })} />
          )}
          <Text> </Text>
          <Button key="expand" plain label="⤢" onPress={open} />
        </Box>
      </Box>
    )
    return below ? <Box flexDirection="column">{row}{below}</Box> : row
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
    const toDebrief = /^debrief\b/.test(args) // `/flight debrief [id]`: the REQ's debrief view, over its phase page
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
      sub: toDebrief ? { kind: 'debrief' } : { kind: 'page' },
      home: !phaseTab && !toDebrief, // narrow: the list home first, unless a phase (or the debrief) was named
    }))
    if (focus) void refreshGit($, focus, true).catch(() => {})
    // History opens on the REQ in view: scroll its row into the band's window once it is drawn.
    if (tab === 'history' && focus) $.clock.after(120, () => { void $.ui.scroll({ to: { key: `hist-${focus}` }, block: 'center' }).catch(() => {}) })
    if ((await read($, layoutA)).height === 'band') await setHeight($, 'open')
    return { text: toDebrief ? 'Debrief open in the flightdeck above the prompt.' : 'Flightdeck open above the prompt.' }
  })
}


// ---------- agent numbers: the place in `$.agent.list()` ----------

async function agentPlaces($: Dollar): Promise<Map<string, number> | null> {
  const now = await $.clock.now()
  if (now - agentsSeen.at < AGENTS_EVERY_MS && agentsSeen.at > 0) return agentsSeen.places
  agentsSeen = { at: now, places: agentsSeen.places }
  try {
    const list = await $.agent.list()
    agentsSeen = { at: now, places: new Map(list.map((a, i) => [a.id, i + 1])) }
  } catch {
    agentsSeen = { at: now, places: null } // no list: rows go unnumbered
  }
  return agentsSeen.places
}

/** A lane's number: its place in the list, else the last one it was drawn with (dropped). Null when the list failed. */
function laneNo(places: Map<string, number> | null, id: string): { n: number; dropped: boolean } | null {
  if (!places) return null
  const n = places.get(id)
  if (n !== undefined) {
    lastPlace.delete(id) // re-set below so the map stays in drawn order and the oldest goes first
    lastPlace.set(id, n)
    if (lastPlace.size > 64) lastPlace.delete(lastPlace.keys().next().value as string)
    return { n, dropped: false }
  }
  const last = lastPlace.get(id)
  return last === undefined ? null : { n: last, dropped: true }
}


// ---------- the cockpit: the band, opened ----------
// One tree in the AbovePrompt band, laid out as the flightdeck mockup draws it:
//   level 1   ✈ the in-flight REQs as chips · the context ring · history · settings · ⤢ · ×
//   level 2   the five phase tabs, a one-line status under each from 110 columns, a rule (narrow: the list home)
//   the page  GATE first — its state, and at an open gate the summary, the options, the consequence of the
//             recommended one and compact first — then the phase's evidence, one titled block each, a blank row apart.
// Called by the band's render hook when the height is open or max.

/** The mockup's palette, as theme keys so light and dark themes both hold. */
const C = { v: 'autoAccept', amber: 'warning', ok: 'success', link: 'suggestion', red: 'error', faint: 'inactive', dim: 'subtle' } as const

// ----- the debrief view (0.10.0): debrief.md, as core/skills/debrief.md writes it -----
// Theme keys only, and never the mod's accent (`autoAccept`): permission for the title, suggestion for links,
// warning for ◇ and the gaps, subtle bold for heads, inactive for rules.

/** What the reader condition sets: cold the full story, warm the delta, a handover files first. Read from the head, never recomputed. */
const DEBRIEF_DEPTH: Record<DebriefReader, string> = { cold: 'full story', warm: 'the delta', handover: 'files first' }
const DEBRIEF_READER_TONE: Record<DebriefReader, string> = { cold: 'warning', warm: 'success', handover: 'permission' }
/** Below 84 columns a head keeps its first words. */
const DEBRIEF_SHORT: Record<string, string> = { 'WHAT WAS CHECKED': 'CHECKED', 'WHAT TO WATCH': 'WATCH', 'SAY IT TO YOUR LEAD': 'SAY IT', 'QUESTIONS YOU MAY GET': 'QUESTIONS' }
const NO_DEBRIEF = 'no debrief here yet — /debrief writes one (the working set is local to whoever ran the pipeline)'
const DEBRIEF_GUTTER = 18 // the heads' column from 84 columns
const FOLD_MAX = 8 // rows an unfolded section shows below 84 columns: nothing scrolls inside the band, so the options after it stay on screen
const STORY_TONE = { ok: 'success', warn: 'warning', ask: 'warning', crit: 'error', plain: undefined } as const
const STORY_ID = /\b(?:ADR-\d+|TASK-\d+|[CMm]\d+)\b/g

/** Word-wraps `text` to `w` columns, so two columns can be drawn row by row with one rule between them. */
function wrapTo(text: string, w: number): string[] {
  const out: string[] = []
  let cur = ''
  for (const word of text.split(/\s+/).filter(Boolean)) {
    let rest = word
    while (rest.length > w) { if (cur) { out.push(cur); cur = '' } out.push(rest.slice(0, w)); rest = rest.slice(w) }
    if (!rest) continue
    if (!cur) cur = rest
    else if (cur.length + 1 + rest.length <= w) cur += ` ${rest}`
    else { out.push(cur); cur = rest }
  }
  if (cur) out.push(cur)
  return out
}

/** A story line as spans with their theme keys: ✓ success, ⚠ and ? warning, critical error, pointers and ids suggestion. */
function storySpans(line: string): { text: string; color?: string }[] {
  const out: { text: string; color?: string }[] = []
  for (const m of markSpans(plainMd(line))) {
    if (m.tone !== 'plain') { out.push({ text: m.text, color: STORY_TONE[m.tone] }); continue }
    for (const p of pointerSpans(m.text)) {
      if (p.path !== undefined) { out.push({ text: p.text, color: C.link }); continue }
      let last = 0
      for (const x of p.text.matchAll(STORY_ID)) {
        if ((x.index ?? 0) > last) out.push({ text: p.text.slice(last, x.index) })
        out.push({ text: x[0], color: C.link })
        last = (x.index ?? 0) + x[0].length
      }
      if (last < p.text.length) out.push({ text: p.text.slice(last) })
    }
  }
  return out
}

/** `names 1 of 3 files` and the changed files the summary never names, by summaryGaps' rule (evidence.ts). */
function gapsOf(summary: string, rows: PlanRow[]): { named: string; missed: string } | null {
  const total = rows.filter(r => r.touched).length
  if (!total) return null
  const { mentioned, missed } = summaryGaps(summary, rows)
  return { named: `names ${mentioned.length} of ${total} file${total === 1 ? '' : 's'}`, missed: missed.length ? `not mentioned: ${missed.map(baseName).join(', ')}` : '' }
}

/** The one-line gist a folded section shows below 84 columns. */
function debriefGist(d: Debrief, label: string, summary: string | null, gaps: { named: string } | null): string {
  const lines = (d.sections.find(s => s.label === label)?.lines ?? []).filter(l => !/^\s*```/.test(l)).map(l => plainMd(l.trim()))
  if (label === 'WHAT CHANGED') {
    const planned = d.files.filter(f => f.planned).length
    return `${d.files.length} file${d.files.length === 1 ? '' : 's'} · ◆ ${planned} planned ◇ ${d.files.length - planned}`
  }
  if (label === 'SAY IT TO YOUR LEAD') {
    const yours = summary ? (gaps ? ` · yours ${gaps.named.replace(/^names (\d+) of (\d+).*$/, 'names $1/$2')}` : ' · yours is in') : ' · no summary of yours yet'
    return `${lines.length} line${lines.length === 1 ? '' : 's'} for your ${d.head?.forWho || 'lead'}${yours}`
  }
  if (label === 'QUESTIONS YOU MAY GET') return [String(lines.length), ...lines.map(l => l.replace(/^Q\s+/, '').replace(/\s*→.*$/, ''))].join(' · ')
  if (label === 'WHAT TO WATCH' && lines.length > 1) return `${lines.length} · ${lines[0]}`
  return lines[0] ?? ''
}

async function cockpit($: Dollar, e: RenderInput<'AbovePrompt'>, height: 'open' | 'max', below: unknown = null) {
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
  const diffAt = await read($, diffA)
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
  // `narrow` is derived here and never written back: a render only reads (0.8.1; `layout.narrow` is no longer kept).

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
    if (r && !gitAll[id]) void refreshGit($, id).catch(() => {}) // first look at it: git is asked from the press, not the draw
  }
  // The gate's options take their letters (OPTION_KEYS) only while the open gate's page is on screen.
  // The debrief view draws the live gate's options after the story, so they take their letters there too.
  const gateOnScreen = !!live?.waiting && (view.sub.kind === 'debrief' || (view.sub.kind === 'page' && (view.tab === live.phase) && !(narrow && view.home !== false)))
  // Asked on every draw (cached 5 s): the header's ring shows it at any height. The gate page still hides its own line on `never`.
  const usagePct = await contextPercent($)
  const places = await agentPlaces($) // read, never written: lane numbers are worked out here
  const numOf = (id: string) => {
    const no = laneNo(places, id)
    return no ? <Text dimColor={no.dropped}>#{no.n} </Text> : null
  }
  const ringReq = deck.reqs.find(r => r.id === focus) ?? live
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
  /** `key` is the caller's, unique to where the link stands (0.8.1: one path in two blocks no longer shares a key). */
  const ref = (key: string, path: string, line?: number, label?: string) => {
    const abs = absPath(root, path)
    const text = label ?? (line ? `${path}:${line}` : path)
    if (isTerminal) return <Link href={editorHref(settings.editorUri, abs, line)}>{text}</Link>
    return <Button key={`ref-${key}`} plain label={text}
      onPress={() => void $.process.run(['code', '-g', `${abs}:${line ?? 1}`], { timeoutMs: 8000 }).catch(() => {})} />
  }
  /**
   * A list row's path, clipped to `room`; while the pointer rests on it, a card above shows the whole
   * path. A desktop's button clips its own label, so there the card is drawn for every path.
   */
  const pathCell = (scope: string, path: string, room: number) => {
    const shown = clip(path, room)
    return (
      <Box key={`${scope}path-${pathKey(path)}`} flexGrow={1}>
        <Box flexGrow={1} overflow="hidden">{ref(`${scope}${pathKey(path)}`, path, undefined, shown)}</Box>
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
  const diffCell = (scope: string, t: FlightTouched | null, path: string) => {
    if (!t) return faint('—')
    const body = t.status === '?' || (t.status === 'A' && !t.add) ? [<Text color={C.ok}>new</Text>]
      : t.status === 'D' ? [<Text color={C.red}>deleted</Text>]
      : [<Text color={C.ok}>+{t.add}</Text>, <Text> </Text>, <Text color={C.red}>−{t.del}</Text>]
    return <Button key={`${scope}diff-${pathKey(path)}`} plain onPress={() => void openDiff($, reqId ?? '', path).catch(() => {})}>{body as never}</Button>
  }
  /** ◉ viewed (the blob still matches), ~ changed since, ○ not yet; pressed, toggles the mark. */
  const viewedMark = (scope: string, path: string) => {
    const k = pathKey(path)
    const hash = g?.hashes[k]
    const mark = marks?.[k]
    const seen = !!mark && mark === hash
    const stale = !!mark && !seen
    return (
      <Button key={`${scope}seen-${k}`} plain onPress={() => void (seen ? unmarkViewed($, reqId ?? '', path) : markViewed($, reqId ?? '', path, hash))}>
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
    const room = W - 2 - (narrow ? 14 : 30) - (usagePct !== null ? RING_W : 0) - (narrow ? 7 : 12) // ✈, the right-hand controls (the ring too), the `+n more ▾` chip
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
          {ringOf($, els, usagePct, settings.compactAt, ringReq)}
          {usagePct !== null ? faint(' · ') : null}
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
  /** The rounds that answered the gate: predict, summary and debrief are asks, never gate rounds. */
  const gateRounds = (c: PhaseCtx) => c.rounds.filter(r => r.decision !== 'predict' && r.decision !== 'summary' && r.decision !== 'debrief')
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
              <Button key={`home-${p.n}`} plain dimColor={p.n !== tabN} {...(p.state === 'gate' ? { autoFocus: true as const } : {})}
                onPress={() => go(p.n as FlightTab)}>
                <Text color={p.n === tabN ? C.v : undefined}>{p.n} {p.name}</Text>
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
   * The gate's options inline, `a: fix all (recommended)`, the recommended one in the accent; under them the
   * consequence of the recommended one, then `[ ⟳ compact first ]` with the context fill. An option that takes
   * an argument (`fix <ids>`, `revise <what>`) fills the prompt with its head for you to finish.
   * `accent`: the recommended option's colour — the debrief view passes `permission` (it never uses the mod's accent).
   */
  const gateCard = (c: PhaseCtx, accent: string = C.v) => {
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
      // A held typed approve goes first: nothing pressed may overtake it.
      if (compacting) { $.ui.toast('still compacting — your held reply goes first'); return }
      const text = replyFor(o, null, c.n, viewedArg)
      void (async () => {
        if (await read($, pendingA)) return // a reply already on its way: one click, one reply
        // The toggle, or auto compact on an approve. A failed compaction never holds the reply back.
        if ((compactFirst && mode !== 'never') || autoCompactApplies(settings, usagePct, o.label, c.n)) {
          const compacted = await compactThenSend($, live, { text, options, via: 'pane' })
          if (compacted && compactFirst) await update($, layoutA, l => ({ ...l, compactFirst: false })).catch(() => {})
          return
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
              // Keyed by the option's head (its identity at this gate, not its changing text); a head two options share gets its place.
              const head = optionHead(o.label)
              const optKey = options.findIndex(x => optionHead(x.label) === head) === i ? `opt-${head}` : `opt-${head}-${i}`
              return (
                <Box marginRight={2} flexShrink={0}>
                  <Button key={optKey} plain {...(hotkey ? { hotkey } : {})} dimColor={dimAll || !!pending} onPress={() => choose(o)}>
                    <Text color={o.recommended ? accent : undefined}>{o.label}{o.recommended ? ' (recommended)' : ''}</Text>
                  </Button>
                </Box>
              )
            })}
          </Box>
        )}
        {shownCons?.consequence ? <Text color={C.dim} wrap="truncate"><Text color={C.faint}>{gateOnScreen && OPTION_KEYS[recI] ? `${OPTION_KEYS[recI]} ` : ''}→</Text> {shownCons.consequence}</Text> : null}
        {source === 'standard' ? faint('the phase’s standard options — this gate’s marker lists none') : null}
        {mode !== 'never' && options.length ? (
          <Box flexDirection="row" flexWrap="wrap">
            <Button key="compact-first" plain dimColor={dimAll || (mode === 'suggest' && !hotCtx && !compactFirst)}
              onPress={() => void update($, layoutA, l => ({ ...l, compactFirst: !l.compactFirst })).catch(() => {})}>
              <Text color={C.faint}>[</Text><Text color={compactFirst ? accent : undefined}>⟳ compact first</Text><Text color={C.faint}>]</Text>
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

  /**
   * The GATE line — awaiting, sent, cleared, in progress or not reached — and, at an open gate, its card.
   * A REQ's line ends in `debrief ›` (click-only), which opens the debrief view; that view draws the block without it.
   */
  const gateBlock = (c: PhaseCtx, { link = true, accent = C.v }: { link?: boolean; accent?: string } = {}) => {
    const st_ = c.p?.state ?? 'todo'
    const rounds = gateRounds(c)
    const last = rounds[rounds.length - 1]
    const toDebrief = link && kind === 'req' ? (
      <Box flexShrink={0} marginLeft={2}>
        <Button key="gate-debrief" plain onPress={() => sub({ kind: 'debrief' })}><Text color={C.link}>debrief ›</Text></Button>
      </Box>
    ) : null
    const line = (glyph: string, color: string, text: string) => {
      const said = <Text wrap="truncate"><Text bold>GATE</Text> <Text color={color}>{glyph}</Text> <Text color={st_ === 'gate' ? undefined : C.dim}>{text}</Text></Text>
      return toDebrief ? <Box flexDirection="row"><Box flexShrink={1} overflow="hidden">{said}</Box>{toDebrief}</Box> : said
    }
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
          {gateCard(c, accent)}
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
        <Text wrap="truncate"><Text color={C.link}>{spinFrame(now)}</Text> {numOf(l.id)}{l.agent}{l.task ? ` · ${l.task}` : ''} <Text color={C.faint}>· {clock(now - l.startedAt)} ·</Text> {l.doing}</Text>
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
            <Cell w={3}>{viewedMark('', r.path)}</Cell>
            {pathCell('files-', r.path, W - 20 - cols.length * 4)}
            {cols.map(t => <Cell w={4}><Text color={r.tasks.includes(t.id) ? C.link : C.faint}>{r.tasks.includes(t.id) ? '●' : '·'}</Text></Cell>)}
            <Cell w={12}>{diffCell('', r.touched, r.path)}</Cell>
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
      const where = f.where ? (m ? ref(`find-${f.id}`, m[1] ?? f.where, Number(m[2]), clip(f.where, wW - 2)) : ref(`find-${f.id}`, f.where, undefined, clip(f.where, wW - 2))) : faint('—')
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
        <Cell w={3}>{r.touched ? viewedMark('plan-', r.path) : faint(' ')}</Cell>
        {pathCell('plan-', r.path, W - 32)}
        <Cell w={12}><Text color={r.planned && r.touched ? C.faint : C.amber}>{!r.planned ? 'surprise' : !r.touched ? 'not touched' : 'planned'}</Text></Cell>
        <Cell w={12}>{diffCell('plan-', r.touched, r.path)}</Cell>
      </Box>
    )))

  /** Plan vs actual for the REQ: what the ship tab and the debrief count changed files and +/- from. */
  const changedRows = async (): Promise<PlanRow[]> => {
    const arch = folder ? await cached($, `${folder}/${kind === 'bug' ? 'investigation.md' : 'architecture.md'}`) : null
    return planVsActual(blastRadius(arch), await tasksOf($, folder), g?.touched ?? [])
  }
  /** debrief.md, parsed; null when the REQ has none (a BUG never has one). */
  const debriefOf = async (): Promise<{ md: string; d: Debrief } | null> => {
    const md = folder && kind === 'req' ? await cached($, `${folder}/debrief.md`) : null
    return md === null ? null : { md, d: parseDebrief(md) }
  }
  /** The ship round where /wrapup records your own summary (`--decision summary`); a skip is none. */
  const yourSummary = () => { const s = roundOf(ctxOf(5).rounds, 'summary'); return s && !/^skip\b/i.test(s) ? s : null }

  /** The ship tab's DEBRIEF: IN ONE BREATH, then the reader and `open ›`. */
  const debriefSec = async () => {
    if (kind !== 'req') return null
    const got = await debriefOf()
    const hd = got?.d.head ?? null
    const breath = (got?.d.sections.find(s => s.label === 'IN ONE BREATH')?.lines ?? []).map(l => plainMd(l.trim())).join(' ')
    return Sec('DEBRIEF', hd ? `${hd.reader} reader → ${DEBRIEF_DEPTH[hd.reader]}` : null,
      !got ? dim(NO_DEBRIEF) : breath ? <Text wrap="truncate">{breath}</Text> : faint('no IN ONE BREATH yet — run /debrief'),
      got ? (
        <Box flexDirection="row">
          <Box flexGrow={1} flexShrink={1} overflow="hidden">
            <Text color={C.dim} wrap="truncate">{hd ? `for: ${hd.forWho} · reader: ${hd.reader}${hd.why ? ` — ${hd.why}` : ''}` : 'no head line — the reader condition is unknown'}</Text>
          </Box>
          <Box flexShrink={0} marginLeft={2}>
            <Button key="ship-debrief" plain onPress={() => sub({ kind: 'debrief' })}><Text color={C.link}>open ›</Text></Button>
          </Box>
        </Box>
      ) : null)
  }

  const shipPage = async () => {
    const rows = await changedRows()
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
      await debriefSec(),
      Sec('WHAT APPROVING SETS IN MOTION', null,
        cons.length === 0 ? dim('no drafts on disk yet — wrapup writes commits-draft.md, pr-draft.md and merge-checklist.md') : null,
        ...cons.map((x, i) => (
          <Box flexDirection="row"><Cell w={3}>{faint(String(i + 1))}</Cell><Box flexGrow={1}><Text color={x.tone === 'warn' ? C.amber : undefined} wrap="wrap">{x.text}</Text></Box></Box>
        ))),
      Sec('DIFFSTAT', `${touched.length} file${touched.length === 1 ? '' : 's'} · +${adds} −${dels}${g?.baseName ? ` · vs ${g.baseName}` : ''}`,
        touched.length === 0 ? dim(g ? 'the tree matches the base' : 'asking git…') : null,
        ...touched.map(r => (
          <Box flexDirection="row">
            <Box flexGrow={1} overflow="hidden">{ref(`stat-${pathKey(r.path)}`, r.path, undefined, clip(r.path, W - barW - 12))}</Box>
            <Cell w={6}>{faint(String((r.touched?.add ?? 0) + (r.touched?.del ?? 0)))}</Cell>
            <Cell w={barW}><Button key={`bar-${pathKey(r.path)}`} plain onPress={() => void openDiff($, reqId ?? '', r.path).catch(() => {})}>{plusMinus(r.touched?.add ?? 0, r.touched?.del ?? 0)}</Button></Cell>
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
      const blocks = ['BEHAVIOUR · ACCEPTANCE CRITERIA', 'YOU SAID · CLAUDE FOUND · TASKS', 'FILES', 'FINDINGS · ACCEPTANCE CRITERIA · PLAN VS ACTUAL',
        `${kind === 'req' ? 'DEBRIEF · ' : ''}WHAT APPROVING SETS IN MOTION · DIFFSTAT`][n - 1] ?? ''
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
  /** `right`: drawn at the far end of the row; `lead`: drawn just before the title (a lane's `#n`). */
  /** `tone`: the title's colour — the debrief view passes `permission`, never the accent. */
  const header = (title: string, { right = null, lead = null, tone = C.v }: { right?: unknown; lead?: unknown; tone?: string } = {}) => (
    <Box flexDirection="row" justifyContent="space-between">
      <Box flexDirection="row" flexShrink={1}><Button key="back" plain label="‹ back" onPress={back} /><Text>  </Text>{lead as never}<Text bold color={tone} wrap="truncate">{title}</Text></Box>
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
        {header(title, { right: text !== null ? ref('open-editor', path, undefined, 'open in editor ↗') : null })}
        <Box marginTop={1} flexDirection="column" paddingLeft={2}>
          {listing ? listing.map(f => <Button key={`doc-file-${f}`} plain label={f} onPress={() => sub({ kind: 'doc', path: `${path}/${f}`, title: f })} />) : null}
          {text !== null ? <Markdown key={`doc-${path}`} text={text} /> : listing ? null : dim('could not read that file')}
        </Box>
      </Box>
    )
  }

  /**
   * One file's change against the base, unified. 0.8.1: drawn from `diff`, which the press that opened it filled
   * (`openDiff`: git is asked, and the file marked viewed, there); this render only reads.
   */
  const diffView = (path: string) => {
    const k = pathKey(path)
    const d = diffAt && diffAt.req === reqId && pathKey(diffAt.path) === k ? diffAt : null
    const source = d?.source ?? null
    const isNew = !!d?.isNew
    const seen = !!marks?.[k] && marks[k] === g?.hashes[k]
    return (
      <Box flexDirection="column">
        {header(clip(path, W - 40), { right: <Box flexDirection="row">{ref('open-editor', path, undefined, 'open in editor ↗')}<Text>  </Text><Text color={seen ? C.ok : C.amber}>{seen ? '◉ viewed' : 'marking viewed'}</Text></Box> })}
        <Box paddingLeft={2}>{faint(`${isNew ? 'new file' : `vs ${g?.baseName ?? 'HEAD'}`}${g?.authors[k] ? ` · last: ${g.authors[k]}` : ''}${source && source.length >= DIFF_MAX ? ' · cut at 90KB' : ''}`)}</Box>
        <Box marginTop={1}>
          {!d ? dim('reading the diff…') : source === null ? dim('git could not show that file') : isNew ? <Code source={source} path={path} startLine={1} /> : source.trim() ? <Code source={source} format="diff" path={path} /> : dim('no difference against the base')}
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

  /**
   * The debrief: the REQ's story in review order, then — at an open gate — the GATE line and its options, last.
   * ≥110 the Debrief board: heads in an 18-column gutter, files `mark · path · what · why`, SAY IT │ YOUR SUMMARY.
   * 84–109 the same story in one column; the files drop `why`, YOUR SUMMARY sits under SAY IT.
   * <84 the DebriefNarrow board: one row per section (head · gist · ›), one unfolded in place and capped at
   * FOLD_MAX rows, files `mark · path · +/-`. Probe P10 found the band does not pin (architecture.md → Probe
   * result): nothing scrolls inside the band, so the narrow list keeps the view short and the options follow it.
   */
  const debriefView = async () => {
    const got = await debriefOf()
    const d = got?.d ?? null
    const hd = d?.head ?? null
    const wide = !narrow && e.props.bodyColumns >= STATUS_AT
    const rows = await changedRows()
    const summary = yourSummary()
    const gaps = summary ? gapsOf(summary, rows) : null
    const gateC = live?.waiting ? ctxOf(live.phase) : null
    const options = gateC ? <Box flexDirection="column" marginTop={1}>{rule()}{gateBlock(gateC, { link: false, accent: 'permission' })}</Box> : null
    const top = header(`DEBRIEF${hd ? ` · for: ${hd.forWho}` : ''}`, {
      tone: 'permission',
      right: hd ? <Text><Text color={DEBRIEF_READER_TONE[hd.reader]}>{hd.reader}</Text><Text color={C.dim}> reader → {DEBRIEF_DEPTH[hd.reader]}</Text></Text> : null,
    })
    if (!d) return <Box flexDirection="column">{top}<Box marginTop={1} paddingLeft={2}>{dim(NO_DEBRIEF)}</Box>{options}</Box>

    const evidence = hd ? [hd.why, hd.written ? `written ${when(hd.written)}${hd.sha ? ` at ${hd.sha}` : ''}` : ''].filter(Boolean).join(' · ') : 'no head line — the reader condition is unknown; run /debrief'
    const labels = DEBRIEF_LABELS.filter(l => d.sections.some(s => s.label === l))
    const linesOf = (label: string) => d.sections.filter(s => s.label === label).flatMap(s => s.lines)
    const missing = DEBRIEF_LABELS.length - labels.length
    const hint = labels.length === 0 ? dim('debrief.md has none of the eight sections yet — run /debrief')
      : missing ? faint(`${labels.length} of ${DEBRIEF_LABELS.length} sections · run /debrief to write the rest`) : null
    const story = (line: string, wrap: 'wrap' | 'truncate' = 'wrap') => <Text wrap={wrap}>{storySpans(line).map(sp => <Text color={sp.color}>{sp.text}</Text>)}</Text>
    /** A path cut from the left, so the file name survives. */
    const clipLeft = (s: string, n: number) => (s.length > n ? `…${s.slice(s.length - n + 1)}` : s)
    const touchedOf = (path: string) => { const k = pathKey(path); return (g?.touched ?? []).find(t => pathKey(t.path) === k || pathKey(t.path).endsWith(`/${k}`)) ?? null }
    const markOf = (f: Debrief['files'][number]) => (f.planned ? <Text>◆</Text> : <Text color={C.amber}>◇</Text>)
    const planned = d.files.filter(f => f.planned).length
    const counted = d.files.length ? (
      <Text><Text color={C.faint}>{d.files.length} file{d.files.length === 1 ? '' : 's'} · </Text><Text>◆ {planned} planned</Text><Text color={C.faint}> · </Text><Text color={C.amber}>◇ {d.files.length - planned} unplanned</Text></Text>
    ) : null
    const say = linesOf('SAY IT TO YOUR LEAD').map(l => plainMd(l.trim()))
    /** YOUR SUMMARY's rows: the summary, then what it names and the gaps (warning). */
    const yours = (w: number): { text: string; color?: string }[] => [
      ...(summary ? wrapTo(`“${summary}”`, w).map(text => ({ text })) : [{ text: 'no summary recorded — /wrapup asks for yours at ship', color: C.dim }]),
      ...(gaps ? [{ text: gaps.named, color: C.dim }, ...(gaps.missed ? wrapTo(gaps.missed, w).map(text => ({ text, color: C.amber })) : [])] : []),
    ]
    const showSay = say.length > 0 || !!summary

    // ----- below 84 columns: the sections as a list, one unfolded -----
    if (narrow) {
      const fold = view.sub.kind === 'debrief' ? view.sub.open ?? 'WHAT CHANGED' : ''
      const inner = W - 4
      const gistW = W - 14 - 2
      const capped = (items: unknown[]) => items.length > FOLD_MAX ? [...items.slice(0, FOLD_MAX), faint(`… ${items.length - FOLD_MAX} more — widen to 84+ cols or open debrief.md`)] : items
      const plainRows = (lines: string[]) => lines.filter(l => !/^\s*```/.test(l)).flatMap(l => wrapTo(plainMd(l), inner)).map(l => story(l, 'truncate'))
      const unfolded = (label: string): unknown[] => {
        if (label === 'WHAT CHANGED') {
          // Fences are drawn from 84 columns; here the rail lines and the files.
          const lines: string[] = []
          let fenced = false
          for (const l of linesOf(label)) { if (/^\s*```/.test(l)) { fenced = !fenced; continue } if (!fenced) lines.push(l) }
          return [
            ...plainRows(lines),
            ...(d.files.length ? [
              <Box flexDirection="row"><Cell w={2}><Text> </Text></Cell><Box flexGrow={1}>{faint('file')}</Box><Cell w={12}>{faint('+/-')}</Cell></Box>,
              ...d.files.map(f => {
                const t = touchedOf(f.path)
                return (
                  <Box flexDirection="row">
                    <Cell w={2}>{markOf(f)}</Cell>
                    <Box flexGrow={1} flexShrink={1} overflow="hidden">{ref(`debrief-n-${pathKey(f.path)}`, f.path, f.line, clipLeft(f.path, inner - 16))}</Box>
                    <Cell w={12}>{diffCell('debrief-', t, t?.path ?? f.path)}</Cell>
                  </Box>
                )
              }),
              <Text color={C.dim}>what · why dropped below 84 cols</Text>,
            ] : []),
          ]
        }
        if (label === 'SAY IT TO YOUR LEAD') {
          return [...plainRows(say), <Text bold color={C.dim}>YOUR SUMMARY</Text>,
            ...yours(inner).map(x => <Text color={x.color} wrap="truncate">{x.text}</Text>)]
        }
        return plainRows(linesOf(label))
      }
      const list = labels.map(label => {
        const open = fold === label
        return (
          <Box flexDirection="column">
            <Button key={`debrief-sec-${label.toLowerCase().replace(/\s+/g, '-')}`} plain
              onPress={() => sub({ kind: 'debrief', open: open ? '' : label })}>
              <Text bold color={C.dim}>{(DEBRIEF_SHORT[label] ?? label).padEnd(14)}</Text>
              <Text>{clip(debriefGist(d, label, summary, gaps), gistW - 1).padEnd(gistW - 1)}</Text>
              <Text color={C.dim}> {open ? '×' : '›'}</Text>
            </Button>
            {open ? <Box flexDirection="column" paddingLeft={2}>{capped(unfolded(label)) as never}</Box> : null}
          </Box>
        )
      })
      return (
        <Box flexDirection="column">
          {top}
          <Box paddingLeft={2}><Text color={C.dim} wrap="truncate">{evidence}</Text></Box>
          {rule()}
          {hint}
          {list as never}
          {options}
        </Box>
      )
    }

    // ----- from 84 columns: the story, heads in a gutter -----
    const CW = W - DEBRIEF_GUTTER
    const row = (label: string, ...children: unknown[]) => label.length >= DEBRIEF_GUTTER - 1 ? (
      <Box flexDirection="column">
        <Text bold color={C.dim}>{label}</Text>
        <Box flexDirection="column" paddingLeft={DEBRIEF_GUTTER}>{children as never}</Box>
      </Box>
    ) : (
      <Box flexDirection="row">
        <Cell w={DEBRIEF_GUTTER}><Text bold color={C.dim}>{label}</Text></Cell>
        <Box flexDirection="column" flexGrow={1} flexShrink={1}>{children as never}</Box>
      </Box>
    )
    /** A section's lines; a fence (at most one mermaid of five nodes, the skill's rule) as code. */
    const bodyOf = (lines: string[]) => {
      const out: unknown[] = []
      for (let i = 0; i < lines.length; i++) {
        const l = lines[i] ?? ''
        const fence = /^\s*```\s*(\S*)/.exec(l)
        if (!fence) { out.push(story(l)); continue }
        const src: string[] = []
        for (i++; i < lines.length && !/^\s*```/.test(lines[i] ?? ''); i++) src.push(lines[i] ?? '')
        out.push(<Code source={src.join('\n')} {...(fence[1] ? { language: fence[1] } : {})} />)
      }
      return out
    }
    const pW = Math.min(36, Math.floor(CW * (wide ? 0.34 : 0.45)))
    const wW = Math.floor((CW - 2 - pW) * 0.45)
    const fileTable = d.files.length === 0 ? [] : [
      wide ? (
        <Box flexDirection="row"><Cell w={2}><Text> </Text></Cell><Cell w={pW}>{faint('file')}</Cell><Cell w={wW}>{faint('what')}</Cell><Box flexGrow={1}>{faint('why')}</Box></Box>
      ) : (
        <Box flexDirection="row"><Cell w={2}><Text> </Text></Cell><Cell w={pW}>{faint('file')}</Cell><Box flexGrow={1}>{faint('what')}</Box></Box>
      ),
      ...d.files.map(f => {
        const label = f.line ? `${f.path}:${f.line}` : f.path
        return (
          <Box flexDirection="row">
            <Cell w={2}>{markOf(f)}</Cell>
            <Cell w={pW}><Box overflow="hidden">{ref(`debrief-${pathKey(label)}`, f.path, f.line, clipLeft(label, pW - 1))}</Box></Cell>
            {wide ? <Cell w={wW}><Text wrap="truncate">{plainMd(f.what) || ' '}</Text></Cell> : <Box flexGrow={1} flexShrink={1}><Text wrap="truncate">{plainMd(f.what) || ' '}</Text></Box>}
            {wide ? <Box flexGrow={1} flexShrink={1}><Text color={C.dim} wrap="truncate">{plainMd(f.why) || ' '}</Text></Box> : null}
          </Box>
        )
      }),
    ]
    /** ≥110: SAY IT TO YOUR LEAD │ YOUR SUMMARY, drawn row by row so the one rule runs between them. */
    const sayBeside = () => {
      const colW = Math.floor((W - 3) / 2)
      type Cel = { text: string; color?: string; head?: boolean }
      const left: Cel[] = [{ text: 'SAY IT TO YOUR LEAD', head: true }, ...say.flatMap(l => wrapTo(l, colW)).map(text => ({ text }))]
      const right: Cel[] = [{ text: 'YOUR SUMMARY', head: true }, ...yours(colW)]
      const cel = (x: Cel | undefined) => (x ? <Text bold={!!x.head} color={x.head ? C.dim : x.color} wrap="truncate">{x.text}</Text> : <Text> </Text>)
      return (
        <Box flexDirection="column">
          {Array.from({ length: Math.max(left.length, right.length) }, (_, i) => (
            <Box flexDirection="row"><Cell w={colW}>{cel(left[i])}</Cell><Text color={C.faint}> │ </Text><Box flexGrow={1} flexShrink={1}>{cel(right[i])}</Box></Box>
          ))}
        </Box>
      )
    }
    const sayBelow = () => [
      say.length ? row('SAY IT TO YOUR LEAD', ...say.map(l => story(l))) : null,
      row('YOUR SUMMARY',
        summary ? <Text wrap="wrap">“{summary}”</Text> : dim('no summary recorded — /wrapup asks for yours at ship'),
        gaps ? <Text wrap="wrap"><Text color={C.dim}>{gaps.named}</Text>{gaps.missed ? <Text color={C.amber}> · {gaps.missed}</Text> : null}</Text> : null),
    ]
    const blocks = DEBRIEF_LABELS.map(label => {
      if (label === 'SAY IT TO YOUR LEAD') return showSay ? (wide ? sayBeside() : sayBelow()) : null
      if (!labels.includes(label)) return null
      if (label === 'WHAT CHANGED') return row(label, counted, ...bodyOf(linesOf(label)), ...fileTable)
      return row(label, ...bodyOf(linesOf(label)))
    })
    return (
      <Box flexDirection="column">
        {top}
        <Box paddingLeft={2}><Text color={C.dim} wrap="truncate">{evidence}</Text></Box>
        {rule()}
        {d.before.map(l => faint(l)) as never}
        {hint}
        {blocks as never}
        {options}
      </Box>
    )
  }

  const cardView = (phase: string) => {
    const c = reqId ? trail[reqId]?.[phase]?.card : null
    return (
      <Box flexDirection="column">
        {header(`gate card · ${phase}`, { right: c ? faint(`seen ${dateOf(c.at)} ${timeOf(c.at)}`) : null })}
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
        {header(l?.agent ?? r?.agent ?? id, { lead: numOf(id) })}
        <Box flexDirection="column" paddingLeft={2}>
          {l ? faint(`${l.label} · ${clock((l.endedAt ?? now) - l.startedAt)}${l.tokens ? ` · ${tokens(l.tokens)} fresh · ${tokens(l.wrote)} wrote` : ''}`) : null}
          {r && !l ? faint(`${r.task ?? ''} · ${clock(r.endedAt - r.startedAt)} · ${tokens(r.tokens)} fresh · ${r.isFailed ? 'failed' : 'landed'} ${dateOf(r.endedAt)} ${timeOf(r.endedAt)}`) : null}
          {r ? <Box marginTop={1}><Text wrap="wrap">{r.verdict || '(no last line)'}</Text></Box> : null}
          {l ? l.trail.slice(-room).reverse().map(hit => ( // not `h`: that is the JSX factory, and shadowing it breaks the row
            <Box flexDirection="row">
              <Cell w={8}>{faint(`-${clock(now - hit.t)}`)}</Cell>
              <Text color={hit.err ? TONE.err : TONE[hit.k]}>{hit.err ? '✗ ' : '▆ '}</Text>
              <Text wrap="truncate">{hit.d}</Text>
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
    const open = (it: FlightItem) => {
      void setView($, () => ({ req: it.id, tab: (it.state === 'flying' || it.state === 'gate' ? it.phase : 5) as FlightTab, sub: { kind: 'page' }, home: true }))
      if (!gitAll[it.id] && deck.reqs.some(r => r.id === it.id)) void refreshGit($, it.id).catch(() => {}) // from the press, not the draw
    }
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
    const seg = <T extends string,>(key: string, values: readonly T[], cur: T, set: (v: T) => void, labels?: Readonly<Record<T, string>>) => (
      <Box flexDirection="row">
        {values.map(v => (
          <Box marginRight={1}>
            <Button key={`${key}-${v}`} plain onPress={() => set(v)}>
              <Text color={C.faint}>[</Text><Text color={v === cur ? C.v : undefined}>{labels?.[v] ?? v}</Text><Text color={C.faint}>]</Text>
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
        row('auto compact', seg('set-auto-compact', ['off', 'approve', 'past'] as const, settings.autoCompact, v => void setSettings($, s => ({ ...s, autoCompact: v })),
          { off: 'off', approve: 'on approve', past: 'past compact at' }), 'an approve compacts first'),
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
      Sec('KEYS', null, <Text color={C.dim} wrap="wrap"><Text color={undefined}>ctrl+x tab</Text> focus the flightdeck, then <Text color={undefined}>{OPTION_KEYS.slice(0, 4).join(' ')} …</Text> gate options · <Text color={undefined}>{KEYS.compose}</Text> send your finding picks · Tab / Enter — no digit keys: a digit typed in the prompt stays in the prompt</Text>),
    ]
  }

  const body = view.tab === 'reqs' ? reqsPage()
    : view.tab === 'history' ? historyPage()
    : view.tab === 'settings' ? settingsPage()
    : view.sub.kind === 'doc' ? await docView(view.sub.path, view.sub.title)
    : view.sub.kind === 'card' ? cardView(view.sub.phase)
    : view.sub.kind === 'lane' ? laneView(view.sub.id)
    : view.sub.kind === 'diff' ? diffView(view.sub.path)
    : view.sub.kind === 'mermaid' ? await mermaidView(view.sub.n)
    : view.sub.kind === 'debrief' ? await debriefView()
    : await phasePage(tabN || 1)

  // Nothing is cut: a tree taller than the band scrolls in the engine's window (wheel, keys). Open and max differ in
  // what a phase page holds (the summary, or the evidence too), never in a height the band could not take anyway.
  const frame = (...children: unknown[]) => {
    const tree = <Box flexDirection="column" paddingX={1}><Box flexDirection="column" flexShrink={0}>{children as never}</Box></Box>
    return below ? <Box flexDirection="column">{tree}{below as never}</Box> : tree
  }

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
