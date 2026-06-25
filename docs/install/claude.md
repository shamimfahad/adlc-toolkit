# Install: Claude Code

Claude Code calls commands **skills** (`SKILL.md` in a folder per command) and supports first-class **sub-agents** with per-agent model and tool restrictions. This is the highest-fidelity target — read-only reviewers are enforced by the tool.

Adapter source: `adapters/claude/` → `skills/<name>/SKILL.md`, `agents/<name>.md`, `CLAUDE.md`.

## Install — one command (recommended)

```bash
node scripts/adlc.mjs sync --tool=claude          # add --dry-run to preview; --repo=<path> for one project
```

Global install symlinks `~/.claude/skills`, `~/.claude/agents`, and `~/.claude/CLAUDE.md` to the toolkit, so every repo gets the pipeline and `git -C <toolkit> pull` updates all of them. The manual Options below are the equivalent, if you'd rather place files yourself.

## Prerequisites

- Claude Code installed (`claude --version`).
- Node 18+ only if you need to regenerate adapters (`node scripts/adlc.mjs build`).

## Manual — project-local (good for teams)

The pipeline travels with the repo. Run from your project root.

**macOS / Linux**
```bash
# 1. Vendor the toolkit into the project
git clone <repo-url> .adlc-toolkit

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
git clone <repo-url> .adlc-toolkit
node .adlc-toolkit\scripts\adlc.mjs build --tool=claude --toolkit-path=.adlc-toolkit
New-Item -ItemType Directory -Force .claude | Out-Null
Copy-Item -Recurse -Force .adlc-toolkit\adapters\claude\skills .claude\skills
Copy-Item -Recurse -Force .adlc-toolkit\adapters\claude\agents .claude\agents
Copy-Item -Force .adlc-toolkit\adapters\claude\CLAUDE.md .\CLAUDE.md
```

## Manual — global (all repos)

What the one-command installer does, by hand: install once into `~/.claude`, available in every project. Symlink so `git pull` on the toolkit updates everything.

**macOS / Linux**
```bash
git clone <repo-url> ~/code/adlc-toolkit
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
git clone <repo-url> $HOME\code\adlc-toolkit
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
- During `/review`, the reviewer sub-agents run with `tools: Read, Grep, Glob, Bash` only — they cannot edit. Confirm with `git status` after a review pass (should be clean).

## Notes

- The skill `SKILL.md` files are **pointer stubs**: each reads `.adlc-toolkit/core/skills/<name>.md` (or your global path) at runtime. Keep the toolkit present at the stamped path.
- `CLAUDE.md` is the project memory file. If your repo already has one, merge the ADLC block rather than overwriting.
- Per-agent models come from `core/manifest.json` → `tierToModel.claude`. Override in `.adlc/config.yml`.
