#!/usr/bin/env node
/**
 * ADLC toolkit — unified, idempotent install/update + adapter generator.
 *
 * One command does install AND update. Re-running `sync` is always safe: it
 * cleanly regenerates the per-tool adapter, then RECONCILES the install against
 * a saved receipt — linking anything new, pruning anything removed, and never
 * touching files you added yourself. Add or delete a skill/agent in core/ and
 * the next `sync` just reflects it. No `.bak` litter, no orphaned links, no
 * self-referential symlink loops.
 *
 *   node scripts/adlc.mjs sync  --tool=all                 # install OR update, globally
 *   node scripts/adlc.mjs sync  --tool=claude --pull       # git pull the toolkit, then reconcile
 *   node scripts/adlc.mjs sync  --tool=copilot --repo=/p   # project-local (vendored) install
 *   node scripts/adlc.mjs sync  --tool=all --dry-run       # show every action, change nothing
 *   node scripts/adlc.mjs build --tool=all                 # (advanced) refresh committed adapters/
 *
 * sync flags:
 *   --tool=<claude|copilot|codex|gemini|cursor|all>   required
 *   --repo=<path>     install into this project (vendored copy) instead of globally
 *   --pull            run `git pull` in the toolkit before reconciling (global only)
 *   --dry-run         print every action; touch nothing
 *   --no-prune        do not remove entries that are no longer part of the toolkit
 *   --force           overwrite an existing real file without a .bak backup
 *   --insiders                     target "Code - Insiders" prompts dir (copilot)
 *   --vscode-prompts-dir=<path>    override the VS Code user prompts dir (copilot)
 *
 * build flags (advanced — you normally never run this; sync builds into dist/):
 *   --tool=<...|all>  default all
 *   --mode=vendored|global            default vendored
 *   --toolkit-path=<path>             path stamped into every stub
 *   --out=<dir>                       default adapters/
 */

import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  readdirSync,
  existsSync,
  lstatSync,
  rmSync,
  unlinkSync,
  renameSync,
  symlinkSync,
  realpathSync,
  chmodSync,
} from 'node:fs';

