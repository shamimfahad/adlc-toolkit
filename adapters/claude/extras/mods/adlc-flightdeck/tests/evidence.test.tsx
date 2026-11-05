import type { On } from 'claude-code'
import { describe, expect, test, type TestBody } from 'claude-code/testing'

import type { FlightDeck, FlightGit, FlightItem, FlightTrail } from '../types'
import {
  acCheckOf, acceptanceOf, asFuelRow, behaviourOf, blastRadius, consequences, editorHref, findingsOf, gitPlan, hasPointer,
  knowledgeHits, mergeTouched, mermaidFences, parseLsTree, parseNameStatus, parseNumstat, parsePorcelain, parseTask, planVsActual,
  pointerSpans, rails, roundOf, summaryGaps, tiersOf, checklist, criterionTitle, plainMd,
} from '../hooks/evidence'
import { parseMarker, standardOptions } from '../hooks/vault'
import { buildReq } from '../hooks/model'

const ARCH = [
  '# REQ-042 — Architecture', '',
  '## Summary', '', 'Retries back off.', '',
  '## Blast radius', '',
  '| Path | Why touched | Risk |', '|---|---|---|',
  '| `src/pay/RetryPolicy.cs` | new backoff | medium |',
  '| `src/pay/Gateway.cs` | call the policy | low |',
  '| `tests/pay/RetryPolicyTests.cs` | cover it | low |',
  '| `docs/retries.md` | document the default | low |', '',
  '## Approach', '', 'A policy object, injected.', '',
  '```mermaid', 'graph LR', '  A[Gateway] --> B[RetryPolicy]', '```', '',
  '## Related', '', '- L-REQ-031-2 — backoff must be jittered', '- ADR-009 — retries live in the gateway', '- none matched for Startup', '',
  '## Risks', '', '- clock skew on retry windows',
].join('\n')

const TASK = (id: string, dep: string, files: string) => [
  `# ${id} — ${id === 'TASK-001' ? 'add the policy' : 'wire it in'}`, '',
  '| Field | Value |', '|---|---|', '| REQ | REQ-042 |', '| Tier | 0 |', '| Status | complete |', `| Depends on | ${dep} |`, '',
  '## Goal', '', 'One sentence. What must be true when this task is done.', 'The policy exists.', '',
  '## Files to touch', '', '| Path | Action |', '|---|---|', ...files.split(',').map(f => `| \`${f}\` | edit |`), '',
  '## Acceptance', '', '- [x] Tests pass', '- [ ] Backoff is jittered',
].join('\n')

const VER = [
  '# REQ-042 — Verification', '',
  '## Findings at a glance', '',
  '| ID | Severity | Finding (one line) | Where | Effort | Fix | Disagreement |', '|----|----------|---|---|---|---|---|',
  '| C1 | critical | double-charge path on retry | src/pay/RetryPolicy.cs:88 | small | yes | |',
  '| M1 | major | duplicated retry helper | src/pay/RetryPolicy.cs | small | yes | quality: minor |',
  '| m1 | minor | ADR-009 conflict | src/pay/Gateway.cs:12 | — | your call | |', '',
  'Reviewed by: correctness (balanced) · quality (balanced)', '',
  '## Acceptance criteria check', '',
  '| Criterion | Status | Evidence |', '|---|---|---|',
  '| retries back off | ✓ | tests/pay/RetryPolicyTests.cs:40 |',
  '| jitter applied | ✗ missing | |',
].join('\n')

const REQ = [
  '# REQ-042 — retry with backoff', '',
  '## Behaviour', '', '### Today', '', '- a failed call is retried at once', '', '### After', '', '- retries wait, longer each time', '',
  '## Acceptance criteria', '', '- [ ] retries back off', '- [x] jitter applied', '',
  '## Non-goals', '', '- circuit breaking',
].join('\n')

