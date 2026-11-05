#!/usr/bin/env node
// ADLC vault-budget hook for Claude Code.
//
// The vault's hot-path files have size budgets (see the vault README, "Size
// budgets"). Until 1.7.0 nothing enforced them: on a measured vault now.md sat
// at 68KB against a 1KB budget for two months, loaded at every phase start.
// This hook turns a budget into a refusal. Wire it to four events — see
// ../README.md — and it does one thing per event:
//
//   PreToolUse   (Read)         deny reading a file `review.packet.exclude`
//                               names (generated code the reviewers must not
//                               read line by line), and deny reading hot.md
//                               without a `limit` (newest entries are at the
//                               top; the whole file is 3,800+ lines).
//   PostToolUse  (Write|Edit)   after a write to now.md, CLAUDE.md, a record
//                               (<REQ_PATH>.md, 6KB) or context/*.md, exit 2 if it is over budget so
//                               Claude fixes it in the same turn. Warn (do not
//                               block) on an over-budget verification.md.
//   SubagentStop                if a review-log.md touched in the last 15 min
//                               has a reviewer section over 12KB, block with
//                               the section and its size — the reviewer trims.
//   SessionStart                print the budget strip as additionalContext.
//
// Silent on any error; never blocks anything it can't measure. No dependencies.
import { readFileSync, statSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';

const KB = 1024;
const BUDGET = {
  'now.md': 1 * KB,
  'CLAUDE.md': 5 * KB,
  'context/*.md': 8 * KB,
  'verification.md': 8 * KB, // warn only
  'record': 6 * KB,          // <REQ_PATH>.md — the one committed file per work item (1.9.0)
};
const HOT_MAX_LINES = 500;
const SECTION_MAX = 12 * KB;
const MAX_DEPTH = 4;

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

function norm(p) { return p.replace(/\\/g, '/'); }

// Minimal glob → regex: ** (any depth), * (within a segment), ? (one char).
function globToRegex(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const ch = glob[i];
    if (ch === '*') {
      if (glob[i + 1] === '*') {
        i++;
        if (glob[i + 1] === '/') { i++; re += '(?:.*/)?'; } else re += '.*';
      } else re += '[^/]*';
    } else if (ch === '?') re += '[^/]';
    else re += ch.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp('^' + re + '$');
}

// Read `review.packet.exclude` from config.yml without a YAML parser: find the
// `review:` block, then `packet:`, then the `exclude:` list items.
function packetExcludes(vault) {
  try {
    const lines = readFileSync(join(vault, 'config.yml'), 'utf8').split(/\r?\n/);
    const out = [];
    let inReview = false, inPacket = false, inExclude = false;
    for (const raw of lines) {
      const line = raw.replace(/#.*$/, '').trimEnd();
      if (!line.trim()) continue;
      const indent = line.length - line.trimStart().length;
      if (indent === 0) { inReview = /^review:\s*$/.test(line); inPacket = inExclude = false; continue; }
      if (!inReview) continue;
      if (indent === 2) { inPacket = /^\s*packet:\s*$/.test(line); inExclude = false; continue; }
      if (!inPacket) continue;
      if (indent === 4) { inExclude = /^\s*exclude:\s*$/.test(line); continue; }
      if (inExclude && /^\s*-\s+/.test(line)) {
        out.push(line.replace(/^\s*-\s+/, '').replace(/^["']|["']$/g, ''));
      }
    }
    return out.map(globToRegex);
  } catch { return []; }
}

function readInput() {
  try { return JSON.parse(readFileSync(0, 'utf8')); } catch { return {}; }
}

function repoRel(vault, filePath) {
  const repo = dirname(vault);
  const rel = norm(relative(repo, norm(filePath)));
  return rel.startsWith('..') ? norm(filePath) : rel;
}

function vaultRel(vault, filePath) {
  const rel = norm(relative(vault, norm(filePath)));
  return rel.startsWith('..') ? null : rel;
}

function fmtKB(bytes) { return (bytes / KB).toFixed(1) + 'KB'; }

function lineCount(p) { return readFileSync(p, 'utf8').split(/\r?\n/).length; }

// ---- PreToolUse: Read ----------------------------------------------------
function preToolUse(payload, vault) {
  if (payload.tool_name !== 'Read') return;
  const fp = payload.tool_input?.file_path;
  if (!fp) return;
  const rel = repoRel(vault, fp);
  for (const re of packetExcludes(vault)) {
    if (re.test(rel)) {
      return deny(`\`${rel}\` is in config.yml → review.packet.exclude (generated output). Reviewers do not read it line by line; the packet manifest carries its +/− counts. If you need one symbol from it, grep for it instead of reading the file.`);
    }
  }
  const vrel = vaultRel(vault, fp);
  if (vrel === 'hot.md' && !payload.tool_input?.limit) {
    let n = '?';
    try { n = lineCount(fp); } catch {}
    return deny(`hot.md is ${n} lines; newest entries are at the top. Read it with a limit (e.g. limit: 40) — the skill protocols say "last 20 entries", never the whole file.`);
  }
}

function deny(reason) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason },
  }));
}

