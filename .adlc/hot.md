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

## [2026-11-06] init-import | docs/adr-tiered-vault-loading.md → architecture/adr-001-tiered-vault-loading.md
## [2026-11-06] init-import | README.md → context/project-overview.md
## [2026-11-06] init | Vault initialized
