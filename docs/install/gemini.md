# Install: Gemini CLI

Gemini CLI uses `GEMINI.md` (auto-loaded, hierarchical) as the memory file, **custom commands** in **TOML** (`.gemini/commands/*.toml`, invoked as `/name`) for slash commands, and **sub-agents** (`.gemini/agents/*.md` with YAML frontmatter, addressable with `@name`).

Adapter source: `adapters/gemini/` → `GEMINI.md`, `.gemini/commands/<name>.toml`, `.gemini/agents/<name>.md`.

> Gemini is the one tool whose commands are TOML, not Markdown. The generator handles that — the protocol text lives in the TOML `prompt = """..."""` field.

## Install — one command (recommended)

```bash
node scripts/install.mjs --tool=gemini          # add --dry-run to preview; --repo=<path> for one project
```

Global install symlinks commands into `~/.gemini/commands/`, agents into `~/.gemini/agents/`, and the memory file to `~/.gemini/GEMINI.md` — available in every repo. Symlinks track the toolkit, so `git -C <toolkit> pull` updates everything. The manual steps below are the equivalent, if you prefer to place files yourself.

## Prerequisites

- Gemini CLI installed (`gemini --version`).
- Node 18+ only if regenerating adapters.

## Manual — project-local

**macOS / Linux**
```bash
git clone <repo-url> .adlc-toolkit
node .adlc-toolkit/scripts/build.mjs --tool=gemini --toolkit-path=.adlc-toolkit   # only if path differs
cp -R .adlc-toolkit/adapters/gemini/.gemini ./.gemini
cp    .adlc-toolkit/adapters/gemini/GEMINI.md ./GEMINI.md
```

**Windows (PowerShell)**
```powershell
git clone <repo-url> .adlc-toolkit
node .adlc-toolkit\scripts\build.mjs --tool=gemini --toolkit-path=.adlc-toolkit
Copy-Item -Recurse -Force .adlc-toolkit\adapters\gemini\.gemini .\.gemini
Copy-Item -Force .adlc-toolkit\adapters\gemini\GEMINI.md .\GEMINI.md
```

If the repo already has `.gemini/` or `GEMINI.md`, copy the contents / merge the block.

## Manual — global (all repos)

```bash
git clone <repo-url> ~/code/adlc-toolkit
node ~/code/adlc-toolkit/scripts/build.mjs --tool=gemini --mode=global --toolkit-path="$HOME/code/adlc-toolkit"
mkdir -p ~/.gemini/commands ~/.gemini/agents
cp ~/code/adlc-toolkit/adapters/gemini/.gemini/commands/*.toml ~/.gemini/commands/
cp ~/code/adlc-toolkit/adapters/gemini/.gemini/agents/*.md     ~/.gemini/agents/
cp ~/code/adlc-toolkit/adapters/gemini/GEMINI.md ~/.gemini/GEMINI.md
```

(Windows: same paths under `$HOME\.gemini\`, using `Copy-Item`.)

## Use it

```
gemini
> /commands reload     # if you added commands while the CLI was running
> /init                 → creates .adlc/
> /spec                 → start a REQ
> /proceed              → full gated pipeline
```

Direct a single role with `@`, e.g. `@correctness-reviewer review the diff`.

## Verify

- `/help` lists the ADLC commands; run `/commands reload` if they don't appear.
- `gemini` loads `GEMINI.md` at startup (shown in context).
- After `/init`, `.adlc/` exists.

## Notes

- **Read-only is advisory on Gemini** — the agent stub instructs the model not to edit, but it isn't blocked at the tool layer. Review the diff after a review pass. (See [fidelity matrix](../fidelity-matrix.md).)
- **`/sprint`** uses Gemini's sub-agents and works as designed.
- Commands carry `{{args}}`, so `/spec add OAuth login` passes your text through to the protocol.
- Command/agent files are pointer stubs reading `.adlc-toolkit/core/...` at runtime — keep the toolkit present at the stamped path.
