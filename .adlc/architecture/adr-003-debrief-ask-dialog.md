# ADR-003 — The debrief's reader question uses a question dialog ^ADR-003

| Field | Value |
|---|---|
| Status | accepted |
| Decided | 2026-11-07 |
| Author | Shamim Fahad |
| Supersedes | (none) |
| Superseded by | (none) |
| Based on | REQ-002, `core/GATE-PROTOCOL.md` → *The trail* |

## Context

GATE-PROTOCOL invariant 5 forbids question dialogs at gates, because the cockpit is not drawn while one is open (probe P7). The predict and summary asks follow it: they are text that ends the turn. The debrief needs two answers (who it is for, what they want to answer) **inside** `/wrapup`'s turn: after the summary reply, before the ship card. A text ask would end the turn there and split the ship gate across two turns. ETHOS 6 already allows `AskUserQuestion` for a choice that is not a gate.

## Decision

The debrief ask is put with `AskUserQuestion` on Claude, only when no gate marker is open for the REQ — in practice `/wrapup` step 7c, which runs before the ship marker is written. Nothing is under review at that moment, so hiding the cockpit costs nothing. On an assistant without a question dialog, and under `/autopilot` or `/sprint`, it is not asked: the trail's defaults are used and recorded as `skip`. Gates, and the predict and summary asks, keep their text form. GATE-PROTOCOL → *The trail* names this as the one exception.

## Consequences

- `/wrapup` stays one turn from the summary reply to the ship card.
- The mod does not draw this ask. The DebriefAsk board's in-band form is a follow-up REQ, and when it lands it replaces the dialog.
- `trail gate --decision debrief` records the answer like `predict` and `summary`: never into an open gate round.
- 2026-11-07 — narrowed after review (REQ-002 ARCH-001): the exception holds only with no gate marker open. `/debrief` run while a gate is open (its `debrief ›` link) never opens the dialog, since the cockpit would vanish as the user decides (GATE-PROTOCOL invariant 5). It reuses a recorded `debrief` round, else uses the defaults for that run and records nothing (so `/wrapup` step 7c still asks; review round 2, CORR-005), and ends its turn with the open gate's `Decision →` line.
