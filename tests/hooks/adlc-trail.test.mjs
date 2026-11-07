// Tests for core/extras/claude/hooks/adlc-trail.mjs (REQ-002): the reader condition, ask rounds that
// never close a gate round, the DEBRIEF header, and stats. Run: node --test tests/hooks/*.test.mjs
// Lives outside core/ on purpose: the build copies core/extras to users, and tests are not theirs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { readerOf, autoPhasesOf, ASK_LINE } from '../../core/extras/claude/hooks/adlc-trail.mjs';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'core', 'extras', 'claude', 'hooks', 'adlc-trail.mjs');
const NOW = Date.parse('2026-11-08T12:00:00Z');
const hoursAgo = (h) => new Date(NOW - h * 3_600_000).toISOString();
const ME = 'Shamim Fahad';

/** A REQ the user flew themselves, recently, looking at the code: warm. Each test tips one input. */
function base() {
  return {
    1: { gates: [{ at: hoursAgo(5), decision: 'approve', via: 'typed', by: ME }] },
    2: { gates: [{ at: hoursAgo(4), decision: 'approve', via: 'typed', by: ME }] },
    3: { gates: [{ at: hoursAgo(3), decision: 'approve', viewed: '5/6', via: 'pane', by: ME }] },
    4: { gates: [{ at: hoursAgo(1), decision: 'approve', viewed: '4/6', via: 'pane', by: ME }] },
  };
}
const reader = (phases, extra = {}) => readerOf({ phases, user: ME, now: NOW, autoPhases: [], ...extra });

// ---------- readerOf ----------

test('readerOf: the user flew it, recently, looking → warm', () => {
  const r = reader(base());
  assert.equal(r.reader, 'warm');
  assert.match(r.why, /you answered 4 gates · last 1h ago/);
});

test('readerOf: lowest viewed under 1/2 at review → cold', () => {
  const p = base(); p[4].gates[0].viewed = '2/7';
  const r = reader(p);
  assert.equal(r.reader, 'cold');
  assert.match(r.why, /viewed 2\/7 at review/);
});

test('readerOf: exactly 1/2 is not under 1/2', () => {
  const p = base(); p[3].gates[0].viewed = '3/6';
  assert.equal(reader(p).reader, 'warm');
});

test('readerOf: no viewed recorded at implement or review → cold', () => {
  const p = base(); delete p[3].gates[0].viewed; delete p[4].gates[0].viewed;
  p[3].gates[0].via = 'typed'; p[4].gates[0].via = 'typed';
  const r = reader(p);
  assert.equal(r.reader, 'cold');
  assert.match(r.why, /no viewed count at implement or review/);
});

test('readerOf: half the gates answered from the pane unseen → cold', () => {
  const p = base(); p[1].gates[0].via = 'pane'; p[2].gates[0].via = 'pane';
  const r = reader(p);
  assert.equal(r.reader, 'cold');
  assert.match(r.why, /2 of 4 gates answered from the pane unseen/);
});

test('readerOf: one pane round of four is under half → warm', () => {
  const p = base(); p[1].gates[0].via = 'pane';
  assert.equal(reader(p).reader, 'warm');
});

test('readerOf: a phase cleared by the decision-maker → cold', () => {
  const r = reader(base(), { autoPhases: [2] });
  assert.equal(r.reader, 'cold');
  assert.match(r.why, /architect cleared by the decision-maker/);
});

test('readerOf: 24 hours or more since the last gate round → cold', () => {
  const r = readerOf({ phases: base(), user: ME, now: NOW + 23 * 3_600_000, autoPhases: [] });
  assert.equal(r.reader, 'cold');
  assert.match(r.why, /24h since the last gate/);
  assert.equal(readerOf({ phases: base(), user: ME, now: NOW + 22 * 3_600_000 }).reader, 'warm');
});

test('readerOf: days are counted from 48h', () => {
  const r = readerOf({ phases: base(), user: ME, now: NOW + 71 * 3_600_000 });
  assert.match(r.why, /3 days since the last gate/);
});

test('readerOf: every gate round by someone else → handover', () => {
  const p = base(); for (const ph of Object.values(p)) ph.gates[0].by = 'Ada Lovelace';
  const r = reader(p);
  assert.equal(r.reader, 'handover');
  assert.match(r.why, /Ada Lovelace, none by you/);
});

test('readerOf: handover wins over cold (first match)', () => {
  const p = base(); for (const ph of Object.values(p)) ph.gates[0].by = 'Ada Lovelace';
  p[4].gates[0].viewed = '0/9';
  assert.equal(reader(p, { autoPhases: [1] }).reader, 'handover');
});

test('readerOf: a mixed REQ (one round by the user) is not a handover', () => {
  const p = base(); for (const n of [1, 2, 3]) p[n].gates[0].by = 'Ada Lovelace';
  assert.equal(reader(p).reader, 'warm');
});

