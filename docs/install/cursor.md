# Install: Cursor

Cursor uses **slash commands** (`.cursor/commands/*.md`) and **rules** (`.cursor/rules/*.mdc`) as the auto-loaded memory file. Cursor has **no isolated sub-agents**, so the ADLC reviewer/explorer/implementer roles run sequentially inside the main session. Read-only is advisory on Cursor — see [fidelity matrix](../fidelity-matrix.md).

Adapter source: `adapters/cursor/.cursor/` → `commands/<name>.md`, `commands/adlc-agent-<name>.md`, `rules/adlc.mdc`.

## Prerequisites

- Cursor installed. Custom commands are read from `.cursor/commands/` in the project (and `~/.cursor/commands/` globally).
- Node 18+ only if regenerating adapters.

## Option A — Project-local (recommended)

Cursor auto-discovers `.cursor/` in the open project. Just drop the folder in.

**macOS / Linux**
```bash
git clone <repo-url> .adlc-toolkit
node .adlc-toolkit/scripts/build.mjs --tool=cursor --toolkit-path=.adlc-toolkit   # only if path differs
cp -R .adlc-toolkit/adapters/cursor/.cursor ./.cursor
```

**Windows (PowerShell)**
```powershell
git clone <repo-url> .adlc-toolkit
node .adlc-toolkit\scripts\build.mjs --tool=cursor --toolkit-path=.adlc-toolkit
Copy-Item -Recurse -Force .adlc-toolkit\adapters\cursor\.cursor .\.cursor
```

If the project already has a `.cursor/` folder, copy the *contents* of `commands/` and `rules/` in rather than replacing the directory.

## Option B — Global (solo, all repos)

Put the commands in your user-level Cursor folder so they appear in every project. Rules remain project-scoped in Cursor, so the ADLC memory rule is best kept per-project.

**macOS / Linux**
```bash
git clone <repo-url> ~/code/adlc-toolkit
node ~/code/adlc-toolkit/scripts/build.mjs --tool=cursor --mode=global --toolkit-path="$HOME/code/adlc-toolkit"
mkdir -p ~/.cursor/commands
cp ~/code/adlc-toolkit/adapters/cursor/.cursor/commands/*.md ~/.cursor/commands/
```

**Windows (PowerShell)**
```powershell
git clone <repo-url> $HOME\code\adlc-toolkit
node $HOME\code\adlc-toolkit\scripts\build.mjs --tool=cursor --mode=global --toolkit-path="$HOME/code/adlc-toolkit"
New-Item -ItemType Directory -Force $HOME\.cursor\commands | Out-Null
Copy-Item -Force $HOME\code\adlc-toolkit\adapters\cursor\.cursor\commands\*.md $HOME\.cursor\commands\
```

Still copy `rules/adlc.mdc` into each project's `.cursor/rules/` so the pipeline conventions auto-load.

## Use it

In Cursor's chat/agent input, type `/` and pick a command:

```
/init        → creates .adlc/
/spec        → start a REQ
/proceed     → full gated pipeline
```

The `/adlc-agent-*` commands let you run a single role (e.g. a correctness review) on demand.

## Verify

- Typing `/` lists `init`, `spec`, `architect`, … and the `adlc-agent-*` helpers.
- `.cursor/rules/adlc.mdc` shows in Settings → Rules as always-applied.
- After `/init`, `.adlc/` exists.

## Notes

- **Read-only is advisory here.** During `/review`, the model is instructed not to edit, but Cursor won't block it. Review the diff after a review pass to confirm nothing changed.
- **`/sprint` runs sequentially** on Cursor (no parallel sub-agents). `/proceed` works fully.
- Commands are pointer stubs that read `.adlc-toolkit/core/skills/<name>.md` at runtime — keep the toolkit present at the stamped path.