// Remove a symlink itself (never follow it into its target). Portable across
// platforms — unlike rmSync, which on macOS throws EISDIR for a symlink that
// points at a directory. Use this everywhere we delete one of our own links.
function removeLink(p) {
  if (DRY) return;
  try {
    unlinkSync(p);
  } catch {
    rmSync(p, { force: true, recursive: true });
  }
}
import { dirname, join, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir, platform } from 'node:os';
import { execFileSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const HOME = homedir();
const ROOT_REAL = realpathSafe(ROOT);

const SUPPORTED = ['claude', 'copilot', 'codex', 'gemini', 'cursor'];

// ======================================================================
// args
// ======================================================================
const SUB = process.argv[2];
const rawArgs = process.argv.slice(SUB && !SUB.startsWith('--') ? 3 : 2);
const args = Object.fromEntries(
  rawArgs.map((a) => {
    const m = a.match(/^--([^=]+)=(.*)$/);
    return m ? [m[1], m[2]] : [a.replace(/^--/, ''), true];
  }),
);

// ======================================================================
// tiny logger
// ======================================================================
const C = {
  dim: '\x1b[2m',
  grn: '\x1b[32m',
  yel: '\x1b[33m',
  red: '\x1b[31m',
  cyn: '\x1b[36m',
  rst: '\x1b[0m',
};
let DRY = false;
const log = (s = '') => console.log(s);
const act = (verb, detail) =>
  log(`  ${DRY ? C.yel + 'would ' + verb + C.rst : C.grn + verb + C.rst} ${detail}`);
const note = (s) => log(`  ${C.dim}${s}${C.rst}`);
const warn = (s) => log(`  ${C.red}! ${s}${C.rst}`);

// ======================================================================
// fs helpers
// ======================================================================
const expand = (p) => (p.startsWith('~') ? join(HOME, p.slice(1)) : p);
const tidy = (p) => p.replace(HOME, '~').replace(ROOT, '<toolkit>');

function realpathSafe(p) {
  try {
    return realpathSync(p);
  } catch {
    return resolve(p);
  }
}
const isSymlink = (p) => {
  try {
    return lstatSync(p).isSymbolicLink();
  } catch {
    return false;
  }
};
function ensureDir(d) {
  if (!DRY) mkdirSync(d, { recursive: true });
}
const filesIn = (d, ext) =>
  existsSync(d)
    ? readdirSync(d)
        .filter((f) => f.endsWith(ext))
        .map((f) => join(d, f))
    : [];

// Refuse to operate on any destination that resolves INSIDE the toolkit/dist.
// This is the guard that prevents the self-referential symlink corruption:
// linking dist/* onto a destination that is itself a symlink back into dist/.
function assertOutsideToolkit(destDir, ctx) {
  // A symlinked dest dir is handled by healDirSymlinks (it removes legacy
  // dir-symlinks that point back into the toolkit). Only a REAL directory that
  // resolves inside the toolkit is a genuine misconfiguration (e.g. HOME set
  // inside the toolkit) — that's what we refuse here.
  if (isSymlink(destDir)) return;
  const real = realpathSafe(destDir);
  if (real === ROOT_REAL || real.startsWith(ROOT_REAL + '/')) {
    throw new Error(
      `refusing to install into "${tidy(destDir)}" — it resolves inside the toolkit ` +
        `(${tidy(real)}). That is the misconfiguration that creates symlink loops. ` +
        `Check that your tool config dir (${ctx}) is not symlinked back into the toolkit.`,
    );
  }
}

// Heal legacy directory-symlinks. An older install (or the historical corruption)
// may have symlinked a whole tool-config dir — e.g. ~/.claude/skills → the
// toolkit's dist/. We install per-child links, so that parent must be a REAL
// directory. If it's a symlink resolving back into the toolkit, remove it; the
// child links we then create restore the same content, loop-free. A symlink
// pointing OUTSIDE the toolkit is the user's own choice and is left alone.
function healDirSymlinks(ops) {
  const seen = new Set();
  for (const op of ops) {
    if (op.kind !== 'link') continue;
    const parent = dirname(op.dest);
    if (seen.has(parent)) continue;
    seen.add(parent);
    if (!isSymlink(parent)) continue;
    const real = realpathSafe(parent);
    if (real === ROOT_REAL || real.startsWith(ROOT_REAL + '/')) {
      act('heal: replace legacy dir-symlink with a real directory', `${tidy(parent)} → ${tidy(real)}`);
      removeLink(parent);
      if (!DRY) mkdirSync(parent, { recursive: true });
    }
  }
}

// ======================================================================
// generation (ported from the original build.mjs — single source of truth)
// ======================================================================
// ---- Engine/Overlay: core/ is upstream-owned; local/ is the team's overlay. ----
// A team customizes WITHOUT editing core/ — add a skill (local/skills/<name>.md +
// a local/manifest.json entry), override a core skill (same filename in local/),
// or drop one (manifest entry with "disabled": true). Because customizations live
// only in local/, pulling upstream never conflicts with core/.
const LOCAL = join(ROOT, 'local');
const hasLocal = (rel) => existsSync(join(LOCAL, rel));

function mergeByName(coreArr = [], localArr = []) {
  const map = new Map(coreArr.map((x) => [x.name, x]));
  for (const l of localArr || []) map.set(l.name, { ...(map.get(l.name) || {}), ...l });
  return [...map.values()].filter((x) => !x.disabled);
}
function mergeManifest(core, local) {
  if (!local) return core;
  const out = { ...core, ...local };
  out.skills = mergeByName(core.skills, local.skills);
  out.agents = mergeByName(core.agents, local.agents);
  out.tierToModel = { ...(core.tierToModel || {}), ...(local.tierToModel || {}) };
  out.sources = local.sources ? { ...(core.sources || {}), ...local.sources } : core.sources;
  return out;
}
const coreManifest = JSON.parse(readFileSync(join(ROOT, 'core/manifest.json'), 'utf8'));
const localManifest = hasLocal('manifest.json')
  ? JSON.parse(readFileSync(join(LOCAL, 'manifest.json'), 'utf8'))
  : null;
const manifest = mergeManifest(coreManifest, localManifest);

function parseFrontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---/);
  const fm = {};
  if (m) {
    for (const line of m[1].split('\n')) {
      const mm = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
      if (mm) fm[mm[1]] = mm[2].trim();
    }
  }
  return fm;
}
// Load frontmatter for a kind ("skills" | "agents"), local overriding core by name.
function loadDir(kind) {
  const out = {};
  const read = (root) => {
    const dir = join(root, kind);
    if (!existsSync(dir)) return;
    for (const f of readdirSync(dir).filter((f) => f.endsWith('.md')))
      out[f.replace(/\.md$/, '')] = parseFrontmatter(readFileSync(join(dir, f), 'utf8'));
  };
  read(join(ROOT, 'core'));
  read(LOCAL); // local wins
  return out;
}