describe('evidence: markdown', () => {
  test('blast radius, diagram, knowledge hits', () => {
    const b = blastRadius(ARCH)
    expect(b.map(x => x.path)).toEqual(['src/pay/RetryPolicy.cs', 'src/pay/Gateway.cs', 'tests/pay/RetryPolicyTests.cs', 'docs/retries.md'])
    expect(b[0]?.risk).toBe('medium')
    expect(mermaidFences(ARCH).length).toBe(1)
    expect(mermaidFences(ARCH)[0]?.startsWith('graph LR')).toBe(true)
    expect(knowledgeHits(ARCH).map(h => h.id)).toEqual(['L-REQ-031-2', 'ADR-009'])
  })

  test('knowledge hits: lessons on every id scheme (sequential, prefixed, bug)', () => {
    const md = ['## Related', '', '- L-REQ-sf-031-2 — prefixed', '- LESSON-REQ-sf-7-1 — long form', '- L-BUG-017-1 — bug', '- L-REQ-042-1 — sequential', ''].join('\n')
    expect(knowledgeHits(md).map(h => h.id)).toEqual(['L-REQ-sf-031-2', 'LESSON-REQ-sf-7-1', 'L-BUG-017-1', 'L-REQ-042-1'])
  })

  test('task files: fields, files, acceptance; tiers and rails', () => {
    const t1 = parseTask(TASK('TASK-001', '—', 'src/pay/RetryPolicy.cs,tests/pay/RetryPolicyTests.cs'))
    const t2 = parseTask(TASK('TASK-002', 'TASK-001', 'src/pay/Gateway.cs').replace('| Tier | 0 |', '| Tier | 1 |'))
    expect(t1.id).toBe('TASK-001')
    expect(t1.title).toBe('add the policy')
    expect(t1.goal).toBe('The policy exists.')
    expect(t1.files.map(f => f.path)).toEqual(['src/pay/RetryPolicy.cs', 'tests/pay/RetryPolicyTests.cs'])
    expect(t1.acceptance).toEqual([{ text: 'Tests pass', done: true }, { text: 'Backoff is jittered', done: false }])
    expect(t2.dependsOn).toEqual(['TASK-001'])
    const tiers = tiersOf([t1, t2])
    expect(tiers.map(t => t.map(x => x.id))).toEqual([['TASK-001'], ['TASK-002']])
    expect(rails(tiers).map(r => r.tier)).toEqual([0, 1])
    // without a Tier field the depth comes from depends-on
    const t3 = parseTask(TASK('TASK-003', 'TASK-002', 'docs/retries.md').replace('| Tier | 0 |', ''))
    expect(tiersOf([t1, t2, t3]).length).toBe(3)
  })

  test('findings digest, roster, acceptance check', () => {
    const f = findingsOf(VER)
    expect(f.map(x => x.id)).toEqual(['C1', 'M1', 'm1'])
    expect(f[0]?.where).toBe('src/pay/RetryPolicy.cs:88')
    expect(f[1]?.disagreement).toBe('quality: minor')
    expect(f[2]?.needsDecision).toBe(true)
    expect(f[0]?.needsDecision).toBe(false)
    const ac = acCheckOf(VER)
    expect(ac.map(a => a.status)).toEqual(['pass', 'fail'])
    expect(ac[0]?.evidence).toBe('tests/pay/RetryPolicyTests.cs:40')
  })

  test('requirement: behaviour pair, acceptance criteria', () => {
    expect(behaviourOf(REQ)).toEqual({ today: ['a failed call is retried at once'], after: ['retries wait, longer each time'] })
    expect(acceptanceOf(REQ)).toEqual([{ text: 'retries back off', done: false }, { text: 'jitter applied', done: true }])
    expect(behaviourOf('# nothing')).toEqual({ today: [], after: [] })
  })
})

