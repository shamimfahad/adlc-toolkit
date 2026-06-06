# Quickstart

The ADLC toolkit gives any AI coding assistant a **spec-driven pipeline with a human approval gate at every phase**. It works with Claude Code, Cursor, GitHub Copilot, OpenAI Codex, and Gemini CLI, on macOS, Windows, and Linux.

This page gets you from zero to your first gated REQ in five steps. For tool-specific detail, see the [per-tool install guides](install/).

## How it fits together

Three pieces:

1. **The toolkit** — this repository. Holds the tool-agnostic protocol (`core/`), the vault templates (`templates/`), and generated per-tool adapters (`adapters/`).
2. **Adapters** — thin "pointer" files that wire your assistant's slash commands and sub-agents to the protocol in `core/`. One per tool, already generated in `adapters/<tool>/`. They contain no copied logic — they route your assistant at the single source of truth, so there is nothing to keep in sync.
3. **The `.adlc/` vault** — created per code-repo by the `init` command. Holds that project's specs, architecture, conventions, decisions, and compounding knowledge. Plain markdown; Obsidian-compatible.

```
adlc-toolkit/            ← the toolkit (shared across all your projects)
  core/                  ← protocol: skills/ + agents/ + manifest.json   (the one source of truth)
  templates/             ← vault + in-REQ templates
  adapters/<tool>/       ← generated stubs for each assistant
  scripts/build.mjs      ← regenerates adapters/

your-project/            ← any code repo you work in
  .adlc/                 ← the vault, created by `init`
  <adapter files>        ← copied/symlinked from adapters/<your-tool>/
```

## The five steps

### 1. Get the toolkit

```bash
git clone <repo-url> adlc-toolkit
```

Decide where it lives. Two models, both cross-platform:

- **Vendored (recommended, simplest):** copy the toolkit into each project at `.adlc-toolkit/`. No symlinks, identical on every OS, and the project is self-contained.
- **Global:** keep one copy somewhere central and point every project at it by absolute path. Less duplication; needs the path stamped per machine.

### 2. Generate adapters for your tool (and your path)

The committed adapters assume the vendored path `.adlc-toolkit`. If that matches, skip this. Otherwise regenerate with your path:

```bash
cd adlc-toolkit
node scripts/build.mjs --tool=cursor --toolkit-path=.adlc-toolkit          # vendored
node scripts/build.mjs --tool=cursor --mode=global --toolkit-path=/abs/path/to/adlc-toolkit
```

`--tool=all` builds every tool. The stamped path is the only thing that changes between the two models.

### 3. Install the adapter into your assistant

Copy `adapters/<tool>/` into the right location for your tool. Each tool differs — see its guide:

| Tool | Guide | Lands in |
|---|---|---|
| Claude Code | [install/claude.md](install/claude.md) | `~/.claude/` or `.claude/` |
| Cursor | [install/cursor.md](install/cursor.md) | `.cursor/` |
| GitHub Copilot | [install/copilot.md](install/copilot.md) | `.github/` |
| OpenAI Codex | [install/codex.md](install/codex.md) | `AGENTS.md` + `~/.codex/` |
| Gemini CLI | [install/gemini.md](install/gemini.md) | `GEMINI.md` + `.gemini/` |

### 4. Initialize a project

Open your assistant in a code repo and run the init command (`/init`, or `init` — depends on the tool):

```
/init
```

It creates `.adlc/`, scans existing docs (README, ARCHITECTURE, CONTRIBUTING, lint configs, ADRs) to seed the vault, and asks a few project questions. Then edit `.adlc/config.yml` for your stack.

### 5. Run your first REQ

```
/spec      → approve → /architect → approve → /implement → approve → /review → approve → /wrapup → approve
```

Or run the whole thing with `/proceed`. Each gate pauses for your approval. For bugs, use `/bugfix`.

## What stays true on every tool

- **You decide; the assistant drafts.** Gates pause for you; you run all git.
- **The vault is portable.** It's just markdown — switch tools or use several at once against the same `.adlc/`.
- **Read-only reviewers** report findings; they never edit.

Where tools differ — read-only enforcement strength, parallel sub-agents, command file format — is documented in the [fidelity matrix](fidelity-matrix.md).
