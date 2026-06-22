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

`scripts/install.mjs` does either for you. Global is the default; pass `--repo=<path>` for project-local.

- **Global / user-level** (default) — install once into `~/.claude`, `~/.copilot`, `~/.codex`, `~/.gemini`, `~/.cursor/commands`; the pipeline is then available in every repo you open. Best for solo work across many repos. All five tools support user-level slash commands and (except Cursor) user-level memory + sub-agents — modern VS Code Copilot reads `~/.copilot/agents`, user-level prompt files, and `~/.copilot/instructions`, so it is no longer project-bound.
- **Project-local** (`--repo=<path>`) — writes the adapter into the repo (`.claude/`, `.github/`, `.cursor/`, etc.). Best for teams: the pipeline travels with the repo, everyone gets the same commands, and it's reviewable in PRs.
- **Cursor is the partial case:** slash commands install globally, but its memory **rule** is project-scoped — install per-repo, or paste it into Cursor's User Rules.

## External sources (issues / designs)

Optional. When `.adlc/config.yml` declares a `sources` block, `/spec` and `/bugfix` can **seed** a draft from a tracker issue and `/architect` from a design frame; `/wrapup` and `/bugfix` Phase 5 can optionally **write back** (gated). The *service* is fixed at `/init`; the *mechanism* — how a skill reaches that service — is auto-resolved at runtime, first that works wins. This degrades gracefully: with no mechanism available, the skill says so in one line and you author the artifact manually, exactly as a hermetic project always has.

| Mechanism | What it needs | Typical availability |
|---|---|---|
| **Dedicated CLI** (`gh` for GitHub) | the CLI installed and authed on your machine | Available on any assistant that can run shell commands — the broadest path, and the default for GitHub. |
| **MCP server** for the service | the user has attached that server to their assistant | Claude Code, Cursor, Codex, Gemini CLI, Copilot all support MCP, with differing setup; availability is per the user's host config, not the toolkit. |
| **URL fetch** | the reference is a full link the assistant can fetch | Fallback for public/authenticated links when neither CLI nor MCP is present. |

| Capability | Notes |
|---|---|
| Read-seed (`/spec`, `/bugfix`, `/architect`) | First-class wherever any one mechanism resolves. The same resolver serves `/spec` and `/bugfix`. |
| Write-back (`/wrapup`, `/bugfix` P5) | Off unless `sources.write` lists the service. Always drafted to `source-writeback.md` and sent only on approval. Under `/ship`, additionally capped by `autonomy.sources`. External writes are hard-stop-eligible. |

The honest line, as everywhere else in this matrix: sources are **strictly additive**. The hermetic pipeline is always intact; a missing CLI, unattached MCP, or unreachable URL never blocks a phase — it just means you type the draft yourself.

## Notes on accuracy

These tools ship changes frequently. The adapter formats here reflect each tool's documented mechanism at the time of writing; if a tool changes its frontmatter keys or command location, update the relevant emitter in `scripts/build.mjs` and regenerate — every adapter for that tool updates at once. The Codex agent TOML keys in particular are worth confirming against your installed Codex version.
