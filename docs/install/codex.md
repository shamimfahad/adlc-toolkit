# Install: OpenAI Codex

Codex uses `AGENTS.md` (auto-loaded, hierarchical from repo root down) as the memory file, **custom prompts** (`~/.codex/prompts/*.md`, invoked as `/name`) for slash commands, and **custom agents** (`~/.codex/agents/*.toml`) for sub-agents — which can run in parallel and carry a `read_only` flag.

Adapter source: `adapters/codex/` → `AGENTS.md`, `prompts/<name>.md`, `agents/<name>.toml`.

## Install — one command (recommended)

```bash
node scripts/adlc.mjs sync --tool=codex          # add --dry-run to preview; --repo=<path> for one project
```

Global install symlinks commands into `~/.codex/prompts/`, agents into `~/.codex/agents/`, and the memory file to `~/.codex/AGENTS.md` (Codex reads it for every session). Symlinks track the toolkit, so a `git -C <toolkit> pull` refreshes skill content automatically; re-run `node scripts/adlc.mjs sync --tool=codex` after a pull (or `--pull` to do both) to link any added skills and prune removed ones. The manual steps below are the equivalent, if you prefer to place files yourself.

## Prerequisites

- Codex CLI installed (`codex --version`).
- Node 18+ only if regenerating adapters.

## Manual install

What the one-command installer does, by hand. Codex prompts and agents are **user-level** (`~/.codex/`); `AGENTS.md` works at the repo root or, for an all-repos default, at `~/.codex/AGENTS.md` (where the installer places it).

**macOS / Linux**
```bash
# toolkit (vendored in the project, or global — your choice)
git clone <repo-url> .adlc-toolkit
node .adlc-toolkit/scripts/adlc.mjs build --tool=codex --toolkit-path=.adlc-toolkit
# (global toolkit instead: --mode=global --toolkit-path="$HOME/code/adlc-toolkit")

# user-level commands + agents
mkdir -p ~/.codex/prompts ~/.codex/agents
cp .adlc-toolkit/adapters/codex/prompts/*.md   ~/.codex/prompts/
cp .adlc-toolkit/adapters/codex/agents/*.toml  ~/.codex/agents/

# per-repo memory
cp .adlc-toolkit/adapters/codex/AGENTS.md ./AGENTS.md
```

**Windows (PowerShell)**
```powershell
git clone <repo-url> .adlc-toolkit
node .adlc-toolkit\scripts\adlc.mjs build --tool=codex --toolkit-path=.adlc-toolkit
New-Item -ItemType Directory -Force $HOME\.codex\prompts, $HOME\.codex\agents | Out-Null
Copy-Item -Force .adlc-toolkit\adapters\codex\prompts\*.md  $HOME\.codex\prompts\
Copy-Item -Force .adlc-toolkit\adapters\codex\agents\*.toml $HOME\.codex\agents\
Copy-Item -Force .adlc-toolkit\adapters\codex\AGENTS.md .\AGENTS.md
```

If the repo already has an `AGENTS.md`, append the ADLC block — Codex concatenates `AGENTS.md` files from root down, so it can also live in a parent directory shared across repos.

## Use it

```
codex
> /init        → creates .adlc/
> /spec         → start a REQ
> /proceed      → full gated pipeline
```

## Verify

- `/` lists the ADLC prompts (`init`, `spec`, …).
- `codex` picks up `AGENTS.md` at startup (shown in the session context).
- The agents in `~/.codex/agents/` carry `read_only = true` for every reviewer; the implementer is `false`.
- After `/init`, `.adlc/` exists.

## Notes

- **Read-only reviewers** rely on the agent TOML `read_only = true` flag. Confirm your Codex version honors it; if the schema differs, adjust `scripts/adlc.mjs build` (the `codex.agent` emitter) and regenerate. The generated TOMLs carry a header comment flagging this.
- **`/sprint`** uses Codex's parallel sub-agent support — works as designed.
- Prompts and agent instructions are pointer stubs reading `.adlc-toolkit/core/...` at runtime — keep the toolkit present at the stamped path. If you installed commands globally but vendored the toolkit per-project, use `--mode=global` with an absolute `--toolkit-path` so the path resolves regardless of which repo is open.
