# Install: Claude Code

Claude Code calls commands **skills** (`SKILL.md` in a folder per command) and supports first-class **sub-agents** with per-agent model and tool restrictions. Claude Code supports everything the toolkit does — isolated sub-agents, each on its own model tier. (Read-only reviewers are enforced by instruction, not the tool sandbox: they carry Write only to author their own findings — see the fidelity matrix.)

Adapter source: `adapters/claude/` → `skills/<name>/SKILL.md`, `agents/<name>.md`, `CLAUDE.md`.

## Install — one command (recommended)

```bash
node scripts/adlc.mjs sync --tool=claude          # add --dry-run to preview; --repo=<path> for one project
```

Global install symlinks `~/.claude/skills`, `~/.claude/agents`, and `~/.claude/CLAUDE.md` to the toolkit, so every repo gets the pipeline. To update, re-run the install — `node scripts/adlc.mjs sync --tool=claude --pull` pulls the toolkit and reconciles in one step (content flows through the symlinks automatically; added skills get linked, removed ones pruned). Or run `/toolkit-update` from inside Claude Code. The manual Options below are the equivalent, if you'd rather place files yourself.

## Prerequisites

- Claude Code installed (`claude --version`).
- Node 18+ only if you need to regenerate adapters (`node scripts/adlc.mjs build`).

## Manual — project-local (good for teams)

The pipeline travels with the repo. Run from your project root.

**macOS / Linux**
```bash
# 1. Vendor the toolkit into the project
git clone https://github.com/shamimfahad/adlc-toolkit.git .adlc-toolkit

# 2. (only if your path differs from the default) regenerate
node .adlc-toolkit/scripts/adlc.mjs build --tool=claude --toolkit-path=.adlc-toolkit

# 3. Install the adapter into the project
mkdir -p .claude
cp -R .adlc-toolkit/adapters/claude/skills .claude/skills
cp -R .adlc-toolkit/adapters/claude/agents .claude/agents
cp    .adlc-toolkit/adapters/claude/CLAUDE.md ./CLAUDE.md
```

**Windows (PowerShell)**
```powershell
git clone https://github.com/shamimfahad/adlc-toolkit.git .adlc-toolkit
node .adlc-toolkit\scripts\adlc.mjs build --tool=claude --toolkit-path=.adlc-toolkit
New-Item -ItemType Directory -Force .claude | Out-Null
Copy-Item -Recurse -Force .adlc-toolkit\adapters\claude\skills .claude\skills
Copy-Item -Recurse -Force .adlc-toolkit\adapters\claude\agents .claude\agents
Copy-Item -Force .adlc-toolkit\adapters\claude\CLAUDE.md .\CLAUDE.md
```

## Manual — global (all repos)

What the one-command installer does, by hand: install once into `~/.claude`, available in every project. Symlinks mean a `git pull` on the toolkit updates skill *content* automatically; re-run `sync` after a pull to also link any newly added skills and prune removed ones.

**macOS / Linux**
```bash
git clone https://github.com/shamimfahad/adlc-toolkit.git ~/code/adlc-toolkit
cd ~/code/adlc-toolkit
node scripts/adlc.mjs build --tool=claude --mode=global --toolkit-path="$HOME/code/adlc-toolkit"

# back up anything existing, then symlink
[ -e ~/.claude/skills ] && mv ~/.claude/skills ~/.claude/skills.bak
[ -e ~/.claude/agents ] && mv ~/.claude/agents ~/.claude/agents.bak
ln -s "$PWD/adapters/claude/skills" ~/.claude/skills
ln -s "$PWD/adapters/claude/agents" ~/.claude/agents
```

**Windows (PowerShell, Developer Mode or admin)**
```powershell
git clone https://github.com/shamimfahad/adlc-toolkit.git $HOME\code\adlc-toolkit
cd $HOME\code\adlc-toolkit
node scripts\adlc.mjs build --tool=claude --mode=global --toolkit-path="$HOME/code/adlc-toolkit"
cmd /c mklink /D "$HOME\.claude\skills" "$PWD\adapters\claude\skills"
cmd /c mklink /D "$HOME\.claude\agents" "$PWD\adapters\claude\agents"
```

In global mode the stubs hold an absolute toolkit path, so `core/` resolves from any working directory. (Use forward slashes in `--toolkit-path` on Windows; they work and avoid escaping.)

## Use it

```
claude
> /init          # in a project repo — creates .adlc/
> /spec           # start your first REQ
> /proceed        # or run the whole gated pipeline
```

## Verify

- `/help` (or the command picker) lists `init`, `spec`, `architect`, … `recover`.
- After `/init`, `.adlc/` exists with `context/`, `knowledge/`, `specs/`, `config.yml`.
- During `/review`, the reviewer sub-agents are read-only on your code: they may write only their findings into `.adlc/` (e.g. `review-log.md`, `lesson-candidates.md`), never source files. After a review pass, `git status` should show only `.adlc/` changes — never edits to your source or repo files.

## Notes

- The skill `SKILL.md` files are **pointer stubs**: each reads `.adlc-toolkit/core/skills/<name>.md` (or your global path) at runtime. Keep the toolkit present at the stamped path.
- `CLAUDE.md` is the project memory file. If your repo already has one, merge the ADLC block rather than overwriting.
- Per-agent models come from `core/manifest.json` → `tierToModel.claude`. Override in `.adlc/config.yml`.

## Optional: statusline, gate notifications, vault budgets

Three Claude-only extras. Two make the pipeline visible without reading scrollback: a **statusline** showing the active REQ, phase, and whether a gate is waiting, and a **desktop notification** when the pipeline pauses at a gate. The third, **vault budgets**, is the one worth wiring on day one: it turns the vault's size budgets into refusals (an over-budget `now.md` write is bounced back with the fix; a `Read` of generated code the review packet excludes is denied; a reviewer section over 12KB blocks the reviewer's stop until trimmed) and prints a budget strip at session start. Setup is three `settings.json` snippets — see [`adapters/claude/extras/README.md`](../../adapters/claude/extras/README.md). The pipeline works the same without them.
