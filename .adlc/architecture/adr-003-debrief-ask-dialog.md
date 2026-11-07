# ADR-003 — The debrief's reader question uses a question dialog

| Field | Value |
|---|---|
| Status | accepted |
| Date | 2026-11-07 |
| REQ | REQ-002 |
| Supersedes | — |

^ADR-003

## Context

GATE-PROTOCOL invariant 5 forbids question dialogs at gates, because the cockpit is not drawn while one is open (probe P7). The predict and summary asks follow it: they are text that ends the turn. The debrief needs two answers (who it is for, what they want to answer) **inside** `/wrapup`'s turn: after the summary reply, before the ship card. A text ask would end the turn there and split the ship gate across two turns. ETHOS 6 already allows `AskUserQuestion` for a choice that is not a gate.

## Decision

The debrief ask is put with `AskUserQuestion` on Claude. At `/wrapup` nothing is under review at that moment, so hiding the cockpit costs nothing. When `/debrief` runs from a gate's `debrief ›` link the gate is open, and the dialog hides its cockpit for the one short question; the cockpit is back as soon as it is answered, and the round is recorded before the open gate round, so the gate is unaffected (ADV-001). On an assistant without a question dialog, and under `/autopilot` or `/sprint`, it is not asked: the trail's defaults are used and recorded as `skip`. Gates, and the predict and summary asks, keep their text form. GATE-PROTOCOL → *The trail* names this as the one exception.

## Consequences

- `/wrapup` stays one turn from the summary reply to the ship card.
- The mod does not draw this ask. The DebriefAsk board's in-band form is a follow-up REQ, and when it lands it replaces the dialog.
- `trail gate --decision debrief` records the answer like `predict` and `summary`: never into an open gate round.
