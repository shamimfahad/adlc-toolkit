import type { On } from 'claude-code'
import { describe, expect, mock, test, type TestBody } from 'claude-code/testing'

import type { FlightDeck, FlightGateAsk, FlightGit, FlightItem, FlightLane, FlightTrail } from '../types'
import {
  COMPACT_TIMEOUT_MS, autoCompactApplies, buildReq, describeTool, eta, idOf, isApproveLike, markSpans, parseDebrief, parseDispatch, parseGateCard, ringGlyph, runs, splitFolder, taskGlyphs,
  timeline,
} from '../hooks/model'
import {
  filterItems, firstLine, hotFor, hotTail, notesFor, optionsFromDecision, parseHot, parseMarker, parseRecord, partsOf, phaseLine, phaseOf,
  recordDecisionsFor, replyFor, replyOf, inFlight, sectionOf, sprintMembers, stripOf, idOrder, flyingTarget,
} from '../hooks/vault'
import { planVsActual, summaryGaps } from '../hooks/evidence'

const CARD = [
  'Implementation is done. Here is the gate.',
  '',
  '```',
  'GATE 3/5 · Implement · REQ-042-payment-retries — retry with backoff',
  '   7/7 tasks landed, 41 tests pass — recommend approve',
  '',
  'READY      5 commits drafted in commits-draft.md · 14 files, +412 −88',
  'NEEDS YOU  ⚠ TASK-005 edited Startup.cs (outside the blast radius)',
  '           ? keep the 3-retry default, or make it config',
  'CHECKS     ✓ build · ✓ tests 41/41 · ✓ lint · ⚠ coverage 71%',
  '',
  'MY READ    approve — the Startup.cs edit is the DI line TASK-005 needed',
  'Decision → approve — moves on to review · revise — say what to change · abort — stops REQ-042',
  '```',
].join('\n')

const DEBRIEF = [
  'DEBRIEF · REQ-002-debrief · for: lead · reader: cold — viewed 2/7 at review · 3 days since the last gate · written 2026-11-08T10:02Z at 9fa7fc2',
  'IN ONE BREATH',
  'The pane tells the story of a REQ.',
  'One file, eight sections.',
  '',
  'WHY',
  'today → nothing · after → debrief.md — requirement.md',
  'WHAT CHANGED',
  '```mermaid',
  'flowchart LR',
  '  A --> B',
  '```',
  '◆ core/skills/debrief.md:12 — the new skill — AC1',
  '◆ hooks/model.ts — parseDebrief — the mod reads the file — never recomputes',
  '◇ README.md — skill count — the list grew (unplanned)',
  'HOW',
  'T1,T2 → T3 · 3 agents — ADR-003',
  'WHAT WAS CHECKED',
  '✓ tests 41/41 — verify-output.md:14',
  'WHAT TO WATCH',
  '⚠ the pin is not verified live — README · Debrief',
  'SAY IT TO YOUR LEAD',
  '"I added a debrief."',
  'QUESTIONS YOU MAY GET',
  'Q why not a dialog? → ADR-003',
].join('\n')

describe('model', () => {
  test('phase rail: implement running, two phases done', () => {
    const r = buildReq('REQ-042-payment-retries', { currentPhase: 3, gateState: 'awaiting' }, false, null, 0)
    expect(r.id).toBe('REQ-042')
    expect(r.phases.map(p => p.state)).toEqual(['done', 'done', 'now', 'todo', 'todo'])
  })

  test('phase rail: waiting shows a gate, cleared advances', () => {
    expect(buildReq('REQ-7-x', { currentPhase: 2, gateState: 'awaiting' }, true, 1, 0).phases[1]?.state).toBe('gate')
    expect(buildReq('REQ-7-x', { currentPhase: 2, gateState: 'cleared' }, false, null, 0).phaseName).toBe('implement')
  })

  test('dispatch prompt → REQ and TASK', () => {
    expect(parseDispatch('Task: TASK-004\nTask file: .adlc/specs/2026-10/sf/REQ-042-pay/tasks/TASK-004.md'))
      .toEqual({ req: 'REQ-042', task: 'TASK-004' })
  })

  test('tool descriptions', () => {
    expect(describeTool('Edit', { file_path: 'D:\\repo\\src\\RetryPolicy.cs' })).toBe('Edit RetryPolicy.cs')
    expect(describeTool('Bash', { command: 'dotnet   test' })).toBe('$ dotnet test')
    expect(describeTool('Bash', { command: 'cd /repo && grep -n "x" README.md', description: 'Find  the day picker copy' })).toBe('Find the day picker copy')
  })

  test('timeline: void before take-off, idle gaps, writes outrank reads, failures marked', () => {
    const now = 60_000
    const cells = timeline(
      [
        { t: 31_000, k: 'read', err: false, d: '' },
        { t: 31_500, k: 'write', err: false, d: '' },
        { t: 55_000, k: 'run', err: true, d: '' },
      ],
      30_000, null, now, 12, 60_000, 2,
    )
    expect(cells.slice(0, 5).every(c => c.kind === 'void')).toBe(true) // 0–25s: before it started
    expect(cells[6]?.kind).toBe('write') // 30–35s: read + write → write
    expect(cells[8]?.kind).toBe('idle')
    const last = cells[11]
    expect(last?.kind === 'run' && last.err).toBe(true)
    expect(runs(cells).map(r => r.key)).toEqual(['void', 'write', 'idle', 'err'])
  })

  test('eta waits for two samples', () => {
    expect(eta([60_000], 5, 1)).toBe(null)
    expect(eta([60_000, 120_000], 4, 2)).toBe(180_000)
  })

  test('task constellation', () => {
    expect(taskGlyphs([{ id: 'TASK-001', status: 'complete' }, { id: 'TASK-002', status: 'pending' }, { id: 'TASK-003', status: 'pending' }], new Set(['TASK-002']), 0))
      .toBe('● ◐ ○')
  })

  test('gate card: fenced card parses into its spine, prose around it kept', () => {
    const c = parseGateCard(CARD)
    expect(c?.n).toBe(3)
    expect(c?.phase).toBe('Implement')
    expect(c?.req).toBe('REQ-042')
    expect(c?.title).toBe('retry with backoff')
    expect(c?.verdict).toBe('7/7 tasks landed, 41 tests pass — recommend approve')
    expect(c?.sections.map(s => s.label)).toEqual(['READY', 'NEEDS YOU', 'CHECKS', 'MY READ'])
    expect(c?.sections[1]?.lines.length).toBe(2)
    expect(c?.decision?.startsWith('approve')).toBe(true)
    expect(c?.before).toBe('Implementation is done. Here is the gate.')
    expect(c?.after).toBe('')
  })

  test('gate card: unfenced card and title from the slug', () => {
    const c = parseGateCard('GATE 1/5 · Spec · REQ-007-dark-mode\n   clean — recommend approve\n\nCHECKS   ✓ testable · ✓ non-goals\nMY READ  approve')
    expect(c?.title).toBe('dark mode')
    expect(c?.sections.length).toBe(2)
  })

  test('gate card: prose that only mentions a gate is left alone', () => {
    expect(parseGateCard('We are at GATE 2/5 now, see above.')).toBe(null)
  })

  test('debrief: a full file parses into head, eight sections and the file rows', () => {
    const d = parseDebrief(DEBRIEF)
    expect(d.head).toEqual({
      req: 'REQ-002', slug: 'debrief', forWho: 'lead', reader: 'cold',
      why: 'viewed 2/7 at review · 3 days since the last gate', written: '2026-11-08T10:02Z', sha: '9fa7fc2',
    })
    expect(d.sections.map(s => s.label)).toEqual([
      'IN ONE BREATH', 'WHY', 'WHAT CHANGED', 'HOW', 'WHAT WAS CHECKED', 'WHAT TO WATCH', 'SAY IT TO YOUR LEAD', 'QUESTIONS YOU MAY GET',
    ])
    expect(d.sections[0]?.lines).toEqual(['The pane tells the story of a REQ.', 'One file, eight sections.'])
    const changed = d.sections[2]?.lines ?? []
    expect(changed).toEqual(['```mermaid', 'flowchart LR', '  A --> B', '```'])
    expect(d.files).toEqual([
      { planned: true, path: 'core/skills/debrief.md', line: 12, what: 'the new skill', why: 'AC1' },
      { planned: true, path: 'hooks/model.ts', what: 'parseDebrief', why: 'the mod reads the file — never recomputes' },
      { planned: false, path: 'README.md', what: 'skill count', why: 'the list grew' },
    ])
    expect(d.before).toEqual([])
  })

  test('debrief: partial, empty, no head, CRLF', () => {
    const partial = parseDebrief('DEBRIEF · REQ-7-x · for: me · reader: warm\nIN ONE BREATH\nshort\nWHAT TO WATCH\n⚠ one\nSAY IT TO YOUR LEAD\n"done"')
    expect(partial.head?.reader).toBe('warm')
    expect(partial.head?.why).toBe('')
    expect(partial.head?.written).toBe(null)
    expect(partial.sections.map(s => s.label)).toEqual(['IN ONE BREATH', 'WHAT TO WATCH', 'SAY IT TO YOUR LEAD'])
    expect(partial.files).toEqual([])

    expect(parseDebrief('')).toEqual({ head: null, sections: [], files: [], before: [] })
    expect(parseDebrief(undefined as unknown as string).sections).toEqual([])

    const headless = parseDebrief('some prose first\n## WHY\ntoday → after')
    expect(headless.head).toBe(null)
    expect(headless.before).toEqual(['some prose first'])
    expect(headless.sections).toEqual([{ label: 'WHY', lines: ['today → after'] }])

    const crlf = parseDebrief(DEBRIEF.replace(/\n/g, '\r\n'))
    expect(crlf).toEqual(parseDebrief(DEBRIEF))
    expect(crlf.head?.sha).toBe('9fa7fc2')
  })

  test('debrief: an unknown label stays a line of the section before; a head with no why keeps the written tail', () => {
    const d = parseDebrief('**DEBRIEF · REQ-sf-033 · for: a handover · reader: handover · written 2026-11-08T10:02Z at abc1234**\n**HOW**\nT1 → T2\nEXTRA NOTES\nkept\nhow\nWHAT CHANGED\n◇ docs/x.md:3 — moved\nnot a file row')
    expect(d.head).toEqual({ req: 'REQ-sf-033', slug: '', forWho: 'a handover', reader: 'handover', why: '', written: '2026-11-08T10:02Z', sha: 'abc1234' })
    expect(d.sections).toEqual([
      { label: 'HOW', lines: ['T1 → T2', 'EXTRA NOTES', 'kept', 'how'] },
      { label: 'WHAT CHANGED', lines: ['not a file row'] },
    ])
    expect(d.files).toEqual([{ planned: false, path: 'docs/x.md', line: 3, what: 'moved', why: '' }])
    // ◆ outside WHAT CHANGED is plain text; an unknown reader is not a head.
    expect(parseDebrief('WHY\n◆ a — b — c').files).toEqual([])
    expect(parseDebrief('DEBRIEF · REQ-1 · for: me · reader: lukewarm').head).toBe(null)
  })

  test('context ring: one glyph per bucket, edges included', () => {
    const at = (xs: number[]) => xs.map(ringGlyph).join('')
    expect(at([0, 12, 12.5])).toBe('○○○')
    expect(at([13, 25, 37])).toBe('◔◔◔')
    expect(at([38, 50, 62])).toBe('◑◑◑')
    expect(at([63, 75, 87])).toBe('◕◕◕')
    expect(at([88, 99, 100])).toBe('●●●')
  })

  test('approve-like: a plain approve (or approve, reject ADR-NNN), nothing after it', () => {
    for (const l of ['approve', 'Approve', '  approve ', 'approve, reject ADR-002', 'approve,  Reject adr-014',
      'approve\n\n[flightdeck] pane', 'approve, reject ADR-002\n\n[flightdeck] viewed 3/4 files']) expect(isApproveLike(l)).toBe(true)
    for (const l of ['approved', 'approves', 'revise <what>', 'fix all', 'fix <ids|all-major>', 'abort', 'merged', '', 'not approve']) expect(isApproveLike(l)).toBe(false)
    // A note after the approve is rework the next phase needs its context for: not approve-like.
    for (const l of ['approve, but rename X first', 'approve — looks right', 'approve. also tighten AC2', 'approve, reject ADR-002 and rename X',
      'approve [flightdeck] pane', 'approve\n\n[flightdeck] pane\nand one more thing']) expect(isApproveLike(l)).toBe(false)
    // Placeholders are dropped from an option's label only: typed, a bracketed part is the person's own note.
    expect(isApproveLike('approve <note>')).toBe(true)
    expect(isApproveLike('approve <but rename X first>', 'typed')).toBe(false)
    expect(isApproveLike('approve\n\n[flightdeck] pane', 'typed')).toBe(true)
    expect(autoCompactApplies({ compact: 'button', compactAt: 70, autoCompact: 'approve' }, null, 'approve <but rename X first>', 2, 'typed')).toBe(false)
  })

  test('auto compact: off, never, the ship gate and non-approve answers never compact; past needs a known percent at the threshold', () => {
    const s = (autoCompact: 'off' | 'approve' | 'past', compact: 'button' | 'suggest' | 'never' = 'button') => ({ compact, compactAt: 70, autoCompact })
    expect(autoCompactApplies(s('off'), 95, 'approve', 2)).toBe(false)
    expect(autoCompactApplies(s('approve', 'never'), 95, 'approve', 2)).toBe(false)
    expect(autoCompactApplies(s('past', 'never'), 95, 'approve', 2)).toBe(false)
    expect(autoCompactApplies(s('approve'), 95, 'approve', 5)).toBe(false) // ship: no next phase
    expect(autoCompactApplies(s('approve'), 95, 'revise keep 3 retries', 2)).toBe(false)
    expect(autoCompactApplies(s('approve'), 95, 'fix all', 4)).toBe(false)
    expect(autoCompactApplies(s('approve'), null, 'approve', 2)).toBe(true) // on approve: the percent does not matter
    expect(autoCompactApplies(s('approve', 'suggest'), 10, 'approve, reject ADR-002', 1)).toBe(true)
    expect(autoCompactApplies(s('past'), 70, 'approve', 3)).toBe(true) // at the threshold counts
    expect(autoCompactApplies(s('past'), 69, 'approve', 3)).toBe(false)
    expect(autoCompactApplies(s('past'), null, 'approve', 3)).toBe(false) // unknown percent: not past anything
  })

  test('marker spans carry tone', () => {
    expect(markSpans('✓ build · ⚠ coverage').map(s => s.tone)).toEqual(['ok', 'plain', 'warn', 'plain'])
  })
})

