#!/usr/bin/env node
// ADLC trail hook for Claude Code — records who flew and what was decided, per phase,
// into the REQ's own pipeline-state.json (`phases` block, 1.10). The cockpit mod reads it;
// /wrapup folds it into the record's `## Trail`.
//
// Two modes in one file, so the hook and the skills write through the same code:
//
//   hook  (stdin JSON, wired by scripts/claude-settings.mjs):
//     SessionStart          phases[n].sessions += session_id; startedAt if absent
//     SubagentStart         phases[n].agents += { id, type, startedAt }
//     SubagentStop          fills endedAt, task, verdict (first line of the last message), transcript
//     Stop                  when .awaiting-approval exists: opens a gate round { at, card } for the skill to close
//
//   cli   (node adlc-trail.mjs <cmd> …, also `node scripts/adlc.mjs trail <cmd> …`):
//     gate     --req <id|path> --decision <approve|revise|fix|abort|merged|reframe|predict|summary|…> [--note "<the user's words>"] [--viewed <n/m>] [--by <name>] [--phase <n>]
//     findings --req <id|path> --json '[{"id","severity","decision","reason"}]' | --file <path>
//     show     --req <id|path>
//     stats    [--all | --json]     did the evidence change behaviour: viewed ratios, predict/summary asks, findings without a location
//
// The hook stamps the mechanical fields; the skill writes the semantic ones. Disjoint keys,
// one lock. Everything is bounded: verdicts and notes are cut, agents per phase are capped,
// and nothing here is read by a phase preflight — the block exists for the cockpit and the
// record. Silent on every error in hook mode; the pipeline never waits on its own trail.
import { readFileSync, writeFileSync, readdirSync, existsSync, statSync, openSync, closeSync, unlinkSync, readSync } from 'node:fs';
import { join, dirname, resolve, basename } from 'node:path';
import { execSync } from 'node:child_process';

const MAX_DEPTH = 4;
const AGENTS_PER_PHASE = 20;
const VERDICT_MAX = 160;
const NOTE_MAX = 200;
const LOCK_STALE_MS = 10_000;
const HEAD_BYTES = 65_536;

// ---------- vault and REQ resolution ----------

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
      if (/^(REQ|BUG)-\d+/.test(e.name)) out.push(p);
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

