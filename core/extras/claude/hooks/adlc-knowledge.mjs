#!/usr/bin/env node
// ADLC knowledge hook for Claude Code — v1.9.1.
//
// The vault's knowledge only helps if it reaches the agent at the moment it
// edits the code the knowledge is about. Until now that depended on an agent
// remembering to grep. This hook makes the relevant lines arrive on their own,
// once, capped, and only for the directory being touched. It also carries the
// two lifecycle cases that need the same file parsing (compaction snapshot,
// generated-file write deny) and two advisories from the audit's failed-call
// analysis. One script, six cases, each a no-op unless its event matches:
//
//   PreToolUse   Read|Edit|Write|MultiEdit   on a source file: inject lessons.md /
//                                            gotchas.md lines whose path or tag
//                                            matches the file's directory — once
//                                            per session per directory, ≤8 lines,
//                                            ≤3KB, worst severity first. On the
//                                            first *Write* in a directory also
//                                            inject the generated rule body for
//                                            that path (a new file is never Read,
//                                            so the native rule never fires).
//   PreToolUse   Write|Edit|MultiEdit         on a `<!-- GENERATED` file: deny with
//                                            the regenerate command.
//   SubagentStart task-implementer|pipeline-runner: inject every `critical`
//                                            lesson (always-read), ≤10.
//   SessionStart source=compact             re-inject a recomputed working-state
//                                            snapshot: active REQ, phase, gate
//                                            marker, git status head, verify cmds.
//   PostToolUse  Bash                        once per session: a search piped to
//                                            head/tail or -m is not evidence of
//                                            absence.
//   PostToolUseFailure Bash                  the same command failed twice
//                                            unchanged: name the four rules.
//
// Emission: JSON additionalContext on stdout AND the same text on stderr — a
// PostToolUse hook that only writes stderr never reaches the model. Silent on
// any error; never blocks anything it can't read. No dependencies.
//
// Budgets are constants here; if the vault README's table changes, change them.
import { readFileSync, existsSync, readdirSync, mkdirSync, appendFileSync, statSync } from 'node:fs';
import { join, dirname, relative, posix } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';

const MAX_LINES = 8;          // knowledge lines per injection
const MAX_BYTES = 3 * 1024;   // knowledge bytes per injection
const MAX_ALWAYS = 10;        // critical lessons at SubagentStart
const ANCESTOR_LEVELS = 2;    // how far up a lesson's directory may sit from the touched file
const SEVERITY_RANK = { landmine: 0, critical: 0, trap: 1, careful: 2, guideline: 2, 'nice-to-know': 3, trivia: 3 };

function norm(p) { return String(p || '').replace(/\\/g, '/'); }
function findVault(start) {
  let dir = start;
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, '.adlc'))) return join(dir, '.adlc');
    const up = dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return null;
}
function readStdin() {
  try { return JSON.parse(readFileSync(0, 'utf8')); } catch { return null; }
}
function emit(eventName, text) {
  if (!text) return;
  process.stderr.write(text + '\n');
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: eventName, additionalContext: text } }) + '\n');
}
function deny(text) {
  process.stderr.write(text + '\n');
  process.exit(2);
}

// ---- once-per-session state ------------------------------------------------
function stateFile(sessionId) {
  const dir = join(tmpdir(), 'adlc-knowledge');
  try { mkdirSync(dir, { recursive: true }); } catch {}
  return join(dir, String(sessionId || 'nosession').replace(/[^A-Za-z0-9._-]/g, '_'));
}
function seen(sessionId, key) {
  const f = stateFile(sessionId);
  try { if (existsSync(f) && readFileSync(f, 'utf8').split('\n').includes(key)) return true; } catch {}
  try { appendFileSync(f, key + '\n'); } catch {}
  return false;
}

