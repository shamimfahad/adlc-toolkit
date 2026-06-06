# ADLC Toolkit

A spec-driven development pipeline with a **human approval gate at every phase boundary** — that runs on whatever AI coding assistant you use.

Works with **Claude Code, Cursor, GitHub Copilot, OpenAI Codex, and Gemini CLI**, on **macOS, Windows, and Linux**, for **teams or solo**. One protocol, one knowledge vault, five front-ends.

Inspired by Brett Luelling's [adlc-toolkit](https://github.com/atelier-fashion/sdlc-toolkit) and Karpathy's [LLM wiki](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) pattern, reshaped for **production work where the developer wants control at every decision step**.

## Start here

→ **[Quickstart](docs/quickstart.md)** — zero to your first gated REQ in five steps.
→ **Install for your tool:** [Claude Code](docs/install/claude.md) · [Cursor](docs/install/cursor.md) · [GitHub Copilot](docs/install/copilot.md) · [OpenAI Codex](docs/install/codex.md) · [Gemini CLI](docs/install/gemini.md)
→ **[Fidelity matrix](docs/fidelity-matrix.md)** — what's first-class vs. degraded on each tool.

## How it works

Every major assistant converged on the same three primitives — a memory file, custom slash commands, and sub-agents — so the pipeline maps cleanly onto all of them:

| Primitive | Claude Code | Cursor | Copilot | Codex | Gemini CLI |
|---|---|---|---|---|---|
| **Memory file** | `CLAUDE.md` | `.cursor/rules/*.mdc` | `.github/copilot-instructions.md` | `AGENTS.md` | `GEMINI.md` |
| **Slash commands** | skills (`SKILL.md`) | `.cursor/commands/*.md` | `.github/prompts/*.prompt.md` | `~/.codex/prompts/` | `.gemini/commands/*.toml` |
| **Sub-agents** | `agents/*.md` | (sequential) | `.github/agents/*.agent.md` | `~/.codex/agents/*.toml` | `.gemini/agents/*.md` |

The toolkit keeps the protocol in **one tool-agnostic place** (`core/`) and generates thin **pointer-stub adapters** per tool. A stub doesn't copy the protocol — it routes the assistant's command at `core/`, read at runtime. So there is exactly one source of truth and nothing to keep in sync.

```
adlc-toolkit/
  core/
    skills/<name>.md       # the 13 command protocols (tool-agnostic)
    agents/<name>.md        # the 9 agent role definitions
    manifest.json           # catalog the generator reads
  templates/                # vault + in-REQ templates (stack-agnostic)
  adapters/<tool>/          # generated stubs — clone-and-go for each assistant
  scripts/build.mjs         # regenerates adapters/
  docs/                     # quickstart, fidelity matrix, per-tool install guides
ETHOS.md                    # the 5 guiding principles
```

Per project, the `init` command creates a **`.adlc/` vault** — an Obsidian-compatible markdown knowledge base holding that repo's specs, architecture, conventions, decisions, lessons, and gotchas. The vault is plain markdown, so it's portable across tools and survives switching assistants.

## Regenerating adapters

The committed adapters assume the vendored path `.adlc-toolkit`. To stamp a different path (e.g. a global install):

```bash
node scripts/build.mjs --tool=all --toolkit-path=.adlc-toolkit              # vendored (default)
node scripts/build.mjs --tool=all --mode=global --toolkit-path=/abs/path    # global
node scripts/build.mjs --tool=cursor                                        # just one tool
```

Change the protocol once in `core/`, regenerate, and every tool's adapter updates together.

## Skills

| Skill | What it does | Ends in gate? |
|---|---|---|
| `init` | Bootstrap `.adlc/` vault in a repo | No |
| `spec` | Draft + validate a requirement | Yes |
| `architect` | Design + task breakdown + validate | Yes |
| `implement` | Execute task DAG | Yes |
| `review` | Dispatch reviewers, consolidate findings | Yes |
| `wrapup` | Draft PR + lessons + vault updates + git checklist | Yes |
| `proceed` | Run all five phase skills with gates between | — |
| `sprint` | Parallel multi-REQ orchestrator (gate-pause) | — |
| `bugfix` | Slimmer pipeline for bugs | Yes |
| `analyze` | Standalone codebase health audit | No |
| `optimize` | Standalone performance/cost scan | No |
| `status` | Show every active REQ and gate state | No |
| `recover` | Reconcile pipeline-state with git reality; back-fill the vault | No |

## Agents

| Agent | Tier | Role |
|---|---|---|
| codebase-explorer | Haiku | One structured recon pass: similar patterns, blast radius, integration points |
| task-implementer | Opus | Writes code for one task. No git operations. |
| correctness-reviewer | Sonnet | Logic, race conditions, security. Read-only. |
| quality-reviewer | Sonnet | Conventions, naming, duplication, test coverage. Read-only. |
| architecture-reviewer | Sonnet | Layering, separation of concerns, API contracts. Read-only. |
| reflector | Sonnet | Self-review against captured lessons. Read-only. |
| health-auditor | Sonnet | Codebase health audit for `analyze`. Read-only. |
| performance-scanner | Sonnet | API cost + DB perf + latency for `optimize`. Read-only. |
| pipeline-runner | Opus | Runs the full pipeline for one REQ in a worktree for `sprint`. No sub-agents. No git. |

Model tiers map to each tool's models via `core/manifest.json` → `tierToModel`, overridable per project in `.adlc/config.yml`. Read-only enforcement strength varies by tool — see the [fidelity matrix](docs/fidelity-matrix.md).

## Workflow

```
spec → gate → architect → gate → implement → gate → review → gate → wrapup → gate
```

Or run it all with `proceed`. Each gate produces both a chat prompt and a `.awaiting-approval` file marker, so you can resume across sessions. Bugs use `bugfix`. Multi-REQ batches use `sprint` (each runner pauses at its first gate; you triage across them).

## The vault

The `.adlc/` directory is an Obsidian-compatible vault — open it in Obsidian for graph view, backlinks, and Dataview, or just treat it as a directory of markdown.

**Conventions:**
- Wikilinks: `[[concepts/idempotency]]`, `[[knowledge/gotchas#^g05|G05]]`
- Block anchors for stable references: `^L##` (lessons), `^g##` (gotchas), `^ADR-##` (ADRs)
- `STATUS: needs verification` flags provisional content
- Field tables at the top of every spec/concept/ADR; "Related" / "Backlinks" at the bottom

## Git policy

The assistant never runs `git add`, `git commit`, `git push`, `gh pr create`, `gh pr merge`, branch deletes, or force pushes. It reads git state (`git status`, `git diff`, `git log`) and creates worktrees / feature branches at the start of a REQ. Everything else is yours. At gate boundaries it drafts what you'll need: `commits-draft.md` after `implement`, `pr-draft.md` after `wrapup`.

## Philosophy

The five principles in [ETHOS.md](ETHOS.md), injected into every skill: **you decide / the assistant drafts**; **spec first, code second**; **read-only reviewers**; **knowledge compounds**; **process is explicit**.

## Contributing / extending

- **Change a command or agent:** edit `core/skills/<name>.md` or `core/agents/<name>.md`, then `node scripts/build.mjs`.
- **Add a tool:** add an emitter to the `TOOLS` map in `scripts/build.mjs` and regenerate.
- **Add a stack preset:** see `templates/config-template.yml`.

Roadmap: an `npx adlc init` installer that asks your tool, OS, and team/solo preferences, then scaffolds the vault and the right adapters automatically.