describe('readers the flightdeck pages lean on', () => {
  test('task paths in backticks match git\'s paths', () => {
    const t = parseTask(TASK('TASK-001', '—', 'src/pay/RetryPolicy.cs'))
    expect(planVsActual([], [t], [{ path: 'src/pay/RetryPolicy.cs', status: 'M', add: 1, del: 0 }]).map(r => [r.path, r.tasks, !!r.touched])).toEqual([['src/pay/RetryPolicy.cs', ['TASK-001'], true]])
  })

  test('a criterion that wraps is one item, drawn by its bold lead', () => {
    const items = checklist(['- [ ] **1. Opens at its address.** On `pnpm dev`', '      the page loads.', '- [x] plain one'].join('\n'))
    expect(items.length).toBe(2)
    expect(items[0]?.text).toMatch(/the page loads\.$/)
    expect(criterionTitle(items[0]?.text ?? '')).toBe('Opens at its address.')
    expect(criterionTitle('plain `code` and **bold**')).toBe('plain code and bold')
    expect(plainMd('[a link](x.md) and _this_')).toBe('a link and this')
  })

  test('a gate with no Options: block: Awaiting is the ask, and the phase\'s standard options stand in', () => {
    expect(parseMarker('Phase: verify\nAwaiting: review the findings.').ask).toBe('review the findings.')
    expect(parseMarker('Awaiting: x\nAsk: the real ask').ask).toBe('the real ask')
    const review = standardOptions('review', 'fix all — two majors')
    expect(review.map(o => o.label)).toEqual(['fix all', 'fix <ids|all-major>', 'approve', 'revise <what>', 'abort'])
    expect(review.find(o => o.recommended)?.label).toBe('fix all')
    expect(standardOptions('spec', '').map(o => o.label)).toEqual(['approve', 'revise <what>', 'abort'])
    expect(standardOptions('ship', '').some(o => o.label === 'merged')).toBe(true)
  })

  test('the current phase listed as completed while its marker is open is still the gate', () => {
    const r = buildReq('REQ-sf-038-x', { currentPhase: 4, completedPhases: [0, 1, 2, 3, 4], gateState: 'awaiting' }, true, 0, 0)
    expect(r.phases.map(p => p.state)).toEqual(['done', 'done', 'done', 'gate', 'todo'])
    expect(buildReq('REQ-1-x', { currentPhase: 4, completedPhases: [1, 2, 3, 4] }, false, null, 0).phases[3]?.state).toBe('done')
  })
})