function buildModel(toolkitPath) {
  const tp = toolkitPath.replace(/\/+$/, '');
  const skillFm = loadDir('skills');
  const agentFm = loadDir('agents');
  const skills = manifest.skills.map((s) => ({
    ...s,
    description: (skillFm[s.name] && skillFm[s.name].description) || s.summary,
  }));
  const agents = manifest.agents.map((a) => ({
    ...a,
    description: (agentFm[a.name] && agentFm[a.name].description) || a.role,
  }));

  // Point each stub at the resolved source: local/ override if present, else core/.
  const skillRef = (n) => `${tp}/${hasLocal(`skills/${n}.md`) ? 'local' : 'core'}/skills/${n}.md`;
  const agentRef = (n) => `${tp}/${hasLocal(`agents/${n}.md`) ? 'local' : 'core'}/agents/${n}.md`;
  const yamlStr = (s) => `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  const tomlStr = (s) => JSON.stringify(String(s));

  function dispatchNote(tool, agentNames) {
    const list = agentNames.join(', ');
    switch (tool) {
      case 'claude':
      case 'codex':
      case 'gemini':
        return `This skill dispatches sub-agents (${list}). Run them as subagents and consolidate their reports.`;
      case 'copilot':
        return `This skill relies on the agents (${list}). Invoke the matching custom agents (use handoffs) or run each role sequentially.`;
      case 'cursor':
        return `This skill relies on the agents (${list}). Cursor has no isolated read-only subagents — run each role sequentially in your own context, and honor a read-only agent's constraint by NOT editing files during its pass.`;
    }
  }
  function protocolBody(tool, s) {
    const lines = [
      `Toolkit root: ${tp}`,
      ``,
      `Execute the ADLC **${s.name}** protocol — defined in \`${skillRef(s.name)}\` — against the \`.adlc/\` vault in the current repository.`,
      ``,
      `Read that file in full and follow **every step literally**. It is a protocol, not a guideline (ADLC ETHOS principle 5 — load \`${tp}/ETHOS.md\`).`,
    ];
    if (s.gate)
      lines.push(
        ``,
        `**Gate:** this skill ends in an approval gate. Stop and wait for the user's explicit approval before anything proceeds past it. Do not auto-fix-and-continue on a gate failure — surface what failed and wait.`,
      );
    if (s.agents && s.agents.length) lines.push(``, dispatchNote(tool, s.agents));
    lines.push(
      ``,
      `**Git policy:** follow \`git.mode\` in \`${manifest.vaultDir}/config.yml\` (default \`manual\`). \`manual\` — never run git writes; read git state and draft commit/PR artifacts for the user. \`commit\` / \`commit+push\` — you may commit (and push, fast-forward only) the REQ's own feature branch once that phase's gate is approved. Never a protected branch, force-push, history rewrite, branch delete, \`gh pr create\`/\`gh pr merge\`, or \`--no-verify\` — in any mode.`,
    );
    return lines.join('\n');
  }
  function agentBody(a) {
    const ro = a.readonly
      ? `**READ-ONLY.** Do not edit, write, or create source files, and never run git write commands. You report findings only — the orchestrator consolidates them and the user decides what to fix.`
      : `You write code for the assigned task only. Never run git write commands.`;
    return [
      `You are the **${a.name}** agent in the ADLC pipeline.`,
      ``,
      `Read and fully adopt the role defined in \`${agentRef(a.name)}\`, then carry it out for the inputs you are given.`,
      ``,
      ro,
    ].join('\n');
  }
  const claudeTools = (a) =>
    a.readonly ? 'Read, Grep, Glob, Bash' : 'Read, Write, Edit, Grep, Glob, Bash';
  const model = (tool, tier) =>
    (manifest.tierToModel[tool] && manifest.tierToModel[tool][tier]) || 'default';

  function memoryFile(toolLabel) {
    return [
      `# ADLC Toolkit — pipeline conventions`,
      ``,
      `This repository uses the **ADLC toolkit**: a spec-driven development pipeline with a human approval gate at every phase boundary. You are running inside ${toolLabel}.`,
      ``,
      `**Knowledge vault:** \`${manifest.vaultDir}/\` holds specs, architecture, conventions, decisions (ADRs), lessons, gotchas, and glossary. Read \`${manifest.vaultDir}/context/conventions.md\`, \`${manifest.vaultDir}/context/project-overview.md\`, and \`${manifest.vaultDir}/now.md\` before non-trivial work. The toolkit itself lives at \`${tp}/\`.`,
      ``,
      `**The six principles (full text: \`${tp}/ETHOS.md\`):**`,
      `1. **You decide; the assistant drafts.** Every phase boundary pauses for the user. Git writes follow \`${manifest.vaultDir}/config.yml\` → \`git.mode\` (default \`manual\` = the assistant drafts; you run git).`,
      `2. **Spec first, code second.** Never implement without a validated spec.`,
      `3. **Read-only reviewers.** Review/audit agents report findings; they never edit. The user decides what gets fixed.`,
      `4. **Knowledge compounds.** Every change leaves the vault smarter — lessons, gotchas, concepts, ADRs.`,
      `5. **Process is explicit.** Skill steps are a protocol, not a guideline. No shortcuts; no \`--no-verify\`.`,
      `6. **Ask in options, not open prose.** When you need a decision from the user, present discrete labeled options with a recommendation, not an open-ended question. On Claude, use the \`AskUserQuestion\` tool; elsewhere, a short numbered list inline. The user can always go off-menu.`,
      ``,
      `**Git policy — set by \`${manifest.vaultDir}/config.yml\` → \`git.mode\` (default \`manual\`):** In \`manual\`, never run git writes — read git state and draft the commit message, PR body, and merge checklist for the user. In \`commit\`, you may \`git add\`/\`git commit\` on the REQ's feature branch after that phase's gate is approved; in \`commit+push\`, you also \`git push\` that branch (fast-forward only). **Invariant in every mode:** only the REQ's own feature branch — never a protected branch (\`git.protect\`, e.g. main/master/release/*), never force-push, rebase, amend published commits, \`reset --hard\` away commits, delete branches, \`gh pr create\`/\`gh pr merge\`, or \`--no-verify\`. Where any skill or agent below says "the user commits" or "never commit," that is the \`manual\`-mode description.`,
      ``,
      `**Workflow:** \`spec → architect → implement → review → wrapup\`, each ending in a gate. Run the commands below, or the whole pipeline with \`proceed\`. Bugs use \`bugfix\`. **Small changes use \`task\`** — a slim two-gate pipeline that still writes a REQ to the vault and escalates to \`proceed\` if the work turns out large, so small work is never done outside the ADLC. See per-command stubs for how each maps in ${toolLabel}.`,
    ].join('\n');
  }

  const TOOLS = {
    claude: {
      label: 'Claude Code',
      cmd: (s) => ({
        path: `skills/${s.name}/SKILL.md`,
        body: `---\nname: ${s.name}\ndescription: ${yamlStr(s.description)}\n---\n\n${protocolBody('claude', s)}\n`,
      }),
      agent: (a) => ({
        path: `agents/${a.name}.md`,
        body: `---\nname: ${a.name}\ndescription: ${yamlStr(a.description)}\nmodel: ${model('claude', a.tier)}\ntools: ${claudeTools(a)}\n---\n\n${agentBody(a)}\n`,
      }),
      memory: { path: 'CLAUDE.md', body: memoryFile('Claude Code') },
    },
    cursor: {
      label: 'Cursor',
      cmd: (s) => ({
        path: `.cursor/commands/${s.name}.md`,
        body: `---\ndescription: ${yamlStr(s.description)}\n---\n\n${protocolBody('cursor', s)}\n`,
      }),
      agent: (a) => ({
        path: `.cursor/commands/adlc-agent-${a.name}.md`,
        body: `---\ndescription: ${yamlStr(`ADLC agent: ${a.name} — ${a.readonly ? 'read-only review' : 'implementation'}`)}\n---\n\n${agentBody(a)}\n`,
      }),
      memory: {
        path: '.cursor/rules/adlc.mdc',
        body: `---\ndescription: ADLC toolkit — spec-driven pipeline conventions\nalwaysApply: true\n---\n\n${memoryFile('Cursor')}\n`,
      },
    },
    copilot: {
      label: 'GitHub Copilot',
      cmd: (s) => ({
        path: `.github/prompts/${s.name}.prompt.md`,
        body: `---\ndescription: ${yamlStr(s.description)}\n---\n\n${protocolBody('copilot', s)}\n`,
      }),
      agent: (a) => ({
        path: `.github/agents/${a.name}.agent.md`,
        body: `---\nname: ${a.name}\ndescription: ${yamlStr(a.description)}\n---\n\n${agentBody(a)}\n`,
      }),
      memory: { path: '.github/copilot-instructions.md', body: memoryFile('GitHub Copilot') },
    },
    codex: {
      label: 'OpenAI Codex',
      cmd: (s) => ({ path: `prompts/${s.name}.md`, body: `${protocolBody('codex', s)}\n` }),
      agent: (a) => ({
        path: `agents/${a.name}.toml`,
        body:
          `# Codex custom agent. Verify key names against your Codex version's schema.\n` +
          `name = ${tomlStr(a.name)}\n` +
          `description = ${tomlStr(a.description)}\n` +
          `model = ${tomlStr(model('codex', a.tier))}\n` +
          `read_only = ${a.readonly ? 'true' : 'false'}\n` +
          `instructions = """\n${agentBody(a)}\n"""\n`,
      }),
      memory: { path: 'AGENTS.md', body: memoryFile('OpenAI Codex') },
    },
    gemini: {
      label: 'Gemini CLI',
      cmd: (s) => ({
        path: `.gemini/commands/${s.name}.toml`,
        body:
          `description = ${tomlStr(s.description)}\n` +
          `prompt = """\n${protocolBody('gemini', s)}\n\n{{args}}\n"""\n`,
      }),
      agent: (a) => ({
        path: `.gemini/agents/${a.name}.md`,
        body: `---\nname: ${a.name}\ndescription: ${yamlStr(a.description)}\n---\n\n${agentBody(a)}\n`,
      }),
      memory: { path: 'GEMINI.md', body: memoryFile('Gemini CLI') },
    },
  };

  return { tp, skills, agents, TOOLS };
}

