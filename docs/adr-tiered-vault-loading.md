# ADR: Tiered vault loading for reflector and architect

| Field | Value |
|---|---|
| Status | **accepted — implemented in 1.9.0**, differently from §Decision below: the ledger became `knowledge/lessons.md` carrying the whole minimal lesson (one line each), the reflector reads that file whole and opens a lesson file only for `↗` lines it needs, the architect and implementer grep it by blast-radius path and tag, `critical` is the always-read flag, and `enforced:` lines leave the read set. The trigger (60KB / 30 lessons) had been crossed ten-fold on the measured vault when this landed |
| Created | 2026-07-22 |
| Trigger | `knowledge/` exceeds **60KB** or **30 lesson files**, whichever first (reported by `/analyze`'s vault-health footprint) |
| Decides | whether the reflector and architect keep reading the whole knowledge layer per REQ, or switch to a ledger-first tiered read |

## Context

Two load paths scale linearly with vault age, and they are the only two:

- The **reflector** reads every lesson, every gotcha, every accepted ADR, and the relevant concept/component pages on every REQ. Its instructions say so on purpose: "Read every applicable lesson and gotcha. Don't filter prematurely." That unfiltered pass is the agent's whole value — it's the memory of the system.
- The **architect** loads all accepted ADRs at every `/architect` run.

At today's vault sizes this costs a few thousand tokens per REQ — noise. At ~50 lessons plus grown gotchas and ADRs it becomes a five-figure token cost *per REQ*, paid on every run, forever.

## Decision (to take when the trigger fires — not before)

Switch both agents to a **ledger-first read**:

1. The lesson ledger already exists — `knowledge/lesson-ledger.md`, generated one row per lesson (ID · Title · Tags · Severity · REQ) since 1.8.0. The flip adds one column: an optional `load-bearing: always-read` flag for entries the user marks as universally applicable. ADRs get the same treatment via `decisions.md`.
2. The reflector reads the full ledger, then the **full text** of: every `always-read` entry, every entry whose domain tags intersect the REQ's blast radius or components, and every gotcha (gotchas stay unfiltered — they're one consolidated file and file-scoped by nature).
3. The architect reads `decisions.md` (the ADR ledger) in full, then full ADR text only where the ADR's domain intersects the REQ.

## The trade, stated plainly

This trades a slice of the reflector's thoroughness for bounded per-REQ cost. A lesson whose domain tags are wrong or missing can be skipped when it would have applied — that's a real regression risk, and it's why this ADR is **not** implemented preemptively. Tag hygiene becomes load-bearing the day this flips on. Since 1.8.0 `Tags` is a required field in the lesson template and `/analyze` reports untagged lessons — a team with several developers reaches 30 lessons in months, not years, so the one-release-before window was pulled forward.

## Alternatives considered

- **Prose-compress the knowledge layer** — rejected: saves ~25% once, fights the plain-language voice rules, and the growth curve wins anyway.
- **Summarize lessons into a digest the reflector reads instead** — rejected: lossy at exactly the layer whose job is precision recall of past mistakes.
- **Do nothing** — acceptable until the trigger; that's what this ADR encodes.

## Consequences

When accepted and implemented: reflector/architect required-reading sections change (their "don't filter prematurely" language is scoped to the post-trigger tiered rule), the ledger gains the `always-read` column (the ledger itself, required tags, and the `/analyze` tag-coverage readout landed in 1.8.0 ahead of the flip). Until then: nothing changes, and `/analyze` reports distance-to-trigger so the flip is a planned decision, not a surprise.