const deck: FlightDeck = {
  vault: 'D:/repo/.adlc',
  scannedAt: 0,
  reqs: [buildReq('REQ-042-payment-retries', { currentPhase: 3, gateState: 'awaiting', taskStatus: { 'TASK-001': 'complete', 'TASK-002': 'pending' } }, false, null, 0)],
}
const lane: FlightLane = {
  id: 'a1', agent: 'task-implementer', label: 'retry policy', req: 'REQ-042', task: 'TASK-002', phase: 'implement',
  startedAt: 1000, doing: 'Edit RetryPolicy.cs', trail: [{ t: 4000, k: 'write', err: false, d: 'Edit RetryPolicy.cs' }],
  endedAt: null, tokens: null, wrote: 0, isFailed: false,
}
const BAND = (isWorking: boolean) => ({
  component: 'AbovePrompt' as const,
  props: { hasSurvey: false, isWorking, maxRows: 24, bodyColumns: 120, scroll: { offset: 0, bodyRows: 23 }, view: {} },
})

const stale = buildReq('BUG-016-old-thing', { currentPhase: 4, gateState: 'awaiting' }, false, null, 0)
const vaultDeck: FlightDeck = { ...deck, reqs: [...deck.reqs, stale] }
type Key = 'deck' | 'lanes' | 'focus' | 'fuel' | 'agents' | 'now' | 'view' | 'items' | 'settings' | 'trail' | 'filters' | 'git' | 'viewed' | 'picks' | 'gate' | 'strip' | 'layout' | 'pending'
const state = (on: On, key: Key, value: unknown) =>
  on('state.get', { plugin: 'adlc-flightdeck', key } as never, async () => ({ value: { value, version: 1 } }) as never)

describe('band', () => {
  test('says nothing until this session flies a REQ, even with REQs open in the vault', async ($, on) => {
    on('clock.now', async () => ({ value: 5000 }))
    state(on, 'deck', vaultDeck)
    on('ui.render', { component: 'AbovePrompt' }, async ($, e) => { const { Text } = $.ui.resolve(e); return <Text>engine</Text> })
    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({ plugin: 'adlc-flightdeck', surface, ...BAND(false) })
      expect(await ui.find({ type: 'Text', text: /engine/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /BUG-016/ })).toBeUndefined()
      await ui.unmount()
    }
  })

  test('one line for the REQ being flown, with details', async ($, on) => {
    on('clock.now', async () => ({ value: 5000 }))
    state(on, 'deck', vaultDeck)
    state(on, 'focus', 'REQ-042')
    state(on, 'lanes', [lane])
    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({ plugin: 'adlc-flightdeck', surface, ...BAND(true) })
      expect(await ui.find({ type: 'Text', text: /REQ-042/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /1 flying/ })).toBeDefined()
      expect(await ui.find({ key: 'expand' })).toBeDefined() // ⤢ opens the cockpit in place
      expect(await ui.find({ type: 'Text', text: /-30s/ })).toBeUndefined() // the tower lives in the pane
      expect(await ui.find({ type: 'Text', text: /BUG-016/ })).toBeUndefined()
      await ui.unmount()
    }
  })

  test('at a gate: resume only for a gate this session has not seen', async ($, on) => {
    const gated: FlightDeck = { ...deck, reqs: [buildReq('REQ-042-payment-retries', { currentPhase: 3, gateState: 'awaiting' }, true, 0, 0)] }
    on('clock.now', async () => ({ value: 5000 }))
    state(on, 'deck', gated)
    state(on, 'focus', 'REQ-042')
    let seen = false // case 1: no card captured here (a gate opened in another session); case 2: this session emitted it
    on('state.get', { plugin: 'adlc-flightdeck', key: 'trail' } as never, async () => ({ value: { value: seen ? { 'REQ-042': { implement: { rounds: [], runs: [], card: { at: 10, text: CARD } } } } : {}, version: 1 } }) as never)
    for (const surface of ['terminal', 'desktop'] as const) {
      seen = false
      const ui = await $.ui.mount({ plugin: 'adlc-flightdeck', surface, ...BAND(false) })
      expect(await ui.find({ type: 'Text', text: /· gate: waiting/ })).toBeDefined()
      expect(await ui.find({ key: 'resume-REQ-042' })).toBeDefined()
      await ui.unmount()
      seen = true
      const ui2 = await $.ui.mount({ plugin: 'adlc-flightdeck', surface, ...BAND(false) })
      expect(await ui2.find({ type: 'Text', text: /· gate: approve\?/ })).toBeDefined() // the card's MY READ: the band asks the recommended option
      expect(await ui2.find({ key: 'resume-REQ-042' })).toBeUndefined()
      await ui2.unmount()
    }
  })
})

const HOT = [
  '# Hot Log', '', '## Entries', '',
  '## [2026-06-21] verify-gate-cleared | REQ-001-priorities | findings: C0/M3/m9 all fixed, 20 tests green',
  '## [2026-06-21] implement-gate-cleared | REQ-001-priorities | 3 tasks, 12 tests green',
  '## [2026-06-21] adr-accepted | ADR-001 — priority read-time default',
  '## [2026-06-21] architect-gate-cleared | REQ-001-priorities | 3 tasks, ADR-001 proposed',
  '## [2026-06-21] req-reverted | REQ-001-priorities | -1 phases | review → implement',
  '## [2026-06-21] spec-gate-cleared | REQ-001-priorities',
  '## [2026-06-20] req-created | REQ-002-other | something else',
].join('\n')

const RECORD = [
  '# REQ-042 — retry with backoff', '',
  '| Field | Value |', '|---|---|', '| Status | merged |', '| Review rounds | 2 |', '',
  '## Goal', '', 'Retries now back off.', '',
  '## Decisions', '',
  '- ADR-031 accepted — retries are idempotent by request key',
  '- Spec gate: dropped the admin override',
  '- Review gate: kept the 3-attempt cap',
  '', '## Verification', '', '- Verdict: **PASS** after round 2',
].join('\n')

describe('vault readers', () => {
  test('hot.md lines parse and filter by REQ and phase, REQ-wide events ride along', () => {
    const evs = parseHot(HOT)
    expect(evs.length).toBe(7)
    expect(evs[0]?.event).toBe('verify-gate-cleared')
    expect(evs[0]?.req).toBe('REQ-001')
    expect(hotTail(evs[0] as never)).toBe('findings: C0/M3/m9 all fixed, 20 tests green')
    expect(hotFor(evs, 'REQ-001', 'req').length).toBe(5)
    expect(hotFor(evs, 'REQ-001', 'req', 4).map(e => e.event)).toEqual(['verify-gate-cleared', 'req-reverted'])
    expect(hotFor(evs, 'REQ-001', 'req', 1).map(e => e.event)).toEqual(['req-reverted', 'spec-gate-cleared'])
  })

  test('phase aliases: verify is review for a REQ, review is verify for a BUG', () => {
    expect(phaseOf('req', 'verify-gate-cleared')).toBe(4)
    expect(phaseOf('req', 'wrapup')).toBe(5)
    expect(phaseOf('bug', 'review')).toBe(4)
    expect(phaseOf('bug', 'report')).toBe(1)
    expect(phaseOf('req', 'req-cancelled')).toBe(null)
  })

  test('notes[] lines land on their phase; TASK lines on implement', () => {
    const notes = ['spec-gate-cleared 2026-09-08', 'TASK-003 done: 41 passed', 'verify: typecheck ✓']
    expect(notesFor('req', 1, notes)).toEqual(['spec-gate-cleared 2026-09-08'])
    expect(notesFor('req', 3, notes)).toEqual(['TASK-003 done: 41 passed'])
    expect(notesFor('req', 4, notes)).toEqual(['verify: typecheck ✓'])
  })

  test('record: title, header fields, sections, and decisions per phase', () => {
    const r = parseRecord(RECORD)
    expect(r.id).toBe('REQ-042')
    expect(r.title).toBe('retry with backoff')
    expect(r.fields.status).toBe('merged')
    expect(r.sections.goal).toBe('Retries now back off.')
    expect(recordDecisionsFor('req', 1, r.sections.decisions)).toEqual(['Spec gate: dropped the admin override'])
    expect(recordDecisionsFor('req', 2, r.sections.decisions)).toEqual(['ADR-031 accepted — retries are idempotent by request key'])
    expect(recordDecisionsFor('req', 4, r.sections.decisions)).toEqual(['Review gate: kept the 3-attempt cap'])
    expect(sectionOf(RECORD, 'verification')).toBe('- Verdict: **PASS** after round 2')
    expect(sectionOf(RECORD, 'nope')).toBe(null)
  })

  test('paths: month and author from a partitioned vault', () => {
    expect(partsOf('specs/2026-08/sf/REQ-042-slug')).toEqual({ month: '2026-08', author: 'sf', archived: false })
    expect(partsOf('specs/REQ-042-slug')).toEqual({ month: null, author: null, archived: false })
    expect(partsOf('specs/_archive/2026-08/sf/REQ-042-slug.md')).toEqual({ month: '2026-08', author: 'sf', archived: true })
  })

  test('a reply → decision, note and the trailer lifted out', () => {
    const opts = parseMarker(MARKER).options
    expect(replyOf('approve', opts)).toEqual({ decision: 'approve', note: '', viewed: null })
    expect(replyOf('fix C1,M1 · accept m2', opts)).toEqual({ decision: 'fix', note: 'C1,M1 · accept m2', viewed: null })
    expect(replyOf('fix all\n\n[flightdeck] viewed 4/7 files', opts)).toEqual({ decision: 'fix all', note: '', viewed: '4/7' })
    expect(replyOf('revise: tighten AC2 [flightdeck] viewed 4/7 files', opts)).toEqual({ decision: 'revise', note: 'tighten AC2', viewed: '4/7' })
    expect(replyOf('approve\n\n[flightdeck] pane', opts)).toEqual({ decision: 'approve', note: '', viewed: null })
    expect(replyOf('why is C1 critical?', opts).decision).toBe('') // a question names no option: the gate stays open
    expect(replyOf('approved it yesterday', opts).decision).toBe('') // a word that starts like an option is not one
    expect(replyOf('revise keep the default', []).decision).toBe('revise') // no options captured: the gate verbs
    expect(firstLine('# Done\n\n**TASK-003** landed — 4 tests', 40)).toBe('TASK-003 landed — 4 tests')
  })

  test('history filter: mode, author, text', () => {
    const it = (id: string, state: FlightItem['state'], author: string | null, touchedAt: number): FlightItem =>
      ({ id, title: `${id} thing`, kind: 'req', state, phase: 5, phaseName: 'ship', author, month: null, touchedAt, folder: null, record: null })
    const items = [it('REQ-1', 'merged', 'sf', 1), it('REQ-2', 'flying', 'sf', 3), it('REQ-3', 'gate', 'jd', 2)]
    expect(filterItems(items, 'all', null, '').map(i => i.id)).toEqual(['REQ-2', 'REQ-3', 'REQ-1'])
    expect(filterItems(items, 'flying', null, '').map(i => i.id)).toEqual(['REQ-2', 'REQ-3'])
    expect(filterItems(items, 'done', null, '').map(i => i.id)).toEqual(['REQ-1'])
    expect(filterItems(items, 'all', 'jd', '').map(i => i.id)).toEqual(['REQ-3'])
    expect(filterItems(items, 'all', null, 'req-1').map(i => i.id)).toEqual(['REQ-1'])
  })
})

// 0.7.0: the cockpit is the above-prompt band at full height (`max`); no pane.
const PANE_PROPS = { hasSurvey: false, isWorking: false, maxRows: 400, bodyColumns: 120, scroll: { offset: 0, bodyRows: 399 }, view: {} }
const items: FlightItem[] = [
  { id: 'REQ-042', title: 'payment retries', kind: 'req', state: 'flying', phase: 3, phaseName: 'implement', author: 'sf', month: '2026-10', touchedAt: 1000, folder: 'D:/repo/.adlc/specs/REQ-042-payment-retries', record: null },
  { id: 'BUG-016', title: 'old thing', kind: 'bug', state: 'flying', phase: 4, phaseName: 'verify', author: 'jd', month: '2026-09', touchedAt: 500, folder: 'D:/repo/.adlc/bugs/BUG-016-old-thing', record: null },
  { id: 'REQ-007', title: 'dark mode', kind: 'req', state: 'merged', phase: 5, phaseName: 'ship', author: 'sf', month: '2026-08', touchedAt: 100, folder: null, record: 'D:/repo/.adlc/specs/REQ-007-dark-mode.md' },
]
const trail: FlightTrail = {
  'REQ-042': {
    implement: {
      rounds: [{ at: 0, decision: 'revise', note: 'keep 3 retries but make it config' }, { at: 60_000, decision: 'approve', note: '' }],
      runs: [{ id: 'a0', agent: 'codebase-explorer', task: null, startedAt: 0, endedAt: 31_000, tokens: 41_000, verdict: 'recon done — 3 similar patterns', isFailed: false }],
      card: { at: 0, text: CARD },
    },
  },
}
const settings = { openOnStart: false, band: true, cards: true, narrowAt: 84, showAll: false, history: 'all' as const, editorUri: 'vscode://file/{path}:{line}:{col}', compact: 'button' as const, compactAt: 70, autoCompact: 'off' as const }
const mountPane = ($: Parameters<TestBody>[0], surface: 'terminal' | 'desktop') =>
  $.ui.mount({ plugin: 'adlc-flightdeck', surface, component: 'AbovePrompt', props: PANE_PROPS, viewport: { columns: 124, rows: 800 } })

