#!/usr/bin/env node
/**
 * ADLC adapter generator.
 *
 * Reads the tool-agnostic core (core/manifest.json + core/skills/*.md + core/agents/*.md)
 * and emits thin "pointer-stub" adapters for each assistant. A stub does not duplicate the
 * protocol — it routes the assistant's slash-command / subagent at the single source of truth
 * in core/, which is read at runtime. One protocol, many front-ends, zero drift.
 *
 * Usage:
 *   node scripts/build.mjs [--tool=all|claude|cursor|copilot|codex|gemini]
 *                          [--mode=vendored|global]
 *                          [--toolkit-path=<path stamped into every stub>]
 *                          [--out=<output dir>]   (default: adapters/)
 *
 * --toolkit-path is the location of THIS toolkit as seen from the target repo.
 *   vendored (default): a relative path, e.g. ".adlc-toolkit" (toolkit copied into the repo)
 *   global:             an absolute path, e.g. "/Users/me/code/adlc-toolkit" or "C:/adlc-toolkit"
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// ---------- args ----------
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)=(.*)$/);
    return m ? [m[1], m[2]] : [a.replace(/^--/, ""), true];
  })
);
const TOOL = args.tool || "all";
const MODE = args.mode || "vendored";
const TOOLKIT_PATH =
  args["toolkit-path"] || (MODE === "global" ? ROOT : ".adlc-toolkit");
const OUT = resolve(ROOT, args.out || "adapters");

// ---------- load core ----------
const manifest = JSON.parse(readFileSync(join(ROOT, "core/manifest.json"), "utf8"));

function parseFrontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---/);
  const fm = {};
  if (m) {
    for (const line of m[1].split("\n")) {
      const mm = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
      if (mm) fm[mm[1]] = mm[2].trim();
    }
  }
  return fm;
}

function loadDir(dir) {
  const out = {};
  for (const f of readdirSync(join(ROOT, dir)).filter((f) => f.endsWith(".md"))) {
    const name = f.replace(/\.md$/, "");
    out[name] = parseFrontmatter(readFileSync(join(ROOT, dir, f), "utf8"));
  }
  return out;
}

const skillFm = loadDir("core/skills");
const agentFm = loadDir("core/agents");

// enrich manifest entries with parsed frontmatter description
const skills = manifest.skills.map((s) => ({
  ...s,
  description: (skillFm[s.name] && skillFm[s.name].description) || s.summary,
}));
const agents = manifest.agents.map((a) => ({
  ...a,
  description: (agentFm[a.name] && agentFm[a.name].description) || a.role,
}));
const agentByName = Object.fromEntries(agents.map((a) => [a.name, a]));

// ---------- helpers ----------
const tp = TOOLKIT_PATH.replace(/\/+$/, "");
const skillRef = (n) => `${tp}/core/skills/${n}.md`;
const agentRef = (n) => `${tp}/core/agents/${n}.md`;
const yamlStr = (s) => `"${String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
const tomlStr = (s) => JSON.stringify(String(s)); // valid TOML basic string

function dispatchNote(tool, agentNames) {
  const list = agentNames.join(", ");
  switch (tool) {
    case "claude":
    case "codex":
    case "gemini":
      return `This skill dispatches sub-agents (${list}). Run them as subagents and consolidate their reports.`;
    case "copilot":
      return `This skill relies on the agents (${list}). Invoke the matching custom agents (use handoffs) or run each role sequentially.`;
    case "cursor":
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
      `**Gate:** this skill ends in an approval gate. Stop and wait for the user's explicit approval before anything proceeds past it. Do not auto-fix-and-continue on a gate failure — surface what failed and wait.`
    );
  if (s.agents && s.agents.length) lines.push(``, dispatchNote(tool, s.agents));
  lines.push(
    ``,
    `**Git policy:** follow \`git.mode\` in \`${manifest.vaultDir}/config.yml\` (default \`manual\`). \`manual\` — never run git writes; read git state and draft commit/PR artifacts for the user. \`commit\` / \`commit+push\` — you may commit (and push, fast-forward only) the REQ's own feature branch once that phase's gate is approved. Never a protected branch, force-push, history rewrite, branch delete, \`gh pr create\`/\`gh pr merge\`, or \`--no-verify\` — in any mode.`
  );
  return lines.join("\n");
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
  ].join("\n");
}

const claudeTools = (a) =>
  a.readonly ? "Read, Grep, Glob, Bash" : "Read, Write, Edit, Grep, Glob, Bash";
const model = (tool, tier) =>
  (manifest.tierToModel[tool] && manifest.tierToModel[tool][tier]) || "default";

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
    `**Workflow:** \`spec → architect → implement → review → wrapup\`, each ending in a gate. Run the commands below, or the whole pipeline with \`proceed\`. Bugs use \`bugfix\`. See per-command stubs for how each maps in ${toolLabel}.`,
  ].join("\n");
}

// ---------- per-tool emitters ----------
const TOOLS = {
  claude: {
    label: "Claude Code",
    cmd: (s) => ({
      path: `skills/${s.name}/SKILL.md`,
      body: `---\nname: ${s.name}\ndescription: ${yamlStr(s.description)}\n---\n\n${protocolBody("claude", s)}\n`,
    }),
    agent: (a) => ({
      path: `agents/${a.name}.md`,
      body: `---\nname: ${a.name}\ndescription: ${yamlStr(a.description)}\nmodel: ${model("claude", a.tier)}\ntools: ${claudeTools(a)}\n---\n\n${agentBody(a)}\n`,
    }),
    memory: { path: "CLAUDE.md", body: memoryFile("Claude Code") },
  },

  cursor: {
    label: "Cursor",
    cmd: (s) => ({
      path: `.cursor/commands/${s.name}.md`,
      body: `---\ndescription: ${yamlStr(s.description)}\n---\n\n${protocolBody("cursor", s)}\n`,
    }),
    agent: (a) => ({
      path: `.cursor/commands/adlc-agent-${a.name}.md`,
      body: `---\ndescription: ${yamlStr(`ADLC agent: ${a.name} — ${a.readonly ? "read-only review" : "implementation"}`)}\n---\n\n${agentBody(a)}\n`,
    }),
    memory: {
      path: ".cursor/rules/adlc.mdc",
      body: `---\ndescription: ADLC toolkit — spec-driven pipeline conventions\nalwaysApply: true\n---\n\n${memoryFile("Cursor")}\n`,
    },
  },

  copilot: {
    label: "GitHub Copilot",
    cmd: (s) => ({
      path: `.github/prompts/${s.name}.prompt.md`,
      body: `---\ndescription: ${yamlStr(s.description)}\n---\n\n${protocolBody("copilot", s)}\n`,
    }),
    agent: (a) => ({
      path: `.github/agents/${a.name}.agent.md`,
      body: `---\nname: ${a.name}\ndescription: ${yamlStr(a.description)}\n---\n\n${agentBody(a)}\n`,
    }),
    memory: { path: ".github/copilot-instructions.md", body: memoryFile("GitHub Copilot") },
  },

  codex: {
    label: "OpenAI Codex",
    cmd: (s) => ({
      path: `prompts/${s.name}.md`,
      body: `${protocolBody("codex", s)}\n`,
    }),
    agent: (a) => ({
      path: `agents/${a.name}.toml`,
      body:
        `# Codex custom agent. Verify key names against your Codex version's schema.\n` +
        `name = ${tomlStr(a.name)}\n` +
        `description = ${tomlStr(a.description)}\n` +
        `model = ${tomlStr(model("codex", a.tier))}\n` +
        `read_only = ${a.readonly ? "true" : "false"}\n` +
        `instructions = """\n${agentBody(a)}\n"""\n`,
    }),
    memory: { path: "AGENTS.md", body: memoryFile("OpenAI Codex") },
  },

  gemini: {
    label: "Gemini CLI",
    cmd: (s) => ({
      path: `.gemini/commands/${s.name}.toml`,
      body:
        `description = ${tomlStr(s.description)}\n` +
        `prompt = """\n${protocolBody("gemini", s)}\n\n{{args}}\n"""\n`,
    }),
    agent: (a) => ({
      path: `.gemini/agents/${a.name}.md`,
      body: `---\nname: ${a.name}\ndescription: ${yamlStr(a.description)}\n---\n\n${agentBody(a)}\n`,
    }),
    memory: { path: "GEMINI.md", body: memoryFile("Gemini CLI") },
  },
};

// ---------- emit ----------
function write(toolDir, rel, body) {
  const full = join(OUT, toolDir, rel);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, body);
}

const toolsToBuild = TOOL === "all" ? Object.keys(TOOLS) : [TOOL];
const report = [];

for (const t of toolsToBuild) {
  const def = TOOLS[t];
  if (!def) {
    console.error(`Unknown tool: ${t}`);
    process.exit(1);
  }
  let n = 0;
  for (const s of skills) {
    const { path, body } = def.cmd(s);
    write(t, path, body);
    n++;
  }
  for (const a of agents) {
    const { path, body } = def.agent(a);
    write(t, path, body);
    n++;
  }
  write(t, def.memory.path, def.memory.body);
  n++;
  report.push(`  ${t.padEnd(8)} → adapters/${t}/  (${skills.length} commands, ${agents.length} agents, 1 memory file = ${n} files)`);
}

console.log(`ADLC adapters generated`);
console.log(`  mode:         ${MODE}`);
console.log(`  toolkit path: ${tp}  (stamped into every stub)`);
console.log(`  output:       ${OUT}`);
console.log(report.join("\n"));