// ---- knowledge parsing -----------------------------------------------------
// lessons.md: one list item per lesson. We extract severity, tags, paths.
//   - **L-REQ-042-1** · trap · `payments, retries` · Sentence. — `src/a/b.cs:31`, `src/c.ts:7` · REQ-042 [· enforced: …] [· ↗] ^L-REQ-042-1
function parseLessons(vault) {
  const f = join(vault, 'knowledge', 'lessons.md');
  if (!existsSync(f)) return [];
  const out = [];
  for (const line of readFileSync(f, 'utf8').split('\n')) {
    if (!line.startsWith('- **L-')) continue;                 // skips superseded (~~) and prose
    if (/·\s*enforced:/.test(line)) continue;                 // a sensor owns it
    const sev = (line.match(/\*\*\s*·\s*([a-z-]+)\s*·/) || [])[1] || 'guideline';
    const tags = ((line.match(/·\s*`([^`]*)`\s*·/) || [])[1] || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    const paths = [...line.matchAll(/`([^`\s:]+(?:\.[A-Za-z0-9]+))(?::\d+)?`/g)].map(m => norm(m[1]));
    out.push({ kind: 'lesson', line: line.replace(/\s*\^L-[A-Za-z0-9-]+$/, ''), sev, tags, paths });
  }
  return out;
}
// gotchas.md: entries start with `## G12 — Title ^g12`; `**Where:**` carries paths;
// `| Severity |` row carries the severity. We keep the header + What + Where lines only.
function parseGotchas(vault) {
  const f = join(vault, 'knowledge', 'gotchas.md');
  if (!existsSync(f)) return [];
  const out = [];
  let cur = null;
  for (const line of readFileSync(f, 'utf8').split('\n')) {
    const h = line.match(/^## (G\d+) — (.*?)\s*\^g\d+\s*$/);
    if (h) { if (cur) out.push(cur); cur = { kind: 'gotcha', id: h[1], title: h[2], sev: 'careful', paths: [], tags: [], what: '', where: '', enforced: false }; continue; }
    if (!cur) continue;
    if (/^\| Severity \|/.test(line)) cur.sev = (line.match(/\|\s*Severity\s*\|\s*([a-z-]+)/) || [])[1] || cur.sev;
    if (/^\| Component \|/.test(line)) cur.tags = ((line.split('|')[2] || '').trim().toLowerCase()).split(/[,\s]+/).filter(Boolean);
    if (/^\| Enforced by \|/.test(line) && !/\|\s*—\s*\|/.test(line)) cur.enforced = true;
    if (/^\*\*What:\*\*/.test(line)) cur.what = line.replace(/^\*\*What:\*\*\s*/, '');
    if (/^\*\*Where:\*\*/.test(line)) { cur.where = line.replace(/^\*\*Where:\*\*\s*/, ''); cur.paths = [...line.matchAll(/`([^`\s:]+(?:\.[A-Za-z0-9]+))(?::\d+)?`/g)].map(m => norm(m[1])); }
  }
  if (cur) out.push(cur);
  return out.filter(g => !g.enforced).map(g => ({ ...g, line: `- **${g.id}** · ${g.sev} · ${g.title} — ${g.what} (${g.where})` }));
}

// ---- matching ----------------------------------------------------------------
function repoRelative(filePath, vault) {
  const repo = dirname(vault);
  let rel = norm(relative(repo, filePath));
  if (rel.startsWith('..')) rel = norm(filePath);
  return rel;
}
function dirOf(p) { const d = posix.dirname(p); return d === '.' ? '' : d; }
function withinLevels(entryDir, fileDir, levels) {
  // entry matches if its directory equals the file's, or is an ancestor within `levels`,
  // or the file's directory is an ancestor of it within `levels` (a lesson filed deeper).
  if (entryDir === fileDir) return true;
  const a = entryDir.split('/').filter(Boolean), b = fileDir.split('/').filter(Boolean);
  const common = a.findIndex((s, i) => s !== b[i]);
  const shared = common === -1 ? Math.min(a.length, b.length) : common;
  return shared > 0 && (a.length - shared) <= levels && (b.length - shared) <= levels && shared === Math.min(a.length, b.length);
}
function matchEntries(entries, rel) {
  const fileDir = dirOf(rel);
  const segs = new Set(rel.toLowerCase().split(/[\/._-]+/).filter(Boolean));
  const hits = entries.filter(e =>
    e.paths.some(p => withinLevels(dirOf(p), fileDir, ANCESTOR_LEVELS)) ||
    e.tags.some(t => t && segs.has(t)));
  hits.sort((x, y) => (SEVERITY_RANK[x.sev] ?? 2) - (SEVERITY_RANK[y.sev] ?? 2));
  const out = []; let bytes = 0;
  for (const h of hits) {
    if (out.length >= MAX_LINES || bytes + h.line.length > MAX_BYTES) break;
    out.push(h.line); bytes += h.line.length;
  }
  return { lines: out, total: hits.length };
}

// ---- generated rule lookup (write-time backstop) -------------------------------
function globToRegex(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') { if (glob[i + 1] === '*') { re += '.*'; i++; if (glob[i + 1] === '/') i++; } else re += '[^/]*'; }
    else if (c === '?') re += '[^/]';
    else if (c === '{') { const j = glob.indexOf('}', i); re += '(' + glob.slice(i + 1, j).split(',').join('|') + ')'; i = j; }
    else re += c.replace(/[.+^$()|[\]\\]/g, '\\$&');
  }
  return new RegExp('^' + re + '$');
}
function ruleFor(vault, rel) {
  const dir = join(dirname(vault), '.claude', 'rules');
  if (!existsSync(dir)) return null;
  for (const name of readdirSync(dir)) {
    if (!/^adlc-.*\.md$/.test(name)) continue;
    const text = readFileSync(join(dir, name), 'utf8');
    const fm = text.match(/^---\n([\s\S]*?)\n---\n/);
    if (!fm) continue;
    const globs = [...fm[1].matchAll(/-\s*"?([^"\n]+)"?/g)].map(m => m[1].trim());
    if (globs.some(g => globToRegex(g).test(rel))) {
      return { name, body: text.slice(fm[0].length).replace(/<!--[\s\S]*?-->\n?/, '').trim() };
    }
  }
  return null;
}

// ---- cases ---------------------------------------------------------------------
function isSource(rel) {
  return !/^\.adlc\//.test(rel) && !/(^|\/)\.claude\//.test(rel) && /\.[A-Za-z0-9]{1,6}$/.test(rel) && !/\.(md|json|ya?ml|lock|png|jpg|svg)$/i.test(rel);
}

function preToolUse(ev, vault) {
  const tool = ev.tool_name;
  const filePath = ev.tool_input?.file_path;
  if (!filePath) return;
  const abs = norm(filePath);
  const rel = repoRelative(abs, vault);

  // generated-file deny
  if (/^(Write|Edit|MultiEdit)$/.test(tool) && existsSync(abs)) {
    let head = '';
    try { head = readFileSync(abs, 'utf8').slice(0, 600); } catch {}
    const m = head.match(/<!--\s*GENERATED[^>]*?`([^`]+)`/);
    if (m) deny(`BLOCKED: ${rel} is generated — do not edit it by hand.\nRegenerate it instead: ${m[1]}\nEdit the hand-maintained source the marker names, then rebuild.`);
  }

  if (!isSource(rel)) return;
  const fileDir = dirOf(rel) || '.';
  const parts = [];

  if (!seen(ev.session_id, `${fileDir}:knowledge`)) {
    const entries = [...parseLessons(vault), ...parseGotchas(vault)];
    const { lines, total } = matchEntries(entries, rel);
    if (lines.length) {
      parts.push(`ADLC knowledge for \`${fileDir}/\` (${lines.length} of ${total} matching; worst first; once per session):\n${lines.join('\n')}\nFull entries: \`.adlc/knowledge/lessons.md\`, \`.adlc/knowledge/gotchas.md\`. A lesson you break here is a repeated mistake the reflector will flag.`);
    }
  }
  if (/^(Write|MultiEdit|Edit)$/.test(tool) && !existsSync(abs)) {
    const rule = ruleFor(vault, rel);
    if (rule && !seen(ev.session_id, `${rule.name}:write`)) {
      parts.push(`ADLC convention for this path (from \`.claude/rules/${rule.name}\`; a new file is never Read, so it arrives here):\n${rule.body}`);
    }
  }
  if (parts.length) emit('PreToolUse', parts.join('\n\n'));
}

function subagentStart(ev, vault) {
  if (!/^(task-implementer|pipeline-runner)$/.test(ev.agent_type || '')) return;
  const crit = parseLessons(vault).filter(l => SEVERITY_RANK[l.sev] === 0).slice(0, MAX_ALWAYS);
  if (!crit.length) return;
  emit('SubagentStart', `ADLC always-read lessons (severity critical — apply to every task):\n${crit.map(l => l.line).join('\n')}`);
}

function sessionStartCompact(ev, vault) {
  if (ev.source !== 'compact') return;
  const repo = dirname(vault);
  const sh = (cmd) => { try { return execSync(cmd, { cwd: repo, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return ''; } };
  // active REQ: newest non-terminal pipeline-state.json
  let active = null;
  const walk = (dir, depth) => {
    if (depth > 5 || !existsSync(dir)) return;
    for (const n of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, n.name);
      if (n.isDirectory()) { if (n.name !== '_archive') walk(p, depth + 1); }
      else if (n.name === 'pipeline-state.json') {
        try {
          const s = JSON.parse(readFileSync(p, 'utf8'));
          if (s.prState === 'merged' || s.status === 'cancelled') continue;
          const m = statSync(p).mtimeMs;
          if (!active || m > active.m) active = { m, dir: norm(relative(vault, dirname(p))), phase: s.currentPhase, gate: s.gateState, branch: s.branch };
        } catch {}
      }
    }
  };
  walk(join(vault, 'specs'), 0); walk(join(vault, 'bugs'), 0);
  const lines = ['## ADLC working state recovered after compaction', 'Recomputed from the vault and git, not from the summary. Re-read files by path rather than trusting any paraphrase.'];
  if (active) {
    const awaiting = existsSync(join(vault, active.dir, '.awaiting-approval'));
    lines.push(`- **Active work item:** \`.adlc/${active.dir}/\` — phase ${active.phase}, gate ${active.gate}${awaiting ? ' — **.awaiting-approval present: a gate is waiting for the user**' : ''}${active.branch ? `, branch \`${active.branch}\`` : ''}`);
    lines.push(`- Re-read \`.adlc/${active.dir}/pipeline-state.json\` for the exact state; the task files under \`tasks/\` say which are done.`);
  } else lines.push('- No non-terminal work item found in `.adlc/specs` or `.adlc/bugs`.');
  const st = sh('git status --porcelain').split('\n').filter(Boolean);
  lines.push(st.length ? `- **Uncommitted changes (${st.length}):**\n${st.slice(0, 30).map(s => '  ' + s).join('\n')}${st.length > 30 ? '\n  … run `git status` for the rest' : ''}` : '- **Uncommitted changes:** none.');
  const log = sh('git log --oneline -5');
  if (log) lines.push(`- **Recent commits:**\n${log.split('\n').map(s => '  ' + s).join('\n')}`);
  const cfg = existsSync(join(vault, 'config.yml')) ? readFileSync(join(vault, 'config.yml'), 'utf8') : '';
  const runs = [...cfg.matchAll(/^\s{2,}(format|lint|typecheck|test):\s*\n\s+run:\s*(.+)$/gm)].map(m => `${m[1]}: \`${m[2].replace(/\s+#.*$/, '').trim()}\``);
  if (runs.length) lines.push(`- **Verify before declaring done:** ${runs.join(' · ')}`);
  lines.push('- **Preserve verbatim:** the task file path you were working, the exact function/type signatures the remaining work depends on, and the gate protocol — quote, do not paraphrase.');
  emit('SessionStart', lines.join('\n'));
}

function postToolUseBash(ev) {
  const cmd = String(ev.tool_input?.command || '');
  if (!/(^|[|;&(\s])(grep|rg|ag|git\s+grep|find|Select-String|findstr)(\s|$)/.test(cmd)) return;
  const truncated = (/\|\s*(head|tail)(\s|$)/.test(cmd) && !/\|\s*tail\s+-[fF]/.test(cmd)) || /(grep|rg)[^|]*\s(-m|--max-count)[\s=]*\d/.test(cmd) || /Select-Object\s+-First/.test(cmd);
  if (!truncated || seen(ev.session_id, 'truncated-search')) return;
  emit('PostToolUse', 'WARN (once per session): this search output was truncated (head/tail/-m). Truncated output is not evidence of absence — count first (`| wc -l`, `grep -c`) or re-run without the limit before concluding "there are none" or "nothing calls this".');
}

function postToolUseFailureBash(ev) {
  const cmd = String(ev.tool_input?.command || '').trim();
  if (!cmd) return;
  const key = 'fail:' + Buffer.from(cmd).toString('base64').slice(0, 120);
  if (!seen(ev.session_id, key)) return;                    // first failure: remember only
  if (seen(ev.session_id, key + ':warned')) return;         // warn once per command
  emit('PostToolUseFailure', 'This exact command already failed once in this session. Do not re-run it unchanged. Windows/bash rules from the audit: quote every path (Temp paths have spaces); no heredocs — write helper scripts to a file and run the file; never guess a path — `ls` it first; change something before retrying, or report the failure.');
}

// ---- main ----------------------------------------------------------------------
try {
  const ev = readStdin();
  if (!ev) process.exit(0);
  const vault = findVault(process.env.CLAUDE_PROJECT_DIR || ev.cwd || process.cwd());
  if (!vault) process.exit(0);
  switch (ev.hook_event_name) {
    case 'PreToolUse': preToolUse(ev, vault); break;
    case 'SubagentStart': subagentStart(ev, vault); break;
    case 'SessionStart': sessionStartCompact(ev, vault); break;
    case 'PostToolUse': if (ev.tool_name === 'Bash') postToolUseBash(ev); break;
    case 'PostToolUseFailure': if (ev.tool_name === 'Bash') postToolUseFailureBash(ev); break;
    default: break;
  }
} catch { /* silent by design */ }
process.exit(0);

// ---- settings.json wiring (adapters/claude/extras/README.md) --------------------
// "hooks": {
//   "PreToolUse":         [{ "matcher": "Read|Edit|Write|MultiEdit", "hooks": [{ "type": "command", "command": "node <toolkit>/adapters/claude/extras/hooks/adlc-knowledge.mjs" }] }],
//   "SubagentStart":      [{ "matcher": "task-implementer|pipeline-runner", "hooks": [{ "type": "command", "command": "node <toolkit>/adapters/claude/extras/hooks/adlc-knowledge.mjs" }] }],
//   "SessionStart":       [{ "matcher": "compact", "hooks": [{ "type": "command", "command": "node <toolkit>/adapters/claude/extras/hooks/adlc-knowledge.mjs" }] }],
//   "PostToolUse":        [{ "matcher": "Bash", "hooks": [{ "type": "command", "command": "node <toolkit>/adapters/claude/extras/hooks/adlc-knowledge.mjs" }] }],
//   "PostToolUseFailure": [{ "matcher": "Bash", "hooks": [{ "type": "command", "command": "node <toolkit>/adapters/claude/extras/hooks/adlc-knowledge.mjs" }] }]
// }
// Test a case by piping a fake event:
//   echo '{"hook_event_name":"PreToolUse","tool_name":"Edit","session_id":"t1","cwd":"D:/vantagewebapps","tool_input":{"file_path":"D:/vantagewebapps/frontend/src/api/x.ts"}}' | node adlc-knowledge.mjs
