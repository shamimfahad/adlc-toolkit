# ADLC Toolkit

A spec-driven development pipeline with a **human approval gate at every phase boundary** — that runs on whatever AI coding assistant you use.

Works with **Claude Code, Cursor, GitHub Copilot, OpenAI Codex, and Gemini CLI**, on **macOS, Windows, and Linux**, for **teams or solo**. One protocol, one knowledge vault, five front-ends.

Inspired by Brett Luelling's [adlc-toolkit](https://github.com/atelier-fashion/sdlc-toolkit) and Karpathy's [LLM wiki](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) pattern, reshaped for **production work where the developer wants control at every decision step**.

## Start here

→ **[Quickstart](docs/quickstart.md)** — zero to your first gated REQ in four steps.
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
    skills/<name>.md       # the 15 command protocols (tool-agnostic)
    agents/<name>.md        # the 10 agent role definitions
    manifest.json           # catalog the generator reads
  templates/                # vault + in-REQ templates (stack-agnostic)
  adapters/<tool>/          # generated stubs — clone-and-go for each assistant
  scripts/adlc.mjs          # one command: `sync` (install+update) · `build` (regenerate adapters/)
  scripts/install.mjs       # alias → adlc.mjs sync   (kept for back-compat)
  scripts/build.mjs         # alias → adlc.mjs build  (kept for back-compat)
  docs/                     # quickstart, fidelity matrix, per-tool install guides
ETHOS.md                    # the 6 guiding principles
```

Per project, the `init` command creates a **`.adlc/` vault** — an Obsidian-compatible markdown knowledge base holding that repo's specs, architecture, conventions, decisions, lessons, and gotchas. The vault is plain markdown, so it's portable across tools and survives switching assistants.

## Install

**One command does install *and* update**, global by default — the pipeline becomes available in every repo you open:

```bash
git clone <repo-url> ~/code/adlc-toolkit
cd ~/code/adlc-toolkit
node scripts/adlc.mjs sync --tool=copilot     # or claude · codex · gemini · cursor · all
```

`sync` regenerates the adapter for your tool and symlinks it into that tool's user-level config (`~/.copilot/`, `~/.claude/`, `~/.codex/`, `~/.gemini/`, …). Add `--dry-run` to preview, or `--repo=/path/to/project` to install into a single project instead. See the [quickstart](docs/quickstart.md) and [per-tool guides](docs/install/).

Under the hood it builds machine-specific stubs (absolute toolkit path) into the gitignored `dist/` and links from there, so the committed `adapters/` stays portable.

> The old `node scripts/install.mjs …` command still works — it's now a thin alias for `adlc.mjs sync`.

### Updating

Run the **same command** again — `sync` is an idempotent reconciler, not a one-shot installer:

```bash
node scripts/adlc.mjs sync --tool=all --pull    # git pull the toolkit, then reconcile every install
```

Re-running reconciles your install against what the toolkit currently ships: **new skills/agents get linked, removed ones get pruned, and renamed ones are cleaned up** — while anything *you* added to `~/.claude/skills` (etc.) is left untouched. Content edits flow through automatically because every stub is a thin pointer into `core/`. There is no separate "update" step to remember and no orphaned commands left behind when the skill set changes.

### Or let your AI assistant install it

Open this repo in your AI coding assistant (Claude Code, Copilot, Cursor, Codex, or Gemini CLI) and paste this prompt — it figures out the rest:

```text
You are helping me install this repo (the ADLC toolkit) into my AI coding assistant.

1. Identify which assistant you are and map it to one of: claude, copilot, codex, gemini, cursor.
2. Read README.md and docs/install/<that-tool>.md in this repo so you know the exact locations and caveats.
3. From the repo root, run:  node scripts/adlc.mjs sync --tool=<that-tool> --dry-run
   Show me the planned actions and confirm they look right.
4. Then run it for real (drop --dry-run). It installs GLOBALLY (available in all my repos) by
   default; only add --repo=<path> if I say I want a single project. Re-running this same
   command later is also how I update — it reconciles added/removed skills automatically.
5. Report any manual follow-up it printed (e.g. a VS Code settings line, or reloading
   the window), then walk me through the "Verify" steps from docs/install/<that-tool>.md.

