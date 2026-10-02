# Claude Code extras — statusline, gate notifications, vault budgets, vault knowledge

Four optional scripts for Claude Code users. None touches the pipeline's
protocol: skip them and nothing changes. All read your `.adlc/` folder and stay
silent when there is nothing to say.

## What you get

- **Statusline** — a persistent line at the bottom of your terminal:
  `ADLC REQ-014-payment-retries · phase 3 (implement) · GATE WAITING`.
  Your pipeline state stops living only in scrollback. Costs zero tokens.
- **Gate notification** — a desktop toast when the pipeline pauses at a gate,
  so you can look away during long phases: `ADLC gate ready: REQ-014 (review)`.
- **Vault budgets** — the vault's size budgets become refusals instead of
  `/analyze` findings. A write that leaves `now.md` over 1KB is bounced back
  with the fix; a `Read` of a generated file the review packet excludes is
  denied; a reviewer whose `review-log.md` section passes 12KB is told to trim
  before it stops; every session starts with a one-line budget strip. This is
  the only mechanism in the toolkit that makes a budget a guarantee — the skills
  say the same things in prose, and prose drifted for two months on a measured
  vault (`now.md` at 68KB, `hot.md` at 3,800 lines).

- **Vault knowledge** (`adlc-knowledge.mjs`, 1.9.1) — the relevant lines of
  `knowledge/lessons.md` and `gotchas.md` arrive on their own the first time a
  session touches a directory they are about, once, capped (8 lines / 3KB,
  worst severity first), instead of depending on an agent remembering to grep;
  the path-scoped convention for a brand-new file is injected on the first
  write (a file that does not exist yet is never read, so the native rule
  cannot fire); every `task-implementer` / `pipeline-runner` dispatch opens with
  the `critical` lessons; after a compaction the session is handed a recomputed
  working-state snapshot (active REQ, phase, gate marker, `git status`, the
  `verify:` commands) instead of a paraphrase; a hand edit to a `<!-- GENERATED`
  file (`lessons.md`, `index.md`, `decisions.md`, `.claude/rules/adlc-*.md`)
  is refused with the regenerate command; and two advisories from the audit's
  failed-tool-call analysis — a search piped through `head`/`tail`/`-m` is not
  evidence of absence (once per session), and the same shell command failing
  twice unchanged gets the four Windows/bash rules instead of a third try.
  Entries carrying `enforced:` are skipped — a sensor owns them.

## Setup

**The short version — per repo, per developer:**

```
node <toolkit>/scripts/adlc.mjs settings --repo <path-to-repo>     # add --dry-run to preview
```

