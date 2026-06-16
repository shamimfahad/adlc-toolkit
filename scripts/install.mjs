#!/usr/bin/env node
/**
 * ADLC one-command installer.
 *
 * Installs the toolkit for an AI coding assistant. **Global by default** — the
 * pipeline becomes available in every repo you open. Pass `--repo <path>` to
 * install into a single project instead.
 *
 * What it does:
 *   1. Regenerates the adapter stubs for the chosen tool with the correct
 *      toolkit path stamped in (absolute for global, relative for --repo),
 *      writing them to a gitignored build dir (`dist/`) so the committed,
 *      portable `adapters/` never churns.
 *   2. Symlinks (or, where a transform is needed, writes) those stubs into the
 *      tool's user-level config locations — so one `git pull` on the toolkit
 *      updates every install.
 *
 * Usage:
 *   node scripts/install.mjs --tool=copilot                 # global (default)
 *   node scripts/install.mjs --tool=claude
 *   node scripts/install.mjs --tool=all                     # every supported tool
 *   node scripts/install.mjs --tool=copilot --repo=/path/to/project   # project-local
 *   node scripts/install.mjs --tool=copilot --dry-run       # print actions, change nothing
 *
 * Flags:
 *   --tool=<claude|copilot|codex|gemini|cursor|all>   required
 *   --repo=<path>        install into this project instead of globally (vendored stubs)
 *   --dry-run            show every action without touching the filesystem
 *   --insiders           target "Code - Insiders" for VS Code user prompt files
 *   --vscode-prompts-dir=<path>   override the VS Code user prompts folder (Copilot)
 *   --force              overwrite existing non-symlink targets without a .bak backup
 */

import {
  readFileSync, writeFileSync, mkdirSync, readdirSync,
  existsSync, lstatSync, rmSync, renameSync, symlinkSync, realpathSync,
} from "node:fs";
import { dirname, join, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir, platform } from "node:os";
import { execFileSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const HOME = homedir();

// ---------- args ----------
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)=(.*)$/);
    return m ? [m[1], m[2]] : [a.replace(/^--/, ""), true];
  })
);
const TOOL = args.tool;
const REPO = args.repo ? resolve(String(args.repo)) : null;
const GLOBAL = !REPO;
const DRY = !!args["dry-run"];
const FORCE = !!args.force;

const SUPPORTED = ["claude", "copilot", "codex", "gemini", "cursor"];

if (!TOOL || (TOOL !== "all" && !SUPPORTED.includes(TOOL))) {
  console.error(
    `Usage: node scripts/install.mjs --tool=<${SUPPORTED.join("|")}|all> [--repo=<path>] [--dry-run]`
  );
  process.exit(1);
}

// ---------- tiny logger ----------
const C = { dim: "\x1b[2m", grn: "\x1b[32m", yel: "\x1b[33m", cyn: "\x1b[36m", rst: "\x1b[0m" };
const log = (s = "") => console.log(s);
const act = (verb, detail) =>
  log(`  ${DRY ? C.yel + "would " + verb + C.rst : C.grn + verb + C.rst} ${detail}`);
const note = (s) => log(`  ${C.dim}${s}${C.rst}`);

// ---------- fs helpers ----------
const expand = (p) => (p.startsWith("~") ? join(HOME, p.slice(1)) : p);

function ensureDir(d) {
  if (DRY) return;
  mkdirSync(d, { recursive: true });
}

// Create a symlink at `linkPath` pointing to `target`. Backs up anything real
// that's already there (unless --force). Idempotent for our own symlinks.
function link(target, linkPath) {
  const tgt = realpathSafe(target);
  if (existsSync(linkPath) || isSymlink(linkPath)) {
    if (isSymlink(linkPath) && realpathSafe(linkPath) === tgt) {
      note(`already linked: ${tidy(linkPath)}`);
      return;
    }
    if (FORCE) {
      act("replace", tidy(linkPath));
      if (!DRY) rmSync(linkPath, { recursive: true, force: true });
    } else {
      const bak = linkPath + ".bak";
      act("back up → " + tidy(bak) + " and link", tidy(linkPath));
      if (!DRY) {
        rmSync(bak, { recursive: true, force: true });
        renameSync(linkPath, bak);
      }
    }
  } else {
    act("link", `${tidy(linkPath)} → ${tidy(target)}`);
  }
  if (!DRY) {
    ensureDir(dirname(linkPath));
    symlinkSync(target, linkPath);
  }
}

