---
name: status
description: Read-only overview of all active work — REQs in flight, current phases, gate states, blockers, recent activity from hot.md. Use to orient at session start or to triage when /sprint has multiple REQs in flight.
---

You are surfacing the current state of work in the vault. Read-only, no gates, no side effects.

## When to use

- Start of a new session — orient on what's in flight
- Mid-session — quick "where are we" check
- Sprint mode — see all active REQs at a glance
- Before deciding what to work on next

## Steps

### 1. Read the navigation files

- `.adlc/now.md` — active focus marker (manually edited; not always current)
- `.adlc/hot.md` — last 20 entries (the real source of recent activity)
- `.adlc/index.md` — overall vault catalog (for context, not status)

### 2. Walk active REQs

For each REQ folder under `.adlc/specs/`:

- Read `pipeline-state.json` if it exists
- Skip REQs where `prState == "merged"` and `mergedAt` is more than 7 days old (they're done)
- For each remaining REQ, collect:
  - REQ ID and title
  - Current phase
  - Gate state (`awaiting` vs `cleared`)
  - Isolation mode (`branch` or `worktree`)
  - Work path (verify it exists; flag if missing)
  - In `worktree` mode also verify the worktree is registered with git; in `branch` mode verify the branch ref still exists
  - Branch
  - Blockers list (`pipeline-state.blockers`)
  - Files changed (run `git -C <workPath> diff --name-only <base>..<branch>` if past Phase 3)
  - Findings counts (if past Phase 4)

### 3. Walk active bugs

Same as REQs but under `.adlc/bugs/`.

### 4. Walk recent audits

For `.adlc/audits/`, find audits from the last 30 days. Note any unaddressed Critical findings.

### 5. Compile and emit

Output a structured status report in chat:

```
ADLC Status — YYYY-MM-DD HH:MM

Active focus (from now.md):
  > <focus line from now.md>

Active REQs:
  REQ-NNN-<slug> | phase: <phase> | gate: <awaiting/cleared> | branch: <branch> | isolation: <mode>
    Work path: <path> [✓ exists / ⚠ missing]
    Files changed: <count>
    Findings: C<critical>/M<major>/m<minor> (if past Phase 4)
    Blockers: <none / list>

Active bugs:
  BUG-NNN-<slug> | phase: <phase> | gate: <state> | <one-line summary>

Recent activity (last 5 entries from hot.md):
  YYYY-MM-DD <kind> | <description>
  YYYY-MM-DD <kind> | <description>
  ...

Recent audits:
  YYYY-MM-DD health  — <count> findings (C<N>/M<N>/m<N>)
  YYYY-MM-DD perf    — <count> findings (C<N>/M<N>/m<N>)
  Unaddressed criticals: <list of finding IDs across audits>

Suggested next actions:
  - Gate to clear: <REQ at awaiting> → /proceed REQ-NNN-<slug>
  - Gate to clear, last activity > 24h ago: → /proceed REQ-NNN-<slug> --resume (gets you a decision dossier with drift checks before continuing)
  - Want to walk back the most recent phase: → /proceed REQ-NNN-<slug> --revert~1
  - Want to abandon a REQ deliberately: → /proceed REQ-NNN-<slug> --cancel
  - New work: ready to start (no gates pending)
  - Blockers: <list with one-line context>
  - Drift suspected: <count> REQ(s) where pipeline-state may not match git reality → /recover
```

If a REQ's work path is missing — or, in `worktree` mode, the worktree isn't registered with git; or, in `branch` mode, the branch ref is gone — but the REQ isn't marked complete, surface that explicitly. It's an inconsistency the user should know about.

## Constraints

- **Read-only.** Don't update `now.md`, don't update `hot.md`, don't fix inconsistencies — just surface them.
- **Don't dispatch agents.** This skill is fast and synchronous.
- **Be honest about staleness.** `now.md` is manually edited; if it disagrees with `pipeline-state.json` files, surface both and call out the divergence.
- **Don't over-report.** If there's nothing in flight, say so in one line. The output should be useful, not a wall of text.

## Output

No files written. Status report in chat only.
