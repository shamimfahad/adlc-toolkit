# Quickstart

The ADLC toolkit gives any AI coding assistant a **spec-driven pipeline with a human approval gate at every phase**. It works with Claude Code, Cursor, GitHub Copilot, OpenAI Codex, and Gemini CLI, on macOS, Windows, and Linux.

This page gets you from zero to your first gated REQ in four steps. For tool-specific detail, see the [per-tool install guides](install/).

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
  scripts/adlc.mjs sync    ← one-command install (global by default)
  scripts/adlc.mjs build      ← regenerates adapters/

your-project/            ← any code repo you work in
  .adlc/                 ← the vault, created by `init`
```

The adapters install into your assistant's **user-level** config once, so individual projects only ever hold the `.adlc/` vault.

## The four steps

### 1. Get the toolkit

```bash
git clone <repo-url> ~/code/adlc-toolkit
```

Keep it wherever you like — just leave it there. The installed commands read the protocol from this folder at runtime, so it's the toolkit's permanent home.

### 2. Install for your tool — one command, global by default

```bash
cd ~/code/adlc-toolkit
node scripts/adlc.mjs sync --tool=copilot      # or claude · codex · gemini · cursor · all
```

This regenerates the adapter for your tool and links it into your assistant's **user-level** config, so the pipeline is available in **every repo you open** — no per-project setup. Add `--dry-run` first to preview every action; nothing is written until you run it for real.

**Want it in just one project instead?** Point the installer at that repo:

```bash
node scripts/adlc.mjs sync --tool=copilot --repo=/path/to/project
```

Per-tool detail (exact locations, verification, caveats) lives in each install guide:

| Tool | Guide | Global lands in |
|---|---|---|
| Claude Code | [install/claude.md](install/claude.md) | `~/.claude/` |
| GitHub Copilot | [install/copilot.md](install/copilot.md) | `~/.copilot/` + VS Code user prompts |
| OpenAI Codex | [install/codex.md](install/codex.md) | `~/.codex/` |
| Gemini CLI | [install/gemini.md](install/gemini.md) | `~/.gemini/` |
| Cursor | [install/cursor.md](install/cursor.md) | per-repo (`--repo`); global rules are manual |

> The installer builds machine-specific stubs (with an absolute path to the toolkit) into the gitignored `dist/` folder and symlinks from there, so the committed `adapters/` stays portable and your `git status` stays clean. Update every install later with `git -C ~/code/adlc-toolkit pull` — the symlinks pick it up automatically.

### 3. Initialize a project

Open your assistant in a code repo and run the init command (`/init`, or `init` — depends on the tool):

```
/init
```

It creates `.adlc/`, scans existing docs (README, ARCHITECTURE, CONTRIBUTING, lint configs, ADRs) to seed the vault, and asks a few project questions. Then edit `.adlc/config.yml` for your stack.

### 4. Run your first REQ

```
/spec      → approve → /architect → approve → /implement → approve → /review → approve → /wrapup → approve
```

Or run the whole thing with `/proceed`. Each gate pauses for your approval. For bugs, use `/bugfix`.

## Changing settings

Project settings live in `.adlc/config.yml` and are easiest to change with the **`/config`** command — no hand-editing YAML:

```
/config                      # show current settings
/config git.mode=commit      # change one setting directly
/config                      # (interactive) pick a setting, choose from valid options
```

`/config` validates each value, edits the file surgically (your comments stay intact), and re-syncs anything derived from a setting — e.g. changing `git.mode` also refreshes the git-policy block in `.adlc/CLAUDE.md`. The most common knob is **`git.mode`** (`manual` → `commit` → `commit+push`): how much git the assistant runs. It's set during `/init` and defaults to `manual` (drafts only; you run git). See [Git policy](../README.md#git-policy) for the modes and their invariants.

## What stays true on every tool

- **You decide; the assistant drafts.** Gates pause for you; git is yours by default (`git.mode: manual`), and you can grant more via `/config` when you want it.
- **The vault is portable.** It's just markdown — switch tools or use several at once against the same `.adlc/`.
- **Read-only reviewers** report findings; they never edit.

Where tools differ — read-only enforcement strength, parallel sub-agents, command file format — is documented in the [fidelity matrix](fidelity-matrix.md).
