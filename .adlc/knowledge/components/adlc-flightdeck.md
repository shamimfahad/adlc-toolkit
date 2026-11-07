# adlc-flightdeck — the cockpit mod

| Field | Value |
|---|---|
| Path | `core/extras/claude/mods/adlc-flightdeck/` (mirrored to `adapters/claude/extras/mods/`) |
| Kind | Claude Code mod (plugin hooks + the above-prompt band UI) |
| Version | 0.10.0 (REQ-002) |
| Tests | `claude plugin test .` in the mod folder — 150 as of REQ-002 |
| Touched by | REQ-001, REQ-002 |

## What it is

Draws the ADLC pipeline above the prompt: the REQs in flight, phase tabs, each gate's evidence and its options to answer from. It reads the vault and asks git read-only; it never writes `.adlc/` and never runs a git write. A gate reply it sends arrives as the user's own message (`$.prompt.submit` with `asUser`).

## Layout

- `hooks/model.ts` — pure helpers (phase rail, gate-card parser, `parseDebrief`, `ASK_DECISIONS` / `isGateRound`, `isApproveLike`, `autoCompactApplies`, `ringGlyph`, `COMPACT_TIMEOUT_MS`). Base layer — see [[knowledge/gotchas#^g02|G02]].
- `hooks/vault.ts`, `hooks/evidence.ts` — pure readers over the vault and git text.
- `hooks/register.tsx` — every event hook, the band, the cockpit pages, `/flight`. ~2k lines.
- `types/index.d.ts` — the `$.state` contract.

## Compaction (REQ-001)

One path: `compactThenSend` in `register.tsx`, used by a pressed gate option, a held typed approve, and the context ring. Two flags: `compacting` (holds user input; cleared after the reply is handed to the engine, or at the 60 s give-up) and `compactInFlight` (no second engine compaction until the first settles). `compactNow(r | null)` owns the engine call and the usage-cache reset. Rules: [[architecture/adr-002-opt-in-auto-compact|ADR-002]], [[knowledge/lessons#^L-REQ-001-1|L-REQ-001-1]].

## Debrief (REQ-002)

Reads `debrief.md` (written by `/debrief`) through `parseDebrief`, which never throws; a missing head line or section degrades to a hint. The ship tab has a two-line `DEBRIEF` section; the `{ kind: 'debrief'; open? }` sub-view opens from a `debrief ›` link on every GATE line and from `/flight debrief`. At ≥110 columns it follows the Debrief board; below `foldAt = max(110, narrowAt)` it is the section list, one unfolded, capped at 8 rows (probe P10: the band does not pin options under a scrolling body — `STATUS: needs verification` until the live tmux check). The reader condition is read from the debrief head, never recomputed; the rule is `readerOf` in the trail hook. `ASK_DECISIONS` must match the hook's copy — `tests/hooks/ask-list-parity.test.mjs`.

## Known gaps

- Agent `#n` relies on `$.agent.list()` order matching the list under the prompt — `STATUS: needs verification` (REQ-001 shipped without the live check).
- A held typed approve is lost if another plugin refuses the zero-delay timer.
- The DebriefAsk board (in-band reader ask) is not built; the ask is a dialog — [[architecture/adr-003-debrief-ask-dialog|ADR-003]].
- `laneView()` is unreachable: nothing sets `sub.kind: 'lane'`.

## Related

- Gotchas: [[knowledge/gotchas#^g01|G01]] · [[knowledge/gotchas#^g02|G02]] · [[knowledge/gotchas#^g03|G03]] · [[knowledge/gotchas#^g04|G04]] · [[knowledge/gotchas#^g09|G09]] · [[knowledge/gotchas#^g10|G10]]
- ADRs: [[architecture/adr-002-opt-in-auto-compact|ADR-002]] · [[architecture/adr-003-debrief-ask-dialog|ADR-003]]
