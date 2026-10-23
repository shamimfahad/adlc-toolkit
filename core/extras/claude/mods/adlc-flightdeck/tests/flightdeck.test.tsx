import type { On } from 'claude-code'
import { describe, expect, test, type TestBody } from 'claude-code/testing'

import type { FlightDeck, FlightItem, FlightLane, FlightTrail } from '../types'
import {
  buildReq, describeTool, eta, markSpans, parseDispatch, parseGateCard, runs, taskGlyphs, timeline,
} from '../hooks/model'
import {
  decisionOf, filterItems, firstLine, hotFor, hotTail, notesFor, parseHot, parseRecord, partsOf, phaseOf,
  recordDecisionsFor, sectionOf,
} from '../hooks/vault'

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
const state = (on: On, key: 'deck' | 'lanes' | 'focus' | 'fuel' | 'agents' | 'now' | 'view' | 'items' | 'settings' | 'trail' | 'filters', value: unknown) =>
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
      expect(await ui.find({ key: 'details' })).toBeDefined() // opens the cockpit
      expect(await ui.find({ type: 'Text', text: /-30s/ })).toBeUndefined() // the tower lives in the pane
      expect(await ui.find({ type: 'Text', text: /BUG-016/ })).toBeUndefined()
      await ui.unmount()
    }
  })

  test('at a gate: the wait, and resume when Claude is idle', async ($, on) => {
    const gated: FlightDeck = { ...deck, reqs: [buildReq('REQ-042-payment-retries', { currentPhase: 3, gateState: 'awaiting' }, true, 0, 0)] }
    on('clock.now', async () => ({ value: 5000 }))
    state(on, 'deck', gated)
    state(on, 'focus', 'REQ-042')
    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({ plugin: 'adlc-flightdeck', surface, ...BAND(false) })
      expect(await ui.find({ type: 'Text', text: /gate 3\/5 implement · waiting 0:05/ })).toBeDefined()
      expect(await ui.find({ key: 'resume-REQ-042' })).toBeDefined()
      await ui.unmount()
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

  test('gate answers → decision and note', () => {
    expect(decisionOf({ 'Gate 3?': 'Approve — moves on to review' }, undefined)).toEqual({ decision: 'approve', note: '' })
    expect(decisionOf({ 'Gate 3?': 'revise' }, 'keep 3 retries but make it config')).toEqual({ decision: 'revise', note: 'keep 3 retries but make it config' })
    expect(decisionOf(undefined, undefined).decision).toBe('')
    expect(decisionOf({ 'Gate 3?': 'approve' }, 'ship it [flightdeck] viewed 4/7 files')).toEqual({ decision: 'approve', note: 'ship it' })
    expect(decisionOf({ 'Gate 3?': 'approve' }, '\n\n[flightdeck] viewed 4/7 files')).toEqual({ decision: 'approve', note: '' })
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

const PANE_PROPS = { title: 'ADLC', isFocused: true, bodyColumns: 120, placement: 'dock' as const, scroll: { offset: 0, bodyRows: 40 }, view: {} }
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
const settings = { openOnStart: false, band: true, cards: true, columns: 0, history: 'all' as const, editorUri: 'vscode://file/{path}:{line}:{col}' }
const mountPane = ($: Parameters<TestBody>[0], surface: 'terminal' | 'desktop') =>
  $.ui.mount({ plugin: 'adlc-flightdeck', surface, component: 'Pane', requestId: 'adlc-flight', props: PANE_PROPS, viewport: { columns: 124, rows: 50 } })

describe('cockpit pane', () => {
  test('a phase tab: the gate with its rounds, the agents and their lines, the keys', async ($, on) => {
    on('clock.now', async () => ({ value: 5000 }))
    state(on, 'deck', vaultDeck)
    state(on, 'focus', 'REQ-042')
    state(on, 'lanes', [lane])
    state(on, 'items', items)
    state(on, 'trail', trail)
    state(on, 'settings', settings)
    state(on, 'view', { req: 'REQ-042', tab: 3, sub: { kind: 'page' } })
    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await mountPane($, surface)
      expect(await ui.find({ type: 'Text', text: /in phase/ })).toBeDefined()
      expect(await ui.find({ key: 'tab-3' })).toBeDefined()
      expect(await ui.find({ key: 'tab-history' })).toBeDefined()
      expect(await ui.find({ key: 'tab-settings' })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /revise/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /keep 3 retries/ })).toBeDefined()
      expect(await ui.find({ key: 'card-3' })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /AGENTS · 2/ })).toBeDefined()
      expect(await ui.find({ key: 'lane-a1' })).toBeDefined()
      expect(await ui.find({ key: 'run-a0' })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /recon done/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /ALSO OPEN/ })).toBeUndefined() // gone: history has it
      expect(await ui.find({ type: 'Text', text: /BUG-016/ })).toBeUndefined()
      await ui.unmount()
    }
  })

  test('browsing another REQ says so; the band keeps the one being flown', async ($, on) => {
    on('clock.now', async () => ({ value: 5000 }))
    state(on, 'deck', vaultDeck)
    state(on, 'focus', 'REQ-042')
    state(on, 'items', items)
    state(on, 'trail', {})
    state(on, 'settings', settings)
    state(on, 'view', { req: 'BUG-016', tab: 4, sub: { kind: 'page' } })
    const ui = await mountPane($, 'terminal')
    expect(await ui.find({ type: 'Text', text: /browsing · flying REQ-042/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /BUG-016/ })).toBeDefined()
    await ui.unmount()
  })

  test('history lists every item with state, author and age; done ones too', async ($, on) => {
    on('clock.now', async () => ({ value: 3 * 86_400_000 }))
    state(on, 'deck', vaultDeck)
    state(on, 'focus', 'REQ-042')
    state(on, 'items', items)
    state(on, 'trail', {})
    state(on, 'settings', settings)
    state(on, 'filters', { author: null, text: '' })
    state(on, 'view', { req: 'REQ-042', tab: 'history', sub: { kind: 'page' } })
    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await mountPane($, surface)
      expect(await ui.find({ key: 'hist-REQ-042' })).toBeDefined()
      expect(await ui.find({ key: 'hist-BUG-016' })).toBeDefined()
      expect(await ui.find({ key: 'hist-REQ-007' })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /merged/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /3 of 3/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /3d ago/ })).toBeDefined()
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
    state(on, 'view', { req: 'REQ-042', tab: 'settings', sub: { kind: 'page' } })
    const ui = await mountPane($, 'terminal')
    expect(await ui.find({ key: 'set-open' })).toBeDefined()
    expect(await ui.find({ key: 'set-band' })).toBeDefined()
    expect(await ui.find({ key: 'set-cards' })).toBeDefined()
    expect(await ui.find({ key: 'set-columns' })).toBeDefined()
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
      expect(await ui.find({ type: 'Text', text: /your call/ })).toBeDefined()
      await ui.unmount()
    }
  })
})
