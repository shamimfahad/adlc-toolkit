#!/usr/bin/env node
/**
 * Wire the ADLC Claude Code extras into a settings file — idempotently, PER REPO.
 *
 *   node scripts/adlc.mjs settings --repo <path>   [--dry-run] [--no-statusline]
 *   node scripts/adlc.mjs settings --global        [--dry-run] [--no-statusline]
 *   (no flag: the repo containing the current directory, if it has a .adlc/ vault)
 *
 * Default target is <repo>/.claude/settings.local.json — the developer's own,
 * gitignored, project-scoped settings. Hooks there fire only in that repo, so a
 * machine that also runs Claude Code on non-ADLC projects is left alone, and a
 * developer's global ~/.claude/settings.json (their own hooks, their statusline)
 * is never touched. --global exists for someone who wants the extras everywhere;
 * the scripts no-op outside a vault, but they still spawn, and it is their call.
 *
 * What it merges, keyed by script name so re-running is a no-op:
 *   hooks.SessionStart        adlc-budget.mjs (any)   · adlc-knowledge.mjs (matcher "compact")
 *   hooks.PreToolUse          adlc-budget.mjs ("Read") · adlc-knowledge.mjs ("Read|Edit|Write|MultiEdit")
 *   hooks.PostToolUse         adlc-budget.mjs ("Write|Edit|MultiEdit") · adlc-knowledge.mjs ("Bash")
 *   hooks.PostToolUseFailure  adlc-knowledge.mjs ("Bash")
 *   hooks.SubagentStart       adlc-knowledge.mjs ("task-implementer|pipeline-runner")
 *   hooks.SubagentStop        adlc-budget.mjs (any)
 *   hooks.Notification        adlc-notify.mjs (any)
 *   statusLine                adlc-statusline.mjs — only when no statusLine is set (yours wins)
 *
 * Rules: an entry whose command names one of our scripts is OURS — its path is updated
 * when the toolkit moved and it is removed when the toolkit no longer ships that script.
 * Every other entry is yours and is never touched or reordered. Commands point at
 * core/extras/claude/ (the source files, always present) with forward slashes, which
 * node accepts on Windows and which survive the shell Claude Code runs hooks in.
 * A settings file that does not parse is left alone and the snippet is printed instead.
 * The first write makes a one-time backup beside the file (<name>.adlc-backup).
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (n) => { const i = args.indexOf(n); return i >= 0 && !String(args[i + 1] || '').startsWith('--') ? args[i + 1] : null; };
const DRY = args.includes('--dry-run');
const NO_STATUS = args.includes('--no-statusline');
const TOOLKIT = resolve(flag('--toolkit') || join(here, '..'));

function findRepo(start) {
  let dir = resolve(start);
  for (let i = 0; i < 12; i++) {
    if (existsSync(join(dir, '.adlc'))) return dir;
    const up = dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return null;
}
let SETTINGS;
let SCOPE;
if (flag('--settings')) { SETTINGS = resolve(flag('--settings')); SCOPE = 'file'; }
else if (args.includes('--global')) { SETTINGS = join(homedir(), '.claude', 'settings.json'); SCOPE = 'global'; }
else {
  const repo = flag('--repo') ? resolve(flag('--repo')) : findRepo(process.cwd());
  if (!repo) {
    console.error('settings: no repo given and no .adlc/ vault at or above the current directory.');
    console.error('  per repo (recommended):  node scripts/adlc.mjs settings --repo <path>');
    console.error('  every session on this PC: node scripts/adlc.mjs settings --global');
    process.exit(2);
  }
  if (!existsSync(join(repo, '.adlc'))) console.error(`settings: note — ${repo} has no .adlc/ vault yet; the hooks stay silent until /init creates one.`);
  SETTINGS = join(repo, '.claude', 'settings.local.json'); SCOPE = 'repo';
}

const fwd = (p) => p.replace(/\\/g, '/');
const HOOKS_DIR = fwd(join(TOOLKIT, 'core', 'extras', 'claude', 'hooks'));
const STATUS = fwd(join(TOOLKIT, 'core', 'extras', 'claude', 'statusline', 'adlc-statusline.mjs'));
const OUR_SCRIPTS = /adlc-(budget|knowledge|notify)\.mjs/;
const cmd = (script) => `node ${HOOKS_DIR}/${script}`;

// matcher: null = no matcher key (fires for every event of that kind)
const WANT = [
  ['SessionStart', null, 'adlc-budget.mjs'],
  ['SessionStart', 'compact', 'adlc-knowledge.mjs'],
  ['PreToolUse', 'Read', 'adlc-budget.mjs'],
  ['PreToolUse', 'Read|Edit|Write|MultiEdit', 'adlc-knowledge.mjs'],
  ['PostToolUse', 'Write|Edit|MultiEdit', 'adlc-budget.mjs'],
  ['PostToolUse', 'Bash', 'adlc-knowledge.mjs'],
  ['PostToolUseFailure', 'Bash', 'adlc-knowledge.mjs'],
  ['SubagentStart', 'task-implementer|pipeline-runner', 'adlc-knowledge.mjs'],
  ['SubagentStop', null, 'adlc-budget.mjs'],
  ['Notification', null, 'adlc-notify.mjs'],
];

function mergeSettings(settings, { toolkit = TOOLKIT, statusline = !NO_STATUS } = {}) {
  const changes = [];
  const out = JSON.parse(JSON.stringify(settings || {}));
  out.hooks = out.hooks || {};
  const shipped = (script) => existsSync(join(toolkit, 'core', 'extras', 'claude', 'hooks', script));

  // 1. Repoint or drop every entry that is ours, in every event (also events we no longer want).
  for (const [event, entries] of Object.entries(out.hooks)) {
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      if (!Array.isArray(entry.hooks)) continue;
      entry.hooks = entry.hooks.filter((h) => {
        const m = String(h.command || '').match(OUR_SCRIPTS);
        if (!m) return true;
        const script = m[0];
        const wanted = WANT.some(([e, matcher, s]) => e === event && s === script && (matcher ?? undefined) === (entry.matcher ?? undefined));
        if (!wanted || !shipped(script)) { changes.push(`removed ${event}${entry.matcher ? `[${entry.matcher}]` : ''} → ${script} (no longer shipped at this event)`); return false; }
        if (h.command !== cmd(script)) { changes.push(`repointed ${event}${entry.matcher ? `[${entry.matcher}]` : ''} → ${script}`); h.command = cmd(script); }
        return true;
      });
    }
    out.hooks[event] = entries.filter((e) => !Array.isArray(e.hooks) || e.hooks.length);
    if (!out.hooks[event].length) delete out.hooks[event];
  }

  // 2. Add what is missing. Reuse an existing entry with the same matcher (ours or yours) rather than adding a sibling.
  for (const [event, matcher, script] of WANT) {
    if (!shipped(script)) continue;
    const list = (out.hooks[event] = out.hooks[event] || []);
    const has = list.some((e) => (e.matcher ?? undefined) === (matcher ?? undefined) && (e.hooks || []).some((h) => String(h.command || '').includes(script)));
    if (has) continue;
    let entry = list.find((e) => (e.matcher ?? undefined) === (matcher ?? undefined) && Array.isArray(e.hooks));
    if (!entry) { entry = matcher ? { matcher, hooks: [] } : { hooks: [] }; list.push(entry); }
    entry.hooks.push({ type: 'command', command: cmd(script) });
    changes.push(`added ${event}${matcher ? `[${matcher}]` : ''} → ${script}`);
  }
  if (!Object.keys(out.hooks).length) delete out.hooks;

  // 3. Statusline: set only when absent or already ours.
  if (statusline && existsSync(join(toolkit, 'core', 'extras', 'claude', 'statusline', 'adlc-statusline.mjs'))) {
    const cur = out.statusLine;
    if (!cur) { out.statusLine = { type: 'command', command: `node ${STATUS}` }; changes.push('added statusLine → adlc-statusline.mjs'); }
    else if (/adlc-statusline\.mjs/.test(String(cur.command || '')) && cur.command !== `node ${STATUS}`) { cur.command = `node ${STATUS}`; changes.push('repointed statusLine → adlc-statusline.mjs'); }
    else if (!/adlc-statusline\.mjs/.test(String(cur.command || ''))) changes.push('kept your statusLine (not ours) — pass nothing; run with the snippet in adapters/claude/extras/README.md to switch');
  }
  return { settings: out, changes };
}

function main() {
  let current = {};
  if (existsSync(SETTINGS)) {
    const raw = readFileSync(SETTINGS, 'utf8');
    try { current = raw.trim() ? JSON.parse(raw) : {}; } catch (e) {
      console.error(`settings: ${SETTINGS} is not valid JSON (${e.message}) — left untouched. Wire by hand per adapters/claude/extras/README.md.`);
      process.exit(1);
    }
  }
  const { settings, changes } = mergeSettings(current);
  const real = changes.filter((c) => !c.startsWith('kept'));
  for (const c of changes) console.log(`  ${DRY && !c.startsWith('kept') ? 'would: ' : ''}${c}`);
  if (!real.length) { console.log(`  settings: ${SETTINGS} already wired — nothing to do`); return; }
  if (DRY) return;
  mkdirSync(dirname(SETTINGS), { recursive: true });
  const backup = SETTINGS + '.adlc-backup';
  if (existsSync(SETTINGS) && !existsSync(backup)) { copyFileSync(SETTINGS, backup); console.log(`  backup: ${backup} (one-time)`); }
  writeFileSync(SETTINGS, JSON.stringify(settings, null, 2) + '\n');
  console.log(`  settings: ${SETTINGS} — ${real.length} change(s); hooks load in your next Claude Code session${SCOPE === 'repo' ? ' in this repo only (settings.local.json is per developer — keep it gitignored)' : SCOPE === 'global' ? ' in EVERY repo on this machine' : ''}`);
}

main();
