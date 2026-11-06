# ADR-002 — Opt-in auto compaction after an approved gate ^ADR-002

| Field | Value |
|---|---|
| Status | accepted |
| Decided | 2026-11-07 |
| Author | Shamim Fahad |
| Supersedes | (none) |
| Superseded by | (none) |
| Based on | REQ-001, `core/GATE-PROTOCOL.md` → *Compaction at a gate* |

## Context

GATE-PROTOCOL says the cockpit offers compaction "as a button, never on its own". Long `/proceed` runs fill the context, and users forget the button. The engine lets a mod compact between turns (`$.session.compact`) and hold a typed prompt (`prompt.submit` → `{ drop }`).

## Considered options

### Option 1 — Keep it manual
No change. Simple, but users keep running into the engine's own 95% auto-compact mid-phase.

### Option 2 — Compact before the gate card
Compact as soon as a gate opens. The card being read is folded into the summary, and a `revise` answer then reworks without the phase context.

### Option 3 — Opt-in: compact after an approve answer, then deliver it
Off by default. Only `approve`-like answers compact; `revise`/`fix`/`abort` never do. The answer is always delivered, compacted or not.

## Decision

**We chose Option 3.** It compacts at the cheapest point (phase on disk, next not started), never loses an answer, and never decides a gate. GATE-PROTOCOL's sentence becomes: "The cockpit offers it as a button; with *auto compact* on, it compacts after you approve, then sends your answer."

## Consequences

- The user's own answer still clears every gate; auto mode only acts on it.
- A typed approve is briefly held and re-sent by the mod as the user's message.