// Generate one tool's adapter into `outRoot/<tool>`. Always wipes the tool's
// dir first so dist/ never accumulates stale skills or .bak cruft.
function generate(tool, { toolkitPath, outRoot, clean = true } = {}) {
  const { skills, agents, TOOLS } = buildModel(toolkitPath);
  const def = TOOLS[tool];
  if (!def) throw new Error(`Unknown tool: ${tool}`);
  const base = join(outRoot, tool);
  if (clean && !DRY) rmSync(base, { recursive: true, force: true });
  const write = (rel, body) => {
    const full = join(base, rel);
    if (!DRY) {
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, body);
    }
  };
  let n = 0;
  for (const s of skills) {
    const { path, body } = def.cmd(s);
    write(path, body);
    n++;
  }
  for (const a of agents) {
    const { path, body } = def.agent(a);
    write(path, body);
    n++;
  }
  write(def.memory.path, def.memory.body);
  n++;
  return { base, count: n, skills: skills.length, agents: agents.length };
}

// ======================================================================
// build subcommand (advanced — regenerate the committed adapters/)
// ======================================================================
function cmdBuild() {
  DRY = !!args['dry-run'];
  const TOOL = args.tool || 'all';
  const MODE = args.mode || 'vendored';
  const toolkitPath = args['toolkit-path'] || (MODE === 'global' ? ROOT : '.adlc-toolkit');
  const outRoot = resolve(ROOT, args.out || 'adapters');
  const tools = TOOL === 'all' ? SUPPORTED : [TOOL];
  log('');
  log(`${C.cyn}ADLC build${C.rst}  ${C.dim}mode=${MODE}  path=${tidy(toolkitPath)}  out=${tidy(outRoot)}${C.rst}`);
  for (const t of tools) {
    if (!SUPPORTED.includes(t)) {
      console.error(`Unknown tool: ${t}`);
      process.exit(1);
    }
    const r = generate(t, { toolkitPath, outRoot });
    log(`  ${t.padEnd(8)} → ${tidy(outRoot)}/${t}/  (${r.skills} commands, ${r.agents} agents, 1 memory = ${r.count} files)`);
  }
  log('');
}

