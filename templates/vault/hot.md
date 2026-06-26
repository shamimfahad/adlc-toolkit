# Hot Log

Append-only chronological log of significant events. One line per entry. Newest at the top.

**Committed and shared.** This file carries `merge=union` (via `.adlc/.gitattributes`), so when two branches each append entries, git combines both sets instead of raising a conflict — the team keeps one shared history with no merge pain. Only ever *append*; never rewrite or reorder existing lines (that defeats the union merge).

Grep-friendly format: `## [YYYY-MM-DD] kind | description` with optional metadata after.

```
## [2026-05-13] req-merged | REQ-042 added Firestore composite indexes for query path
## [2026-05-13] lesson | L007 captured — declare composite indexes before deploy
## [2026-05-12] adr-accepted | ADR-003 chose direct SignalR client over BFF translation
## [2026-05-12] gotcha | G05 noted — Login.aspx URL-substring branching
```

## Entries

<!-- Newest entries below this line, newest first. Each entry is a level-2 heading. -->
