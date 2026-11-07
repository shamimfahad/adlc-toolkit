# Hot Log

Append-only chronological log of significant events. One line per entry. Newest at the top.

**Committed and shared.** Only ever add entries — never rewrite or reorder old ones. Git is configured (`merge=union` via `.adlc/.gitattributes`) so that when two branches both add entries, it keeps both instead of raising a conflict — the team keeps one shared history with no merge pain. Only ever *append*; never rewrite or reorder existing lines (that defeats the union merge).

Grep-friendly format: `## [YYYY-MM-DD] kind | description` with optional metadata after.

```
## [2026-05-13] req-merged | REQ-042 added Firestore composite indexes for query path
## [2026-05-13] lesson | L-REQ-012-1 — declare composite indexes before deploy
## [2026-05-12] adr-accepted | ADR-003 chose direct SignalR client over BFF translation
## [2026-05-12] gotcha | G05 noted — Login.aspx URL-substring branching
```

## Entries

<!-- Newest entries below this line, newest first. Each entry is a level-2 heading. -->

## [2026-11-07] ship-gate-cleared | REQ-002-debrief
## [2026-11-07] req-ready-to-merge | REQ-002-debrief | /debrief skill and the flightdeck DEBRIEF view (toolkit 1.14.0, mod 0.10.0)
## [2026-11-07] lesson | L-REQ-002-1 — change a rule's code and its prose in one diff
## [2026-11-07] lesson | L-REQ-002-2 — a field only one client writes is unknown when absent
## [2026-11-07] lesson | L-REQ-002-3 — scope a protocol exception to what makes it safe; record only what the user chose
## [2026-11-07] lesson | L-REQ-002-4 — build a fallback over the probe's whole range, from the setting
## [2026-11-07] lesson | L-REQ-002-5 — keep one copy per runtime and a parity test
## [2026-11-07] lesson | L-REQ-002-6 — test an event hook through its event, not its regex
## [2026-11-07] lesson | L-REQ-002-7 — a card example in a skill must parse
## [2026-11-07] gotcha | G05–G11 — ADR header rows, sandbox tmux, hook main guard, trail ask words, mod test-kit traps, worktree tsc, core/ text ships elsewhere
## [2026-11-07] verify-gate-cleared | REQ-002-debrief | findings: C0/M0/m3 (n8, n9, m13 deferred to /wrapup)
## [2026-11-07] implement-gate-cleared | REQ-002-debrief

## [2026-11-07] architect-gate-cleared | REQ-002-debrief
## [2026-11-07] adr-accepted | ADR-003 the debrief's reader question uses a question dialog

## [2026-11-07] work-path-set | REQ-002-debrief | fast-forwarded onto REQ-001 (9fa7fc2), not yet on main

## [2026-11-07] req-ready-to-merge | REQ-001-flightdeck-compact-ring | flightdeck auto compact, context ring, agent numbers (mod 0.9.0)
## [2026-11-07] lesson | L-REQ-001-1 — a flag that holds user input needs one owner
## [2026-11-07] lesson | L-REQ-001-2 — recover a failed send in the one send function
## [2026-11-07] lesson | L-REQ-001-3 — record engine-behaviour bets where the decision lives
## [2026-11-07] lesson | L-REQ-001-4 — test helpers span every mode
## [2026-11-07] gotcha | G01 — `h` is the JSX factory in the flightdeck mod
## [2026-11-07] gotcha | G02 — model.ts must not import values from vault.ts
## [2026-11-07] gotcha | G03 — the mod test kit has no defaults you'd expect
## [2026-11-07] gotcha | G04 — type-check the mods with the bun cache's native tsc
## [2026-11-07] component | adlc-flightdeck — first captured

## [2026-11-07] work-path-set | REQ-002-debrief | worktree at .worktrees/REQ-002-debrief (off main; REQ-001 lands before implement)

## [2026-11-07] verify-gate-cleared | REQ-001-flightdeck-compact-ring | findings: C0/M1/m2 (4 review rounds)

## [2026-11-07] spec-gate-cleared | REQ-002-debrief

## [2026-11-07] implement-gate-cleared | REQ-001-flightdeck-compact-ring

## [2026-11-07] architect-gate-cleared | REQ-001-flightdeck-compact-ring

## [2026-11-07] adr-accepted | ADR-002 opt-in auto compaction after an approved gate

## [2026-11-07] work-path-set | REQ-001-flightdeck-compact-ring | branch at /Users/shamimfahad/code/adlc-toolkit

## [2026-11-07] spec-gate-cleared | REQ-001-flightdeck-compact-ring

## [2026-11-06] init-import | docs/adr-tiered-vault-loading.md → architecture/adr-001-tiered-vault-loading.md
## [2026-11-06] init-import | README.md → context/project-overview.md
## [2026-11-06] init | Vault initialized