// ======================================================================
// sync subcommand — idempotent install/update reconciler
// ======================================================================

// Where the receipt of "what we placed last time" lives, per (tool, scope).
function receiptPath(tool, scope) {
  const slug = scope.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return join(HOME, '.adlc', 'receipts', `${tool}__${slug}.json`);
}
function readReceipt(tool, scope) {
  try {
    return JSON.parse(readFileSync(receiptPath(tool, scope), 'utf8')).entries || [];
  } catch {
    return [];
  }
}
function writeReceipt(tool, scope, entries) {
  if (DRY) return;
  const p = receiptPath(tool, scope);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify({ tool, scope, updatedAt: new Date().toISOString(), entries }, null, 2));
}

// VS Code user prompts dir (Copilot global slash commands)
function vscodeUserDir() {
  if (args['vscode-prompts-dir']) return expand(String(args['vscode-prompts-dir']));
  const appName = args.insiders ? 'Code - Insiders' : 'Code';
  const p = platform();
  if (p === 'darwin')
    return join(HOME, 'Library', 'Application Support', appName, 'User', 'prompts');
  if (p === 'win32')
    return join(process.env.APPDATA || join(HOME, 'AppData', 'Roaming'), appName, 'User', 'prompts');
  return join(HOME, '.config', appName, 'User', 'prompts');
}

