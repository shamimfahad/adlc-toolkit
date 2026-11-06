# Lessons

<!-- GENERATED from knowledge/lessons/ by `node $TOOLKIT_PATH/scripts/adlc.mjs lessons` — do not hand-edit (the Claude adapter refuses the write).
     Rebuilt whole by /wrapup, /task, /bugfix, /recover, /config migrate|lessons. Carries merge=union; a duplicated
     line after a parallel merge is expected and the next rebuild clears it. Edit the lesson's own file, then rebuild. -->

One line per lesson. **Grep this file; never read the folder.** Sorted: legacy `L-NNN` ascending, then `L-<WORK_ID>-<n>`.
Severity → read discipline: `critical` = always-read (injected at implementer dispatch) · `trap` = read when the path or tag matches · `guideline` / `nice-to-know` = reflector and grep only.
A line ending in `↗` has grown sections in its file. `enforced:` names the rule, sensor, or lint that now catches it — such lines are skipped by the knowledge hook and by the reflector's repeated-mistake pass.

- **L-REQ-001-1** · trap · `flightdeck, compaction, concurrency` · A flag that holds user input is set inside the worker's try, cleared in its finally, covers every stage it blocks, tracks work it gave up on, and is checked by every path that sends the same reply. — `core/extras/claude/mods/adlc-flightdeck/hooks/register.tsx:641` · REQ-001 ^L-REQ-001-1
- **L-REQ-001-2** · guideline · `flightdeck, prompt` · Put send-failure recovery (refill the prompt box, one toast) inside the single send function, never in each caller. — `core/extras/claude/mods/adlc-flightdeck/hooks/register.tsx:595` · REQ-001 ^L-REQ-001-2
- **L-REQ-001-3** · guideline · `adr, engine-api, flightdeck` · When a design rests on engine behaviour the types don't state, mark it STATUS: needs verification in the ADR and record the live check's result in the REQ before shipping the feature. — `.adlc/architecture/adr-002-opt-in-auto-compact.md`, `core/extras/claude/mods/adlc-flightdeck/hooks/register.tsx:1105` · REQ-001 ^L-REQ-001-3
- **L-REQ-001-4** · guideline · `flightdeck, tests` · Make a test helper's mode argument span every mode the code branches on; a narrower union leaves that branch shipping untested. — `core/extras/claude/mods/adlc-flightdeck/tests/flightdeck.test.tsx:746` · REQ-001 ^L-REQ-001-4