test('readerOf: author match ignores case and spaces', () => {
  assert.equal(readerOf({ phases: base(), user: '  shamim fahad ', now: NOW }).reader, 'warm');
});

test('readerOf: a fresh summary by the user with every gate round by others → handover (ADV-003)', () => {
  const p = base(); for (const ph of Object.values(p)) ph.gates[0].by = 'Ada Lovelace';
  p[5] = { gates: [{ at: hoursAgo(0), decision: 'summary', note: 'compaction in register', via: 'typed', by: ME }] };
  assert.equal(reader(p).reader, 'handover');
});

test('readerOf: ask rounds never reset the clock', () => {
  const p = base();
  p[5] = { gates: [
    { at: new Date(NOW + 30 * 3_600_000).toISOString(), decision: 'summary', via: 'typed', by: ME },
    { at: new Date(NOW + 30 * 3_600_000).toISOString(), decision: 'debrief', note: 'lead', via: 'typed', by: ME },
  ] };
  p[2].gates.unshift({ at: new Date(NOW + 30 * 3_600_000).toISOString(), decision: 'predict', note: 'x', via: 'typed', by: ME });
  const r = readerOf({ phases: p, user: ME, now: NOW + 30 * 3_600_000 });
  assert.equal(r.reader, 'cold');
  assert.match(r.why, /since the last gate/);
});

test('readerOf: open (undecided) rounds are ignored', () => {
  const p = base(); p[5] = { gates: [{ at: hoursAgo(0), card: { verdict: 'ready' } }] };
  assert.equal(reader(p).reader, 'warm');
});

test('readerOf: no gate answered yet → warm, and it says so', () => {
  assert.deepEqual(reader({}), { reader: 'warm', why: 'no gate answered yet' });
  assert.equal(readerOf().reader, 'warm');
});

test('readerOf: several tips are all named', () => {
  const p = base(); p[4].gates[0].viewed = '1/9';
  const r = reader(p, { autoPhases: [3] });
  assert.match(r.why, /viewed 1\/9 at review · implement cleared by the decision-maker/);
});

// ---------- autoPhasesOf ----------

const DECISIONS = `# Gate decisions — REQ-900

## [2026-11-07T10:00Z] ARCHITECT gate — APPROVE

| Field | Value |
|---|---|
| Verdict | APPROVE |

## [2026-11-07T11:00Z] REVIEW gate — HALT

**Open question for the human:** …

## [2026-11-07T12:00Z] implement gate — REWORK
`;

test('autoPhasesOf: APPROVE counts; HALT and REWORK went to a human', () => {
  assert.deepEqual(autoPhasesOf(DECISIONS), [2]);
});

test('autoPhasesOf: the phase-name map', () => {
  const entry = (name) => `## [t] ${name} gate — APPROVE\n`;
  assert.deepEqual(autoPhasesOf(['spec', 'architect', 'implement', 'verify', 'review', 'ship', 'nonsense'].map(entry).join('')), [1, 2, 3, 4, 5]);
  assert.deepEqual(autoPhasesOf(''), []);
  assert.deepEqual(autoPhasesOf(null), []);
});

// ---------- ASK_LINE ----------

test('ASK_LINE: DEBRIEF, ASK · Predict and ASK · Summary are not gates', () => {
  assert.ok(ASK_LINE.test('DEBRIEF · REQ-002-debrief · for: lead'));
  assert.ok(ASK_LINE.test('intro\n**DEBRIEF · REQ-002'));
  assert.ok(ASK_LINE.test('## ASK · Predict · REQ-002'));
  assert.ok(ASK_LINE.test('ASK · Summary · REQ-002'));
});

test('ASK_LINE: a gate card and a mid-line mention are not asks', () => {
  assert.ok(!ASK_LINE.test('GATE 5/5 · REQ-002 · ship'));
  assert.ok(!ASK_LINE.test('see the DEBRIEF · section'));
  assert.ok(!ASK_LINE.test('DEBRIEF\nIN ONE BREATH'));
});

// ---------- the CLI, against a throwaway vault ----------

function vault(phases, extra = {}) {
  const root = mkdtempSync(join(tmpdir(), 'adlc-trail-'));
  const folder = join(root, '.adlc', 'specs', 'REQ-900-fixture');
  mkdirSync(folder, { recursive: true });
  writeFileSync(join(folder, 'pipeline-state.json'), JSON.stringify({ req: 'REQ-900-fixture', currentPhase: 5, gateState: 'awaiting', phases }, null, 2));
  for (const [name, text] of Object.entries(extra)) writeFileSync(join(folder, name), text);
  return { root, folder, vault: join(root, '.adlc'), state: () => JSON.parse(readFileSync(join(folder, 'pipeline-state.json'), 'utf8')), done: () => rmSync(root, { recursive: true, force: true }) };
}
const run = (v, ...args) => {
  const r = spawnSync(process.execPath, [SCRIPT, ...args, '--vault', v.vault], { encoding: 'utf8', cwd: v.root });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
};