// Write a (possibly transformed) file. Backs up an existing real file.
function writeFile(path, content, label) {
  if (existsSync(path) && !isSymlink(path)) {
    try {
      if (readFileSync(path, "utf8") === content) { note(`already current: ${tidy(path)}`); return; }
    } catch { /* fall through to (re)write */ }
  }
  if (existsSync(path) && !isSymlink(path) && !FORCE) {
    const bak = path + ".bak";
    act("back up → " + tidy(bak) + " and write", tidy(path));
    if (!DRY) { rmSync(bak, { force: true }); renameSync(path, bak); }
  } else {
    act("write", `${tidy(path)}${label ? "  " + C.dim + label + C.rst : ""}`);
  }
  if (!DRY) { ensureDir(dirname(path)); writeFileSync(path, content); }
}

const isSymlink = (p) => { try { return lstatSync(p).isSymbolicLink(); } catch { return false; } };
const realpathSafe = (p) => { try { return realpathSync(p); } catch { return resolve(p); } };
const tidy = (p) => p.replace(HOME, "~").replace(ROOT, "<toolkit>");
const filesIn = (d, ext) =>
  existsSync(d) ? readdirSync(d).filter((f) => f.endsWith(ext)).map((f) => join(d, f)) : [];

// ---------- VS Code user prompts dir (Copilot global slash commands) ----------
function vscodeUserDir() {
  if (args["vscode-prompts-dir"]) return expand(String(args["vscode-prompts-dir"]));
  const appName = args.insiders ? "Code - Insiders" : "Code";
  const p = platform();
  if (p === "darwin") return join(HOME, "Library", "Application Support", appName, "User", "prompts");
  if (p === "win32") return join(process.env.APPDATA || join(HOME, "AppData", "Roaming"), appName, "User", "prompts");
  return join(HOME, ".config", appName, "User", "prompts"); // linux
}

// ---------- build the adapter for one tool into the gitignored dist/ ----------
function build(tool) {
  const out = join(ROOT, "dist");
  const toolkitPath = GLOBAL ? ROOT : ".adlc-toolkit";
  const mode = GLOBAL ? "global" : "vendored";
  log(`${C.cyn}▸ building ${tool} adapter${C.rst} ${C.dim}(${mode}, path=${tidy(toolkitPath)})${C.rst}`);
  if (!DRY) {
    execFileSync(
      "node",
      [join(ROOT, "scripts", "build.mjs"), `--tool=${tool}`, `--mode=${mode}`,
       `--toolkit-path=${toolkitPath}`, `--out=${out}`],
      { stdio: "ignore" }
    );
  }
  return join(out, tool);
}

