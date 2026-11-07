#!/usr/bin/env node
// ADLC trail hook for Claude Code — records who flew and what was decided, per phase,
// into the REQ's own pipeline-state.json (`phases` block, 1.10). The cockpit mod reads it;
// /wrapup folds it into the record's `## Trail`.
//
// Two modes in one file, so the hook and the skills write through the same code:
//
//   hook  (stdin JSON, wired by scripts/claude-settings.mjs):
//     SessionStart          phases[n].sessions += session_id; startedAt if absent
//                           source=compact (1.12): compactions += 1 on the open gate round, else on the live phase
//     SubagentStart         phases[n].agents += { id, type, startedAt }
//     SubagentStop          fills endedAt, task, verdict (first line of the last message), transcript
//     Stop                  when .awaiting-approval exists: opens a gate round { at, card, ask } for the skill to close;
//                           the card's GATE header names the REQ; an `ASK ·` turn (predict, summary) or a
//                           `DEBRIEF ·` turn (the debrief's ask or its story) is not a gate
//
//   cli   (node adlc-trail.mjs <cmd> …, also `node scripts/adlc.mjs trail <cmd> …`):
//     gate     --req <id|path> --decision <approve|revise|fix|abort|merged|reframe|predict|summary|debrief|…> [--note "<the reply, verbatim>"] [--viewed <n/m>] [--by <name>] [--phase <n>]
//                                    predict, summary and debrief are asks: they never close an open gate round
//     reader   --req <id|path> [--by <name>]   the debrief's reader condition: `cold|warm|handover — <why>` (readerOf)
//     findings --req <id|path> --json '[{"id","severity","decision","reason"}]' | --file <path>
//     show     --req <id|path>
//     stats    [--all | --json]     did the evidence change behaviour: viewed ratios, predict/summary/debrief asks, findings without a location,
//                                    answers sent from the cockpit vs typed, compactions at gates (1.12)
//
// The hook stamps the mechanical fields; the skill writes the semantic ones. Disjoint keys,
// one lock. Everything is bounded: verdicts and notes are cut, agents per phase are capped,
// and nothing here is read by a phase preflight — the block exists for the cockpit and the
// record. Silent on every error in hook mode; the pipeline never waits on its own trail.
import { readFileSync, writeFileSync, readdirSync, existsSync, statSync, openSync, closeSync, unlinkSync, readSync, realpathSync } from 'node:fs';
import { join, dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const MAX_DEPTH = 4;
const AGENTS_PER_PHASE = 20;
const VERDICT_MAX = 160;
const NOTE_MAX = 200;
const MARKER_MAX = 4096;
const OPTIONS_MAX = 8;
const OPTION_LABEL_MAX = 40;
const LOCK_STALE_MS = 10_000;
const HEAD_BYTES = 65_536;

// ---------- vault and REQ resolution ----------

// A work-item ID as every req.id_scheme mints it: REQ-042 (sequential, ticket), REQ-sf-042
// (prefixed), BUG-017. Grammar: core/VAULT-LAYOUT.md → "Work-item IDs" — keep this in step with
// it and with ID_SRC in the flightdeck mod (hooks/model.ts). The prefix starts with a letter, so a
// slug that starts with a digit (REQ-042-2fa-login) never reads as one. Not preceded by a word
// char or a hyphen, so a lesson id (L-REQ-035-1) never yields REQ-035.
const ID_SRC = '(?:REQ|BUG)-(?:[a-z][a-z0-9]{0,7}-)?\\d+';
const ID_IN_TEXT = new RegExp(`(?<![\\w-])(${ID_SRC})`);
const ID_AT_START = new RegExp(`^(${ID_SRC})(?![\\w])`);
const idOf = (s) => ID_IN_TEXT.exec(s ?? '')?.[1] ?? null;
/** A work folder or record name: `REQ-042-slug`, `REQ-sf-042-slug`, `BUG-017-slug` (with `.md` for records). */
const isWorkName = (name) => ID_AT_START.test(name);
/** A gate card's header line (GATE-PROTOCOL skeleton); the id in it names the REQ. */
const GATE_LINE = /^[ \t]*(?:#+\s*|\*\*)?GATE \d+\/\d+ · [^\n]*\n/m;
/** A predict or summary ask, or a debrief turn (GATE-PROTOCOL → The trail): ends the turn, but is not a gate. */
export const ASK_LINE = /^[ \t]*(?:#+\s*|\*\*)?(?:ASK · (?:Predict|Summary)|DEBRIEF) · /m;
/** Decisions that record an ask, not a gate answer: they never close an open round and never count as gate rounds. */
const ASK_DECISIONS = new Set(['predict', 'summary', 'debrief']);
/** The trailer a reply sent from the cockpit ends with (adlc-flightdeck): the viewed count at implement and review, `pane` elsewhere. */
const TRAILER = /\s*\[flightdeck\](?: viewed (\d{1,3})\/(\d{1,3}) files?| pane)\s*$/;

function findVault(start) {
  let dir = resolve(start);
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, '.adlc'))) return join(dir, '.adlc');
    const up = dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return null;
}

