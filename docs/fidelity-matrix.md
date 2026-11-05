# What works on each tool

_(a.k.a. the fidelity matrix)_

All five assistants converged on the same three primitives — a memory/context file, custom slash commands, and sub-agents — so the ADLC pipeline runs on all of them. But they are not identical. This page is the honest account of what works fully, what works with limits, and what to expect on each tool.

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
| **Reviewer read-only on source** | ⚠️ instruction | ⚠️ instruction | ⚠️ instruction | ⚠️ instruction | ⚠️ instruction |
| Parallel sub-agents (`/sprint`) | ✅ | ❌ sequential | ⚠️ handoffs | ✅ | ✅ |
| Per-agent model tier | ✅ | ❌ | ✅ | ✅ | ✅ |
| Vault budgets enforced (hook) | ✅ `adlc-budget.mjs` | ❌ prose only | ❌ prose only | ❌ prose only | ❌ prose only |
| Path-scoped conventions (`conventions-paths.md`) | ✅ native `.claude/rules/adlc-*.md` on read + hook on first write | ⚠️ skills grep the file by path | ⚠️ grep | ⚠️ grep | ⚠️ grep |
| Relevant knowledge arrives unasked (`adlc-knowledge.mjs`) | ✅ injected per directory, once | ❌ implementer greps `lessons.md` (instructed) | ❌ instructed | ❌ instructed | ❌ instructed |
| Generated files write-blocked | ✅ hook denies | ❌ prose only | ❌ prose only | ❌ prose only | ❌ prose only |

✅ first-class · ⚠️ works, reduced · ❌ not available, degrades gracefully

## What the ⚠️/❌ cells mean in practice

**Read-only reviewers.** Principle 3 says review agents report but never touch your code. Reviewers do have `Write`/`Edit` — they need it to write their own report files (`review-log.md`, an audit report, `gate-decisions.md`). So "never touch your source code" is enforced by the reviewer's instructions, not by the tool's permission system, and that is equally true on all five tools. (It was never fully tool-enforced anyway: reviewers also carry `Bash`, which can write files.) The real guardrail is the agent's constraint (write only your findings file) plus the git-mutation ban. On **every** tool, treat read-only-on-source as a discipline: after a review pass, confirm `git status` shows only `.adlc/` changes and no edits to your source or repo files.

**Parallel sub-agents / `/sprint`.** `/sprint` runs several REQs at once, each in its own worktree, via the `pipeline-runner` agent. Claude, Codex, and Gemini can spawn parallel sub-agents, so `/sprint` works as designed. **Copilot uses sequential "handoffs"** and **Cursor has no isolated sub-agents**, so on those two `/sprint` runs one REQ at a time — same results, just not in parallel. The single-REQ pipeline (`/proceed`) works fully everywhere.

**Inline agents on Cursor.** Cursor has no sub-agent process, so the reviewer/explorer/implementer roles run sequentially inside the main session. The generated `adlc-agent-*` command files let you invoke a role on demand, and the orchestration stubs instruct the main agent to run each role's checklist in its own pass. You lose isolation (each role sees the others' context) but keep the substance.

**Vault budgets.** Every adapter carries the budgets as protocol: `/wrapup` rotates `hot.md` and keeps `now.md` to its table, `/status` prints the strip, `/config budgets` repairs drift. Only Claude Code has a hook surface that can refuse a write, so only there is a budget a guarantee rather than an instruction. On the other tools, run `/status` and act on `⚠`.

**Path-scoped conventions and knowledge injection (1.9.1).** On Claude Code, `node scripts/adlc.mjs rules` turns each section of `.adlc/context/conventions-paths.md` into a `.claude/rules/adlc-*.md` that loads only when a matching file is read — inside sub-agents too, since a sub-agent receives the project rules — and `adlc-knowledge.mjs` injects the matching `lessons.md`/`gotchas.md` lines the first time a directory is touched. Elsewhere the same files exist and the skills say to grep them (`task-implementer` §Required reading, the reviewers' **Rules in scope**); the difference is who has to remember.

**Per-agent model tier.** Claude/Codex/Gemini/Copilot can assign a cheaper model to the recon pass and a stronger one to implementation. Cursor uses one model for the session. Tier defaults live in `core/manifest.json` → `tierToModel` and are overridable in `.adlc/config.yml`.

## Choosing where to install

`scripts/adlc.mjs sync` does either for you. Global is the default; pass `--repo=<path>` for project-local.

- **Global / user-level** (default) — install once into `~/.claude`, `~/.copilot`, `~/.codex`, `~/.gemini`, `~/.cursor/commands`; the pipeline is then available in every repo you open. Best for solo work across many repos. All five tools support user-level slash commands and (except Cursor) user-level memory + sub-agents — modern VS Code Copilot reads `~/.copilot/agents`, user-level prompt files, and `~/.copilot/instructions`, so it is no longer project-bound.
- **Project-local** (`--repo=<path>`) — writes the adapter into the repo (`.claude/`, `.github/`, `.cursor/`, etc.). Best for teams: the pipeline travels with the repo, everyone gets the same commands, and it's reviewable in PRs.
- **Cursor is the partial case:** slash commands install globally, but its memory **rule** is project-scoped — install per-repo, or paste it into Cursor's User Rules.

## External sources (issues / designs)

Optional. When `.adlc/config.yml` declares a `sources` block, `/spec` and `/bugfix` can **seed** a draft from a tracker issue and `/architect` from a design frame; `/wrapup` and `/bugfix` Phase 5 can optionally **write back** (gated). The *service* is fixed at `/init`; the *mechanism* — how a skill reaches that service — is auto-resolved at runtime, first that works wins. This degrades gracefully: with no mechanism available, the skill says so in one line and you author the artifact manually, exactly as a project with no integrations always has.

| Mechanism | What it needs | Typical availability |
|---|---|---|
| **Dedicated CLI** (`gh` for GitHub) | the CLI installed and authed on your machine | Available on any assistant that can run shell commands — the broadest path, and the default for GitHub. |
| **MCP server** for the service | the user has attached that server to their assistant | Claude Code, Cursor, Codex, Gemini CLI, Copilot all support MCP, with differing setup; availability is per the user's host config, not the toolkit. |
| **URL fetch** | the reference is a full link the assistant can fetch | Fallback for public/authenticated links when neither CLI nor MCP is present. |

| Capability | Notes |
|---|---|
| Read-seed (`/spec`, `/bugfix`, `/architect`) | First-class wherever any one mechanism resolves. The same resolver serves `/spec` and `/bugfix`. |
| Write-back (`/wrapup`, `/bugfix` P5) | Off unless `sources.write` lists the service. Always drafted to `source-writeback.md` and sent only on approval. Under `/autopilot`, additionally capped by `autonomy.sources`. External writes always stop for your explicit OK. |

Bottom line, as everywhere else on this page: integrations only ever **add** convenience. The self-contained, no-integrations pipeline always works; a missing CLI, unattached MCP, or unreachable URL never blocks a phase — it just means you type the draft yourself.

## Notes on accuracy

These tools ship changes frequently. The adapter formats here reflect each tool's documented mechanism at the time of writing; if a tool changes its frontmatter keys or command location, update the relevant emitter in `scripts/adlc.mjs build` and regenerate — every adapter for that tool updates at once. The Codex agent TOML keys in particular are worth confirming against your installed Codex version.