describe('cockpit pane', () => {
  test('a phase in progress: the GATE line says so, then what is flying for it and what each agent is doing', async ($, on) => {
    on('clock.now', async () => ({ value: 5000 }))
    state(on, 'deck', vaultDeck)
    state(on, 'focus', 'REQ-042')
    state(on, 'lanes', [lane])
    state(on, 'items', items)
    state(on, 'trail', trail)
    state(on, 'settings', settings)
    state(on, 'layout', { height: 'max', narrow: false })
    state(on, 'view', { req: 'REQ-042', tab: 3, sub: { kind: 'page' } })
    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await mountPane($, surface)
      expect(await ui.find({ type: 'Text', text: /in progress — implement/ })).toBeDefined()
      expect(await ui.find({ key: 'tab-3' })).toBeDefined()
      expect(await ui.find({ key: 'tab-history' })).toBeDefined()
      expect(await ui.find({ key: 'tab-settings' })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /^SO FAR$/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /1\/2 tasks/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /task-implementer · TASK-002/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /Edit RetryPolicy\.cs/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /revise · 2 rounds/ })).toBeUndefined() // a phase in progress has no cleared line
      expect(await ui.find({ type: 'Text', text: /BUG-016/ })).toBeUndefined()
      await ui.unmount()
    }
  })

  // Agent numbers: the place in $.agent.list(), worked out at draw (2 s cache), so each look moves the clock past it.
  describe('agent numbers', () => {
    const laneA: FlightLane = { ...lane, id: 'num-a', agent: 'alpha-agent', task: 'TASK-001' }
    const laneB: FlightLane = { ...lane, id: 'num-b', agent: 'beta-agent', task: 'TASK-002' }
    const flying = (on: On, clock: () => number, list: () => { id: string }[], sub: unknown = { kind: 'page' }) => {
      on('clock.now', async () => ({ value: clock() }))
      on('agent.list', async () => ({ value: list() }) as never)
      state(on, 'deck', vaultDeck)
      state(on, 'focus', 'REQ-042')
      state(on, 'lanes', [laneA, laneB])
      state(on, 'items', items)
      state(on, 'trail', trail)
      state(on, 'settings', settings)
      state(on, 'layout', { height: 'max', narrow: false })
      state(on, 'view', { req: 'REQ-042', tab: 3, sub })
    }
    const num = async (ui: Awaited<ReturnType<typeof mountPane>>, n: number) => ui.find({ type: 'Text', text: new RegExp(`^#${n} $`) })

    test('SO FAR numbers each lane by its place in the list', async ($, on) => {
      flying(on, () => 100_000, () => [{ id: 'num-b' }, { id: 'num-a' }])
      const ui = await mountPane($, 'terminal')
      expect(await ui.find({ type: 'Text', text: /#1 beta-agent · TASK-002/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /#2 alpha-agent · TASK-001/ })).toBeDefined()
      expect((await num(ui, 1))?.props.dimColor).toBeFalsy()
      await ui.unmount()
    })

    test('an earlier agent leaves the list: the later one renumbers, the dropped one keeps its number, dimmed', async ($, on) => {
      let t = 200_000
      let list = [{ id: 'num-a' }, { id: 'num-b' }]
      flying(on, () => t, () => list)
      const first = await mountPane($, 'terminal')
      expect(await first.find({ type: 'Text', text: /#1 alpha-agent/ })).toBeDefined()
      expect(await first.find({ type: 'Text', text: /#2 beta-agent/ })).toBeDefined()
      await first.unmount()
      list = [{ id: 'num-b' }]
      t += 3000 // past the 2 s cache
      const ui = await mountPane($, 'terminal')
      expect(await ui.find({ type: 'Text', text: /#1 beta-agent/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /#1 alpha-agent/ })).toBeDefined() // the last number it was drawn with
      expect(await ui.find({ type: 'Text', text: /#2 / })).toBeUndefined()
      expect((await ui.findAll({ type: 'Text', text: /^#1 $/ })).map(t => !!t.props.dimColor).sort()).toEqual([false, true]) // only the dropped one dim
      await ui.unmount()
    })

    test('the list throws: rows draw without numbers, nothing breaks', async ($, on) => {
      flying(on, () => 300_000, () => { throw new Error('no list') })
      const ui = await mountPane($, 'terminal')
      expect(await ui.find({ type: 'Text', text: /^SO FAR$/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /alpha-agent · TASK-001/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /#\d+ / })).toBeUndefined()
      await ui.unmount()
    })

    test('the lane view header carries the number too', async ($, on) => {
      flying(on, () => 400_000, () => [{ id: 'num-b' }, { id: 'num-a' }], { kind: 'lane', id: 'num-a' })
      const ui = await mountPane($, 'terminal')
      expect(await num(ui, 2)).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /^alpha-agent$/ })).toBeDefined()
      await ui.unmount()
    })
  })

  test('a cleared phase: the decision, the rounds, on the tab and on the GATE line', async ($, on) => {
    on('clock.now', async () => ({ value: 5000 }))
    state(on, 'deck', { ...vaultDeck, reqs: [buildReq('REQ-042-payment-retries', { currentPhase: 4 }, false, null, 0)] })
    state(on, 'focus', 'REQ-042')
    state(on, 'items', items)
    state(on, 'trail', trail)
    state(on, 'settings', settings)
    state(on, 'layout', { height: 'max', narrow: false })
    state(on, 'view', { req: 'REQ-042', tab: 3, sub: { kind: 'page' } })
    const ui = await mountPane($, 'terminal')
    expect(await ui.find({ type: 'Text', text: /cleared · approve · round 2/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /approve · 2 rounds/ })).toBeDefined() // the tab's status line
    await ui.unmount()
  })

  test('a REQ opened from history rides level 1 as the selected chip when nothing else is in flight', async ($, on) => {
    on('clock.now', async () => ({ value: 5000 }))
    state(on, 'deck', vaultDeck)
    state(on, 'focus', 'REQ-042')
    state(on, 'items', items)
    state(on, 'trail', {})
    state(on, 'settings', settings)
    state(on, 'layout', { height: 'max', narrow: false })
    state(on, 'view', { req: 'BUG-016', tab: 4, sub: { kind: 'page' } })
    const ui = await mountPane($, 'terminal')
    expect((await ui.find({ key: 'strip-BUG-016' }))?.props.dimColor).toBe(false)
    expect(await ui.find({ key: 'tab-4' })).toBeDefined()
    await ui.unmount()
  })

  test('history lists every item with its state, date and author, and a first / last state each', async ($, on) => {
    on('clock.now', async () => ({ value: 3 * 86_400_000 }))
    state(on, 'deck', vaultDeck)
    state(on, 'focus', 'REQ-042')
    state(on, 'items', items)
    state(on, 'trail', {})
    state(on, 'settings', settings)
    state(on, 'layout', { height: 'max', narrow: false })
    state(on, 'view', { req: 'REQ-042', tab: 'history', sub: { kind: 'page' }, hist: { id: 'REQ-007', which: 'last' } })
    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await mountPane($, surface)
      expect(await ui.find({ key: 'hist-REQ-042' })).toBeDefined()
      expect(await ui.find({ key: 'hist-BUG-016' })).toBeDefined()
      expect(await ui.find({ key: 'hist-REQ-007' })).toBeDefined()
      expect(await ui.find({ key: 'hist-REQ-007-first' })).toBeDefined()
      expect(await ui.find({ key: 'hist-REQ-007-last' })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /3 REQs/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /shipped/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /last state · nothing in hot\.md for REQ-007/ })).toBeDefined()
      await ui.unmount()
    }
  })

  test('settings shows each switch', async ($, on) => {
    on('clock.now', async () => ({ value: 5000 }))
    state(on, 'deck', vaultDeck)
    state(on, 'focus', 'REQ-042')
    state(on, 'items', items)
    state(on, 'trail', {})
    state(on, 'settings', settings)
    state(on, 'layout', { height: 'max', narrow: false })
    state(on, 'view', { req: 'REQ-042', tab: 'settings', sub: { kind: 'page' } })
    const ui = await mountPane($, 'terminal')
    expect(await ui.find({ key: 'set-editor' })).toBeDefined()
    for (const k of ['set-compact-button', 'set-compact-suggest', 'set-compact-never', 'set-compact-at-70', 'set-auto-compact-off', 'set-auto-compact-approve', 'set-auto-compact-past', 'set-narrow-84', 'set-open-off', 'set-cards-on', 'set-show-all-off', 'set-forget', 'set-forget-viewed']) {
      expect(await ui.find({ key: k })).toBeDefined()
    }
    expect(await ui.find({ key: 'set-columns' })).toBeUndefined() // no pane, no pane width
    expect(await ui.find({ type: 'Text', text: /^KEYS$/ })).toBeDefined()
    await ui.unmount()
  })

  test('settings: auto compact offers three choices, the current one in accent, and a press is kept in the store', async ($, on) => {
    on('clock.now', async () => ({ value: 5000 }))
    state(on, 'deck', vaultDeck)
    state(on, 'focus', 'REQ-042')
    state(on, 'items', items)
    state(on, 'trail', {})
    state(on, 'layout', { height: 'max', narrow: false })
    state(on, 'view', { req: 'REQ-042', tab: 'settings', sub: { kind: 'page' } })
    const stored: { key: string; value: unknown }[] = []
    on('store.set', async ($, e, next) => { stored.push({ key: e.key, value: e.value }); return next(e) })
    const ui = await mountPane($, 'terminal') // settings left to the real state: the defaults, then the press
    // Each choice's label Text — the one between the faint brackets — and its colour.
    const label = async (v: string) => {
      const kids = ((await ui.find({ key: `set-auto-compact-${v}` }))?.children ?? []) as { type?: string; props?: { color?: unknown }; children?: unknown[] }[]
      const t = kids.find(k => k.type === 'Text' && !(k.children ?? []).includes('['))
      return { text: (t?.children ?? []).join(''), color: t?.props?.color }
    }
    expect(await label('off')).toEqual({ text: 'off', color: 'autoAccept' }) // the default
    expect(await label('approve')).toEqual({ text: 'on approve', color: undefined })
    expect(await label('past')).toEqual({ text: 'past compact at', color: undefined })
    await ui.press({ key: 'set-auto-compact-approve' })
    await settle(() => stored.some(x => x.key === 'settings'))
    expect((stored.find(x => x.key === 'settings')?.value as { autoCompact?: string }).autoCompact).toBe('approve')
    expect((await label('approve')).color).toBe('autoAccept')
    expect((await label('off')).color).toBeUndefined()
    await ui.unmount()
  })
})

describe('gate card', () => {
  test('a gate message draws as a card; plain prose is left to the engine', async ($, on) => {
    const gated: FlightDeck = { ...deck, reqs: [buildReq('REQ-042-payment-retries', { currentPhase: 3, gateState: 'awaiting' }, true, 0, 0)] }
    on('clock.now', async () => ({ value: 42_000 }))
    on('state.get', { plugin: 'adlc-flightdeck', key: 'deck' }, async () => ({ value: { value: gated as unknown, version: 1 } }))
    on('state.get', { plugin: 'adlc-flightdeck', key: 'fuel' }, async () => ({
      value: { value: { 'REQ-042': { implement: { fresh: 123_000, read: 2_000_000, wrote: 20_000 } }, 'REQ-040': { review: { fresh: 90_000, read: 0, wrote: 0 } }, 'REQ-041': { review: { fresh: 86_000, read: 0, wrote: 0 } } } as unknown, version: 1 },
    }))
    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({
        plugin: 'adlc-flightdeck', surface, component: 'AssistantMessage',
        props: { text: CARD, isFirstOfReply: true },
        viewport: { columns: 110, rows: 40 },
      })
      expect(await ui.find({ type: 'Text', text: /GATE 3\/5/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /NEEDS YOU/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /waiting 0:42/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /next: review ≈ 88k tok \(avg of 2\)/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /your call — reply in the prompt, or pick in the flightdeck above it/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /dialog/ })).toBeUndefined() // the open card's last line names the cockpit, not a dialog
      await ui.unmount()
    }
  })
})

// ---------- 0.6.0: ids by their full name, the gate is the turn ----------

const MARKER = [
  'Phase: verify',
  'REQ: REQ-sf-033-payment-retries',
  'Gate: 4/5',
  'Awaiting: review the findings, decide which to fix.',
  'Ask: 3 findings — 1 needs a call. Fix before this ships?',
  'Options:',
  '  - approve — accept the findings as they are; moves on to /wrapup',
  '  - fix all — I fix every actionable finding, re-check, gate comes back',
  '  - fix <ids> — the same loop, only the findings you name',
  '  - revise <what> — other changes to the review',
  '  - abort — stops this REQ; nothing is committed',
  'Recommended: fix all',
  'Files:',
  '  - .adlc/specs/2026-10/sf/REQ-sf-033-payment-retries/verification.md',
].join('\n')

const IMPLEMENT_MARKER = [
  'Phase: implement', 'REQ: REQ-042-payment-retries', 'Gate: 3/5', 'Awaiting: review the code.', 'Ask: 7/7 tasks landed. Run the commits?',
  'Options:', '  - approve — run the commits in commits-draft.md, then /review', '  - revise <what> — I change the code, re-check, ask again',
  '  - abort — discards the uncommitted code; cleanup commands follow', 'Recommended: approve',
].join('\n')

const gated: FlightDeck = { vault: 'D:/repo/.adlc', scannedAt: 0, reqs: [buildReq('REQ-042-payment-retries', { currentPhase: 3, gateState: 'awaiting' }, true, 0, 0)] }
const gitFacts: Record<string, FlightGit> = {
  'REQ-042': {
    at: 0, cwd: 'D:/repo', base: 'abc', baseName: 'main', branch: 'feat/REQ-042', me: 'sf', error: null, tip: 'feat/REQ-042', checkedOut: true,
    touched: [{ path: 'src/pay/RetryPolicy.cs', status: 'M', add: 12, del: 3 }, { path: 'src/pay/Startup.cs', status: 'M', add: 1, del: 0 }],
    hashes: { 'src/pay/retrypolicy.cs': 'h1', 'src/pay/startup.cs': 'h2' }, authors: {},
  },
}
const atGate = (on: On, extra: Partial<Record<Key, unknown>> = {}) => {
  on('clock.now', async () => ({ value: 5000 }))
  const seed: Partial<Record<Key, unknown>> = {
    deck: gated, focus: 'REQ-042', lanes: [], items, trail: {}, settings, git: gitFacts, layout: { height: 'max', narrow: false },
    viewed: { 'REQ-042': { 'src/pay/retrypolicy.cs': 'h1' } }, picks: {},
    gate: { 'REQ-042': parseMarker(IMPLEMENT_MARKER) } as Record<string, FlightGateAsk>,
    view: { req: 'REQ-042', tab: 3, sub: { kind: 'page' }, home: false },
    ...extra,
  }
  // A key passed as undefined is left to the real state: a pressed control that writes it then lands (a stub's version never moves).
  for (const [k, v] of Object.entries(seed)) if (v !== undefined) state(on, k as Key, v)
}
// The test host runs hooks off the press; give them a few ticks (setTimeout is there at run time, not in the hooks' lib types).
const tick = (globalThis as unknown as { setTimeout: (f: () => void, ms: number) => unknown }).setTimeout
const settle = async (until: () => boolean) => { for (let i = 0; i < 40 && !until(); i++) await new Promise<void>(r => { tick(() => r(), 5) }) }

describe('0.6.0', () => {
  test('ids: REQ-sf-033 resolves whole — never REQ-033, and L-REQ-035-1 is not REQ-035', () => {
    expect(splitFolder('REQ-sf-033-gate-turn')).toEqual({ id: 'REQ-sf-033', title: 'gate turn', kind: 'req' })
    expect(splitFolder('REQ-042-2fa-login').id).toBe('REQ-042') // a slug that starts with a digit is not a prefix
    expect(splitFolder('BUG-sf-7-null-ref').kind).toBe('bug')
    expect(idOf('the lesson L-REQ-035-1 says jitter')).toBe(null)
    expect(idOf('/proceed REQ-sf-033')).toBe('REQ-sf-033')
    expect(idOf('REQ-035 is next')).toBe('REQ-035')
    expect(parseGateCard('GATE 4/5 · Review · REQ-sf-033 — gate turn\n   3 findings\n\nMY READ  fix all')?.req).toBe('REQ-sf-033')
    const hot = parseHot('## [2026-10-24] verify-gate-cleared | REQ-sf-033-gate-turn | findings fixed')
    expect(hot[0]?.req).toBe('REQ-sf-033')
    expect(hotTail(hot[0] as never)).toBe('findings fixed')
    expect(parseDispatch('Task file: .adlc/specs/2026-10/sf/REQ-sf-033-x/tasks/TASK-002.md').req).toBe('REQ-sf-033')
    expect(parseRecord('# REQ-sf-033 — gate turn\n').id).toBe('REQ-sf-033')
  })

  test('focus: a prompt that mentions a lesson id keeps the REQ being flown', async ($, on) => {
    on('clock.now', async () => ({ value: 5000 }))
    const flown: FlightDeck = { vault: 'D:/repo/.adlc', scannedAt: 0, reqs: [buildReq('REQ-sf-033-gate-turn', { currentPhase: 3 }, false, null, 0)] }
    state(on, 'deck', flown)
    state(on, 'items', [])
    state(on, 'lanes', [])
    on('prompt.submit', async ($, e) => ({ text: e.text }))
    const typed = (text: string) => ({ text, wait: false, origin: { kind: 'composer' } }) as never // a prompt as the person types it
    await $.prompt.submit(typed('/proceed REQ-sf-033'))
    await $.prompt.submit(typed('the lesson L-REQ-035-1 says jitter; also see REQ-035 in the old log'))
    const ui = await $.ui.mount({ plugin: 'adlc-flightdeck', surface: 'terminal', ...BAND(false) })
    expect(await ui.find({ type: 'Text', text: /REQ-sf-033/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /REQ-035/ })).toBeUndefined()
    await ui.unmount()
  })

  test('marker: Ask, Options and Recommended parse; a 1.11 marker gives no options and the card\'s Decision line fills in', () => {
    const m = parseMarker(MARKER)
    expect(m.phase).toBe('verify')
    expect(m.ask).toBe('3 findings — 1 needs a call. Fix before this ships?')
    expect(m.options.map(o => o.label)).toEqual(['approve', 'fix all', 'fix <ids>', 'revise <what>', 'abort'])
    expect(m.options.filter(o => o.recommended).map(o => o.label)).toEqual(['fix all'])
    expect(m.options[2]?.needsArg).toBe(true)
    expect(m.options[4]?.consequence).toBe('stops this REQ; nothing is committed')
    expect(m.files).toEqual(['.adlc/specs/2026-10/sf/REQ-sf-033-payment-retries/verification.md'])
    const old = parseMarker('Phase: verify\nREQ: REQ-042-x\nAwaiting: review\nFiles:\n  - .adlc/specs/REQ-042-x/verification.md\n')
    expect(old.options).toEqual([])
    const card = parseGateCard(CARD)
    const fromCard = optionsFromDecision(card?.decision ?? null, 'approve — the Startup.cs edit is the DI line')
    expect(fromCard.map(o => o.label)).toEqual(['approve', 'revise', 'abort'])
    expect(fromCard[0]?.recommended).toBe(true)
    const paren = optionsFromDecision('approve · fix all (recommended — I fix, then re-check) · fix <ids|all-major> · revise <what> · abort', '')
    expect(paren.find(o => o.recommended)?.label).toBe('fix all')
    expect(paren.find(o => o.label.startsWith('fix <'))?.needsArg).toBe(true)
  })

  test('reply text: trailer at implement and review only, pane elsewhere, an argument substituted for <ids>', () => {
    const [approve, , fixIds] = parseMarker(MARKER).options
    expect(replyFor(approve!, null, 3, { n: 1, m: 2 })).toBe('approve\n\n[flightdeck] viewed 1/2 files')
    expect(replyFor(approve!, null, 2, { n: 1, m: 2 })).toBe('approve\n\n[flightdeck] pane')
    expect(replyFor(approve!, null, 4, { n: 0, m: 0 })).toBe('approve\n\n[flightdeck] pane')
    expect(replyFor(fixIds!, 'C1,M1', 4, { n: 4, m: 7 })).toBe('fix C1,M1\n\n[flightdeck] viewed 4/7 files')
    expect(replyOf(replyFor(fixIds!, 'C1,M1', 4, { n: 4, m: 7 }), parseMarker(MARKER).options)).toEqual({ decision: 'fix', note: 'C1,M1', viewed: '4/7' })
  })

  test('pane at a gate: an option button submits as the user, once', async ($, on) => {
    atGate(on)
    const sent: { text: string; asUser: boolean }[] = []
    on('prompt.submit', async ($, e) => { sent.push({ text: e.text, asUser: e.origin.kind === 'plugin' && e.origin.asUser === true }); return { text: e.text } })
    const ui = await mountPane($, 'terminal')
    expect((await ui.find({ key: 'opt-approve' }))?.props.hotkey).toBe('a') // 0.8.1: a letter, never a digit
    expect(await ui.find({ type: 'Text', text: /1 of 2 changed files not viewed/ })).toBeDefined()
    await ui.press({ key: 'opt-approve' })
    await settle(() => sent.length > 0)
    expect(sent).toEqual([{ text: 'approve\n\n[flightdeck] viewed 1/2 files', asUser: true }])
    // One press, one reply: the gate now reads sent, and its options are gone until the next gate.
    expect(await ui.find({ type: 'Text', text: /Sent to Claude/ })).toBeDefined()
    expect(await ui.find({ key: 'opt-approve' })).toBeUndefined()
    expect(sent.length).toBe(1)
    await ui.unmount()
  })

  test('the dialog is left alone: an AskUserQuestion call passes through untouched', async ($, on) => {
    atGate(on)
    let seen: unknown = null
    on('tool.call', async ($, e) => { seen = e; return { result: { questions: [], answers: { 'Gate 3?': 'approve' } } } as never })
    const questions = [{ question: 'Gate 3?', header: 'Gate', multiSelect: false, options: [{ label: 'approve', description: 'moves on to review' }, { label: 'revise', description: 'say what' }] }]
    const ran = await $.tool.call({ tool: 'AskUserQuestion', questions } as never) as { result?: { response?: string; answers?: Record<string, string> } }
    expect(ran.result?.response).toBeUndefined()
    expect(ran.result?.answers).toEqual({ 'Gate 3?': 'approve' })
    expect((seen as { questions: typeof questions }).questions[0]?.options[0]?.description).toBe('moves on to review')
  })

  test('compact first: drawn with the context fill; suggest dims it below the threshold; never hides it', async ($, on) => {
    let mode: Record<string, unknown> = { ...settings }
    atGate(on, { settings: undefined })
    on('state.get', { plugin: 'adlc-flightdeck', key: 'settings' } as never, async () => ({ value: { value: mode, version: 1 } }) as never)
    on('session.usage', async () => ({ value: { startedAt: 0, context: { window: 200_000, tokens: 150_000, percent: 75 }, rateLimits: [] } }) as never)
    const look = async () => {
      const ui = await mountPane($, 'terminal')
      const out = { first: await ui.find({ key: 'compact-first' }), pct: await ui.find({ type: 'Text', text: /context 75%/ }) }
      await ui.unmount()
      return out
    }
    const button = await look()
    expect(button.first).toBeDefined()
    expect(button.first?.props.dimColor).toBe(false)
    expect(button.pct).toBeDefined()
    mode = { ...settings, compact: 'suggest', compactAt: 70 }
    expect((await look()).first?.props.dimColor).toBe(false) // past the threshold: lit
    mode = { ...settings, compact: 'suggest', compactAt: 80 }
    expect((await look()).first?.props.dimColor).toBe(true)
    mode = { ...settings, compact: 'never' }
    expect((await look()).first).toBeUndefined()
  })

  test('compact first, then an option: compacts, then sends; a skipped or rejected compact still sends, with a toast', async ($, on) => {
    atGate(on, { layout: { height: 'max', narrow: false, compactFirst: true } })
    let answer: 'skip' | 'reject' | 'ok' = 'skip'
    let compacted = 0
    const sent: string[] = []
    const toasts: string[] = []
    on('session.usage', async () => ({ value: { startedAt: 0, context: { window: 200_000, percent: 40 }, rateLimits: [] } }) as never)
    on('session.compact', async ($, e) => {
      if (answer === 'reject') throw new Error('turn running')
      if (answer === 'skip') return { skip: 'vetoed' }
      compacted += 1
      expect(e.instructions ?? '').toMatch(/ADLC gate compaction\. Resuming REQ-042/)
      return { messages: [{ role: 'user', text: 'summary', toolUses: [] }] }
    })
    on('ui.toast', async ($, e) => { toasts.push(e.text); return { value: undefined } as never })
    on('prompt.submit', async ($, e) => { sent.push(e.text); return { text: e.text } })
    on('turn.complete', async () => ({ text: '' }))
    for (const a of ['skip', 'reject', 'ok'] as const) {
      answer = a
      const before = sent.length
      const ui = await mountPane($, 'terminal')
      await ui.press({ key: 'opt-approve' })
      await settle(() => sent.length > before)
      await ui.unmount()
      await $.turn.complete({ turnId: 't1', usage: {}, reason: 'end', isAborted: false, answer: '' } as never) // the turn ends: the pending reply clears
      expect(sent.length).toBe(before + 1) // never lost: the reply goes out whatever compaction did
    }
    expect(compacted).toBe(1)
    expect(toasts.filter(t => /^not compacted — sent as is/.test(t)).length).toBe(2)
    expect(toasts[0]).toBe('not compacted — sent as is (vetoed)') // a rejection's reason is the engine's wording
  })
})

// ---------- 0.9.0: auto compact on an approve, pressed or typed ----------

const AUTO_MARKER = [
  'Phase: implement', 'REQ: REQ-042-payment-retries', 'Gate: 3/5', 'Awaiting: review the code.', 'Ask: 7/7 tasks landed. Run the commits?',
  'Options:', '  - approve — run the commits, then /review', '  - revise — I change the code, re-check, ask again', '  - fix all — fix every finding',
  '  - abort — discards the uncommitted code', 'Recommended: approve',
].join('\n')
const typedAt = (text: string) => ({ text, wait: false, origin: { kind: 'composer' } }) as never // a prompt as the person types it

describe('auto compact', () => {
  /** A gate with auto compact on: records every call the flow makes, in order. */
  const autoGate = ($: Parameters<TestBody>[0], on: On, auto: 'off' | 'approve' | 'past' = 'approve', pct = 40, extra: Partial<Record<Key, unknown>> = {}) => {
    atGate(on, { settings: { ...settings, autoCompact: auto }, gate: { 'REQ-042': parseMarker(AUTO_MARKER) }, trail: undefined, ...extra })
    const log: string[] = []
    const fills: string[] = []
    const toasts: string[] = []
    const trails: unknown[] = []
    const layouts: { compactFirst?: boolean }[] = []
    let compact: 'ok' | 'skip' | 'reject' = 'ok'
    let beforeCompact = async () => {}
    let failSend = false
    let refuseTimeout = false
    let beforeSend = async () => {}
    on('turn.start', async () => ({ turnId: 't1' }))
    on('turn.complete', async () => ({ text: '' }))
    // A timer fires as soon as asked; the compaction timeout only when the test says so.
    const timeouts: (() => void)[] = []
    on('clock.after', async ($, e) => {
      if (refuseTimeout && (e as { ms: number }).ms >= COMPACT_TIMEOUT_MS) throw new Error('timer refused')
      if ((e as { ms: number }).ms >= COMPACT_TIMEOUT_MS) await new Promise<void>(r => { timeouts.push(r) })
      return { value: undefined } as never
    })
    on('session.usage', async () => ({ value: { startedAt: 0, context: { window: 200_000, percent: pct }, rateLimits: [] } }) as never)
    on('session.compact', async () => {
      log.push('compact')
      await beforeCompact()
      if (compact === 'reject') throw new Error('turn running')
      if (compact === 'skip') return { skip: 'vetoed' }
      return { messages: [{ role: 'user', text: 'summary', toolUses: [] }] }
    })
    on('prompt.submit', async ($, e) => {
      if (failSend && e.origin.kind === 'plugin') throw new Error('engine refused')
      if (e.origin.kind === 'plugin') await beforeSend()
      log.push(`submit:${e.origin.kind === 'plugin' && e.origin.asUser === true ? 'plugin' : e.origin.kind}:${e.text.split('\n')[0]}`)
      return { text: e.text }
    })
    on('prompt.fill', async ($, e) => { fills.push(e.text); return { isFilled: true } as never })
    on('ui.toast', async ($, e) => { toasts.push(e.text); return { value: undefined } as never })
    on('state.set', async ($, e, next) => {
      const { key, value } = e as { key: string; value: unknown }
      if (key === 'trail') trails.push(value)
      if (key === 'layout') layouts.push(value as { compactFirst?: boolean })
      return next(e)
    })
    const rounds = () => ((trails.at(-1) as FlightTrail | undefined)?.['REQ-042']?.['implement']?.rounds ?? []).map(r => `${r.decision}:${r.via}`)
    return {
      log, fills, toasts, rounds, layouts,
      setCompact: (c: typeof compact) => { compact = c },
      setFailSend: (f: boolean) => { failSend = f },
      refuseTimeout: () => { refuseTimeout = true },
      onSend: (f: () => Promise<void>) => { beforeSend = f }, // runs as the engine takes the mod's own send
      // The main loop's turn ends: clears `busy` and the pending reply (the real state; sendReply writes it).
      endTurn: () => $.turn.complete({ turnId: 't1', usage: {}, reason: 'end', isAborted: false, answer: '' } as never),
      onCompact: (f: () => Promise<void>) => { beforeCompact = f },
      // The compaction timeout runs out (once its timer was asked for).
      timeOut: async () => { await settle(() => timeouts.length > 0); timeouts.splice(0).forEach(f => f()) },
    }
  }

  test('pressed approve: compacts, then sends; revise and fix all never compact', async ($, on) => {
    const g = autoGate($, on)
    for (const key of ['opt-revise', 'opt-fix all', 'opt-approve']) {
      const before = g.log.length
      const ui = await mountPane($, 'terminal')
      await ui.press({ key })
      await settle(() => g.log.slice(before).some(l => l.startsWith('submit')))
      await ui.unmount()
      await g.endTurn()
    }
    expect(g.log).toEqual(['submit:plugin:revise', 'submit:plugin:fix all', 'compact', 'submit:plugin:approve'])
  })

  test('pressed approve: a vetoed or rejected compaction still sends, with a toast', async ($, on) => {
    const g = autoGate($, on)
    for (const c of ['skip', 'reject'] as const) {
      g.setCompact(c)
      const before = g.log.length
      const ui = await mountPane($, 'terminal')
      await ui.press({ key: 'opt-approve' })
      await settle(() => g.log.slice(before).some(l => l.startsWith('submit')))
      await ui.unmount()
      await g.endTurn()
    }
    expect(g.log).toEqual(['compact', 'submit:plugin:approve', 'compact', 'submit:plugin:approve'])
    expect(g.toasts.filter(t => /^not compacted — sent as is/.test(t)).length).toBe(2)
  })

  test('typed approve: held once, compacted, resent as the user by the mod; one round recorded', async ($, on) => {
    const g = autoGate($, on)
    const res = await $.prompt.submit(typedAt('approve')) as { drop?: string }
    expect(res.drop).toBe('compacting first — your reply follows')
    await settle(() => g.log.some(l => l.startsWith('submit')))
    expect(g.log).toEqual(['compact', 'submit:plugin:approve'])
    await settle(() => g.rounds().length > 0)
    expect(g.rounds()).toEqual(['approve:typed']) // typed, though the mod resent it
  })

  test('typed revise and fix all: no hold, no compaction, recorded as typed', async ($, on) => {
    const g = autoGate($, on)
    expect((await $.prompt.submit(typedAt('revise keep the default')) as { drop?: string }).drop).toBeUndefined()
    expect((await $.prompt.submit(typedAt('fix all')) as { drop?: string }).drop).toBeUndefined()
    expect(g.log).toEqual(['submit:composer:revise keep the default', 'submit:composer:fix all'])
    await settle(() => g.rounds().length > 1)
    expect(g.rounds()).toEqual(['revise:typed', 'fix all:typed'])
  })

  test('typed approve: a vetoed compaction still sends, with a toast', async ($, on) => {
    const g = autoGate($, on)
    g.setCompact('skip')
    await $.prompt.submit(typedAt('approve'))
    await settle(() => g.log.some(l => l.startsWith('submit')))
    expect(g.log).toEqual(['compact', 'submit:plugin:approve'])
    expect(g.toasts.some(t => /^not compacted — sent as is \(vetoed\)/.test(t))).toBe(true)
  })

  test('typed approve: sendReply failing → the text back in the box, with a toast', async ($, on) => {
    const g = autoGate($, on)
    g.setFailSend(true) // the engine refuses the resend: sendReply answers false
    await $.prompt.submit(typedAt('approve'))
    await settle(() => g.fills.length > 0)
    expect(g.fills).toEqual(['approve'])
    expect(g.toasts.filter(t => t === 'not sent — your reply is back in the box').length).toBe(1) // one toast, not two
    expect(g.log.filter(l => l.startsWith('submit'))).toEqual([])
  })

  test('pressed answer, no compaction: a failed send puts the reply back in the box, with one toast', async ($, on) => {
    const g = autoGate($, on)
    g.setFailSend(true)
    const ui = await mountPane($, 'terminal')
    await ui.press({ key: 'opt-revise' })
    await settle(() => g.fills.length > 0)
    await ui.unmount()
    expect(g.log).toEqual([]) // never compacted, never sent
    expect(g.fills.length).toBe(1)
    expect(g.fills[0]).toMatch(/^revise/)
    expect(g.toasts.filter(t => t === 'not sent — your reply is back in the box').length).toBe(1)
  })

  test('typed approve with a bracketed note: not held, not compacted', async ($, on) => {
    const g = autoGate($, on)
    expect((await $.prompt.submit(typedAt('approve <but rename X first>')) as { drop?: string }).drop).toBeUndefined()
    expect(g.log).toEqual(['submit:composer:approve <but rename X first>'])
  })

  test('typed approve mid-turn or with a reply pending: passes through, not held', async ($, on) => {
    const g = autoGate($, on)
    await $.turn.start({ text: 'x', turnId: 't1' } as never)
    expect((await $.prompt.submit(typedAt('approve')) as { drop?: string }).drop).toBeUndefined()
    await g.endTurn()
    // A reply sent from the pane is pending until its turn ends.
    const ui = await mountPane($, 'terminal')
    await ui.press({ key: 'opt-revise' })
    await settle(() => g.log.length > 1)
    await ui.unmount()
    expect((await $.prompt.submit(typedAt('approve')) as { drop?: string }).drop).toBeUndefined()
    expect(g.log).toEqual(['submit:composer:approve', 'submit:plugin:revise', 'submit:composer:approve'])
  })

  test('a second typed reply while compacting: dropped and filled back; the held approve is sent once', async ($, on) => {
    const g = autoGate($, on)
    let release = () => {}
    const gate = new Promise<void>(r => { release = r })
    g.onCompact(() => gate)
    expect((await $.prompt.submit(typedAt('approve')) as { drop?: string }).drop).toBe('compacting first — your reply follows')
    await settle(() => g.log.includes('compact'))
    const second = await $.prompt.submit(typedAt('revise tighten AC2')) as { drop?: string }
    expect(second.drop).toBe('still compacting — your reply is back in the box')
    await settle(() => g.fills.length > 0)
    expect(g.fills).toEqual(['revise tighten AC2'])
    release()
    await settle(() => g.log.some(l => l.startsWith('submit')))
    expect(g.log.filter(l => l.startsWith('submit'))).toEqual(['submit:plugin:approve'])
  })

  test('typed approve with a note: not held, not compacted', async ($, on) => {
    const g = autoGate($, on)
    expect((await $.prompt.submit(typedAt('approve, but rename X first')) as { drop?: string }).drop).toBeUndefined()
    expect(g.log).toEqual(['submit:composer:approve, but rename X first'])
  })

  test('held typed approve: a pressed answer and the ring are refused with a toast; the approve is sent once', async ($, on) => {
    const g = autoGate($, on)
    let release = () => {}
    const gate = new Promise<void>(r => { release = r })
    g.onCompact(() => gate)
    await $.prompt.submit(typedAt('approve'))
    await settle(() => g.log.includes('compact'))
    const ui = await mountPane($, 'terminal')
    await ui.press({ key: 'opt-revise' })
    await ui.press({ key: 'ring' })
    await settle(() => g.toasts.length > 1)
    expect(g.toasts).toEqual(['still compacting — your held reply goes first', 'still compacting — try again when it ends'])
    release()
    await settle(() => g.log.some(l => l.startsWith('submit')))
    await ui.unmount()
    expect(g.log).toEqual(['compact', 'submit:plugin:approve'])
  })

  test('a compaction that never settles: given up after the timeout, the approve back in the box and never sent', async ($, on) => {
    const g = autoGate($, on)
    let release = () => {}
    const gate = new Promise<void>(r => { release = r })
    g.onCompact(() => gate)
    await $.prompt.submit(typedAt('approve'))
    await settle(() => g.log.includes('compact'))
    await g.timeOut()
    await settle(() => g.fills.length > 0)
    expect(g.fills).toEqual(['approve'])
    expect(g.toasts).toContain('compaction is taking too long (it may still finish) — your reply is back in the box')
    // The deck is free again: a typed reply is no longer dropped as "still compacting".
    expect((await $.prompt.submit(typedAt('revise tighten AC2')) as { drop?: string }).drop).toBeUndefined()
    release() // the late compaction settles: the reply it held is not sent behind the person's back
    await settle(() => false)
    expect(g.log.filter(l => l.startsWith('submit'))).toEqual(['submit:composer:revise tighten AC2'])
  })

  test('after the give-up the compaction still runs: no second one starts; its late settle still clears compact first', async ($, on) => {
    const g = autoGate($, on, 'approve', 40, { layout: { height: 'max', narrow: false, compactFirst: true } })
    let release = () => {}
    const gate = new Promise<void>(r => { release = r })
    g.onCompact(() => gate)
    const ui = await mountPane($, 'terminal')
    await ui.press({ key: 'opt-approve' })
    await settle(() => g.log.includes('compact'))
    await g.timeOut()
    await settle(() => g.fills.length > 0)
    expect(g.fills[0]).toMatch(/^approve/)
    // The engine is still compacting: a pressed approve, the ring and a typed approve are all refused.
    await ui.press({ key: 'opt-approve' })
    await ui.press({ key: 'ring' })
    await settle(() => g.toasts.filter(t => t === 'still compacting — try again when it ends').length > 1)
    expect((await $.prompt.submit(typedAt('approve')) as { drop?: string }).drop).toBe('still compacting — your reply is back in the box')
    expect(g.log).toEqual(['compact'])
    release() // the late compaction settles: nothing is sent, and compact first is used up as on the normal path
    await settle(() => g.layouts.some(l => l.compactFirst === false))
    await ui.unmount()
    expect(g.layouts.at(-1)?.compactFirst).toBe(false)
    expect(g.log).toEqual(['compact'])
  })

  test('a clock that refuses the give-up timer: the approve still goes out, nothing stays stuck, later presses work', async ($, on) => {
    const g = autoGate($, on)
    g.refuseTimeout()
    const ui = await mountPane($, 'terminal')
    await ui.press({ key: 'opt-approve' })
    await settle(() => g.log.some(l => l.startsWith('submit')))
    expect(g.log).toEqual(['compact', 'submit:plugin:approve'])
    await g.endTurn()
    // Both flags cleared: the ring compacts again, with no "still compacting" refusal.
    await ui.press({ key: 'ring' })
    await settle(() => g.log.length > 2)
    await ui.unmount()
    expect(g.log).toEqual(['compact', 'submit:plugin:approve', 'compact'])
    expect(g.toasts.filter(t => /still compacting/.test(t))).toEqual([])
  })

  test('a second typed approve while the held one is being sent: refused and filled back, never compacted again', async ($, on) => {
    const g = autoGate($, on)
    let sending = false
    let release = () => {}
    const gate = new Promise<void>(r => { release = r })
    // The engine is still taking the held approve (compaction settled, send under way) when the person types approve again.
    g.onSend(async () => { sending = true; await gate })
    expect((await $.prompt.submit(typedAt('approve')) as { drop?: string }).drop).toBe('compacting first — your reply follows')
    await settle(() => sending)
    const second = await $.prompt.submit(typedAt('approve')) as { drop?: string }
    expect(second.drop).toBe('still compacting — your reply is back in the box')
    release()
    await settle(() => g.log.some(l => l.startsWith('submit')) && g.fills.length > 0)
    expect(g.fills).toEqual(['approve'])
    expect(g.log).toEqual(['compact', 'submit:plugin:approve'])
  })

  test('past compact at: below the threshold an approve goes as is, pressed or typed', async ($, on) => {
    const g = autoGate($, on, 'past', 40) // compact at 70
    expect((await $.prompt.submit(typedAt('approve')) as { drop?: string }).drop).toBeUndefined()
    const ui = await mountPane($, 'terminal')
    await ui.press({ key: 'opt-approve' })
    await settle(() => g.log.length > 1)
    await ui.unmount()
    expect(g.log).toEqual(['submit:composer:approve', 'submit:plugin:approve'])
  })

  test('past compact at: at or above the threshold an approve compacts first, typed', async ($, on) => {
    const g = autoGate($, on, 'past', 70)
    expect((await $.prompt.submit(typedAt('approve')) as { drop?: string }).drop).toBe('compacting first — your reply follows')
    await settle(() => g.log.some(l => l.startsWith('submit')))
    expect(g.log).toEqual(['compact', 'submit:plugin:approve'])
  })

  test('past compact at: at or above the threshold an approve compacts first, pressed', async ($, on) => {
    const g = autoGate($, on, 'past', 85)
    const ui = await mountPane($, 'terminal')
    await ui.press({ key: 'opt-approve' })
    await settle(() => g.log.some(l => l.startsWith('submit')))
    await ui.unmount()
    expect(g.log).toEqual(['compact', 'submit:plugin:approve'])
  })

  test('auto off: typed approve passes; pressed approve sends without compacting; the toggle still compacts', async ($, on) => {
    const g = autoGate($, on, 'off')
    expect((await $.prompt.submit(typedAt('approve')) as { drop?: string }).drop).toBeUndefined()
    const ui = await mountPane($, 'terminal')
    await ui.press({ key: 'opt-approve' })
    await settle(() => g.log.length > 1)
    await ui.unmount()
    expect(g.log).toEqual(['submit:composer:approve', 'submit:plugin:approve'])
  })
})

// ---------- 0.7.0: one band above the prompt, three heights; in flight means in flight ----------

const twoReqs = (): FlightDeck => ({ vault: 'D:/repo/.adlc', scannedAt: 0, reqs: [
  buildReq('REQ-042-payment-retries', { currentPhase: 3 }, false, null, 900),
  buildReq('REQ-sf-033-gate-turn', { currentPhase: 4, gateState: 'awaiting' }, true, 100, 100),
] })
const bandAt = (cols: number, rows = 24) => ({
  component: 'AbovePrompt' as const,
  props: { hasSurvey: false, isWorking: false, maxRows: rows, bodyColumns: cols, scroll: { offset: 0, bodyRows: rows - 1 }, view: {} },
})

describe('0.7.0', () => {
  test('in flight: started and not yet at the last phase, or waiting at its gate — phase 0 and an unmarked ship are history', () => {
    const at = (name: string, st: Parameters<typeof buildReq>[1], waiting = false) => buildReq(name, st, waiting, waiting ? 1 : null, 0)
    const reqs = [
      at('REQ-sf-001-unstarted', { currentPhase: 0 }),
      at('REQ-sf-002-spec', { currentPhase: 1 }),
      at('REQ-sf-003-architect-gate', { currentPhase: 2, gateState: 'awaiting' }, true),
      at('REQ-sf-004-review', { currentPhase: 4 }),
      at('REQ-sf-005-ship', { currentPhase: 5 }),
      at('REQ-sf-006-review-cleared', { currentPhase: 4, gateState: 'cleared' }), // cleared review → ship
      at('BUG-sf-7-fix', { currentPhase: 2 }),
      at('REQ-sf-008-ship-gate', { currentPhase: 5, gateState: 'awaiting' }, true), // 0.8.1: the ship gate is still a gate to answer
    ]
    expect(inFlight(reqs).map(r => r.id)).toEqual(['REQ-sf-002', 'REQ-sf-003', 'REQ-sf-004', 'BUG-sf-7', 'REQ-sf-008'])
  })

  test('chips never shrink: thirty REQs in 120 columns show the ones that fit, the selected one among them, then +n', async ($, on) => {
    const many = Array.from({ length: 30 }, (_, i) => buildReq(`REQ-sf-0${10 + i}-x`, { currentPhase: 2 + (i % 3) }, i % 4 === 0, i % 4 === 0 ? 1 : null, i))
    atGate(on, { deck: { vault: 'D:/repo/.adlc', scannedAt: 0, reqs: many }, strip: stripOf(many, [], () => null), view: { req: 'REQ-sf-034', tab: 3, sub: { kind: 'page' }, home: false }, gate: {} })
    for (const cols of [120, 80]) {
      const ui = await $.ui.mount({ plugin: 'adlc-flightdeck', surface: 'terminal', ...bandAt(cols, 400) })
      const chips = (await ui.findAll({ type: 'Button' })).filter(b => /^strip-REQ/.test(b.key ?? ''))
      const width = chips.reduce((w, c) => w + (c.text ?? '').length + 3, 0)
      expect(chips.length).toBeLessThan(30)
      expect(width).toBeLessThanOrEqual(cols)
      expect(chips.some(c => c.key === 'strip-REQ-sf-034')).toBe(true)
      expect((await ui.find({ key: 'strip-more' }))?.text).toBe(`+${30 - chips.length}${cols < 84 ? '' : ' more'} ▾`)
      const ids = chips.map(c => (c.key ?? '').slice(6))
      expect(ids).toEqual(ids.slice().sort(idOrder)) // by ID number
      await ui.unmount()
    }
  })

  test('no letter key on any header control: the terminal would draw it as `k: label`', async ($, on) => {
    atGate(on)
    for (const cols of [120, 80]) {
      const ui = await $.ui.mount({ plugin: 'adlc-flightdeck', surface: 'terminal', ...bandAt(cols, 400) })
      for (const k of ['ring', 'tab-history', 'tab-settings', 'size', 'collapse', 'home', 'band-open', 'expand']) {
        expect((await ui.find({ key: k }))?.props.hotkey).toBeUndefined()
      }
      const letters = (await ui.findAll({ type: 'Button' })).filter(b => typeof b.props.hotkey === 'string' && /^[a-z]$/.test(b.props.hotkey as string))
      expect(letters.map(b => b.key).filter(k => !/^(compose|mermaid-src|opt-.*)$/.test(k ?? ''))).toEqual([]) // 0.8.1: the gate's options are lettered
      await ui.unmount()
    }
  })

  test('strip: a sprint member that finished here rides along done, after the ones flying', () => {
    const members = sprintMembers(JSON.stringify({ sprint: 'S1', status: 'running', reqs: [{ id: 'REQ-sf-032', status: 'merged' }, { id: 'REQ-sf-033', status: 'running' }] }))
    expect(members.map(m => m.id)).toEqual(['REQ-sf-032', 'REQ-sf-033']) // finished members stay members while the sprint runs
    const strip = stripOf(twoReqs().reqs, members, id => (id === 'REQ-sf-032' ? 'merged' : null))
    expect(strip.map(s => [s.id, s.ended ?? ''])).toEqual([['REQ-sf-033', ''], ['REQ-042', ''], ['REQ-sf-032', 'merged']])
  })

  test('band: one row — REQ · phase · gate: ask · n in flight · k at gate, ⤢ (the engine draws [-]), no key hints', async ($, on) => {
    on('clock.now', async () => ({ value: 5000 }))
    const deck2 = twoReqs()
    state(on, 'deck', deck2)
    state(on, 'focus', null)
    state(on, 'lanes', [])
    state(on, 'strip', stripOf(deck2.reqs, [], () => null))
    state(on, 'gate', { 'REQ-sf-033': { ...parseMarker(IMPLEMENT_MARKER), ask: 'fix all?' } })
    const ui = await $.ui.mount({ plugin: 'adlc-flightdeck', surface: 'terminal', ...bandAt(120) })
    expect((await ui.find({ key: 'band-open' }))?.text).toMatch(/✈ REQ-sf-033 · review · gate: approve\? · 2 in flight · 1 at gate/) // the recommended option, asked
    expect(await ui.find({ key: 'expand' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /×/ })).toBeUndefined() // 0.8.1: the dead `×` is gone; the engine's own [-] collapses the band
    expect(await ui.find({ type: 'Text', text: /\bp\b.*cockpit|esc →|j \/ k/ })).toBeUndefined()
    await ui.unmount()
  })

  test('heights: ⤢ opens the summary, ⤢ again the evidence too, × back to the band; nothing is cut, no pane is opened', async ($, on) => {
    on('clock.now', async () => ({ value: 5000 }))
    const deck2 = twoReqs()
    state(on, 'deck', deck2)
    state(on, 'focus', 'REQ-042')
    state(on, 'lanes', [])
    state(on, 'items', items)
    state(on, 'trail', {})
    state(on, 'settings', settings)
    state(on, 'strip', stripOf(deck2.reqs, [], () => null))
    let opened = 0
    on('ui.open', async () => { opened += 1; return { value: { isPlaced: true } } })
    const ui = await $.ui.mount({ plugin: 'adlc-flightdeck', surface: 'terminal', ...bandAt(120, 30) })
    await ui.press({ key: 'expand' })
    await settle(() => false)
    const props = ((await ui.drawn()) as unknown as { props: Record<string, unknown> }).props
    expect(props.height).toBeUndefined() // a tree taller than the band scrolls in the engine's window
    expect(props.overflow).toBeUndefined()
    expect(await ui.find({ key: 'strip-REQ-042' })).toBeDefined()
    expect(await ui.find({ key: 'tab-3' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /in progress — implement/ })).toBeDefined()
    expect((await ui.find({ key: 'evidence' }))?.text).toMatch(/⤢ FILES/) // the summary says what ⤢ adds
    expect(await ui.find({ type: 'Text', text: /asking git/ })).toBeUndefined() // …and draws none of it
    expect((await ui.find({ key: 'size' }))?.text).toBe('⤢')
    await ui.press({ key: 'size' })
    await settle(() => false)
    expect(await ui.find({ type: 'Text', text: /asking git/ })).toBeDefined() // FILES, waiting on git
    expect(await ui.find({ key: 'evidence' })).toBeUndefined()
    expect((await ui.find({ key: 'size' }))?.text).toBe('⤡')
    await ui.press({ key: 'collapse' })
    await settle(() => false)
    expect(await ui.find({ key: 'band-open' })).toBeDefined()
    expect(await ui.find({ key: 'tab-3' })).toBeUndefined()
    expect(opened).toBe(0)
    await ui.unmount()
  })

  test('/flight opens the cockpit in the band, never a pane; close, max and toggle change its height', async ($, on) => {
    on('clock.now', async () => ({ value: 5000 }))
    const deck2 = twoReqs()
    state(on, 'deck', deck2)
    state(on, 'focus', 'REQ-042')
    state(on, 'lanes', [])
    state(on, 'items', items)
    state(on, 'trail', {})
    state(on, 'settings', settings)
    let opened = 0
    on('ui.open', async () => { opened += 1; return { value: { isPlaced: true } } })
    const run = async (args = '') => ((await $.command.run({ command: 'flight', args } as never)) as { text?: string }).text ?? ''
    expect(await run()).toMatch(/open above the prompt/)
    const ui = await $.ui.mount({ plugin: 'adlc-flightdeck', surface: 'terminal', ...bandAt(120, 30) })
    expect(await ui.find({ key: 'tab-3' })).toBeDefined() // the band is open: the REQ's live phase
    expect(await run('close')).toMatch(/collapsed to its one row/)
    await settle(() => false)
    expect(await ui.find({ key: 'band-open' })).toBeDefined()
    expect(await run('max')).toMatch(/full height/)
    await settle(() => false)
    expect((await ui.find({ key: 'size' }))?.text).toBe('⤡')
    expect(await run('toggle')).toMatch(/collapsed/)
    expect(opened).toBe(0)
    await ui.unmount()
  })

  test('wide: level 1 chips with history · settings · ⤢ · ×; level 2 tabs with a status line from 110 columns', async ($, on) => {
    atGate(on)
    const wide = await $.ui.mount({ plugin: 'adlc-flightdeck', surface: 'terminal', ...bandAt(120, 400) })
    expect((await wide.find({ key: 'strip-REQ-042' }))?.text).toMatch(/REQ-042 ● implement/)
    expect((await wide.find({ key: 'tab-history' }))?.text).toBe('history')
    expect((await wide.find({ key: 'tab-3' }))?.text).toMatch(/3 implement ●/)
    expect(await wide.find({ type: 'Text', text: /waiting 0:05/ })).toBeDefined() // implement's status line
    expect(await wide.find({ key: 'home' })).toBeUndefined() // ‹ back exists only in narrow
    expect((await wide.findAll({ type: 'Text', text: /‹|›/ })).map(t => t.text)).toEqual(['debrief ›']) // 0.10.0: the GATE line's link; no ‹ back
    await wide.unmount()
    const mid = await $.ui.mount({ plugin: 'adlc-flightdeck', surface: 'terminal', ...bandAt(100, 400) })
    expect(await mid.find({ key: 'tab-3' })).toBeDefined()
    expect(await mid.find({ type: 'Text', text: /waiting 0:05/ })).toBeUndefined() // no status lines under 110
    await mid.unmount()
  })

  test('narrow: chips shrink to the number, h / s; the list home replaces the tabs; a row opens its page with ‹ back', async ($, on) => {
    atGate(on, { view: undefined })
    const ui = await $.ui.mount({ plugin: 'adlc-flightdeck', surface: 'terminal', ...bandAt(80, 400) })
    expect((await ui.find({ key: 'strip-REQ-042' }))?.text).toMatch(/^042 ●$/)
    expect((await ui.find({ key: 'tab-history' }))?.text).toBe('h')
    expect((await ui.find({ key: 'tab-settings' }))?.text).toBe('s')
    expect(await ui.find({ key: 'home-3' })).toBeDefined()
    expect(await ui.find({ key: 'tab-3' })).toBeUndefined()
    expect(await ui.find({ key: 'home' })).toBeUndefined() // no back on the list
    await ui.press({ key: 'home-3' })
    expect((await ui.find({ key: 'home' }))?.text).toBe('‹ back')
    expect(await ui.find({ key: 'home-3' })).toBeUndefined()
    expect(await ui.find({ key: 'opt-approve' })).toBeDefined() // the action bar works in narrow mode too
    await ui.press({ key: 'home' })
    expect(await ui.find({ key: 'home-3' })).toBeDefined()
    await ui.unmount()
  })

  test('strip: the one at a gate is selected; a member with nothing here is dim; a chip switches the tabs', async ($, on) => {
    const reqs = twoReqs().reqs
    const members = sprintMembers(JSON.stringify({ sprint: 'SPRINT-2026-10-24-0900', status: 'running', reqs: [{ id: 'REQ-sf-033-gate-turn', status: 'running' }, { id: 'REQ-sf-040-elsewhere', status: 'running' }] }))
    expect(sprintMembers(JSON.stringify({ status: 'complete', reqs: [{ id: 'REQ-1-x' }] }))).toEqual([])
    const strip = stripOf(reqs, members, () => false)
    expect(strip.map(s => s.id)).toEqual(['REQ-sf-033', 'REQ-042', 'REQ-sf-040'])
    atGate(on, { deck: { vault: 'D:/repo/.adlc', scannedAt: 0, reqs }, strip, view: undefined, gate: {} })
    const ui = await mountPane($, 'terminal')
    expect((await ui.find({ key: 'strip-REQ-sf-033' }))?.props.dimColor).toBe(false) // the one at a gate is selected
    await ui.press({ key: 'strip-more' }) // by ID, REQ-042 is past the width: the list has it, and the member with nothing here
    expect((await ui.find({ key: 'reqs-REQ-042' }))?.props.dimColor).toBe(true)
    expect((await ui.find({ key: 'reqs-REQ-sf-040' }))?.text).toMatch(/not on this machine/)
    await ui.press({ key: 'reqs-REQ-042' })
    expect((await ui.find({ key: 'strip-REQ-042' }))?.props.dimColor).toBe(false)
    expect(await ui.find({ type: 'Text', text: /in progress — implement/ })).toBeDefined() // its live phase: implement
    await ui.unmount()
  })
})

// ---------- 0.8.0: ✈ goes to what is flying; +n opens the list; everything by ID ----------

describe('0.8.0', () => {
  test('order by ID number: REQs before BUGs, the number, not the text', () => {
    expect(['REQ-sf-026', 'BUG-3', 'REQ-sf-011', 'REQ-sf-100', 'REQ-sf-020'].sort(idOrder)).toEqual(['REQ-sf-011', 'REQ-sf-020', 'REQ-sf-026', 'REQ-sf-100', 'BUG-3'])
  })

  test('✈ target: a running sprint\'s first member in flight, else the REQ being flown, else a gate', () => {
    const e = (id: string, x: Partial<{ waiting: boolean; sprint: string | null; here: boolean; ended: 'merged' }> = {}) =>
      ({ id, phase: 2, phaseName: 'architect', waiting: false, sprint: null, here: true, ...x })
    expect(flyingTarget([e('REQ-9'), e('REQ-7', { sprint: 'S' }), e('REQ-5', { sprint: 'S', ended: 'merged' }), e('REQ-6', { sprint: 'S', here: false })], 'REQ-9')).toBe('REQ-7')
    expect(flyingTarget([e('REQ-9'), e('REQ-4', { waiting: true })], 'REQ-9')).toBe('REQ-9')
    expect(flyingTarget([e('REQ-9'), e('REQ-4', { waiting: true })], 'REQ-1')).toBe('REQ-4')
    expect(flyingTarget([e('REQ-9'), e('REQ-8')], null)).toBe('REQ-8')
    expect(flyingTarget([], null)).toBe(null)
  })

  test('+n more opens every REQ in flight by ID; a row opens its phases; ✈ goes back to the one flying', async ($, on) => {
    const many = Array.from({ length: 12 }, (_, i) => buildReq(`REQ-sf-0${40 - i}-x`, { currentPhase: 2 + (i % 3) }, false, null, i))
    atGate(on, { deck: { vault: 'D:/repo/.adlc', scannedAt: 0, reqs: many }, strip: stripOf(many, [], () => null), focus: 'REQ-sf-035', view: undefined, gate: {} })
    on('ui.scroll', async () => ({ value: {} }) as never)
    const ui = await $.ui.mount({ plugin: 'adlc-flightdeck', surface: 'terminal', ...bandAt(100, 400) })
    await ui.press({ key: 'fly' }) // nothing chosen yet: ✈ lands on the REQ this session flies
    expect((await ui.find({ key: 'strip-REQ-sf-035' }))?.props.dimColor).toBe(false)
    await ui.press({ key: 'strip-more' })
    const rows = (await ui.findAll({ type: 'Button' })).filter(b => /^reqs-/.test(b.key ?? '')).map(b => (b.key ?? '').slice(5))
    expect(rows.length).toBe(12)
    expect(rows).toEqual(rows.slice().sort(idOrder))
    expect((await ui.find({ key: 'reqs-REQ-sf-035' }))?.text).toMatch(/▸/) // the one shown, marked
    await ui.press({ key: 'reqs-REQ-sf-030' })
    expect(await ui.find({ key: 'tab-2' })).toBeDefined() // its phases
    expect((await ui.find({ key: 'strip-REQ-sf-030' }))?.props.dimColor).toBe(false)
    await ui.press({ key: 'fly' })
    expect((await ui.find({ key: 'strip-REQ-sf-035' }))?.props.dimColor).toBe(false)
    await ui.unmount()
  })

  test('history: by ID number, every row opens that REQ, the one shown is marked', async ($, on) => {
    on('clock.now', async () => ({ value: 5000 }))
    state(on, 'deck', vaultDeck)
    state(on, 'focus', 'REQ-042')
    state(on, 'items', items)
    state(on, 'trail', {})
    state(on, 'settings', settings)
    state(on, 'layout', { height: 'max', narrow: true })
    state(on, 'view', { req: 'REQ-042', tab: 'history', sub: { kind: 'page' } })
    const ui = await $.ui.mount({ plugin: 'adlc-flightdeck', surface: 'desktop', ...bandAt(70, 400) }) // narrow: the rows still press
    const rows = (await ui.findAll({ type: 'Button' })).filter(b => /^hist-[A-Z]+-[\w-]+$/.test(b.key ?? '') && !/-(first|last)$/.test(b.key ?? '')).map(b => (b.key ?? '').slice(5))
    expect(rows).toEqual(['REQ-007', 'REQ-042', 'BUG-016'])
    expect((await ui.find({ key: 'hist-REQ-042' }))?.text).toMatch(/▸/)
    await ui.unmount()
  })
})

// ---------- 0.8.1: make the record true ----------

/** Every value the drawing reads, counted; registered before the stubs so it sees each read. */
const countReads = (on: On) => {
  const reads: Record<string, number> = {}
  on('state.get', async ($, e, next) => { const k = String((e as { key: string }).key); reads[k] = (reads[k] ?? 0) + 1; return next(e) })
  return reads
}
/** Every child process a hook ran: its argv after `git --no-optional-locks`, answered with `stdout`. */
const countRuns = (on: On, stdout = '') => {
  const runs: string[][] = []
  on('process.run', async ($, e) => {
    runs.push([...(e as { argv: readonly string[] }).argv])
    return { value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } } as never
  })
  return runs
}
const DIFF = 'diff --git a/src/pay/Startup.cs b/src/pay/Startup.cs\n--- a/src/pay/Startup.cs\n+++ b/src/pay/Startup.cs\n@@ -1,1 +1,2 @@\n line\n+services.AddRetry();\n'

describe('0.8.1', () => {
  // A write made while drawing is refused, and the `update` helper reads its value again before it writes: so a
  // drawing that tried one shows as a second read of that value. Each value is read once — settings, deck and
  // layout twice (the band's hook, then the cockpit) — and no child process runs.
  const pure = [
    { name: 'narrow while layout says wide', cols: 80, extra: { view: { req: 'REQ-042', tab: 3, sub: { kind: 'page' }, home: false } } },
    { name: 'no git facts yet for the REQ shown', cols: 120, extra: { git: {} } },
    { name: 'a diff open', cols: 120, extra: { view: { req: 'REQ-042', tab: 3, sub: { kind: 'diff', path: 'src/pay/Startup.cs' }, home: false } } },
    { name: 'the debrief open, narrow', cols: 80, extra: { view: { req: 'REQ-042', tab: 3, sub: { kind: 'debrief' }, home: false } } },
  ]
  for (const v of pure) test(`a render only reads, no write and no git: ${v.name}`, async ($, on) => {
    {
      const reads = countReads(on)
      const runs = countRuns(on)
      atGate(on, v.extra as never)
      const ui = await $.ui.mount({ plugin: 'adlc-flightdeck', surface: 'terminal', ...bandAt(v.cols, 400) })
      await settle(() => false)
      for (const [k, n] of Object.entries(reads)) expect(`${k} ×${n}`).toBe(`${k} ×${['settings', 'deck', 'layout'].includes(k) ? Math.min(n, 2) : 1}`)
      expect(runs).toEqual([])
      if ((v.extra as { view?: { sub: { kind: string } } }).view?.sub.kind === 'diff') expect(await ui.find({ type: 'Text', text: /reading the diff/ })).toBeDefined()
      await ui.unmount()
    }
  })

  test('opening a diff: git is asked and the viewed mark lands from the press, not the draw', async ($, on) => {
    const runs = countRuns(on, DIFF)
    const sets: { key: string; value: unknown }[] = []
    on('state.set', async ($, e, next) => { sets.push({ key: String((e as { key: string }).key), value: (e as { value: unknown }).value }); return next(e) })
    atGate(on, { view: undefined, viewed: undefined }) // view and viewed left to the real state, so the press's writes land
    const ui = await $.ui.mount({ plugin: 'adlc-flightdeck', surface: 'terminal', ...bandAt(120, 400) })
    await ui.press({ key: 'tab-3' })
    expect(sets.filter(x => x.key === 'viewed')).toEqual([])
    expect(runs).toEqual([])
    await ui.press({ key: 'diff-src/pay/startup.cs' })
    expect(runs.map(r => r.slice(2, 3))).toEqual([['diff']])
    expect(sets.filter(x => x.key === 'viewed').map(x => x.value)).toEqual([{ 'REQ-042': { 'src/pay/startup.cs': 'h2' } }])
    expect(await ui.find({ type: 'Text', text: /◉ viewed/ })).toBeDefined()
    expect(await ui.find({ type: 'Code' })).toBeDefined()
    expect(runs.length).toBe(1) // the redraws after it ask nothing
    await ui.unmount()
  })

  test('a REQ waiting at the ship gate stays in flight: on the band, with its gate', async ($, on) => {
    on('clock.now', async () => ({ value: 5000 }))
    const shipping: FlightDeck = { vault: 'D:/repo/.adlc', scannedAt: 0, reqs: [buildReq('REQ-sf-005-ship', { currentPhase: 5, gateState: 'awaiting' }, true, 100, 100)] }
    expect(inFlight(shipping.reqs).map(r => r.id)).toEqual(['REQ-sf-005'])
    state(on, 'deck', shipping)
    state(on, 'focus', 'REQ-sf-005')
    state(on, 'lanes', [])
    state(on, 'strip', stripOf(inFlight(shipping.reqs), [], () => null))
    on('ui.render', { component: 'AbovePrompt' }, async ($, e) => { const { Text } = $.ui.resolve(e); return <Text>engine</Text> })
    const ui = await $.ui.mount({ plugin: 'adlc-flightdeck', surface: 'terminal', ...bandAt(120) })
    expect((await ui.find({ key: 'band-open' }))?.text).toMatch(/✈ REQ-sf-005 · ship · gate: .* · 1 in flight · 1 at gate/)
    await ui.unmount()
  })

  const reviewDeck: FlightDeck = { vault: 'D:/repo/.adlc', scannedAt: 0, reqs: [buildReq('REQ-042-payment-retries', { currentPhase: 4, gateState: 'awaiting' }, true, 0, 0)] }
  const keyViews: { name: string; cols: number; extra: Partial<Record<Key, unknown>> }[] = [
    { name: 'the implement gate, wide', cols: 120, extra: {} },
    { name: 'the narrow list home', cols: 80, extra: { view: { req: 'REQ-042', tab: 3, sub: { kind: 'page' }, home: true } } },
    { name: 'narrow, on the gate\'s page', cols: 80, extra: { view: { req: 'REQ-042', tab: 3, sub: { kind: 'page' }, home: false } } },
    { name: 'review: five options and compose', cols: 120, extra: { deck: reviewDeck, gate: { 'REQ-042': parseMarker(MARKER) }, picks: { 'REQ-042': { C1: 'fix' } }, view: { req: 'REQ-042', tab: 4, sub: { kind: 'page' }, home: false } } },
  ]
  for (const v of keyViews) test(`no digit on any band Button; the gate's options take letters, never twice in a view: ${v.name}`, async ($, on) => {
    {
      atGate(on, v.extra)
      const ui = await $.ui.mount({ plugin: 'adlc-flightdeck', surface: 'terminal', ...bandAt(v.cols, 400) })
      const keyed = (await ui.findAll({ type: 'Button' })).filter(b => typeof b.props.hotkey === 'string')
      const hotkeys = keyed.map(b => b.props.hotkey as string)
      expect(hotkeys.filter(h => /^\d$/.test(h))).toEqual([])
      expect(new Set(hotkeys).size).toBe(hotkeys.length)
      const opts = keyed.filter(b => /^opt-/.test(b.key ?? ''))
      if (v.extra.view && (v.extra.view as { home?: boolean }).home) expect(opts).toEqual([]) // the list home: the options are not on screen
      else expect(opts.map(b => b.props.hotkey)).toEqual(['a', 'b', 'd', 'e', 'f', 'g', 'i', 'j'].slice(0, opts.length))
      if (v.extra.deck === reviewDeck) {
        expect(opts.length).toBe(5)
        expect((await ui.find({ key: 'compose' }))?.props.hotkey).toBe('c')
      }
      expect((await ui.findAll({ type: 'Button' })).filter(b => /^home-/.test(b.key ?? '') && b.props.hotkey !== undefined)).toEqual([])
      await ui.unmount()
    }
  })

  test('heartbeat: 4 Hz only while an agent lane runs; gates alone move the clock at most once a minute', async ($, on) => {
    const clock = mock.clock(on, { now: 10_000_000 })
    mock.store(on)
    on('command.register', async () => ({ value: { command: 'flight' } }) as never)
    on('session.start', async ($, e) => ({ cwd: e.cwd }) as never)
    let lanes: FlightLane[] = []
    const ticks: number[] = []
    on('state.set', async ($, e, next) => { if ((e as { key: string }).key === 'now') ticks.push(clock.now()); return next(e) })
    on('state.get', { plugin: 'adlc-flightdeck', key: 'lanes' } as never, async () => ({ value: { value: lanes, version: 1 } }) as never)
    // Two gates waiting, one of them for weeks: neither makes the band tick fast.
    state(on, 'deck', { vault: 'D:/repo/.adlc', scannedAt: 0, reqs: [
      buildReq('REQ-042-payment-retries', { currentPhase: 3, gateState: 'awaiting' }, true, 9_000_000, 0),
      buildReq('REQ-sf-002-old', { currentPhase: 2, gateState: 'awaiting' }, true, 10_000_000 - 21 * 86_400_000, 0),
    ] })
    await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true } as never)
    await clock.advance(180_000)
    await clock.settle()
    expect(ticks.length).toBeGreaterThanOrEqual(1)
    expect(ticks.length).toBeLessThanOrEqual(4) // 3 minutes of gates: about one tick a minute, never 720
    ticks.length = 0
    lanes = [{ ...lane, startedAt: clock.now() }] // an agent flying
    await clock.advance(10_000)
    await clock.settle()
    expect(ticks.length).toBeGreaterThanOrEqual(30) // 4 Hz while it runs
  })

  for (const height of ['band', 'max'] as const) test(`band keys unique, and the band keeps what other plugins draw beneath it: ${height}`, async ($, on) => {
    on('ui.render', { component: 'AbovePrompt' }, async ($, e) => { const { Text } = $.ui.resolve(e); return <Text>another mod</Text> })
    {
      atGate(on, { layout: { height } })
      for (const surface of ['terminal', 'desktop'] as const) {
        const ui = await $.ui.mount({ plugin: 'adlc-flightdeck', surface, ...bandAt(120, 400) })
        expect(await ui.find({ type: 'Text', text: /another mod/ })).toBeDefined()
        expect(await ui.find({ key: height === 'band' ? 'band-open' : 'tab-3' })).toBeDefined()
        const keys = (await ui.findAll({ type: 'Button' })).map(b => b.key)
        expect(keys.filter(k => !k)).toEqual([])
        expect(keys.filter((k, i) => keys.indexOf(k) !== i)).toEqual([])
        await ui.unmount()
      }
    }
  })
})

// ---------- 0.9.0: the context ring in the header ----------

describe('context ring', () => {
  const usage = (on: On, pct: () => number) =>
    on('session.usage', async () => ({ value: { startedAt: 0, context: { window: 200_000, percent: pct() }, rateLimits: [] } }) as never)
  /** Button keys in drawn order. */
  const order = async (ui: { findAll: (q: { type: 'Button' }) => Promise<{ key?: string | null }[]> }) => (await ui.findAll({ type: 'Button' })).map(b => b.key ?? '')

  for (const [name, height, cols, next] of [
    ['band', 'band', 120, 'expand'], ['open', 'open', 120, 'tab-history'], ['max', 'max', 120, 'tab-history'], ['narrow', 'max', 80, 'tab-history'],
  ] as const) test(`ring and whole percent sit just before ${next === 'expand' ? '⤢ (the band has no history)' : 'history'}: ${name}`, async ($, on) => {
    atGate(on, { layout: { height, narrow: false } })
    usage(on, () => 30.4)
    const ui = await $.ui.mount({ plugin: 'adlc-flightdeck', surface: 'terminal', ...bandAt(cols, 400) })
    expect((await ui.find({ key: 'ring' }))?.text).toBe('◔ 30%')
    const keys = await order(ui)
    const at = keys.indexOf('ring')
    expect(at).toBeGreaterThanOrEqual(0)
    expect(keys.slice(at + 1).find(k => k === next || k === 'tab-history' || k === 'expand')).toBe(next) // the next header control after the ring
    expect((await ui.find({ key: 'ring' }))?.props.hotkey).toBeUndefined() // plain: no key, no digit
    await ui.unmount()
  })

  test('no percent known: no ring', async ($, on) => {
    atGate(on)
    const ui = await mountPane($, 'terminal')
    expect(await ui.find({ key: 'ring' })).toBeUndefined()
    expect(await ui.find({ key: 'tab-history' })).toBeDefined()
    await ui.unmount()
  })

  test('amber at or above compact at, normal below; still shown with compact: never', async ($, on) => {
    let mode: Record<string, unknown> = { ...settings, compactAt: 70 }
    atGate(on, { settings: undefined })
    on('state.get', { plugin: 'adlc-flightdeck', key: 'settings' } as never, async () => ({ value: { value: mode, version: 1 } }) as never)
    usage(on, () => 70)
    const look = async () => {
      const ui = await mountPane($, 'terminal')
      const t = await ui.find({ type: 'Text', text: /^◕ 70%$/ })
      await ui.unmount()
      return t
    }
    expect((await look())?.props.color).toBe('warning') // at the threshold
    mode = { ...settings, compactAt: 80 }
    expect((await look())?.props.color).toBeUndefined()
    mode = { ...settings, compact: 'never' }
    expect(await look()).toBeDefined() // pressing it is always your own call
  })

  test('pressed idle: compacts with the REQ brief, and the percent is asked again at once', async ($, on) => {
    atGate(on)
    let pct = 75
    let briefs: string[] = []
    usage(on, () => pct)
    on('session.compact', async ($, e) => {
      briefs = [...briefs, e.instructions ?? '']
      pct = 10
      return { messages: [{ role: 'user', text: 'summary', toolUses: [] }] }
    })
    const ui = await mountPane($, 'terminal')
    expect((await ui.find({ key: 'ring' }))?.text).toBe('◕ 75%')
    await ui.press({ key: 'ring' })
    await settle(() => briefs.length > 0)
    await ui.unmount()
    expect(briefs.length).toBe(1)
    expect(briefs[0]).toMatch(/ADLC gate compaction\. Resuming REQ-042/)
    const again = await mountPane($, 'terminal') // same clock: only the reset cache lets the new percent through
    expect((await again.find({ key: 'ring' }))?.text).toBe('○ 10%')
    await again.unmount()
  })

  test('pressed mid-turn: a toast, no compaction; a vetoed compaction says so', async ($, on) => {
    atGate(on)
    usage(on, () => 50)
    let compacted = 0
    let veto = false
    const toasts: string[] = []
    on('turn.start', async () => ({ turnId: 't1' }))
    on('turn.complete', async () => ({ text: '' }))
    on('session.compact', async () => { compacted += 1; return veto ? { skip: 'vetoed' } : { messages: [{ role: 'user', text: 'summary', toolUses: [] }] } })
    on('ui.toast', async ($, e) => { toasts.push(e.text); return { value: undefined } as never })
    await $.turn.start({ text: 'x', turnId: 't1' } as never)
    const ui = await mountPane($, 'terminal')
    await ui.press({ key: 'ring' })
    await settle(() => toasts.length > 0)
    expect(toasts).toEqual(['Claude is working — compact when the turn ends'])
    expect(compacted).toBe(0)
    await $.turn.complete({ turnId: 't1', usage: {}, reason: 'end', isAborted: false, answer: '' } as never)
    veto = true
    await ui.press({ key: 'ring' })
    await settle(() => toasts.length > 1)
    await ui.unmount()
    expect(compacted).toBe(1)
    expect(toasts[1]).toBe('not compacted (vetoed)')
  })

  test('band: pressed, compacts with the brief of the REQ the band shows', async ($, on) => {
    atGate(on, { layout: { height: 'band' } })
    usage(on, () => 30)
    let brief = ''
    on('session.compact', async ($, e) => { brief = e.instructions ?? 'none'; return { messages: [{ role: 'user', text: 'summary', toolUses: [] }] } })
    const ui = await $.ui.mount({ plugin: 'adlc-flightdeck', surface: 'terminal', ...bandAt(120, 400) })
    await ui.press({ key: 'ring' })
    await settle(() => brief !== '')
    await ui.unmount()
    expect(brief).toMatch(/Resuming REQ-042/)
  })
})

// ---------- 0.10.0: the debrief — the ship tab's DEBRIEF and the debrief view ----------

const SHIP_MARKER = [
  'Phase: ship', 'REQ: REQ-042-payment-retries', 'Gate: 5/5', 'Awaiting: ship it.', 'Ask: Ship REQ-042?', 'Options:',
  '  - approve — run the merge checklist', '  - revise <what> — adjust the PR draft or vault', '  - merged — after you merge; finalize state',
  '  - abort — halts without merging', 'Recommended: approve',
].join('\n')
const FOLDER = 'D:/repo/.adlc/specs/REQ-042-payment-retries'
const MOD = 'core/extras/claude/mods/adlc-flightdeck'
const shipDeck: FlightDeck = { vault: 'D:/repo/.adlc', scannedAt: 0, reqs: [buildReq('REQ-042-payment-retries', { currentPhase: 5, gateState: 'awaiting' }, true, 0, 0)] }
const shipGit: Record<string, FlightGit> = {
  'REQ-042': {
    ...(gitFacts['REQ-042'] as FlightGit),
    touched: [
      { path: `${MOD}/hooks/register.tsx`, status: 'M', add: 88, del: 12 },
      { path: `${MOD}/hooks/model.ts`, status: 'M', add: 24, del: 3 },
      { path: 'README.md', status: 'M', add: 9, del: 1 },
    ],
    hashes: {},
  },
}
// The worked example of architecture.md (ADV-005): it names register, so 1 of 3; model.ts and README.md are not mentioned.
const SUMMARY = 'compaction in register, ring in the band'
const shipTrail = (rounds: { decision: string; note: string }[] = [{ decision: 'summary', note: SUMMARY }, { decision: 'debrief', note: 'lead · why not a dialog' }]): FlightTrail => ({
  'REQ-042': { ship: { rounds: rounds.map((r, i) => ({ at: i, ...r })), runs: [], card: null } },
})
/**
 * Files the mod reads, by path; anything else falls through (and reads as missing). Matched by suffix: the host
 * resolves `D:/…` against the test's folder on a POSIX machine. A fresh mtime per call, so the mtime cache never
 * serves an older test's text.
 */
let fsEpoch = 0
const files = (on: On, map: Record<string, string>) => {
  const mtimeMs = ++fsEpoch
  const at = (path: string) => Object.entries(map).find(([k]) => path === k || path.endsWith(`/${k}`))?.[1]
  on('fs.stat', async ($, e, next) => {
    const t = at((e as { path: string }).path)
    return t === undefined ? next(e) : ({ value: { kind: 'file', size: t.length, mtimeMs, isLink: false } } as never)
  })
  on('fs.read', async ($, e, next) => {
    const t = at((e as { path: string }).path)
    return t === undefined ? next(e) : ({ value: t } as never)
  })
}
const debriefView = { req: 'REQ-042', tab: 5, sub: { kind: 'debrief' }, home: false }
/** The ship gate with a debrief on disk, drawn at one width: the one helper whose width spans all three regimes (L-REQ-001-4). */
const debriefAt = async ($: Parameters<TestBody>[0], on: On, cols: 120 | 100 | 80, { md = DEBRIEF as string | null, ...extra }: Partial<Record<Key, unknown>> & { md?: string | null } = {}) => {
  atGate(on, { deck: shipDeck, git: shipGit, trail: shipTrail(), gate: { 'REQ-042': parseMarker(SHIP_MARKER) }, view: debriefView, ...extra })
  files(on, md === null ? {} : { [`${FOLDER}/debrief.md`]: md })
  return $.ui.mount({ plugin: 'adlc-flightdeck', surface: 'terminal', ...bandAt(cols, 400) })
}
type Mounted = Awaited<ReturnType<typeof debriefAt>>
/** The view never uses the mod's accent: the only autoAccept Texts are level 1's (✈ and the selected chip). */
const accentOutsideLevel1 = async (ui: Mounted) =>
  (await ui.findAll({ type: 'Text' })).filter(t => t.props.color === 'autoAccept').map(t => t.text).filter(t => !/^(✈|REQ-042|042| ship)$/.test(t))

describe('0.10.0 debrief', () => {
  const regimes: { cols: 120 | 100 | 80; name: string }[] = [
    { cols: 120, name: '≥110: the Debrief board' }, { cols: 100, name: '84–109: one column' }, { cols: 80, name: '<84: the DebriefNarrow board' },
  ]
  for (const r of regimes) test(`the debrief view, ${r.name}: the head's reader condition, one ‹ back, the options last with letters`, async ($, on) => {
    const ui = await debriefAt($, on, r.cols)
    expect((await ui.find({ type: 'Text', text: /^DEBRIEF · for: lead$/ }))?.props.color).toBe('permission')
    expect((await ui.find({ type: 'Text', text: /^cold$/ }))?.props.color).toBe('warning') // read from the head, never recomputed
    expect(await ui.find({ type: 'Text', text: /reader → full story/ })).toBeDefined()
    expect((await ui.findAll({ type: 'Button' })).filter(b => b.text === '‹ back').length).toBe(1)
    expect(await ui.find({ key: 'gate-debrief' })).toBeUndefined() // the view draws the GATE line without its own link
    expect((await ui.find({ key: 'opt-approve' }))?.props.hotkey).toBe('a')
    expect(await ui.find({ type: 'Text', text: /awaiting — ship · round 1/ })).toBeDefined() // summary and debrief are asks, not rounds
    // Headers click-only; no digit anywhere; only the gate's options take letters.
    const keyed = (await ui.findAll({ type: 'Button' })).filter(b => typeof b.props.hotkey === 'string')
    expect(keyed.every(b => /^opt-/.test(b.key ?? '') && /^[a-z]$/.test(b.props.hotkey as string))).toBe(true)
    expect(await accentOutsideLevel1(ui)).toEqual([])
    if (r.cols === 120) {
      expect(await ui.find({ type: 'Text', text: /^ │ $/ })).toBeDefined() // SAY IT │ YOUR SUMMARY
      expect((await ui.find({ type: 'Text', text: /^ │ $/ }))?.props.color).toBe('inactive')
      expect(await ui.find({ type: 'Text', text: /^why$/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /^QUESTIONS YOU MAY GET$/ })).toBeDefined()
    }
    if (r.cols === 100) {
      expect(await ui.find({ type: 'Text', text: /^ │ $/ })).toBeUndefined()
      expect(await ui.find({ type: 'Text', text: /^why$/ })).toBeUndefined() // the files table drops why
      expect(await ui.find({ type: 'Text', text: /^what$/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /^YOUR SUMMARY$/ })).toBeDefined()
    }
    if (r.cols !== 80) {
      expect((await ui.find({ type: 'Text', text: /^SAY IT TO YOUR LEAD$/ }))?.props.color).toBe('subtle')
      expect((await ui.find({ type: 'Text', text: /^◇ 1 unplanned$/ }))?.props.color).toBe('warning')
      expect(await ui.find({ type: 'Code' })).toBeDefined() // the one mermaid fence
      expect((await ui.findAll({ type: 'Button' })).filter(b => /^debrief-sec-/.test(b.key ?? ''))).toEqual([]) // the list is the narrow board only
    }
    if (r.cols === 80) {
      for (const k of ['in-one-breath', 'why', 'what-changed', 'how', 'what-was-checked', 'what-to-watch', 'say-it-to-your-lead', 'questions-you-may-get']) expect(await ui.find({ key: `debrief-sec-${k}` })).toBeDefined()
      expect((await ui.find({ key: 'debrief-sec-what-changed' }))?.text).toMatch(/WHAT CHANGED +3 files · ◆ 2 planned ◇ 1 +×$/) // unfolded at first
      expect((await ui.find({ key: 'debrief-sec-say-it-to-your-lead' }))?.text).toMatch(/^SAY IT +1 line for your lead · yours names 1\/3 +›$/)
      expect(await ui.find({ type: 'Text', text: /^\+\/-$/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /^what · why dropped below 84 cols$/ })).toBeDefined()
      expect(await ui.find({ key: 'debrief-diff-readme.md' })).toBeDefined() // +/- from the numstat, pressed opens the diff
      expect(await ui.find({ type: 'Code' })).toBeUndefined()
    }
    await ui.unmount()
  })

  test('<84: one section unfolds in place — another press folds the first, a second press folds it', async ($, on) => {
    const ui = await debriefAt($, on, 80, { view: undefined }) // the view left to the real state, so the presses land
    await $.command.run({ command: 'flight', args: 'debrief' } as never)
    await settle(() => false)
    expect((await ui.find({ key: 'debrief-sec-what-changed' }))?.text).toMatch(/×$/)
    await ui.press({ key: 'debrief-sec-how' })
    expect((await ui.find({ key: 'debrief-sec-how' }))?.text).toMatch(/×$/)
    expect((await ui.find({ key: 'debrief-sec-what-changed' }))?.text).toMatch(/›$/)
    expect(await ui.find({ type: 'Text', text: /^what · why dropped below 84 cols$/ })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /^T1,T2 → T3 · 3 agents — ADR-003$/ })).toBeDefined()
    await ui.press({ key: 'debrief-sec-how' })
    expect((await ui.find({ key: 'debrief-sec-how' }))?.text).toMatch(/›$/)
    expect(await ui.find({ type: 'Text', text: /^T1,T2 → T3 · 3 agents — ADR-003$/ })).toBeUndefined() // the gist row is padded; the unfolded line is not
    await ui.unmount()
  })

  test('YOUR SUMMARY: the worked example names 1 of 3 files; model.ts and README.md are not mentioned (ADV-005)', async ($, on) => {
    const rows = planVsActual([], [], shipGit['REQ-042']?.touched ?? [])
    expect(summaryGaps(SUMMARY, rows)).toEqual({ mentioned: [`${MOD}/hooks/register.tsx`], missed: [`${MOD}/hooks/model.ts`, 'README.md'] })
    const ui = await debriefAt($, on, 100)
    expect(await ui.find({ type: 'Text', text: /^names 1 of 3 files$/ })).toBeDefined()
    expect((await ui.find({ type: 'Text', text: /^ · not mentioned: model\.ts, README\.md$/ }))?.props.color).toBe('warning')
    await ui.unmount()
  })

  test('at 80 columns with 20 files and WHAT CHANGED unfolded, it caps at 8 rows and the options still render (ADV-007)', async ($, on) => {
    const many = DEBRIEF.replace(/◆ core\/skills.*\n/, Array.from({ length: 20 }, (_, i) => `◆ src/f${i}.ts — what ${i} — why ${i}\n`).join(''))
      .replace(/◆ hooks\/model.*\n/, '').replace(/◇ README.*\n/, '')
    expect(parseDebrief(many).files.length).toBe(20)
    const ui = await debriefAt($, on, 80, { md: many })
    expect((await ui.find({ key: 'debrief-sec-what-changed' }))?.text).toMatch(/×$/)
    expect(await ui.find({ type: 'Text', text: /^… 14 more — widen to 84\+ cols or open debrief\.md$/ })).toBeDefined() // header + 20 files + footer = 22 rows, 8 shown
    expect(await ui.find({ type: 'Link', text: 'src/f6.ts' })).toBeDefined() // the 7th file is the 8th row
    expect(await ui.find({ type: 'Link', text: 'src/f7.ts' })).toBeUndefined()
    for (const k of ['opt-approve', 'opt-revise', 'opt-merged', 'opt-abort']) expect(await ui.find({ key: k })).toBeDefined()
    await ui.unmount()
  })

  test('no debrief.md: the view says so and how to make one; the options still follow', async ($, on) => {
    const ui = await debriefAt($, on, 120, { md: null })
    expect(await ui.find({ type: 'Text', text: /^no debrief here yet — \/debrief writes one \(the working set is local to whoever ran the pipeline\)$/ })).toBeDefined()
    expect(await ui.find({ key: 'opt-approve' })).toBeDefined()
    await ui.unmount()
  })

  test('a partial debrief: the sections present, and a run /debrief hint', async ($, on) => {
    const ui = await debriefAt($, on, 120, { md: 'IN ONE BREATH\nit tells the story\nWHY\nbecause\nHOW\nT1 → T2' })
    expect(await ui.find({ type: 'Text', text: /^3 of 8 sections · run \/debrief to write the rest$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /no head line — the reader condition is unknown/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^WHAT CHANGED$/ })).toBeUndefined()
    await ui.unmount()
  })

  test('the ship tab: DEBRIEF with IN ONE BREATH, the reader and open ›; without the file, how to make one', async ($, on) => {
    const ui = await debriefAt($, on, 120, { view: undefined })
    await ui.press({ key: 'tab-5' })
    expect(await ui.find({ type: 'Text', text: /^DEBRIEF$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^The pane tells the story of a REQ\. One file, eight sections\.$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^for: lead · reader: cold — viewed 2\/7 at review/ })).toBeDefined()
    await ui.press({ key: 'ship-debrief' })
    expect(await ui.find({ type: 'Text', text: /^DEBRIEF · for: lead$/ })).toBeDefined()
    await ui.unmount()
  })

  test('the ship tab without debrief.md', async ($, on) => {
    const ui = await debriefAt($, on, 120, { md: null, view: { req: 'REQ-042', tab: 5, sub: { kind: 'page' }, home: false } })
    expect(await ui.find({ type: 'Text', text: /^DEBRIEF$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^no debrief here yet/ })).toBeDefined()
    expect(await ui.find({ key: 'ship-debrief' })).toBeUndefined()
    await ui.unmount()
  })

  test('/flight debrief opens it; ‹ back returns to the phase page; the GATE line\'s debrief › opens it again', async ($, on) => {
    const ui = await debriefAt($, on, 120, { view: undefined })
    const run = async (args: string) => ((await $.command.run({ command: 'flight', args } as never)) as { text?: string }).text ?? ''
    expect(await run('debrief')).toMatch(/Debrief open/)
    await settle(() => false)
    expect(await ui.find({ type: 'Text', text: /^DEBRIEF · for: lead$/ })).toBeDefined()
    await ui.press({ key: 'back' })
    expect(await ui.find({ type: 'Text', text: /^DEBRIEF · for: lead$/ })).toBeUndefined()
    expect(await ui.find({ key: 'gate-debrief' })).toBeDefined() // the ship page, its GATE line
    await ui.press({ key: 'gate-debrief' })
    expect(await ui.find({ type: 'Text', text: /^DEBRIEF · for: lead$/ })).toBeDefined()
    await ui.unmount()
  })

  test('a debrief round is not a gate round: not counted on the GATE line, not in the phase line', () => {
    expect(phaseLine({ n: 5, state: 'done', rounds: [{ decision: 'approve', note: '' }, { decision: 'debrief', note: 'lead · skip' }] })).toBe('approve · 1 round')
    expect(phaseLine({ n: 5, state: 'gate', rounds: [{ decision: 'debrief', note: 'skip' }] })).toBe('at the gate')
  })
})