/** Every REQ/BUG working-set folder under specs/ and bugs/, to the bucket depth. */
function folders(vault) {
  const out = [];
  const walk = (dir, depth) => {
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const p = join(dir, e.name);
      if (isWorkName(e.name)) out.push(p);
      else if (depth < MAX_DEPTH && e.name !== '_archive') walk(p, depth + 1);
    }
  };
  for (const shelf of ['specs', 'bugs']) walk(join(vault, shelf), 1);
  return out;
}

function readState(folder) {
  try { return JSON.parse(readFileSync(join(folder, 'pipeline-state.json'), 'utf8')); } catch { return null; }
}

const isTerminal = (st) => !st || st.prState === 'merged' || st.aborted === true || st.status === 'cancelled' || st.currentPhase === undefined;

/**
 * The work item an id or path names; with none, the newest non-terminal one. `atGate` (Stop,
 * compaction) prefers the item holding the newest `.awaiting-approval` — two REQs open in one
 * checkout, and the one at a gate is the one the card or the compaction belongs to.
 */
function resolveReq(vault, hint, { atGate = false } = {}) {
  const all = folders(vault);
  if (hint) {
    // A vault-relative <REQ_PATH> (what every skill passes) names one folder exactly.
    if (!/^[\\/]|^[A-Za-z]:/.test(hint) && existsSync(join(vault, hint, 'pipeline-state.json'))) return join(vault, hint);
    const id = idOf(hint);
    const hit = all.find((f) => basename(f) === hint || basename(f) === basename(hint)) ?? (id && all.find((f) => basename(f).startsWith(id + '-') || basename(f) === id));
    if (hit) return hit;
    if (existsSync(join(resolve(hint), 'pipeline-state.json'))) return resolve(hint);
    return null;
  }
  let best = null, gate = null;
  for (const f of all) {
    const st = readState(f);
    if (isTerminal(st)) continue;
    let m = 0;
    try { m = statSync(join(f, 'pipeline-state.json')).mtimeMs; } catch {}
    if (!best || m > best.m) best = { f, m };
    if (!atGate) continue;
    let g = -1;
    try { g = statSync(join(f, '.awaiting-approval')).mtimeMs; } catch {}
    if (g >= 0 && (!gate || g > gate.m)) gate = { f, m: g };
  }
  return gate?.f ?? best?.f ?? null;
}

/** The marker's ask (1.12): its `Ask:` line, the option labels (≤8, ≤40 chars) and `Recommended:`. A 1.11 marker has no options: null. */
function askOf(folder) {
  let text = '';
  try { text = readFileSync(join(folder, '.awaiting-approval'), 'utf8').slice(0, MARKER_MAX); } catch { return null; }
  const options = [];
  let inOptions = false, ask = '', recommended = '';
  for (const raw of text.replace(/\r\n/g, '\n').split('\n')) {
    const item = /^\s+[-*]\s+(.*)$/.exec(raw);
    if (item) {
      const label = item[1].split(/\s+[—–]\s+/)[0].trim();
      if (inOptions && label && options.length < OPTIONS_MAX) options.push(cut(label, OPTION_LABEL_MAX));
      continue;
    }
    const kv = /^([A-Za-z][\w ]*?):\s*(.*)$/.exec(raw.trim());
    if (!kv) continue;
    const key = kv[1].toLowerCase();
    inOptions = key === 'options';
    if (key === 'ask') ask = kv[2].trim();
    else if (key === 'recommended') recommended = kv[2].trim();
  }
  if (!options.length) return null;
  return { text: cut(ask, VERDICT_MAX), options, ...(recommended ? { recommended: cut(recommended, OPTION_LABEL_MAX) } : {}) };
}

/** The phase agents and gates belong to right now: a cleared gate means the next phase is live. */
function livePhase(st) {
  const n = Number(st.currentPhase) || 1;
  return st.gateState === 'cleared' ? Math.min(5, n + 1) : n;
}

// ---------- the one write path: lock, read, change, write ----------

function mutate(folder, fn) {
  const file = join(folder, 'pipeline-state.json');
  const lock = join(folder, '.pipeline-state.lock');
  let fd = null;
  for (let i = 0; i < 20 && fd === null; i++) {
    try { fd = openSync(lock, 'wx'); } catch {
      try { if (Date.now() - statSync(lock).mtimeMs > LOCK_STALE_MS) unlinkSync(lock); } catch {}
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
    }
  }
  if (fd === null) throw new Error('pipeline-state.json is locked');
  try {
    const st = JSON.parse(readFileSync(file, 'utf8'));
    const out = fn(st) ?? st;
    writeFileSync(file, JSON.stringify(out, null, 2) + '\n');
    return out;
  } finally {
    closeSync(fd);
    try { unlinkSync(lock); } catch {}
  }
}