/** The newest non-terminal work item, or the one an id names. */
function resolveReq(vault, hint) {
  const all = folders(vault);
  if (hint) {
    const id = /\b((?:REQ|BUG)-\d+)/.exec(hint)?.[1];
    const hit = all.find((f) => basename(f) === hint || basename(f) === basename(hint)) ?? (id && all.find((f) => basename(f).startsWith(id + '-') || basename(f) === id));
    if (hit) return hit;
    if (existsSync(join(resolve(hint), 'pipeline-state.json'))) return resolve(hint);
    return null;
  }
  let best = null;
  for (const f of all) {
    const st = readState(f);
    if (isTerminal(st)) continue;
    let m = 0;
    try { m = statSync(join(f, 'pipeline-state.json')).mtimeMs; } catch {}
    if (!best || m > best.m) best = { f, m };
  }
  return best?.f ?? null;
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
    return { req: /\b((?:REQ|BUG)-\d+)/.exec(head)?.[1] ?? null, task: /\b(TASK-\d+)/.exec(head)?.[1] ?? null };
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
      if (ev.source === 'compact') return;
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
      const folder = resolveReq(vault);
      if (!folder || !existsSync(join(folder, '.awaiting-approval'))) return;
      stamp(folder, (st) => {
        const ph = phaseOf(st, Number(st.currentPhase) || 1);
        ph.gates ??= [];
        const last = ph.gates[ph.gates.length - 1];
        // The card's verdict is the line under its GATE header, not the header itself.
        const text = String(ev.last_assistant_message ?? '');
        const m = /^[ \t]*(?:#+\s*|\*\*)?GATE \d+\/\d+ · [^\n]*\n/m.exec(text);
        const card = { transcript: ev.transcript_path, verdict: firstLine(m ? text.slice(m.index + m[0].length) : text) };
        if (last && !last.decision) { last.at = now(); last.card = card; } // the same open round, re-emitted
        else ph.gates.push({ at: now(), card });
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
      const note = cut(flag('--note') || '', NOTE_MAX).replace(/\s*\[flightdeck\] viewed \d+\/\d+ files?\s*$/, '');
      const viewed = /^\d{1,3}\/\d{1,3}$/.test(flag('--viewed') || '') ? flag('--viewed') : null; // files opened of files changed, from the cockpit
      const who = flag('--by') || by();
      const st = mutate(folder, (st) => {
        const n = Number(flag('--phase')) || Number(st.currentPhase) || 1;
        const ph = phaseOf(st, n);
        ph.gates ??= [];
        const last = ph.gates[ph.gates.length - 1];
        const round = last && !last.decision ? last : (ph.gates.push({ at: now() }), ph.gates[ph.gates.length - 1]);
        round.at = now();
        round.decision = decision;
        if (note) round.note = note;
        if (viewed) round.viewed = viewed;
        if (who) round.by = who;
      });
      const n = Number(flag('--phase')) || Number(st.currentPhase) || 1;
      console.log(`trail: ${basename(folder)} phase ${n} round ${st.phases[String(n)].gates.length} → ${decision}${viewed ? ` · viewed ${viewed}` : ''}${note ? ` — “${note}”` : ''}`);
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
    case 'show': {
      const st = readState(folder);
      console.log(JSON.stringify({ req: basename(folder), currentPhase: st?.currentPhase, gateState: st?.gateState, phases: st?.phases ?? {} }, null, 2));
      return 0;
    }
    default:
      console.error('usage: adlc-trail.mjs gate --req <id> --decision <d> [--note "…"] [--viewed <n/m>] [--by <name>] [--phase <n>]\n       adlc-trail.mjs findings --req <id> --json \'[…]\' | --file <path>\n       adlc-trail.mjs show --req <id>\n       adlc-trail.mjs stats [--all | --json]');
      return cmd ? 1 : 0;
  }
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
      if (e.isFile() && /^(REQ|BUG)-\d+.*\.md$/.test(e.name)) out.push(p);
      else if (e.isDirectory() && !/^(REQ|BUG)-\d+/.test(e.name) && depth < MAX_DEPTH) walk(p, depth + 1);
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
  const id = /^((?:REQ|BUG)-\d+)/.exec(basename(folder ?? recordPath))?.[1] ?? basename(folder ?? recordPath);
  const f = { id, source: folder ? 'folder' : 'record', phase: 0, answers: [], predict: null, summary: null, architect: false, ship: false, noWhere: [], behaviour: null };
  if (folder) {
    const st = readState(folder);
    if (st) {
      f.phase = livePhase(st);
      for (const [n, ph] of Object.entries(st.phases ?? {})) {
        const k = Number(n);
        if (k === 2) f.architect = true;
        if (k === 5) f.ship = true;
        for (const g of ph.gates ?? []) {
          if (!g.decision) continue;
          if (g.decision === 'predict') { f.predict = g.note === 'skip' ? 'skipped' : 'answered'; continue; }
          if (g.decision === 'summary') { f.summary = g.note === 'skip' ? 'skipped' : 'answered'; continue; }
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
          const decision = d.replace(/\s*·\s*viewed.*$/, '').trim();
          if (decision === 'predict') { f.predict = 'answered'; continue; }
          if (decision === 'summary') { f.summary = 'answered'; continue; }
          if (k === 3 || k === 4) f.answers.push({ phase: k, decision, viewed: v ? ratio(Number(v[1]), Number(v[2])) : null, raw: v ? `${v[1]}/${v[2]}` : null });
        }
      }
      if (/\bpredict\b.*"/.test(line) && !f.predict) f.predict = 'answered';
      if (/\bsummary\b.*"/.test(line) && !f.summary) f.summary = 'answered';
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
  const out = {
    items: all.length, inFlight: all.filter((it) => it.source === 'folder').length, records: all.filter((it) => it.source === 'record').length,
    viewed: { answers: answers.length, counted: counted.length, mean, lowApprovals: low.map((a) => ({ id: a.id, phase: a.phase, viewed: a.raw })) },
    predict: { gates: arch.length, asked: asked(arch, 'predict').length, answered: arch.filter((it) => it.predict === 'answered').length },
    summary: { gates: ship.length, asked: asked(ship, 'summary').length, answered: ship.filter((it) => it.summary === 'answered').length },
    pointers: { findingsWithoutWhere: noWhere.flatMap((it) => it.noWhere.map((fid) => `${it.id} ${fid}`)) },
    behaviour: { specs: specs.length, present: specs.filter((it) => it.behaviour).length },
    perItem: all.map((it) => ({ id: it.id, source: it.source, phase: it.phase, answers: it.answers.length, viewed: it.answers.filter((a) => a.viewed !== null).map((a) => a.raw), predict: it.predict, summary: it.summary, noWhere: it.noWhere, behaviour: it.behaviour })),
  };
  if (want === 'json') { console.log(JSON.stringify(out, null, 2)); return 0; }
  const lines = [
    `GATE EVIDENCE · ${out.items} items (${out.inFlight} in flight, ${out.records} records)`,
    `viewed      ${out.viewed.answers} answers at implement/review · ${out.viewed.counted} carry a count · mean ${pct(mean)}` +
      (low.length ? ` · ${low.length} approved under 50%: ${low.slice(0, 4).map((a) => `${a.id} (${a.raw})`).join(', ')}${low.length > 4 ? '…' : ''}` : counted.length ? ' · none approved under 50%' : ''),
    `predict     ${out.predict.asked} of ${out.predict.gates} architect gates asked · ${out.predict.answered} answered`,
    `summary     ${out.summary.asked} of ${out.summary.gates} ship gates asked · ${out.summary.answered} answered`,
    `pointers    findings with no location: ${out.pointers.findingsWithoutWhere.length}` + (out.pointers.findingsWithoutWhere.length ? ` (${out.pointers.findingsWithoutWhere.slice(0, 6).join(', ')}${out.pointers.findingsWithoutWhere.length > 6 ? '…' : ''})` : ''),
    `behaviour   ${out.behaviour.present} of ${out.behaviour.specs} in-flight specs carry ## Behaviour`,
  ];
  if (want === 'all') {
    lines.push('', 'item        phase  answers  viewed            predict   summary   no-where  behaviour');
    for (const it of out.perItem) lines.push(`${it.id.padEnd(11)} ${String(it.phase).padEnd(6)} ${String(it.answers).padEnd(8)} ${(it.viewed.join(' ') || '—').padEnd(17)} ${(it.predict ?? '—').padEnd(9)} ${(it.summary ?? '—').padEnd(9)} ${(it.noWhere.join(',') || '—').padEnd(9)} ${it.behaviour === null ? '—' : it.behaviour ? 'yes' : 'no'}`);
  }
  console.log(lines.join('\n'));
  return 0;
}

// ---------- entry ----------

const argv = process.argv.slice(2);
if (argv.length && /^(gate|findings|show|stats)$/.test(argv[0])) {
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