Constraints: do not run any git write commands, and don't move or rename this toolkit folder
(the installed stubs read core/ from here at runtime). Node 18+ is required to run the installer.
```

## Regenerating adapters

You normally don't run this — `adlc.mjs sync` calls the generator for you (into the gitignored `dist/`). Run `build` directly only to refresh the committed, portable `adapters/` after editing `core/` (e.g. adding or removing a skill/agent), or to stamp a custom toolkit path by hand:

```bash
node scripts/adlc.mjs build --tool=all --toolkit-path=.adlc-toolkit              # vendored (default; what's committed)
node scripts/adlc.mjs build --tool=all --mode=global --toolkit-path=/abs/path    # absolute path
node scripts/adlc.mjs build --tool=cursor                                        # just one tool
```

> `node scripts/build.mjs …` still works as a thin alias for `adlc.mjs build`.

Every generated stub is a thin pointer that says "run the protocol defined at `<toolkit-path>/core/...`". So the **only** thing that varies between installs is that stamped path — that's what these flags control:

- `--tool=<claude|cursor|copilot|codex|gemini|all>` — which assistant(s) to emit. Default `all`.
- `--toolkit-path=<path>` — the path stamped into every stub, i.e. where the stub will find `core/` at runtime, **as seen from the repo where you'll use it.**
  - **vendored** (default): a relative path like `.adlc-toolkit` — use when the toolkit is copied into each project.
  - **global**: an absolute path like `/Users/you/code/adlc-toolkit` — use when one central copy serves every repo.
- `--mode=vendored|global` — only sets the *default* for `--toolkit-path` (relative vs. the toolkit's own absolute path). An explicit `--toolkit-path` always wins.
- `--out=<dir>` — where to write the stubs. Defaults to `adapters/`; the installer overrides this to `dist/`.

The committed `adapters/` are built vendored (relative `.adlc-toolkit`) so they stay portable across machines — **don't commit absolute paths.** For a global install, let `adlc.mjs sync` build into `dist/` instead. Change the protocol once in `core/`, regenerate, and every tool's adapter updates together.

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
| `ship` | Autonomous pipeline — routes each gate through the decision-maker; ends in one terminal human review | — |
| `sprint` | Parallel multi-REQ orchestrator (gate-pause) | — |
| `bugfix` | Slimmer pipeline for bugs | Yes |
| `analyze` | Standalone codebase health audit | No |
| `optimize` | Standalone performance/cost scan | No |
| `status` | Show every active REQ and gate state | No |
| `recover` | Reconcile pipeline-state with git reality; back-fill the vault | No |
| `config` | View/change `.adlc/config.yml` settings (git mode, isolation, autonomy…) via guided options | No |

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
| pipeline-runner | Opus | Runs the full pipeline for one REQ in a worktree for `sprint`. No sub-agents. Git per `git.mode` (feature branch only). |
| decision-maker | Opus | Adjudicates one pipeline gate during an autonomous `ship` run — APPROVE / REWORK / HALT with cited evidence. Read-only. |

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

How much git the assistant runs is **your choice per project**, set at `init` and stored in `.adlc/config.yml` → `git.mode`:

| `git.mode` | Behavior |
|---|---|
| `manual` (default) | The assistant runs no git writes. It reads git state, creates the REQ's worktree/feature branch, and drafts `commits-draft.md` (after `implement`) and `pr-draft.md` (after `wrapup`). You run every commit, push, and merge. |
| `commit` | The assistant also `git add` + `git commit`s the approved work on the REQ's feature branch at each gate. You push and open/merge the PR. |
| `commit+push` | The assistant also `git push`es the feature branch (fast-forward only). You open and merge the PR. |

In **every** mode the hard invariants hold: only the REQ's own feature branch, and never a protected branch (`git.protect`, default `main`/`master`/`release/*`), force-push, rebase, history rewrite, branch delete, `gh pr create`, `gh pr merge`, or `--no-verify`. `/ship`'s `autonomy.git` is capped by `git.mode` and can never exceed it.

## Philosophy

The six principles in [ETHOS.md](ETHOS.md), injected into every skill: **you decide / the assistant drafts**; **spec first, code second**; **read-only reviewers**; **knowledge compounds**; **process is explicit**; **ask in options, not open prose**.

## Contributing / extending

- **Change a command or agent:** edit `core/skills/<name>.md` or `core/agents/<name>.md`, then `node scripts/adlc.mjs build` (and `sync` to update installs).
- **Add or remove a skill/agent:** edit `core/` + `core/manifest.json`, then re-run `node scripts/adlc.mjs sync` — added stubs are linked and removed ones pruned automatically.
- **Add a tool:** add an emitter to the `TOOLS` map in `scripts/adlc.mjs` and regenerate.
- **Add a stack preset:** see `templates/config-template.yml`.

Roadmap: an `npx adlc init` installer that asks your tool, OS, and team/solo preferences, then scaffolds the vault and the right adapters automatically.
