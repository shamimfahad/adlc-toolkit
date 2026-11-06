# adlc-flightdeck — the cockpit mod

| Field | Value |
|---|---|
| Path | `core/extras/claude/mods/adlc-flightdeck/` (mirrored to `adapters/claude/extras/mods/`) |
| Kind | Claude Code mod (plugin hooks + the above-prompt band UI) |
| Version | 0.9.0 (REQ-001) |
| Tests | `claude plugin test .` in the mod folder — 124 as of REQ-001 |
| Touched by | REQ-001 |

## What it is

Draws the ADLC pipeline above the prompt: the REQs in flight, phase tabs, each gate's evidence and its options to answer from. It reads the vault and asks git read-only; it never writes `.adlc/` and never runs a git write. A gate reply it sends arrives as the user's own message (`$.prompt.submit` with `asUser`).

## Layout

- `hooks/model.ts` — pure helpers (phase rail, gate-card parser, `isApproveLike`, `autoCompactApplies`, `ringGlyph`, `COMPACT_TIMEOUT_MS`). Base layer — see [[knowledge/gotchas#^g02|G02]].
- `hooks/vault.ts`, `hooks/evidence.ts` — pure readers over the vault and git text.
- `hooks/register.tsx` — every event hook, the band, the cockpit pages, `/flight`. ~2k lines.
- `types/index.d.ts` — the `$.state` contract.

## Compaction (REQ-001)

One path: `compactThenSend` in `register.tsx`, used by a pressed gate option, a held typed approve, and the context ring. Two flags: `compacting` (holds user input; cleared after the reply is handed to the engine, or at the 60 s give-up) and `compactInFlight` (no second engine compaction until the first settles). `compactNow(r | null)` owns the engine call and the usage-cache reset. Rules: [[architecture/adr-002-opt-in-auto-compact|ADR-002]], [[knowledge/lessons#^L-REQ-001-1|L-REQ-001-1]].

## Known gaps

- Agent `#n` relies on `$.agent.list()` order matching the list under the prompt — `STATUS: needs verification` (REQ-001 shipped without the live check).
- A held typed approve is lost if another plugin refuses the zero-delay timer.
- `laneView()` is unreachable: nothing sets `sub.kind: 'lane'`.

## Related

- Gotchas: [[knowledge/gotchas#^g01|G01]] · [[knowledge/gotchas#^g02|G02]] · [[knowledge/gotchas#^g03|G03]] · [[knowledge/gotchas#^g04|G04]]
- ADRs: [[architecture/adr-002-opt-in-auto-compact|ADR-002]]
