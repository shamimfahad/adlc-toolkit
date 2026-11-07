# Scope a protocol exception to what makes it safe; record only what the user chose ^L-REQ-002-3

| Field | Value |
|---|---|
| ID | LESSON-REQ-002-3 |
| Captured | 2026-11-07 |
| REQ | REQ-002 |
| Component | core/skills, GATE-PROTOCOL |
| Tags | gate-protocol, adr, ask |
| Severity | trap |
| Lesson | Scope an exception to a protocol invariant by the condition that makes it safe (no gate marker open), not by a label; and never record a default, or a dismissed dialog, as the user's answer unless the skill says so explicitly — a recorded answer is reused. |
| Saw in | `core/skills/debrief.md:46`, `core/GATE-PROTOCOL.md` → *The trail* |
| Detectable | no |
| Enforced by | — |
| Supersedes | |