// ---- PostToolUse: Write | Edit ------------------------------------------
function postToolUse(payload, vault) {
  if (!['Write', 'Edit', 'MultiEdit'].includes(payload.tool_name)) return;
  const fp = payload.tool_input?.file_path;
  if (!fp) return;
  const vrel = vaultRel(vault, fp);
  if (!vrel) return;
  let size;
  try { size = statSync(fp).size; } catch { return; }

  const over = (limit, fix) => {
    process.stderr.write(`ADLC budget: ${vrel} is ${fmtKB(size)} against a ${fmtKB(limit)} budget. ${fix}\n`);
    process.exit(2);
  };

  if (vrel === 'now.md' && size > BUDGET['now.md']) {
    over(BUDGET['now.md'], 'now.md is the active-REQ table plus a one-line focus. Move narrative (sprint retrospectives, merge plans, notes) to sprints/ or the REQ folder and rewrite now.md to the table.');
  }
  if (vrel === 'CLAUDE.md' && size > BUDGET['CLAUDE.md']) {
    over(BUDGET['CLAUDE.md'], 'CLAUDE.md is the rulebook every session loads. Move explanation and history to README.md or context/, keep the rules.');
  }
  // A record is `specs/**/REQ-*.md` or `bugs/**/BUG-*.md` — a FILE beside the work folder, never inside it.
  if (/^(specs|bugs)\/(?:[^/]+\/){0,3}(REQ|BUG)-[^/]+\.md$/.test(vrel) && size > BUDGET['record']) {
    over(BUDGET['record'], 'A record is IDs and links, not copies: tighten the Goal and What-changed prose; lessons, gotchas and decisions are one line each pointing into knowledge/. The working set keeps the detail.');
  }
  if (/^context\/[^/]+\.md$/.test(vrel) && size > BUDGET['context/*.md']) {
    over(BUDGET['context/*.md'], `context/*.md are loaded at every phase preflight. Keep the rules reviewers enforce; move rationale and history to ${vrel.replace(/\.md$/, '-rationale.md')} (read on demand). \`/config budgets\` does the split.`);
  }
  if (vrel === 'hot.md') {
    let n = 0;
    try { n = lineCount(fp); } catch {}
    if (n > HOT_MAX_LINES) {
      warn(`hot.md is ${n} lines against a ${HOT_MAX_LINES}-line budget. /wrapup step 4 rotates entries past the budget into hot-archive-<YYYY>.md; if you are in /wrapup, do that now.`);
    }
  }
  if (/(^|\/)verification\.md$/.test(vrel) && size > BUDGET['verification.md']) {
    warn(`${vrel} is ${fmtKB(size)} against an 8KB budget. The verdict file is the digest; reviewer narrative belongs in review-log.md next to it, and resolved findings collapse to one digest row.`);
  }
}

