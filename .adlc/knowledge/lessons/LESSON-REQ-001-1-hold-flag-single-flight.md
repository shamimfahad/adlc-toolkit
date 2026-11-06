# A flag that holds user input needs one owner ^L-REQ-001-1

| Field | Value |
|---|---|
| ID | LESSON-REQ-001-1 |
| Captured | 2026-11-07 |
| REQ | REQ-001 |
| Component | adlc-flightdeck |
| Tags | flightdeck, compaction, concurrency |
| Severity | trap |
| Lesson | A flag that holds user input is set inside the worker's try, cleared in its finally, covers every stage it blocks, tracks work it gave up on, and is checked by every path that sends the same reply. |
| Saw in | `core/extras/claude/mods/adlc-flightdeck/hooks/register.tsx:641` |
| Detectable | no |
| Enforced by | — |
| Supersedes | |