// Build the DESIRED placement plan for one tool: a flat list of operations,
// each owning exactly one destination path. Enumerated from the freshly
// generated dist/, so adding/removing a skill in core/ is reflected for free.
function plan(tool, src, scope, repo, FORCE) {
  const ops = []; // { kind:'link'|'copy'|'write', dest, target?, content?, label? }
  const link = (target, dest) => ops.push({ kind: 'link', target, dest });
  const copy = (target, dest) => ops.push({ kind: 'copy', target, dest });
  const write = (dest, content, label) => ops.push({ kind: 'write', dest, content, label });
  const notes = [];
  const global = scope === 'global';

  const childrenOf = (dir) => (existsSync(dir) ? readdirSync(dir).map((n) => join(dir, n)) : []);

  if (tool === 'claude') {
    const skillsRoot = global ? expand('~/.claude/skills') : join(repo, '.claude/skills');
    const agentsRoot = global ? expand('~/.claude/agents') : join(repo, '.claude/agents');
    const mem = global ? expand('~/.claude/CLAUDE.md') : join(repo, 'CLAUDE.md');
    for (const d of childrenOf(join(src, 'skills')))
      (global ? link : copy)(d, join(skillsRoot, basename(d)));
    for (const f of childrenOf(join(src, 'agents')))
      (global ? link : copy)(f, join(agentsRoot, basename(f)));
    (global ? link : copy)(join(src, 'CLAUDE.md'), mem);
  } else if (tool === 'copilot') {
    const agentsRoot = global ? expand('~/.copilot/agents') : join(repo, '.github/agents');
    for (const f of filesIn(join(src, '.github/agents'), '.agent.md'))
      (global ? link : copy)(f, join(agentsRoot, basename(f)));
    const promptsRoot = global ? vscodeUserDir() : join(repo, '.github/prompts');
    for (const f of filesIn(join(src, '.github/prompts'), '.prompt.md'))
      (global ? link : copy)(f, join(promptsRoot, basename(f)));
    const memSrc = join(src, '.github/copilot-instructions.md');
    if (global) {
      const body = existsSync(memSrc) ? readFileSync(memSrc, 'utf8') : '(generated)';
      write(expand('~/.copilot/instructions/adlc.instructions.md'), `---\napplyTo: '**'\n---\n\n${body}`, '(applyTo:** loads in every repo)');
      notes.push(`VS Code prompts dir: ${tidy(promptsRoot)}`);
      notes.push(`if /commands don't appear, add to user settings.json:`);
      notes.push(`  "chat.promptFilesLocations": { "${promptsRoot}": true }`);
    } else {
      copy(memSrc, join(repo, '.github/copilot-instructions.md'));
    }
  } else if (tool === 'codex') {
    const promptsRoot = global ? expand('~/.codex/prompts') : join(repo, '.codex/prompts');
    const agentsRoot = global ? expand('~/.codex/agents') : join(repo, '.codex/agents');
    const mem = global ? expand('~/.codex/AGENTS.md') : join(repo, 'AGENTS.md');
    for (const f of filesIn(join(src, 'prompts'), '.md')) (global ? link : copy)(f, join(promptsRoot, basename(f)));
    for (const f of filesIn(join(src, 'agents'), '.toml')) (global ? link : copy)(f, join(agentsRoot, basename(f)));
    (global ? link : copy)(join(src, 'AGENTS.md'), mem);
  } else if (tool === 'gemini') {
    const cmdRoot = global ? expand('~/.gemini/commands') : join(repo, '.gemini/commands');
    const agentsRoot = global ? expand('~/.gemini/agents') : join(repo, '.gemini/agents');
    const mem = global ? expand('~/.gemini/GEMINI.md') : join(repo, 'GEMINI.md');
    for (const f of filesIn(join(src, '.gemini/commands'), '.toml')) (global ? link : copy)(f, join(cmdRoot, basename(f)));
    for (const f of filesIn(join(src, '.gemini/agents'), '.md')) (global ? link : copy)(f, join(agentsRoot, basename(f)));
    (global ? link : copy)(join(src, 'GEMINI.md'), mem);
  } else if (tool === 'cursor') {
    const cmdRoot = global ? expand('~/.cursor/commands') : join(repo, '.cursor/commands');
    for (const f of filesIn(join(src, '.cursor/commands'), '.md')) (global ? link : copy)(f, join(cmdRoot, basename(f)));
    if (global) {
      notes.push(`Cursor rules are project-scoped — paste ${tidy(join(src, '.cursor/rules/adlc.mdc'))}`);
      notes.push(`into Cursor → Settings → Rules (User Rules), or install per-repo with --repo=<path>.`);
    } else {
      copy(join(src, '.cursor/rules/adlc.mdc'), join(repo, '.cursor/rules/adlc.mdc'));
    }
  }
  return { ops, notes };
}