describe('evidence: git', () => {
  test('porcelain, numstat, name-status merge into one row per path', () => {
    const porcelain = parsePorcelain([' M src/pay/RetryPolicy.cs', '?? src/pay/New.cs', 'R  old.cs -> src/pay/Moved.cs', 'D  gone.cs'].join('\n'))
    expect(porcelain.map(p => `${p.status}:${p.path}`)).toEqual(['M:src/pay/RetryPolicy.cs', '?:src/pay/New.cs', 'R:src/pay/Moved.cs', 'D:gone.cs'])
    const numstat = parseNumstat('12\t3\tsrc/pay/RetryPolicy.cs\n-\t-\timg.png\n4\t0\tsrc/pay/Gateway.cs\n')
    expect(numstat[1]).toEqual({ path: 'img.png', add: 0, del: 0 })
    const committed = parseNameStatus('M\tsrc/pay/Gateway.cs\nA\tsrc/pay/Startup.cs\n')
    const rows = mergeTouched(porcelain, committed, numstat)
    expect(rows.find(r => r.path === 'src/pay/RetryPolicy.cs')).toEqual({ path: 'src/pay/RetryPolicy.cs', status: 'M', add: 12, del: 3 })
    expect(rows.find(r => r.path === 'src/pay/Gateway.cs')?.add).toBe(4)
    expect(rows.find(r => r.path === 'src/pay/Startup.cs')?.status).toBe('A')
  })

  test('plan vs actual: both, planned-only, touched-only, case-insensitive on Windows', () => {
    const t1 = parseTask(TASK('TASK-001', '—', 'src/pay/RetryPolicy.cs'))
    const touched = mergeTouched(parsePorcelain(' M src/Pay/RetryPolicy.cs\n M src/pay/Startup.cs\n'), [], [])
    const rows = planVsActual(blastRadius(ARCH), [t1], touched)
    const by = Object.fromEntries(rows.map(r => [r.path.toLowerCase(), r]))
    expect(by['src/pay/retrypolicy.cs']?.planned && !!by['src/pay/retrypolicy.cs']?.touched).toBe(true)
    expect(by['src/pay/retrypolicy.cs']?.tasks).toEqual(['TASK-001'])
    expect(by['src/pay/startup.cs']?.planned).toBe(false)
    expect(by['src/pay/gateway.cs']?.touched).toBe(null)
    expect(rows[0]?.path).toBe('src/pay/Startup.cs') // surprises first: outside the plan, then planned-untouched
  })

  test('plan vs actual: vault writes are not surprises', () => {
    const touched = mergeTouched(parsePorcelain(' M .adlc/specs/REQ-042/pipeline-state.json\n?? .adlc/lessons/L-1.md\n M src/pay/Startup.cs\n'), [], [])
    expect(planVsActual([], [], touched).map(r => r.path)).toEqual(['src/pay/Startup.cs'])
  })

  test('consequences and summary gaps', () => {
    const rows = planVsActual([], [], mergeTouched(parsePorcelain(' M src/pay/RetryPolicy.cs\n M db/migrations/0042_retry.sql\n'), [], []))
    const c = consequences('### 1\ngit commit -m "a"\n### 2\ngit commit -m "b"', 'gh pr create --base release/2.4', null, 'feat/REQ-042', rows)
    expect(c.map(x => x.text)[0]).toBe('2 commits to run on feat/REQ-042 — commits-draft.md')
    expect(c.some(x => /PR targets release\/2.4/.test(x.text))).toBe(true)
    expect(c.some(x => x.tone === 'warn' && /data shape: db\/migrations/.test(x.text))).toBe(true)
    expect(c.some(x => /2 files outside the plan/.test(x.text))).toBe(true)
    const gaps = summaryGaps('I changed RetryPolicy to back off with jitter.', rows)
    expect(gaps.mentioned).toEqual(['src/pay/RetryPolicy.cs'])
    expect(gaps.missed).toEqual(['db/migrations/0042_retry.sql'])
  })
})

describe('evidence: which tree', () => {
  test('plan vs actual diffs the REQ\'s branch when another branch is checked out', () => {
    const away = gitPlan({ branch: 'feat/REQ-sf-033' }, 'feat/REQ-sf-034', true)
    expect(away.tip).toBe('feat/REQ-sf-033')
    expect(away.checkedOut).toBe(false)
    expect(away.mergeBase('main')).toEqual(['merge-base', 'feat/REQ-sf-033', 'main'])
    expect(away.committed('abc')).toEqual(['diff', '--name-status', 'abc', 'feat/REQ-sf-033'])
    expect(away.porcelain).toBe(null) // the working tree belongs to the other branch
    expect(away.numstat('abc')).toEqual(['diff', '--numstat', 'abc', 'feat/REQ-sf-033'])
    expect(away.hashes(['a.cs'])).toEqual(['ls-tree', '-r', 'feat/REQ-sf-033', '--', 'a.cs'])
    expect(parseLsTree('100644 blob 9f2c1e\tsrc/A.cs\n')).toEqual({ 'src/a.cs': '9f2c1e' })
    const home = gitPlan({ branch: 'feat/REQ-sf-033' }, 'feat/REQ-sf-033', true)
    expect(home.checkedOut).toBe(true)
    expect(home.porcelain).toEqual(['status', '--porcelain', '--untracked-files=all'])
    expect(home.numstat('abc')).toEqual(['diff', '--numstat', 'abc'])
    const gone = gitPlan({ branch: 'feat/deleted' }, 'main', false) // the branch does not resolve: HEAD, as before
    expect(gone.tip).toBe('HEAD')
    expect(gone.checkedOut).toBe(true)
    expect(gone.committed('abc')).toEqual(['diff', '--name-status', 'abc', 'HEAD'])
  })
})

