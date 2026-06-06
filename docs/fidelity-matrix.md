# Fidelity matrix

All five assistants converged on the same three primitives — a memory/context file, custom slash commands, and sub-agents — so the ADLC pipeline runs on all of them. But they are not identical. This page is the honest account of what's first-class, what degrades, and what to expect per tool.

## Primitives, per tool

| Primitive | Claude Code | Cursor | GitHub Copilot | OpenAI Codex | Gemini CLI |
|---|---|---|---|---|---|
| **Memory file** | `CLAUDE.md` | `.cursor/rules/*.mdc` | `.github/copilot-instructions.md` | `AGENTS.md` | `GEMINI.md` |
| **Slash commands** | skills (`SKILL.md`) | `.cursor/commands/*.md` | `.github/prompts/*.prompt.md` | `~/.codex/prompts/*.md` | `.gemini/commands/*.toml` |
| **Sub-agents** | `agents/*.md` (model + tools) | none (sequential) | `.github/agents/*.agent.md` + handoffs | `~/.codex/agents/*.toml` | `.gemini/agents/*.md` |
| **Command file format** | Markdown | Markdown | Markdown | Markdown | **TOML** |

## Capability fidelity

| Capability | Claude | Cursor | Copilot | Codex | Gemini |
|---|---|---|---|---|---|
| Slash commands (`/spec` etc.) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Auto-loaded project memory | ✅ | ✅ | ✅ | ✅ | ✅ |
| Isolated sub-agents | ✅ | ⚠️ inline | ✅ | ✅ | ✅ |
| **Read-only enforced by tool** | ✅ `tools:` | ❌ advisory | ✅ tool sets | ✅ `read_only` | ⚠️ advisory |
| Parallel sub-agents (`/sprint`) | ✅ | ❌ sequential | ⚠️ handoffs | ✅ | ✅ |
| Per-agent model tier | ✅ | ❌ | ✅ | ✅ | ✅ |

✅ first-class · ⚠️ works, reduced · ❌ not available, degrades gracefully

## What the ⚠️/❌ cells mean in practice

**Read-only reviewers.** Principle 3 says review agents report but never edit. Claude enforces this with a `tools:` allow-list (no `Write`/`Edit`); Codex with `read_only = true`; Copilot via restricted agent tool sets. **Cursor and Gemini lean on instruction** — the agent stub tells the model not to edit, but nothing blocks it at the tool layer. On those two, treat read-only as a convention: review passes shouldn't touch files, and you should eyeball the diff after a review phase to confirm nothing changed.

**Parallel sub-agents / `/sprint`.** `/sprint` runs several REQs at once, each in its own worktree, via the `pipeline-runner` agent. Claude, Codex, and Gemini can spawn parallel sub-agents, so `/sprint` works as designed. **Copilot uses sequential "handoffs"** and **Cursor has no isolated sub-agents**, so on those two `/sprint` degrades to one REQ at a time — still correct, just not concurrent. The single-REQ pipeline (`/proceed`) works fully everywhere.

**Inline agents on Cursor.** Cursor has no sub-agent process, so the reviewer/explorer/implementer roles run sequentially inside the main session. The generated `adlc-agent-*` command files let you invoke a role on demand, and the orchestration stubs instruct the main agent to run each role's checklist in its own pass. You lose isolation (each role sees the others' context) but keep the substance.

**Per-agent model tier.** Claude/Codex/Gemini/Copilot can assign a cheaper model to the recon pass and a stronger one to implementation. Cursor uses one model for the session. Tier defaults live in `core/manifest.json` → `tierToModel` and are overridable in `.adlc/config.yml`.

## Choosing where to install

- **Project-local** (copy adapter files into the repo) — best for teams: the pipeline travels with the repo, everyone gets the same commands, and it's reviewable in PRs. All tools support this.
- **Global / user-level** (`~/.claude`, `~/.codex`, `~/.gemini`, user-level Cursor/Copilot) — best for solo work across many repos: install once, available everywhere. Copilot is the most project-oriented of the five.

## Notes on accuracy

These tools ship changes frequently. The adapter formats here reflect each tool's documented mechanism at the time of writing; if a tool changes its frontmatter keys or command location, update the relevant emitter in `scripts/build.mjs` and regenerate — every adapter for that tool updates at once. The Codex agent TOML keys in particular are worth confirming against your installed Codex version.
