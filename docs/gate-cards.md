# Gate cards — how the pipeline asks for your decision

Every human gate in the ADLC pipeline — the pause at the end of `/spec`, `/architect`, `/implement`, `/review`, `/wrapup`, and inside `/bugfix`, `/task`, and `/autopilot` — presents the same **gate card**: a compact, scannable summary that ends in a decision. This page is the reader's tour; the authoritative spec the skills follow is [`core/GATE-PROTOCOL.md`](../core/GATE-PROTOCOL.md).

## The idea

A gate card is not a report. It's built to answer three questions at a glance, in order:

1. **What's done?** — the artifacts this phase produced (FYI).
2. **What needs *you*?** — the decision-bearing items: a proposed decision record (ADR), a stress-test finding that held up, an open question. If nothing, it says so.
3. **What's the decision?** — the last line, and the only thing you must act on. The card ends your assistant's turn; you answer by replying — or, with the flightdeck mod, by picking the option in the cockpit beside the evidence.

Every card also carries a one-line **recommendation** (`MY READ`) — the option the pipeline would pick and why — so a clean gate is one keystroke and a risky one is obvious.

## Anatomy

```
GATE <n>/<N> · <Phase> · <REQ> — <short title>
   <verdict — one line: what's ready, and whether anything needs a call>

READY       terse, FYI — the artifacts / counts this phase produced
NEEDS YOU   the decision-bearing items, prioritized (omitted when there are none)
CHECKS      this gate's validation, compact — ✓ / ⚠ per check

MY READ     the recommendation + one-line why
Decision →  the gate's options, each stating what happens next
```

`READY` / `NEEDS YOU` / `CHECKS` / `MY READ` are a **menu of sections each gate can use, not a fixed form** — each gate uses the ones its phase needs and can rename or add its own. A spec gate is often just verdict + `CHECKS` + decision; a review gate leads with `FINDINGS`; `/wrapup` shows the wrap-up checklist; `/autopilot`'s final review opens with a `RUN SUMMARY`. The order — done, needs you, recommendation, decision — is what never changes.

## Example — the architect gate

```
GATE 2/5 · Architect · REQ-014-payment-retries
   ready to review — 2 items need your call

READY       architecture.md · 6 tasks in 3 stages · new decision ADR-007
            exploration.md · stress-test ran: full pass
            task order: T1,T2 → T3,T4 → T5

NEEDS YOU   ⚠ ADR-007  retry backoff strategy — accept or reject
            ⚠ fixed    double-charge on retry — the fix is in the
                       Approach section; please confirm it
            ? open     how long should idempotency keys live?

CHECKS      ✓ criteria covered · ✓ no cycles · ✓ conventions · ✓ tests concrete

MY READ     approve — the flagged risk is fixed; the new decision is low-risk

Decision →  approve (recommended — move on; ADR-007 accepted) ·
            approve, reject ADR-007 (move on; recorded rejected) ·
            revise <what> · abort
```

Note the task order is shown as **compact text**, not a rendered picture: the card must read cleanly in a plain terminal, where Mermaid doesn't render. The full rendered diagram lives in `architecture.md`, where it renders in Obsidian, GitHub, and IDE preview. That's the rule for diagrams everywhere in the pipeline — see the [diagram conventions](fidelity-matrix.md) and the templates.

## Markers

Cards use one small, consistent vocabulary (no emoji): `✓` pass · `⚠` needs attention · `?` open question · severities spelled out (`critical` / `major` / `minor`; trivial shown only as a count). The full list lives in `core/GATE-PROTOCOL.md`.