describe('evidence: links and numbers', () => {
  test('editor href from the template, line and column', () => {
    expect(editorHref('vscode://file/{path}:{line}:{col}', 'D:/repo/src/a b.cs', 42, 7)).toBe('vscode://file/D:/repo/src/a%20b.cs:42:7')
    expect(editorHref('vscode://file/{path}:{line}:{col}', 'D:\\repo\\src\\a.cs')).toBe('vscode://file/D:/repo/src/a.cs:1:1')
    expect(editorHref('file:///{path}', 'D:/repo/a.cs', 3)).toBe('file:///D:/repo/a.cs')
  })

  test('pointer spans: paths with lines become links, prose stays prose', () => {
    const s = pointerSpans('✓ tests 41/41 (verify-output.md:14) · fixed src/pay/RetryPolicy.cs:88 · see v1.10 and e.g. this')
    expect(s.filter(x => x.path).map(x => `${x.path}:${x.line}`)).toEqual(['verify-output.md:14', 'src/pay/RetryPolicy.cs:88'])
    expect(s.map(x => x.text).join('')).toBe('✓ tests 41/41 (verify-output.md:14) · fixed src/pay/RetryPolicy.cs:88 · see v1.10 and e.g. this')
    expect(hasPointer('41 tests green')).toBe(false)
    expect(hasPointer('fixed C1 and M1')).toBe(true)
  })

  test('fuel rows: old numbers migrate as fresh; rounds by kind', () => {
    expect(asFuelRow(20_800_000)).toEqual({ fresh: 20_800_000, read: 0, wrote: 0 })
    expect(asFuelRow({ fresh: 1, read: 2, wrote: 3 })).toEqual({ fresh: 1, read: 2, wrote: 3 })
    expect(asFuelRow('x')).toEqual({ fresh: 0, read: 0, wrote: 0 })
    expect(roundOf([{ decision: 'predict', note: 'RetryPolicy and Gateway' }, { decision: 'approve', note: '' }], 'predict')).toBe('RetryPolicy and Gateway')
    expect(roundOf([{ decision: 'approve', note: '' }], 'summary')).toBe(null)
  })
})

// ---------- the pages, drawn ----------

const deck: FlightDeck = {
  vault: 'D:/repo/.adlc',
  scannedAt: 0,
  reqs: [buildReq('REQ-042-payment-retries', { currentPhase: 3, gateState: 'awaiting', workPath: 'D:/repo', branch: 'feat/REQ-042', taskStatus: { 'TASK-001': 'complete' } }, true, 0, 0)],
}
const items: FlightItem[] = [
  { id: 'REQ-042', title: 'payment retries', kind: 'req', state: 'gate', phase: 3, phaseName: 'implement', author: 'sf', month: '2026-10', touchedAt: 1000, folder: 'D:/repo/.adlc/specs/REQ-042-payment-retries', record: null },
]
const gitFacts: Record<string, FlightGit> = {
  'REQ-042': {
    at: 0, cwd: 'D:/repo', base: 'abc', baseName: 'main', branch: 'feat/REQ-042', me: 'sf', error: null, tip: 'feat/REQ-042', checkedOut: true,
    touched: [
      { path: 'src/pay/RetryPolicy.cs', status: 'M', add: 12, del: 3 },
      { path: 'src/pay/Startup.cs', status: 'M', add: 1, del: 0 },
    ],
    hashes: { 'src/pay/retrypolicy.cs': 'h1', 'src/pay/startup.cs': 'h2' },
    authors: { 'src/pay/retrypolicy.cs': 'sf · 2 days ago', 'src/pay/startup.cs': 'jd · 7 months ago' },
  },
}
const trail: FlightTrail = {
  'REQ-042': {
    implement: { rounds: [{ at: 0, decision: 'approve', note: '', viewed: '1/2' }], runs: [], card: null },
    review: { rounds: [], runs: [], card: null },
  },
}
const settings = { openOnStart: false, band: true, cards: true, narrowAt: 84, showAll: false, history: 'all' as const, editorUri: 'vscode://file/{path}:{line}:{col}', compact: 'button' as const, compactAt: 70 }
const state = (on: On, key: 'deck' | 'lanes' | 'focus' | 'fuel' | 'agents' | 'now' | 'view' | 'items' | 'settings' | 'trail' | 'filters' | 'git' | 'viewed' | 'picks' | 'gate' | 'strip' | 'layout' | 'pending', value: unknown) =>
  on('state.get', { plugin: 'adlc-flightdeck', key } as never, async () => ({ value: { value, version: 1 } }) as never)
