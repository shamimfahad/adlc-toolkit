# Installation

Everything about getting the toolkit onto a machine, keeping it current, and regenerating adapters. For a guided first run, start with the [quickstart](../quickstart.md); for tool-specific caveats, see the per-tool guides in this folder: [Claude Code](claude.md) · [Cursor](cursor.md) · [GitHub Copilot](copilot.md) · [OpenAI Codex](codex.md) · [Gemini CLI](gemini.md).

## Install

**One command does install _and_ update**, global by default — the pipeline becomes available in every repo you open:

```bash
git clone https://github.com/shamimfahad/adlc-toolkit.git ~/code/adlc-toolkit
cd ~/code/adlc-toolkit
node scripts/adlc.mjs sync --tool=copilot     # or claude · codex · gemini · cursor · all
```

`sync` regenerates the adapter for your tool and symlinks it into that tool's user-level config (`~/.copilot/`, `~/.claude/`, `~/.codex/`, `~/.gemini/`, …). Add `--dry-run` to preview, or `--repo=/path/to/project` to install into a single project instead.

Under the hood it builds machine-specific stubs (absolute toolkit path) into the gitignored `dist/` and links from there, so the committed `adapters/` stays portable.

> The old `node scripts/install.mjs …` command still works — it's now a thin alias for `adlc.mjs sync`.

## Updating

Run the **same command** again — `sync` is safe to run again and again — each run just brings your install up to date:

```bash
node scripts/adlc.mjs sync --tool=all --pull    # git pull the toolkit, then reconcile every install
```

Re-running updates your install to match what the toolkit currently ships: **new skills/agents get linked, removed ones get pruned, and renamed ones are cleaned up** — while anything _you_ added to `~/.claude/skills` (etc.) is left untouched. Content edits flow through automatically because every stub is a thin pointer into `core/`. There is no separate "update" step to remember and no orphaned commands left behind when the skill set changes.

## Or let your AI assistant install it

Open this repo in your AI coding assistant (Claude Code, Copilot, Cursor, Codex, or Gemini CLI) and paste this prompt — it figures out the rest:

```text
You are helping me install this repo (the ADLC toolkit) into my AI coding assistant.

1. Identify which assistant you are and map it to one of: claude, copilot, codex, gemini, cursor.
2. Read docs/install/README.md and docs/install/<that-tool>.md in this repo so you know the
   exact locations and caveats.
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
- `--mode=vendored|global` — only sets the _default_ for `--toolkit-path` (relative vs. the toolkit's own absolute path). An explicit `--toolkit-path` always wins.
- `--out=<dir>` — where to write the stubs. Defaults to `adapters/`; the installer overrides this to `dist/`.

The committed `adapters/` are built vendored (relative `.adlc-toolkit`) so they stay portable across machines — **don't commit absolute paths.** For a global install, let `adlc.mjs sync` build into `dist/` instead. Change the protocol once in `core/`, regenerate, and every tool's adapter updates together.

## Keeping `adapters/` in sync automatically

Run `node scripts/adlc.mjs hooks` once. It activates a version-controlled pre-commit hook (`scripts/hooks/pre-commit`, via `core.hooksPath`) that rebuilds `adapters/` and stages it whenever a commit touches `core/`, `local/`, or the generator — so the committed snapshot never drifts from the protocol source. Bypass a single commit with `git commit --no-verify`; disable with `git config --unset core.hooksPath`.
