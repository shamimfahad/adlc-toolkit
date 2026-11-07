# Keep one copy per runtime and a parity test ^L-REQ-002-5

| Field | Value |
|---|---|
| ID | LESSON-REQ-002-5 |
| Captured | 2026-11-07 |
| REQ | REQ-002 |
| Component | adlc-trail, adlc-flightdeck |
| Tags | trail, flightdeck, tests |
| Severity | guideline |
| Lesson | A word list that a .mjs hook and a bundled mod both filter on lives once per side, and a node test reads both as text and fails on drift or on a hand-rolled filter. |
| Saw in | `tests/hooks/ask-list-parity.test.mjs:15` |
| Detectable | test |
| Enforced by | `tests/hooks/ask-list-parity.test.mjs` |
| Supersedes | |
