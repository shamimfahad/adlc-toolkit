# Build a fallback over the probe's whole range, from the setting ^L-REQ-002-4

| Field | Value |
|---|---|
| ID | LESSON-REQ-002-4 |
| Captured | 2026-11-07 |
| REQ | REQ-002 |
| Component | adlc-flightdeck |
| Tags | flightdeck, probes, layout |
| Severity | guideline |
| Lesson | When a probe verdict names a fallback for a width range, implement it over that whole range, and build every threshold shown to the user from the setting (`narrowAt`, `foldAt`), never a literal. |
| Saw in | `core/extras/claude/mods/adlc-flightdeck/hooks/register.tsx` (`foldAt`), `docs/plans/probes/results-pin.md` |
| Detectable | grep — no literal `84+ cols` or `< 84` in register.tsx user strings |
| Enforced by | — |
| Supersedes | |