test('import runs nothing: the module loads without reading stdin or exiting', () => {
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(SCRIPT)}); console.log('alive');`], { encoding: 'utf8', input: '{"hook_event_name":"Stop"}' });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), 'alive');
});

test('the main guard still runs the CLI through a symlink (an installed hook)', (t) => {
  const v = vault({});
  t.after(v.done);
  const link = join(v.root, 'adlc-trail.mjs');
  symlinkSync(SCRIPT, link);
  const r = spawnSync(process.execPath, [link, 'reader', '--req', 'REQ-900-fixture', '--by', ME, '--vault', v.vault], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), 'warm — no gate answered yet');
});

test('trail gate --decision debrief leaves an open gate round open; the answer closes it', (t) => {
  const v = vault({ 5: { gates: [{ at: hoursAgo(0), card: { verdict: 'ready to ship' } }] } });
  t.after(v.done);
  const out = run(v, 'gate', '--req', 'REQ-900-fixture', '--decision', 'debrief', '--note', 'lead · the trail', '--by', ME);
  assert.match(out, /phase 5 round 1 → debrief/);
  let g = v.state().phases[5].gates;
  assert.equal(g.length, 2);
  assert.equal(g[0].decision, 'debrief');
  assert.equal(g[0].note, 'lead · the trail');
  assert.equal(g[1].decision, undefined);
  assert.equal(g[1].card.verdict, 'ready to ship');
  run(v, 'gate', '--req', 'REQ-900-fixture', '--decision', 'approve', '--by', ME);
  g = v.state().phases[5].gates;
  assert.equal(g.length, 2);
  assert.equal(g[1].decision, 'approve');
  assert.equal(g[1].card.verdict, 'ready to ship');
});

test('trail gate: summary and predict also never close an open round', (t) => {
  const v = vault({ 5: { gates: [{ at: hoursAgo(0), card: { verdict: 'v' } }] } });
  t.after(v.done);
  run(v, 'gate', '--req', 'REQ-900-fixture', '--decision', 'summary', '--note', 'my words', '--by', ME);
  run(v, 'gate', '--req', 'REQ-900-fixture', '--decision', 'predict', '--note', 'skip', '--by', ME);
  const g = v.state().phases[5].gates;
  assert.deepEqual(g.map((r) => r.decision ?? null), ['summary', 'predict', null]);
});

test('trail gate --decision debrief with no open round appends', (t) => {
  const v = vault({ 5: { gates: [{ at: hoursAgo(1), decision: 'revise', by: ME }] } });
  t.after(v.done);
  const out = run(v, 'gate', '--req', 'REQ-900-fixture', '--decision', 'debrief', '--note', 'skip', '--by', ME);
  assert.match(out, /round 2 → debrief/);
  assert.deepEqual(v.state().phases[5].gates.map((r) => r.decision), ['revise', 'debrief']);
});

test('trail stats: a debrief round is not a gate round; debrief asked / skipped is reported', (t) => {
  const v = vault({
    4: { gates: [{ at: hoursAgo(2), decision: 'approve', viewed: '3/4', via: 'pane', by: ME }] },
    5: { gates: [{ at: hoursAgo(1), decision: 'debrief', note: 'skip', via: 'typed', by: ME }, { at: hoursAgo(0), card: { verdict: 'v' } }] },
  });
  t.after(v.done);
  const s = JSON.parse(run(v, 'stats', '--json'));
  assert.equal(s.compactions.gates, 2); // the approve and the open ship round, not the debrief
  assert.equal(s.via.answers, 1);
  assert.deepEqual(s.debrief, { items: 1, asked: 1, skipped: 1 });
  assert.equal(s.perItem[0].debrief, 'skipped');
  assert.match(run(v, 'stats'), /^debrief {5}1 of 1 items asked · 1 skipped$/m);
});

test('trail reader: autoPhases from gate-decisions.md (APPROVE counts, HALT does not)', (t) => {
  const recent = { 3: { gates: [{ at: new Date().toISOString(), decision: 'approve', viewed: '6/6', via: 'pane', by: ME }] } };
  const v = vault(recent, { 'gate-decisions.md': DECISIONS });
  t.after(v.done);
  const out = run(v, 'reader', '--req', 'REQ-900-fixture', '--by', ME);
  assert.match(out, /^cold — architect cleared by the decision-maker$/);
  const w = vault(recent, { 'gate-decisions.md': '## [t] REVIEW gate — HALT\n' });
  t.after(w.done);
  assert.match(run(w, 'reader', '--req', 'REQ-900-fixture', '--by', ME), /^warm — you answered 1 gate · last under an hour ago$/);
});