// ---------- per-tool global placement ----------
function installGlobal(tool, src) {
  switch (tool) {
    case "claude": {
      link(join(src, "skills"), expand("~/.claude/skills"));
      link(join(src, "agents"), expand("~/.claude/agents"));
      link(join(src, "CLAUDE.md"), expand("~/.claude/CLAUDE.md"));
      break;
    }
    case "copilot": {
      // sub-agents → ~/.copilot/agents (VS Code user-level, all workspaces)
      for (const f of filesIn(join(src, ".github", "agents"), ".agent.md"))
        link(f, join(expand("~/.copilot/agents"), basename(f)));
      // slash commands → VS Code user prompts dir (available in every workspace)
      const promptsDir = vscodeUserDir();
      for (const f of filesIn(join(src, ".github", "prompts"), ".prompt.md"))
        link(f, join(promptsDir, basename(f)));
      // memory → ~/.copilot/instructions/*.instructions.md needs applyTo frontmatter
      const memSrc = join(src, ".github", "copilot-instructions.md");
      if (existsSync(memSrc) || DRY) {
        const body = existsSync(memSrc) ? readFileSync(memSrc, "utf8") : "(generated at run time)";
        writeFile(
          expand("~/.copilot/instructions/adlc.instructions.md"),
          `---\napplyTo: '**'\n---\n\n${body}`,
          "(applyTo:** so it loads in every repo)"
        );
      }
      note(`VS Code prompts dir: ${tidy(promptsDir)}`);
      note(`if /commands don't appear, add this to user settings.json:`);
      note(`  "chat.promptFilesLocations": { "${promptsDir}": true }`);
      break;
    }
    case "codex": {
      for (const f of filesIn(join(src, "prompts"), ".md"))
        link(f, join(expand("~/.codex/prompts"), basename(f)));
      for (const f of filesIn(join(src, "agents"), ".toml"))
        link(f, join(expand("~/.codex/agents"), basename(f)));
      link(join(src, "AGENTS.md"), expand("~/.codex/AGENTS.md"));
      break;
    }
    case "gemini": {
      for (const f of filesIn(join(src, ".gemini", "commands"), ".toml"))
        link(f, join(expand("~/.gemini/commands"), basename(f)));
      for (const f of filesIn(join(src, ".gemini", "agents"), ".md"))
        link(f, join(expand("~/.gemini/agents"), basename(f)));
      link(join(src, "GEMINI.md"), expand("~/.gemini/GEMINI.md"));
      break;
    }
    case "cursor": {
      // Cursor reads user-level slash commands from ~/.cursor/commands (all projects).
      for (const f of filesIn(join(src, ".cursor", "commands"), ".md"))
        link(f, join(expand("~/.cursor/commands"), basename(f)));
      // Rules are project-scoped in Cursor — the memory rule can't be installed globally as a file.
      note(`Cursor rules are project-scoped: paste ${tidy(join(src, ".cursor", "rules", "adlc.mdc"))}`);
      note(`into Cursor → Settings → Rules (User Rules), or install per-repo with --repo=<path> to get .cursor/rules/adlc.mdc.`);
      break;
    }
  }
}

// ---------- per-tool project-local placement ----------
function installRepo(tool, src, repo) {
  const cp = (from, to) => {
    if (!existsSync(from)) return;
    act("copy", `${tidy(from)} → ${to.replace(repo, "<repo>")}`);
    if (!DRY) {
      ensureDir(dirname(to));
      execFileSync("cp", ["-R", from, to]);
    }
  };
  switch (tool) {
    case "claude":
      cp(join(src, "skills"), join(repo, ".claude", "skills"));
      cp(join(src, "agents"), join(repo, ".claude", "agents"));
      cp(join(src, "CLAUDE.md"), join(repo, "CLAUDE.md"));
      break;
    case "copilot":
      cp(join(src, ".github"), join(repo, ".github"));
      break;
    case "codex":
      cp(join(src, "prompts"), join(repo, ".codex", "prompts"));
      cp(join(src, "agents"), join(repo, ".codex", "agents"));
      cp(join(src, "AGENTS.md"), join(repo, "AGENTS.md"));
      break;
    case "gemini":
      cp(join(src, ".gemini"), join(repo, ".gemini"));
      cp(join(src, "GEMINI.md"), join(repo, "GEMINI.md"));
      break;
    case "cursor":
      cp(join(src, ".cursor"), join(repo, ".cursor"));
      break;
  }
  note(`project-local stubs reference '.adlc-toolkit/core/…' — vendor the toolkit there, or re-run with global.`);
}

// ---------- main ----------
const tools = TOOL === "all" ? SUPPORTED : [TOOL];

log("");
log(`${C.cyn}ADLC installer${C.rst}  ${C.dim}${GLOBAL ? "global (all repos)" : "project: " + REPO}${DRY ? "  ·  DRY RUN" : ""}${C.rst}`);
log(`${C.dim}toolkit: ${ROOT}${C.rst}`);
log("");

for (const t of tools) {
  const src = build(t);
  if (GLOBAL) installGlobal(t, src);
  else installRepo(t, src, REPO);
  log("");
}

log(`${C.grn}done.${C.rst}`);
if (GLOBAL) {
  log(`${C.dim}Keep the toolkit at ${ROOT} — the installed stubs read core/ from there at runtime.${C.rst}`);
  log(`${C.dim}Update everything later with: git -C "${ROOT}" pull  (symlinks pick it up automatically).${C.rst}`);
}