// 0.7.0: the cockpit is the above-prompt band at full height (`max`); no pane.
const PANE_PROPS = { hasSurvey: false, isWorking: false, maxRows: 400, bodyColumns: 120, scroll: { offset: 0, bodyRows: 399 }, view: {} }
export const mountPane = ($: Parameters<TestBody>[0], surface: 'terminal' | 'desktop') =>
  $.ui.mount({ plugin: 'adlc-flightdeck', surface, component: 'AbovePrompt', props: PANE_PROPS, viewport: { columns: 124, rows: 800 } })
/** The same REQ standing at another phase's open gate. */
const deckAt = (phase: number): FlightDeck => ({ ...deck, reqs: [buildReq('REQ-042-payment-retries', { currentPhase: phase, gateState: 'awaiting', workPath: 'D:/repo', branch: 'feat/REQ-042', taskStatus: { 'TASK-001': 'complete' } }, true, 0, 0)] })
export const common = (on: On, tab: number, viewed: unknown = {}, d: FlightDeck = deck) => {
  on('clock.now', async () => ({ value: 5000 }))
  state(on, 'deck', d)
  state(on, 'focus', 'REQ-042')
  state(on, 'lanes', [])
  state(on, 'items', items)
  state(on, 'trail', trail)
  state(on, 'settings', settings)
  state(on, 'layout', { height: 'max', narrow: false })
  state(on, 'git', gitFacts)
  state(on, 'viewed', viewed)
  state(on, 'picks', {})
  state(on, 'fuel', { 'REQ-042': { implement: { fresh: 48_000, read: 20_800_000, wrote: 12_000 } } })
  state(on, 'view', { req: 'REQ-042', tab, sub: { kind: 'page' } })
}

