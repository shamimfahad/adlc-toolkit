# A card example in a skill must parse ^L-REQ-002-7

| Field | Value |
|---|---|
| ID | LESSON-REQ-002-7 |
| Captured | 2026-11-07 |
| REQ | REQ-002 |
| Component | core/skills, adlc-flightdeck |
| Tags | skills, gate-card, flightdeck |
| Severity | guideline |
| Lesson | A gate-card example in a skill must follow the cockpit parser's rules (two spaces after every label), because the assistant copies the example. |
| Saw in | `core/skills/wrapup.md` step 8 example, `core/extras/claude/mods/adlc-flightdeck/hooks/model.ts:299` |
| Detectable | test |
| Enforced by | parseGateCard ship-card test in `flightdeck.test.tsx` |
| Supersedes | |