// ---- apply a single op, idempotently and loop-safely ----
function applyLink(target, dest, FORCE) {
  const tgtReal = realpathSafe(target);
  if (isSymlink(dest)) {
    if (realpathSafe(dest) === tgtReal) {
      note(`already linked: ${tidy(dest)}`);
      return;
    }
    act('relink', tidy(dest));
    removeLink(dest);
  } else if (existsSync(dest)) {
    // A real file/dir (possibly an old flat-file skill) sits where our link goes.
    if (FORCE) {
      act('replace', tidy(dest));
      if (!DRY) rmSync(dest, { recursive: true, force: true });
    } else {
      const bak = dest + '.bak';
      act('back up → ' + tidy(bak) + ' and link', tidy(dest));
      if (!DRY) {
        rmSync(bak, { recursive: true, force: true });
        renameSync(dest, bak);
      }
    }
  } else {
    act('link', `${tidy(dest)} → ${tidy(target)}`);
  }
  if (!DRY) {
    ensureDir(dirname(dest));
    symlinkSync(tgtReal, dest);
  }
}
function applyCopy(target, dest, FORCE) {
  if (!existsSync(target)) return;
  if (existsSync(dest) && !FORCE && !isSymlink(dest)) {
    // vendored files live in the user's git; overwrite in place (they can diff).
  }
  act('copy', `${tidy(target)} → ${tidy(dest)}`);
  if (!DRY) {
    ensureDir(dirname(dest));
    rmSync(dest, { recursive: true, force: true });
    execFileSync('cp', ['-R', target, dest]);
  }
}
function applyWrite(dest, content, label, FORCE) {
  if (existsSync(dest) && !isSymlink(dest)) {
    try {
      if (readFileSync(dest, 'utf8') === content) {
        note(`already current: ${tidy(dest)}`);
        return;
      }
    } catch {}
    if (!FORCE) {
      const bak = dest + '.bak';
      act('back up → ' + tidy(bak) + ' and write', tidy(dest));
      if (!DRY) {
        rmSync(bak, { force: true });
        renameSync(dest, bak);
      }
    } else {
      act('write', tidy(dest));
    }
  } else {
    act('write', `${tidy(dest)}${label ? '  ' + C.dim + label + C.rst : ''}`);
  }
  if (!DRY) {
    ensureDir(dirname(dest));
    writeFileSync(dest, content);
  }
}

// Remove an orphan (in last receipt, not in current plan). We only ever remove
// entries WE recorded, and only if a symlink still points into our tree (links)
// or the recorded path still exists (copies/writes) — never user-authored files.
function removeOrphan(entry) {
  const { kind, dest } = entry;
  if (kind === 'link') {
    if (isSymlink(dest)) {
      act('unlink (removed from toolkit)', tidy(dest));
      removeLink(dest);
    }
  } else if (existsSync(dest)) {
    act('remove (removed from toolkit)', tidy(dest));
    if (!DRY) rmSync(dest, { recursive: true, force: true });
  }
}