describe('evidence pages', () => {
  // The test host has no filesystem beneath the plugin, so the pages draw from state here:
  // git facts, the trail, fuel. The markdown-fed parts are covered above and by the live check.
  test('implement at its gate: GATE first with the options, then FILES — every changed file a link, a mark and a diff', async ($, on) => {
    common(on, 3, { 'REQ-042': { 'src/pay/retrypolicy.cs': 'h1' } })
    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await mountPane($, surface)
      expect(await ui.find({ type: 'Text', text: /awaiting — implement · round 2/ })).toBeDefined()
      expect(await ui.find({ key: 'opt-approve' })).toBeDefined() // no marker, no card: the phase's standard options
      expect(await ui.find({ type: 'Text', text: /standard options/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /1 of 2 changed files not viewed/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /^FILES$/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /viewed 1\/2/ })).toBeDefined()
      expect(await ui.find({ key: 'seen-src/pay/startup.cs' })).toBeDefined()
      expect(await ui.find({ key: 'diff-src/pay/retrypolicy.cs' })).toBeDefined()
      if (surface === 'terminal') expect(await ui.find({ type: 'Link' })).toBeDefined()
      else expect(await ui.find({ type: 'Link' })).toBeUndefined() // https-only there: buttons instead
      expect(await ui.find({ type: 'Text', text: /PLAN VS ACTUAL|AGENTS|context re-read|RECORD/ })).toBeUndefined() // the mockup's page, nothing piled under it
      expect(await ui.find({ key: 'resume-REQ-042' })).toBeUndefined()
      await ui.unmount()
    }
  })

  test('a cleared gate says what was chosen, in which round, and how much had been viewed', async ($, on) => {
    common(on, 3, {}, deckAt(4))
    const ui = await mountPane($, 'terminal')
    expect(await ui.find({ type: 'Text', text: /cleared · approve · round 1 · .* · viewed 1\/2/ })).toBeDefined()
    await ui.unmount()
  })

  test('review at its gate: findings, acceptance and plan vs actual, each saying what is missing', async ($, on) => {
    common(on, 4, {}, deckAt(4))
    const ui = await mountPane($, 'terminal')
    expect(await ui.find({ type: 'Text', text: /awaiting — review/ })).toBeDefined()
    expect(await ui.find({ key: 'opt-fix all' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /no verification\.md yet/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /no acceptance check/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^PLAN VS ACTUAL$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /2 touched/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^surprise$/ })).toBeDefined() // touched, never planned
    expect(await ui.find({ key: 'compose' })).toBeUndefined() // nothing picked
    await ui.unmount()
  })

  test('a phase not reached says when it opens, and nothing else', async ($, on) => {
    common(on, 4)
    const ui = await mountPane($, 'terminal')
    expect(await ui.find({ type: 'Text', text: /not reached — opens after implement clears/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /This page fills in when implement clears/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^FINDINGS$/ })).toBeUndefined()
    await ui.unmount()
  })

  test('ship: what approving sets in motion leads, the diffstat follows, every file a diff', async ($, on) => {
    common(on, 5, {}, deckAt(5))
    const ui = await mountPane($, 'terminal')
    expect(await ui.find({ type: 'Text', text: /^WHAT APPROVING SETS IN MOTION$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /2 files outside the plan/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^DIFFSTAT$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /2 files · \+13 −3/ })).toBeDefined()
    expect(await ui.find({ key: 'bar-src/pay/startup.cs' })).toBeDefined()
    expect(await ui.find({ key: 'opt-merged' })).toBeDefined()
    await ui.unmount()
  })

  test('architect with nothing on disk says so instead of drawing an empty table', async ($, on) => {
    common(on, 2)
    const ui = await mountPane($, 'terminal')
    expect(await ui.find({ type: 'Text', text: /no architecture on disk/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /no task files yet/ })).toBeDefined()
    await ui.unmount()
  })
})

describe('0.8.1: keys', () => {
  // One path stands in two blocks of the review page — a finding's `where` and its plan-vs-actual row — and, off the
  // terminal, every path is a Button. Each one's key says where it stands, so no two share one.
  for (const [tab, phase] of [[3, 3], [4, 4], [5, 5]] as const) test(`every Button key is unique and stable on desktop: tab ${tab}`, async ($, on) => {
    on('fs.stat', async ($, e, next) => (/verification\.md$/.test(e.path) ? { value: { kind: 'file', size: VER.length, mtimeMs: 1, isLink: false } } : next(e)) as never)
    on('fs.read', async ($, e, next) => (/verification\.md$/.test(e.path) ? { value: VER } : next(e)) as never)
    common(on, tab, {}, deckAt(phase))
    state(on, 'picks', { 'REQ-042': { C1: 'fix' } })
    const keysAt = async () => {
      const ui = await mountPane($, 'desktop')
      const keys = (await ui.findAll({ type: 'Button' })).map(b => b.key ?? '')
      await ui.unmount()
      return keys
    }
    const keys = await keysAt()
    if (tab === 4) expect(keys.filter(k => /^ref-/.test(k)).length).toBeGreaterThanOrEqual(4) // the findings' and the plan's paths
    expect(keys.filter(k => !k)).toEqual([])
    expect(keys.filter((k, i) => keys.indexOf(k) !== i)).toEqual([])
    expect(await keysAt()).toEqual(keys) // drawn again, the same keys
  })
})
