# A field only one client writes is unknown when absent ^L-REQ-002-2

| Field | Value |
|---|---|
| ID | LESSON-REQ-002-2 |
| Captured | 2026-11-07 |
| REQ | REQ-002 |
| Component | adlc-trail |
| Tags | trail, reader-rule |
| Severity | trap |
| Lesson | A rule built on a field only one client writes (the cockpit's `viewed`) treats its absence as unknown, never as the bad case. |
| Saw in | `core/extras/claude/hooks/adlc-trail.mjs:432` |
| Detectable | no |
| Enforced by | — |
| Supersedes | |