writes all four into `<repo>/.claude/settings.local.json` — your own project-scoped settings, gitignored (the vault's `.gitignore` block lists it). Hooks there fire **only in that repo**, so the rest of the Claude Code sessions on the machine, and your global `~/.claude/settings.json` with whatever hooks and statusline you keep there, are untouched. `/init` offers this at the end and `/config migrate` offers it for an existing vault; `sync` never does — installing the toolkit is a machine-level act, wiring hooks is a per-repo decision that belongs with the vault. It is a merge keyed on the script names: adds what is missing, repoints entries when the toolkit moves, removes an entry for a script the toolkit no longer ships, never touches a hook or statusline that is yours; a one-time `settings.local.json.adlc-backup` is written first; re-running is a no-op. `--no-statusline` leaves `statusLine` alone.

If you really do want the extras in every session on the machine — one person, every repo an ADLC repo — `node scripts/adlc.mjs settings --global` writes the same merge into `~/.claude/settings.json`. The scripts stay silent outside a vault, but they still spawn per tool call; that is why it is opt-in and why a global `sync` never does it.

The snippets below are what it writes, if you prefer to edit by hand.

All of these live in a Claude Code settings file — `<repo>/.claude/settings.local.json`
for one repo and one developer (recommended), or `~/.claude/settings.json` for
every session on the machine. Replace `<toolkit>` with the toolkit's absolute
path (the same path your installed skills point at); the `settings` command
writes `<toolkit>/core/extras/claude/…` with forward slashes, which node accepts
on Windows too.

**Statusline:**

```json
{
  "statusLine": {
    "type": "command",
    "command": "node <toolkit>/adapters/claude/extras/statusline/adlc-statusline.mjs"
  }
}
```

**Gate notification** (fires on Claude Code's `Notification` event — when
Claude pauses for input — and checks whether an ADLC gate is what's waiting):

```json
{
  "hooks": {
    "Notification": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node <toolkit>/adapters/claude/extras/hooks/adlc-notify.mjs"
          }
        ]
      }
    ]
  }
}
```

**Vault budgets** (four events, one script — each case is a no-op unless its
event matches):

```json
{
  "hooks": {
    "SessionStart": [
      { "hooks": [ { "type": "command", "command": "node <toolkit>/adapters/claude/extras/hooks/adlc-budget.mjs" } ] }
    ],
    "PreToolUse": [
      { "matcher": "Read",
        "hooks": [ { "type": "command", "command": "node <toolkit>/adapters/claude/extras/hooks/adlc-budget.mjs" } ] }
    ],
    "PostToolUse": [
      { "matcher": "Write|Edit|MultiEdit",
        "hooks": [ { "type": "command", "command": "node <toolkit>/adapters/claude/extras/hooks/adlc-budget.mjs" } ] }
    ],
    "SubagentStop": [
      { "hooks": [ { "type": "command", "command": "node <toolkit>/adapters/claude/extras/hooks/adlc-budget.mjs" } ] }
    ]
  }
}
```

**Vault knowledge** (five events, one script — each case is a no-op unless its event matches; hooks in `settings.json` also fire inside sub-agents, which is what puts the lessons in front of the implementer):

```json
{
  "hooks": {
    "PreToolUse": [
      { "matcher": "Read|Edit|Write|MultiEdit",
        "hooks": [ { "type": "command", "command": "node <toolkit>/adapters/claude/extras/hooks/adlc-knowledge.mjs" } ] }
    ],
    "SubagentStart": [
      { "matcher": "task-implementer|pipeline-runner",
        "hooks": [ { "type": "command", "command": "node <toolkit>/adapters/claude/extras/hooks/adlc-knowledge.mjs" } ] }
    ],
    "SessionStart": [
      { "matcher": "compact",
        "hooks": [ { "type": "command", "command": "node <toolkit>/adapters/claude/extras/hooks/adlc-knowledge.mjs" } ] }
    ],
    "PostToolUse": [
      { "matcher": "Bash",
        "hooks": [ { "type": "command", "command": "node <toolkit>/adapters/claude/extras/hooks/adlc-knowledge.mjs" } ] }
    ],
    "PostToolUseFailure": [
      { "matcher": "Bash",
        "hooks": [ { "type": "command", "command": "node <toolkit>/adapters/claude/extras/hooks/adlc-knowledge.mjs" } ] }
    ]
  }
}
```

A `PreToolUse` matcher that already lists `Read` for the budget hook can carry both commands in its `hooks` array; order does not matter — the budget hook denies, the knowledge hook informs. What it does per event:

| Event | Trigger | Does |
|---|---|---|
| PreToolUse | Read/Edit/Write of a source file (not `.adlc/`, not `.claude/`, not docs/json/images) | Inject matching `lessons.md` / `gotchas.md` lines — same directory or an ancestor within 2 levels, or a tag that is a path segment — once per session per directory; ≤8 lines, ≤3KB, landmine/critical → trap → careful/guideline → trivia; skips `enforced:` and superseded. On a **Write to a file that does not exist**, also inject the body of the matching `.claude/rules/adlc-*.md`, once per rule per session |
| PreToolUse | Write/Edit of a file whose first 600 bytes carry `<!-- GENERATED` | **deny** (exit 2) with the regenerate command from the marker |
| SubagentStart | `task-implementer`, `pipeline-runner` | Inject every `critical` lesson line (≤10) — always-read |
| SessionStart | `source: compact` | Inject the recomputed snapshot: newest non-terminal `pipeline-state.json` (phase, gate, branch), `.awaiting-approval` present?, `git status --porcelain` (30 lines), last 5 commits, the `verify:` run lines from `config.yml`, and a "preserve verbatim" reminder |
| PostToolUse | Bash with `grep`/`rg`/`find`/`Select-String`… piped to `head`/`tail` or `-m N` | Advisory, once per session: truncated output is not evidence of absence |
| PostToolUseFailure | Bash, identical command text failed before in this session | Advisory, once per command: quote paths, no heredocs, script to a file, change something before retrying |

State lives in `os.tmpdir()/adlc-knowledge/<session-id>` (one line per thing already shown), so a long session is never told the same thing twice and a new session starts clean. Everything is emitted as `additionalContext` JSON on stdout **and** as text on stderr — a hook that only writes stderr never reaches the model. Test any case by piping a fake event (the file's footer shows one).

**Vault budgets** — what it enforces, and what it only warns about:

| Event | File | Budget | Action |
|---|---|---|---|
| PostToolUse | `now.md` | 1KB | **block** (exit 2) — move narrative to `sprints/` or the REQ folder |
| PostToolUse | `CLAUDE.md` | 5KB | **block** |
| PostToolUse | a record — `specs/**/REQ-*.md`, `bugs/**/BUG-*.md` (the file beside the folder) | 6KB | **block** — IDs and links, not copies |
| PostToolUse | `context/*.md` (not `*-rationale.md`) | 8KB | **block** — `/config budgets` splits rulebook from rationale |
| PostToolUse | `hot.md` | 500 lines | warn — `/wrapup` rotates |
| PostToolUse | any `verification.md` | 8KB | warn — narrative belongs in `review-log.md` |
| PreToolUse | files matching `config.yml → review.packet.exclude` | — | **deny** the Read |
| PreToolUse | `hot.md` without a `limit` | — | **deny** — read the top N, never the whole file |
| SubagentStop | a `review-log.md` section touched in the last 15 min | 12KB | **block** the stop until trimmed |
| SessionStart | all of the above | — | one-line strip, `⚠` on anything over |

Budgets are hard-coded to the vault README's table; if you change one there,
change it here. The hook parses `review.packet.exclude` from `config.yml`
itself (no YAML library) — keep that block in the template's shape: `review:` →
`packet:` → `exclude:` → `- "glob"`.

The toast uses the OSC 9 terminal sequence — supported by Windows Terminal,
iTerm2, WezTerm, Ghostty, and others. If your terminal ignores it, the hook
just does nothing. Hook and statusline schemas evolve; if something doesn't
take, check the current Claude Code docs for `statusline` and `hooks` and
adjust the snippet — the scripts themselves only read stdin JSON and print.

## Notes

- Other tools (Cursor, Copilot, Codex, Gemini) have no equivalent hook
  surface — these extras are Claude-only, and the pipeline works the same
  without them.
- All four scripts fail silent by design: a broken statusline is worse than no
  statusline, and a budget hook that crashes must never block a write it
  couldn't measure.
- They are regenerated into `adapters/claude/extras/` by the build from
  `core/extras/claude/` — edit them there (or override via `local/`).