function warn(text) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: `ADLC budget: ${text}` },
  }));
}

// ---- SubagentStop --------------------------------------------------------
function collectWork(root, depth, out) {
  let entries;
  try { entries = readdirSync(root, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const folder = join(root, e.name);
    if (/^(REQ|BUG)-/.test(e.name)) { out.push(folder); continue; }
    if (e.name === '_archive') continue;
    if (depth < MAX_DEPTH) collectWork(folder, depth + 1, out);
  }
}

function subagentStop(payload, vault) {
  const folders = [];
  for (const kind of ['specs', 'bugs']) {
    const root = join(vault, kind);
    if (existsSync(root)) collectWork(root, 1, folders);
  }
  const recent = Date.now() - 15 * 60 * 1000;
  for (const folder of folders) {
    const log = join(folder, 'review-log.md');
    let st;
    try { st = statSync(log); } catch { continue; }
    if (st.mtimeMs < recent) continue;
    const text = readFileSync(log, 'utf8');
    const parts = text.split(/^(?=## )/m);
    for (const part of parts) {
      const m = part.match(/^## ([^\n]+)/);
      if (!m) continue;
      const bytes = Buffer.byteLength(part, 'utf8');
      if (bytes > SECTION_MAX) {
        process.stdout.write(JSON.stringify({
          decision: 'block',
          reason: `ADLC budget: your section "${m[1].trim()}" in ${norm(relative(dirname(vault), log))} is ${fmtKB(bytes)} against a 12KB cap. Trim it: summary ≤5 lines, each finding ≤8 lines after its field table, cite file:line instead of quoting code the packet carries, drop trivials to a count. Then stop.`,
        }));
        return;
      }
    }
  }
}

// ---- SessionStart --------------------------------------------------------
function sessionStart(payload, vault) {
  const cells = [];
  const sz = (rel) => { try { return statSync(join(vault, rel)).size; } catch { return null; } };
  const mark = (ok) => (ok ? '' : ' ⚠');
  const now = sz('now.md'); if (now !== null) cells.push(`now.md ${fmtKB(now)}/1KB${mark(now <= BUDGET['now.md'])}`);
  try { const n = lineCount(join(vault, 'hot.md')); cells.push(`hot.md ${n}/${HOT_MAX_LINES} lines${mark(n <= HOT_MAX_LINES)}`); } catch {}
  const cl = sz('CLAUDE.md'); if (cl !== null) cells.push(`CLAUDE.md ${fmtKB(cl)}/5KB${mark(cl <= BUDGET['CLAUDE.md'])}`);
  try {
    for (const f of readdirSync(join(vault, 'context'))) {
      if (!f.endsWith('.md') || f.endsWith('-rationale.md')) continue;
      const s = sz(join('context', f));
      if (s !== null && s > BUDGET['context/*.md']) cells.push(`context/${f} ${fmtKB(s)}/8KB ⚠`);
    }
  } catch {}
  if (!cells.length) return;
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: `ADLC vault budgets: ${cells.join(' · ')}. Files marked ⚠ are over budget — /config budgets fixes them, gated per file.` },
  }));
}

// ---- main ----------------------------------------------------------------
try {
  const payload = readInput();
  const cwd = payload?.cwd || process.cwd();
  const vault = findVault(cwd);
  if (!vault) process.exit(0);
  switch (payload.hook_event_name) {
    case 'PreToolUse': preToolUse(payload, vault); break;
    case 'PostToolUse': postToolUse(payload, vault); break;
    case 'SubagentStop': subagentStop(payload, vault); break;
    case 'SessionStart': sessionStart(payload, vault); break;
    default: break;
  }
  process.exit(0);
} catch {
  process.exit(0);
}