function cmdSync() {
  DRY = !!args['dry-run'];
  const FORCE = !!args.force;
  const PRUNE = !args['no-prune'];
  const TOOL = args.tool;
  const repo = args.repo ? resolve(String(args.repo)) : null;
  const scope = repo ? `repo:${repo}` : 'global';

  if (!TOOL || (TOOL !== 'all' && !SUPPORTED.includes(TOOL))) {
    console.error(`Usage: node scripts/adlc.mjs sync --tool=<${SUPPORTED.join('|')}|all> [--repo=<path>] [--pull] [--dry-run]`);
    process.exit(1);
  }

  log('');
  log(`${C.cyn}ADLC sync${C.rst}  ${C.dim}${repo ? 'project: ' + repo : 'global (all repos)'}${DRY ? '  ·  DRY RUN' : ''}${C.rst}`);
  log(`${C.dim}toolkit: ${ROOT}${C.rst}`);

  if (args.pull && !repo) {
    log(`${C.cyn}▸ git pull${C.rst}`);
    if (!DRY) {
      try {
        log(execFileSync('git', ['-C', ROOT, 'pull', '--ff-only'], { encoding: 'utf8' }).trim());
      } catch (e) {
        warn(`git pull failed: ${e.message}`);
      }
    }
  }
  log('');

  const tools = TOOL === 'all' ? SUPPORTED : [TOOL];
  const outRoot = join(ROOT, 'dist');
  const toolkitPath = repo ? '.adlc-toolkit' : ROOT;

  for (const t of tools) {
    log(`${C.cyn}▸ ${t}${C.rst}`);
    const { base } = generate(t, { toolkitPath, outRoot }); // clean regenerate
    const { ops, notes } = plan(t, base, scope, repo, FORCE);

    // Repair any legacy dir-symlink (e.g. ~/.claude/skills → dist/) before linking.
    healDirSymlinks(ops);

    // Loop guard: a REAL dest dir resolving into the toolkit is still refused.
    for (const op of ops) {
      try {
        assertOutsideToolkit(dirname(op.dest), `${t} config`);
      } catch (e) {
        warn(e.message);
        log('');
        process.exitCode = 1;
        return;
      }
    }

    for (const op of ops) {
      if (op.kind === 'link') applyLink(op.target, op.dest, FORCE);
      else if (op.kind === 'copy') applyCopy(op.target, op.dest, FORCE);
      else if (op.kind === 'write') applyWrite(op.dest, op.content, op.label, FORCE);
    }

    // Reconcile: prune anything we placed last time that isn't in the plan now.
    const desired = new Set(ops.map((o) => o.dest));
    const prev = readReceipt(t, scope);
    if (PRUNE) {
      for (const entry of prev) if (!desired.has(entry.dest)) removeOrphan(entry);
    }
    writeReceipt(t, scope, ops.map((o) => ({ kind: o.kind, dest: o.dest })));

    for (const n of notes) note(n);
    log('');
  }

  log(`${C.grn}done.${C.rst}`);
  if (!repo) {
    log(`${C.dim}Keep the toolkit at ${ROOT} — installed stubs read core/ from there at runtime.${C.rst}`);
    log(`${C.dim}Update later (content, added, AND removed skills) with: node scripts/adlc.mjs sync --tool=all --pull${C.rst}`);
  } else {
    log(`${C.dim}Project stubs reference '.adlc-toolkit/core/…' — vendor the toolkit there, or install globally.${C.rst}`);
  }
}

// ======================================================================
// hooks subcommand — activate the version-controlled git hooks
// ======================================================================
function cmdHooks() {
  DRY = !!args['dry-run'];
  const hooksRel = 'scripts/hooks';
  const hook = join(ROOT, hooksRel, 'pre-commit');
  log('');
  log(`${C.cyn}ADLC hooks${C.rst}`);
  if (!existsSync(hook)) {
    console.error(`  no hook found at ${tidy(hook)}`);
    process.exit(1);
  }
  // Make the hook executable (git won't run a non-executable hook).
  act('chmod +x', tidy(hook));
  if (!DRY) chmodSync(hook, 0o755);
  // Point git at the tracked hooks dir.
  act('git config', `core.hooksPath = ${hooksRel}`);
  if (!DRY) execFileSync('git', ['-C', ROOT, 'config', 'core.hooksPath', hooksRel], { stdio: 'ignore' });
  log(`${C.grn}done.${C.rst} pre-commit now rebuilds adapters/ from core/ on every commit that touches the source.`);
  log(`${C.dim}Disable with: git -C "${ROOT}" config --unset core.hooksPath  ·  bypass once with: git commit --no-verify${C.rst}`);
  log('');
}

// ======================================================================
// dispatch
// ======================================================================
function usage() {
  log(`ADLC toolkit\n`);
  log(`  node scripts/adlc.mjs sync  --tool=<${SUPPORTED.join('|')}|all> [--repo=<path>] [--pull] [--dry-run]`);
  log(`  node scripts/adlc.mjs build --tool=<...|all> [--mode=vendored|global] [--toolkit-path=<p>] [--out=<dir>]`);
  log(`  node scripts/adlc.mjs hooks    (activate the pre-commit adapters/ rebuild)`);
}

switch (SUB) {
  case 'sync':
    cmdSync();
    break;
  case 'build':
    cmdBuild();
    break;
  case 'hooks':
    cmdHooks();
    break;
  default:
    usage();
    process.exit(SUB ? 1 : 0);
}