const phaseOf = (st, n) => ((st.phases ??= {})[String(n)] ??= {});
const cut = (s, max) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > max ? t.slice(0, max - 1) + '…' : t; };
const now = () => new Date().toISOString();

/** The first line worth quoting from a message: body before heading, fences and bold stripped. */
function firstLine(text) {
  const lines = String(text ?? '').split('\n').map((l) => l.trim()).filter((l) => l && !/^[`>*|-]+$/.test(l) && !/^```/.test(l));
  const line = lines.find((l) => !/^#/.test(l)) ?? lines[0] ?? '';
  return cut(line.replace(/^#+\s*/, '').replace(/\*\*/g, '').replace(/^[-*]\s+/, ''), VERDICT_MAX);
}

/** What a subagent transcript's head says about its task: the REQ it was dispatched for and the TASK it was given. */
function transcriptHead(path) {
  try {
    const fd = openSync(path, 'r');
    const buf = Buffer.alloc(HEAD_BYTES);
    let n = 0;
    try { n = readSync(fd, buf, 0, buf.length, 0); } finally { closeSync(fd); }
    const head = buf.toString('utf8', 0, n);
    return { req: idOf(head), task: /\b(TASK-\d+)/.exec(head)?.[1] ?? null };
  } catch { return { req: null, task: null }; }
}

// ---------- hook mode ----------

function hook(ev) {
  const cwd = ev.cwd || process.cwd();
  const vault = findVault(cwd);
  if (!vault) return;
  const stamp = (folder, fn) => { try { mutate(folder, fn); } catch {} };

  switch (ev.hook_event_name) {
    case 'SessionStart': {
      if (ev.source === 'compact') {
        // A compaction (the user's, the cockpit's or the engine's): counted on the gate round it fell in, else on the live phase.
        const folder = resolveReq(vault, null, { atGate: true });
        if (!folder) return;
        stamp(folder, (st) => {
          const gp = st.phases?.[String(Number(st.currentPhase) || 1)];
          const last = gp?.gates?.[gp.gates.length - 1];
          if (last && !last.decision) last.compactions = (last.compactions ?? 0) + 1;
          else { const ph = phaseOf(st, livePhase(st)); ph.compactions = (ph.compactions ?? 0) + 1; }
        });
        return;
      }
      const folder = resolveReq(vault);
      if (!folder) return;
      stamp(folder, (st) => {
        const ph = phaseOf(st, livePhase(st));
        ph.startedAt ??= now();
        ph.sessions = [...new Set([...(ph.sessions ?? []), ev.session_id].filter(Boolean))].slice(-10);
      });
      return;
    }
    case 'SubagentStart': {
      const folder = resolveReq(vault);
      if (!folder) return;
      stamp(folder, (st) => {
        const ph = phaseOf(st, livePhase(st));
        ph.agents ??= [];
        if (!ph.agents.some((a) => a.id === ev.agent_id)) {
          ph.agents.push({ id: ev.agent_id, type: ev.agent_type, startedAt: now() });
          if (ph.agents.length > AGENTS_PER_PHASE) { ph.agentsDropped = (ph.agentsDropped ?? 0) + (ph.agents.length - AGENTS_PER_PHASE); ph.agents = ph.agents.slice(-AGENTS_PER_PHASE); }
        }
      });
      return;
    }
    case 'SubagentStop': {
      const { req, task } = transcriptHead(ev.agent_transcript_path);
      const folder = resolveReq(vault, req) ?? resolveReq(vault);
      if (!folder) return;
      stamp(folder, (st) => {
        // The start stamp may sit on the active REQ while the transcript names another; move it.
        let found = null;
        for (const ph of Object.values(st.phases ?? {})) {
          const i = (ph.agents ?? []).findIndex((a) => a.id === ev.agent_id);
          if (i >= 0) { found = ph.agents[i]; break; }
        }
        const ph = phaseOf(st, livePhase(st));
        ph.agents ??= [];
        const entry = found ?? { id: ev.agent_id, type: ev.agent_type, startedAt: now() };
        if (!found) ph.agents.push(entry);
        entry.type ??= ev.agent_type;
        if (task) entry.task = task;
        entry.endedAt = now();
        entry.verdict = firstLine(ev.last_assistant_message);
        entry.transcript = ev.agent_transcript_path;
        if (ph.agents.length > AGENTS_PER_PHASE) { ph.agentsDropped = (ph.agentsDropped ?? 0) + (ph.agents.length - AGENTS_PER_PHASE); ph.agents = ph.agents.slice(-AGENTS_PER_PHASE); }
      });
      return;
    }
    case 'Stop': {
      const text = String(ev.last_assistant_message ?? '');
      if (ASK_LINE.test(text)) return; // a predict, summary or debrief turn ends the turn; it is not a gate
      const m = GATE_LINE.exec(text);
      const named = m ? idOf(m[0]) : null; // the card names its REQ: two open in one checkout land right
      const folder = (named && resolveReq(vault, named)) || resolveReq(vault, null, { atGate: true });
      if (!folder || !existsSync(join(folder, '.awaiting-approval'))) return;
      const ask = askOf(folder);
      stamp(folder, (st) => {
        const ph = phaseOf(st, Number(st.currentPhase) || 1);
        ph.gates ??= [];
        const last = ph.gates[ph.gates.length - 1];
        // The card's verdict is the line under its GATE header, not the header itself.
        const card = { transcript: ev.transcript_path, verdict: firstLine(m ? text.slice(m.index + m[0].length) : text) };
        if (last && !last.decision) {
          // The same open round. A re-emitted card refreshes it; a turn that only answered a question leaves it as it was.
          if (m) { last.at = now(); last.card = card; if (ask) last.ask = ask; }
        } else ph.gates.push({ at: now(), card, ...(ask ? { ask } : {}) });
      });
      return;
    }
    default:
      return;
  }
}

// ---------- cli mode ----------

function cli(argv) {
  const cmd = argv[0];
  const flag = (n) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] !== undefined && !String(argv[i + 1]).startsWith('--') ? argv[i + 1] : null; };
  const vault = resolve(flag('--vault') || findVault(process.cwd()) || '.adlc');
  if (!existsSync(vault)) { console.error(`trail: no vault at ${vault}`); return 2; }
  if (cmd === 'stats') return stats(vault, argv);
  const folder = resolveReq(vault, flag('--req'));
  if (!folder) { console.error(`trail: no work item ${flag('--req') ? `matching ${flag('--req')}` : 'in flight'} under ${vault}`); return 2; }
  const by = () => { try { return execSync('git config user.name', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return ''; } };

  switch (cmd) {
    case 'gate': {
      const decision = (flag('--decision') || '').toLowerCase();
      if (!decision) { console.error('trail gate: --decision is required'); return 2; }
      // The note is the reply, verbatim. The cockpit's trailer is lifted out before the cut, so a long
      // reply keeps it; a note that is only the option is no note.
      const raw = flag('--note') || '';
      const t = TRAILER.exec(raw);
      let note = cut(raw.replace(TRAILER, ''), NOTE_MAX);
      if (note.toLowerCase() === decision) note = '';
      const viewed = /^\d{1,3}\/\d{1,3}$/.test(flag('--viewed') || '') ? flag('--viewed') // an explicit count wins
        : t && t[1] ? `${t[1]}/${t[2]}` : null; // files opened of files changed, from the cockpit
      const via = t ? 'pane' : 'typed';
      const who = flag('--by') || by();
      let index = 0;
      const st = mutate(folder, (st) => {
        const n = Number(flag('--phase')) || Number(st.currentPhase) || 1;
        const ph = phaseOf(st, n);
        ph.gates ??= [];
        const last = ph.gates[ph.gates.length - 1];
        const open = !!last && !last.decision;
        let round;
        if (open && !ASK_DECISIONS.has(decision)) round = last; // the gate's answer closes its open round
        else if (open) { round = { at: now() }; ph.gates.splice(ph.gates.length - 1, 0, round); } // an ask goes before the open round, which stays last
        else { round = { at: now() }; ph.gates.push(round); }
        index = ph.gates.indexOf(round) + 1;
        round.at = now();
        round.decision = decision;
        if (note) round.note = note;
        if (viewed) round.viewed = viewed;
        round.via = via;
        if (who) round.by = who;
      });
      const n = Number(flag('--phase')) || Number(st.currentPhase) || 1;
      console.log(`trail: ${basename(folder)} phase ${n} round ${index} → ${decision}${viewed ? ` · viewed ${viewed}` : ''}${via === 'pane' ? ' · via pane' : ''}${note ? ` — “${note}”` : ''}`);
      return 0;
    }
    case 'findings': {
      let list;
      try { list = JSON.parse(flag('--file') ? readFileSync(resolve(flag('--file')), 'utf8') : flag('--json') || '[]'); } catch (e) { console.error(`trail findings: bad JSON — ${e.message}`); return 2; }
      if (!Array.isArray(list)) { console.error('trail findings: expected an array'); return 2; }
      const clean = list.map((f) => ({ id: cut(f.id, 24), severity: cut(f.severity, 16), decision: cut(f.decision, 16), ...(f.reason ? { reason: cut(f.reason, 120) } : {}) })).filter((f) => f.id);
      mutate(folder, (st) => { phaseOf(st, Number(flag('--phase')) || 4).findings = clean; });
      console.log(`trail: ${basename(folder)} findings recorded: ${clean.length}`);
      return 0;
    }
    case 'reader': {
      const st = readState(folder);
      if (!st) { console.error(`trail reader: no readable pipeline-state.json in ${basename(folder)}`); return 2; }
      let decisions = '';
      try { decisions = readFileSync(join(folder, 'gate-decisions.md'), 'utf8'); } catch {}
      const r = readerOf({ phases: st.phases ?? {}, user: flag('--by') || by(), now: Date.now(), autoPhases: autoPhasesOf(decisions) });
      console.log(`${r.reader} — ${r.why}`);
      return 0;
    }
    case 'show': {
      const st = readState(folder);
      console.log(JSON.stringify({ req: basename(folder), currentPhase: st?.currentPhase, gateState: st?.gateState, phases: st?.phases ?? {} }, null, 2));
      return 0;
    }
    default:
      console.error('usage: adlc-trail.mjs gate --req <id|path> --decision <d> [--note "<the reply, verbatim>"] [--viewed <n/m>] [--by <name>] [--phase <n>]\n       adlc-trail.mjs findings --req <id> --json \'[…]\' | --file <path>\n       adlc-trail.mjs show --req <id>\n       adlc-trail.mjs reader --req <id> [--by <name>]\n       adlc-trail.mjs stats [--all | --json]');
      return cmd ? 1 : 0;
  }
}

// ---------- the reader condition (REQ-002, the debrief) ----------

const HOUR_MS = 3_600_000;
const STALE_HOURS = 24;
const PHASE_NAMES = { 1: 'spec', 2: 'architect', 3: 'implement', 4: 'review', 5: 'ship' };
/** gate-decisions.md names a phase by word (decision-maker.md → Output); this is the one map to its number. */
const PHASE_BY_NAME = { spec: 1, architect: 2, implement: 3, verify: 4, review: 4, ship: 5 };

/**
 * The phases the decision-maker cleared: `## [<ts>] <PHASE> gate — APPROVE` entries in gate-decisions.md.
 * REWORK and HALT went back to a human, so they do not count. Unknown phase names are ignored.
 */
export function autoPhasesOf(text) {
  const out = new Set();
  for (const m of String(text ?? '').matchAll(/^##\s*\[[^\]]*\]\s*(\w+)\s+gate\s*[—–-]+\s*(\w+)/gim)) {
    const n = PHASE_BY_NAME[m[1].toLowerCase()];
    if (n && m[2].toUpperCase() === 'APPROVE') out.add(n);
  }
  return [...out].sort((a, b) => a - b);
}

const ago = (ms) => { const h = Math.floor(ms / HOUR_MS); return h >= 48 ? `${Math.floor(h / 24)} days` : h >= 1 ? `${h}h` : 'under an hour'; };

/**
 * Who the debrief is for, from the trail: `cold`, `warm` or `handover`, with one line of evidence.
 * Counts gate rounds only — decided rounds whose decision is not predict, summary or debrief — so the
 * ask rounds /wrapup records just before the debrief neither hide a handover nor reset the clock.
 * First match wins: handover (rounds carry `by`, none is the user) → cold (low viewed at implement/review,
 * or none there while a round there came from the pane · half or more of the implement/review rounds
 * answered from the pane with no viewed · a phase cleared by the decision-maker · 24h since the last
 * gate round) → warm. The cockpit attaches `viewed` only at implement (3) and review (4) — elsewhere its
 * trailer is `[flightdeck] pane` — so a pane answer at spec, architect or ship never counts toward cold.
 * An empty `user` (no git name) or rounds with no `by` skip the handover rule.
 * Pure: no file, clock or git access.
 */
export function readerOf({ phases = {}, user = '', now = Date.now(), autoPhases = [] } = {}) {
  const at = new Date(now).getTime();
  const rounds = [];
  for (const [n, ph] of Object.entries(phases ?? {})) {
    for (const g of ph?.gates ?? []) if (g?.decision && !ASK_DECISIONS.has(String(g.decision).toLowerCase())) rounds.push({ ...g, phase: Number(n) });
  }
  const me = String(user ?? '').trim().toLowerCase();
  const authors = rounds.map((r) => String(r.by ?? '').trim()).filter(Boolean);
  if (me && authors.length && !authors.some((a) => a.toLowerCase() === me)) {
    const names = [...new Set(authors)];
    return { reader: 'handover', why: `every gate answered by ${names.slice(0, 2).join(', ')}${names.length > 2 ? ' and others' : ''}, none by you` };
  }
  const cold = [];
  const atCode = rounds.filter((r) => r.phase === 3 || r.phase === 4);
  if (atCode.length) {
    const counted = atCode.map((r) => ({ r, m: /^(\d+)\/(\d+)$/.exec(r.viewed ?? '') })).filter((x) => x.m && Number(x.m[2]) > 0);
    // Only the cockpit writes `viewed`: a typed round with no count is unknown, not unseen (CORR-001).
    if (!counted.length) { if (atCode.some((r) => r.via === 'pane')) cold.push('no viewed count at implement or review'); }
    else {
      const low = counted.reduce((a, b) => (Number(b.m[1]) / Number(b.m[2]) < Number(a.m[1]) / Number(a.m[2]) ? b : a));
      if (Number(low.m[1]) / Number(low.m[2]) < 0.5) cold.push(`viewed ${low.m[1]}/${low.m[2]} at ${PHASE_NAMES[low.r.phase]}`);
      // Blind: a pane round at implement/review with no count, against the rounds there (CORR-006).
      // Only when some round there has a count — with none, the reason above already says it.
      const blind = atCode.filter((r) => r.via === 'pane' && !r.viewed).length;
      if (blind * 2 >= atCode.length) cold.push(`${blind} of ${atCode.length} gates at implement and review answered from the pane unseen`);
    }
  }
  const auto = [...new Set((autoPhases ?? []).map(Number))].filter((n) => PHASE_NAMES[n]).sort((a, b) => a - b);
  if (auto.length) cold.push(`${auto.map((n) => PHASE_NAMES[n]).join(', ')} cleared by the decision-maker`);
  const last = Math.max(-Infinity, ...rounds.map((r) => new Date(r.at).getTime()).filter(Number.isFinite));
  if (Number.isFinite(last) && at - last >= STALE_HOURS * HOUR_MS) cold.push(`${ago(at - last)} since the last gate`);
  if (cold.length) return { reader: 'cold', why: cold.join(' · ') };
  if (!rounds.length) return { reader: 'warm', why: 'no gate answered yet' };
  return { reader: 'warm', why: `you answered ${rounds.length} gate${rounds.length === 1 ? '' : 's'} · last ${ago(at - last)} ago` };
}

// ---------- stats: did the evidence change behaviour? (1.11.2) ----------

/** Records of finished work: REQ-*.md / BUG-*.md beside the folders, _archive included. */
function records(vault) {
  const out = [];
  const walk = (dir, depth) => {
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const p = join(dir, e.name);
      if (e.isFile() && isWorkName(e.name) && e.name.endsWith('.md')) out.push(p);
      else if (e.isDirectory() && !isWorkName(e.name) && depth < MAX_DEPTH) walk(p, depth + 1);
    }
  };
  for (const shelf of ['specs', 'bugs']) walk(join(vault, shelf), 1);
  return out;
}

const section = (md, heading) => {
  const m = new RegExp(`^##\\s+${heading}\\s*$`, 'im').exec(md);
  if (!m) return null;
  const rest = md.slice(m.index + m[0].length);
  const end = /^##\s+/m.exec(rest);
  return (end ? rest.slice(0, end.index) : rest).trim();
};
const POINTER = /[\w./\\-]+\.[A-Za-z]{1,8}(?::\d+)?/;
const ratio = (n, m) => (m ? n / m : null);
const pct = (x) => (x === null ? '—' : `${Math.round(x * 100)}%`);

/** One item's evidence facts, from its working set (pipeline-state.phases + files) or its record (## Trail). */
function evidenceOf(folder, recordPath) {
  const id = ID_AT_START.exec(basename(folder ?? recordPath))?.[1] ?? basename(folder ?? recordPath);
  // rounds (1.12): every gate round but predict/summary/debrief — { phase, decided, via: pane|typed|unknown, compactions }
  const f = { id, source: folder ? 'folder' : 'record', phase: 0, answers: [], rounds: [], midCompactions: 0, predict: null, summary: null, debrief: null, architect: false, ship: false, noWhere: [], behaviour: null };
  if (folder) {
    const st = readState(folder);
    if (st) {
      f.phase = livePhase(st);
      for (const [n, ph] of Object.entries(st.phases ?? {})) {
        const k = Number(n);
        if (k === 2) f.architect = true;
        if (k === 5) f.ship = true;
        f.midCompactions += Number(ph.compactions) || 0; // a compaction that fell between gates
        for (const g of ph.gates ?? []) {
          // `via` is written by every 1.12 `trail gate`; a decided round without it predates 1.12.
          if (!ASK_DECISIONS.has(g.decision)) f.rounds.push({ phase: k, decided: !!g.decision, via: g.decision ? (g.via === 'pane' || g.via === 'typed' ? g.via : 'unknown') : null, compactions: Number(g.compactions) || 0 });
          if (!g.decision) continue;
          if (g.decision === 'predict') { f.predict = g.note === 'skip' ? 'skipped' : 'answered'; continue; }
          if (g.decision === 'summary') { f.summary = g.note === 'skip' ? 'skipped' : 'answered'; continue; }
          if (g.decision === 'debrief') { f.debrief = g.note === 'skip' ? 'skipped' : 'answered'; continue; }
          if (k === 3 || k === 4) { const m = /^(\d+)\/(\d+)$/.exec(g.viewed ?? ''); f.answers.push({ phase: k, decision: g.decision, viewed: m ? ratio(Number(m[1]), Number(m[2])) : null, raw: g.viewed ?? null }); }
        }
      }
      if (f.phase >= 2) f.architect = true;
      if (f.phase >= 5) f.ship = true;
    }
    try {
      const ver = readFileSync(join(folder, 'verification.md'), 'utf8');
      const digest = section(ver, 'Findings at a glance') ?? '';
      const rows = digest.split('\n').filter((l) => /^\|/.test(l) && !/^\|[\s:|-]+\|$/.test(l));
      const header = (rows.shift() ?? '').toLowerCase().split('|').map((c) => c.trim());
      const iw = header.findIndex((h) => /where|file|location/.test(h)), ii = header.findIndex((h) => /^id$/.test(h));
      for (const r of rows) {
        const cells = r.split('|').map((c) => c.trim().replace(/^`|`$/g, ''));
        const where = cells[iw >= 0 ? iw : 4] ?? '', fid = cells[ii >= 0 ? ii : 1] ?? '';
        if (fid && !POINTER.test(where)) f.noWhere.push(fid);
      }
    } catch {}
    try {
      const req = readFileSync(join(folder, 'requirement.md'), 'utf8');
      f.behaviour = section(req, 'Behaviou?r') !== null;
    } catch {}
  } else {
    let md = '';
    try { md = readFileSync(recordPath, 'utf8'); } catch { return f; }
    f.phase = 5; f.architect = true; f.ship = true;
    const trail = section(md, 'Trail') ?? '';
    for (const line of trail.split('\n')) {
      const m = /^-\s*(\d)\s+\w+\s+·\s+\d+\s+rounds?\s+\((.*?)\)/.exec(line.trim());
      if (m) {
        const k = Number(m[1]);
        for (const part of m[2].split('→')) {
          const d = part.trim();
          const v = /viewed\s+(\d+)\/(\d+)/.exec(d);
          // 1.12 adds `· via pane` / `· typed` and `· N compactions` after viewed; a pre-1.12 record has neither, so its rounds are `unknown`.
          const decision = d.replace(/\s*·\s*(?:viewed|via|typed|\d+ compactions?)\b.*$/, '').trim();
          if (decision === 'predict') { f.predict = 'answered'; continue; }
          if (decision === 'summary') { f.summary = 'answered'; continue; }
          if (decision === 'debrief') { f.debrief = 'answered'; continue; }
          const c = /·\s*(\d+) compactions?\b/.exec(d);
          f.rounds.push({ phase: k, decided: true, via: /·\s*via pane\b/.test(d) ? 'pane' : /·\s*typed\b/.test(d) ? 'typed' : 'unknown', compactions: c ? Number(c[1]) : 0 });
          if (k === 3 || k === 4) f.answers.push({ phase: k, decision, viewed: v ? ratio(Number(v[1]), Number(v[2])) : null, raw: v ? `${v[1]}/${v[2]}` : null });
        }
      }
      if (/\bpredict\b.*"/.test(line) && !f.predict) f.predict = 'answered';
      if (/\bsummary\b.*"/.test(line) && !f.summary) f.summary = 'answered';
      if (/\bdebrief\b.*"/.test(line) && !f.debrief) f.debrief = 'answered';
    }
    f.behaviour = section(md, 'Behaviou?r') !== null ? true : null;
  }
  return f;
}

function stats(vault, argv) {
  const want = argv.includes('--json') ? 'json' : argv.includes('--all') ? 'all' : 'summary';
  const items = [...folders(vault).map((f) => evidenceOf(f, null)), ...records(vault).map((r) => evidenceOf(null, r))];
  const byId = new Map();
  for (const it of items) if (!byId.has(it.id) || it.source === 'folder') byId.set(it.id, it); // a folder beats its record
  const all = [...byId.values()];
  const answers = all.flatMap((it) => it.answers.map((a) => ({ ...a, id: it.id })));
  const counted = answers.filter((a) => a.viewed !== null);
  const mean = counted.length ? counted.reduce((s, a) => s + a.viewed, 0) / counted.length : null;
  const low = counted.filter((a) => /^(approve|fix)/.test(a.decision) && a.viewed < 0.5);
  const arch = all.filter((it) => it.architect), ship = all.filter((it) => it.ship);
  const asked = (xs, k) => xs.filter((it) => it[k] !== null);
  const noWhere = all.filter((it) => it.noWhere.length);
  const specs = all.filter((it) => it.behaviour !== null && it.source === 'folder');
  const rounds = all.flatMap((it) => it.rounds);
  const decided = rounds.filter((r) => r.decided);
  const viaN = (v) => decided.filter((r) => r.via === v).length;
  const cmpTotal = rounds.reduce((s, r) => s + r.compactions, 0);
  const out = {
    items: all.length, inFlight: all.filter((it) => it.source === 'folder').length, records: all.filter((it) => it.source === 'record').length,
    viewed: { answers: answers.length, counted: counted.length, mean, lowApprovals: low.map((a) => ({ id: a.id, phase: a.phase, viewed: a.raw })) },
    predict: { gates: arch.length, asked: asked(arch, 'predict').length, answered: arch.filter((it) => it.predict === 'answered').length },
    summary: { gates: ship.length, asked: asked(ship, 'summary').length, answered: ship.filter((it) => it.summary === 'answered').length },
    debrief: { items: all.length, asked: asked(all, 'debrief').length, skipped: all.filter((it) => it.debrief === 'skipped').length },
    pointers: { findingsWithoutWhere: noWhere.flatMap((it) => it.noWhere.map((fid) => `${it.id} ${fid}`)) },
    behaviour: { specs: specs.length, present: specs.filter((it) => it.behaviour).length },
    via: { answers: decided.length, pane: viaN('pane'), typed: viaN('typed'), unknown: viaN('unknown') },
    compactions: { gates: rounds.length, total: cmpTotal, perGate: rounds.length ? cmpTotal / rounds.length : null, atGateRounds: rounds.filter((r) => r.compactions > 0).length, midPhase: all.reduce((s, it) => s + it.midCompactions, 0) },
    perItem: all.map((it) => ({ id: it.id, source: it.source, phase: it.phase, answers: it.answers.length, viewed: it.answers.filter((a) => a.viewed !== null).map((a) => a.raw), predict: it.predict, summary: it.summary, debrief: it.debrief, noWhere: it.noWhere, behaviour: it.behaviour, via: { pane: it.rounds.filter((r) => r.via === 'pane').length, typed: it.rounds.filter((r) => r.via === 'typed').length }, compactions: it.rounds.reduce((s, r) => s + r.compactions, 0) })),
  };
  if (want === 'json') { console.log(JSON.stringify(out, null, 2)); return 0; }
  const lines = [
    `GATE EVIDENCE · ${out.items} items (${out.inFlight} in flight, ${out.records} records)`,
    `viewed      ${out.viewed.answers} answers at implement/review · ${out.viewed.counted} carry a count · mean ${pct(mean)}` +
      (low.length ? ` · ${low.length} approved under 50%: ${low.slice(0, 4).map((a) => `${a.id} (${a.raw})`).join(', ')}${low.length > 4 ? '…' : ''}` : counted.length ? ' · none approved under 50%' : ''),
    `predict     ${out.predict.asked} of ${out.predict.gates} architect gates asked · ${out.predict.answered} answered`,
    `summary     ${out.summary.asked} of ${out.summary.gates} ship gates asked · ${out.summary.answered} answered`,
    `debrief     ${out.debrief.asked} of ${out.debrief.items} items asked · ${out.debrief.skipped} skipped`,
    `pointers    findings with no location: ${out.pointers.findingsWithoutWhere.length}` + (out.pointers.findingsWithoutWhere.length ? ` (${out.pointers.findingsWithoutWhere.slice(0, 6).join(', ')}${out.pointers.findingsWithoutWhere.length > 6 ? '…' : ''})` : ''),
    `behaviour   ${out.behaviour.present} of ${out.behaviour.specs} in-flight specs carry ## Behaviour`,
    `via pane    ${out.via.pane} of ${out.via.pane + out.via.typed} gate answers (${out.via.typed} typed · ${out.via.unknown} before 1.12)`,
    `compaction  ${out.compactions.total} at gates across ${out.compactions.gates} rounds · ${out.compactions.perGate === null ? '—' : out.compactions.perGate.toFixed(2)} per gate · ${out.compactions.atGateRounds} rounds compacted` +
      (out.compactions.midPhase ? ` · ${out.compactions.midPhase} between gates` : ''),
  ];
  if (want === 'all') {
    lines.push('', 'item        phase  answers  viewed            predict   summary   debrief   no-where  behaviour  via p/t  cmp');
    for (const it of out.perItem) lines.push(`${it.id.padEnd(11)} ${String(it.phase).padEnd(6)} ${String(it.answers).padEnd(8)} ${(it.viewed.join(' ') || '—').padEnd(17)} ${(it.predict ?? '—').padEnd(9)} ${(it.summary ?? '—').padEnd(9)} ${(it.debrief ?? '—').padEnd(9)} ${(it.noWhere.join(',') || '—').padEnd(9)} ${(it.behaviour === null ? '—' : it.behaviour ? 'yes' : 'no').padEnd(10)} ${`${it.via.pane}/${it.via.typed}`.padEnd(8)} ${it.compactions}`);
  }
  console.log(lines.join('\n'));
  return 0;
}

// ---------- entry ----------

// Run only when executed, never on `import` (the tests import readerOf). argv[1] may be a symlink
// to this file (an installed hook), and import.meta.url is always the real path: compare real paths.
const isMain = (() => { try { return realpathSync(process.argv[1] ?? '') === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; } })();

if (isMain) {
  const argv = process.argv.slice(2);
  if (argv.length && /^(gate|findings|show|stats|reader)$/.test(argv[0])) {
    process.exit(cli(argv));
  } else {
    try {
      let input = '';
      try { input = readFileSync(0, 'utf8'); } catch {}
      let ev = {};
      try { ev = JSON.parse(input); } catch {}
      if (ev && ev.hook_event_name) hook(ev);
    } catch {}
    process.exit(0);
  }
}
