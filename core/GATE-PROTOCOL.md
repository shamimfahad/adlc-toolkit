# Gate Protocol — the base for every human gate

This is the **shared spine** every gate uses to hand a decision back to the user — **not a fixed template.** Gates differ: a spec gate has no task DAG, a review gate is almost all findings, `/wrapup` is a ship checklist, `/autopilot`'s final review summarizes a whole run. So each skill **adapts** this base to what its phase actually produced. What's constant is the spine and the principles below; the sections are a palette, not a mold.

Load it at preflight (with `ETHOS.md` and `core/VOICE.md`) from `$TOOLKIT_PATH/core/GATE-PROTOCOL.md`. It governs **presentation, not semantics** — `approve` / `revise` / `abort` do whatever each skill defines.

The card is the chat-facing twin of the `.awaiting-approval` file marker. The marker persists the gate across sessions; the card is what the user reads now. **Both are always written at a gate.**

## The invariants (every gate, no exceptions)

1. **Separate *done* from *needs-decision*.** Lead the user's eye to what needs them — not a flat list where FYI and blockers carry equal weight.
2. **Always recommend.** State the option you'd pick and one line of why, even when it's "approve — nothing flagged."
3. **The decision is last, and it is the only imperative.** Everything above orients; the final line asks.
4. **Every option states its consequence.** Never a bare `approve · revise · abort` — each option carries a short clause saying what happens next: `approve — moves on to implementation`, `abort — stops this REQ; nothing is committed`.
5. **On Claude, deliver the decision as an `AskUserQuestion`** with that gate's real options (`approve` / `revise` / `abort`, or whatever the gate defines), the recommended one marked *(Recommended)*, and each option's consequence clause (invariant 4) in that option's `description`. Other assistants render an inline menu. The card is the context; the question is the ask.
6. **Text-first.** The card must read in a plain terminal — compact text, never a raw Mermaid code block (it shows as source-noise where nothing renders it). Detail lives in the artifact files; name a file where the user would go to look, but don't pad the card with pointer lines for their own sake. Keep user-facing lines at or under ~72 characters — longer lines wrap badly in a narrow terminal. Never draw fixed-width rulers or boxes (`──────`); they break the moment the terminal is narrower than the card. A short plain header line (`GATE 2/5 · …`) is enough.
7. **Keep it short.** The card orients; it is not a report. Target 20 lines or fewer. When there is more to show (a long findings list, a full task plan), keep it in the artifact file and offer it on demand — "say `show findings` for the full list" — instead of inlining it. The card is the ask; the cockpit (`/flight`, the flightdeck mod) is the long form — it draws the artifact files, the tree and the trail, so the card never has to. On Claude, close the card's body with one dim line, `full view: /flight`, when the mod is installed.
8. **Every claim names where to look.** A factual claim about the code or the tests — a count, a pass, a fix — carries a pointer the reader can follow: `path:line`, `verify-output.md:14`, a finding id, a task id. `✓ tests 41/41` is not a claim; `✓ tests 41/41 — verify-output.md:14` is. A claim with nowhere to look does not go in the card or in `verification.md`. The cockpit draws pointers as links and dims the rest, so the reader sees at a glance which statements can be checked.

## The base skeleton (adapt per gate)

```
GATE <n>/<N> · <Phase> · <REQ> — <short title>
   <verdict — one line: what's ready, and whether anything needs a call>

<WHAT'S DONE>     terse, FYI — the artifacts / counts this phase produced
<WHAT NEEDS YOU>  the decision-bearing items, prioritized by consequence (omit if none)
<CHECKS>          this gate's validation, compact — if it has any

MY READ           the recommendation + one-line why
Decision →        the gate's options, each with its consequence
```

`READY` / `NEEDS YOU` / `CHECKS` / `MY READ` are the common vocabulary — use the names that fit the phase, drop any that don't apply, and **add sections when the work calls for it.** For example:

- **`/spec`** — often just verdict + `CHECKS` + `MY READ` + decision (nothing structural to show).
- **`/architect`** — `READY` with the task DAG in compact text (`T1,T2 → T3,T4 → T5`); `NEEDS YOU` for a proposed ADR or a stress-test finding that held up.
- **`/review`** — leads with `FINDINGS` grouped by severity; the decision is which to fix vs. accept.
- **`/wrapup`** — a `SHIP CHECKLIST` and the PR/lessons/vault state, including what the lesson dedup was compared against (`dedup vs origin/<base> as of <age>`).
- **`/autopilot` final review** — opens with a `RUN SUMMARY` across every gate it auto-cleared.

The spine (done → needs-you → recommend → decide) holds; the middle is the phase's to shape.

## Markers

Use **one** small vocabulary across every card — no other glyphs, no emoji:

- `✓` — a check that passed.
- `⚠` — a check that flagged, or an item that needs attention/decision.
- `?` — an open question that bears on the decision.
- Severities spelled out: `critical` / `major` / `minor`; show trivial only as a count (`+3 trivial`).

The same symbol means the same thing at every gate, so the user reads cards without relearning them.

## The trail

A gate is a decision; the decision is recorded where the REQ lives, in the user's words, before the skill acts on it. After **any** answer — `approve`, `revise`, `fix …`, `abort`, `merged`, `reframe`, `escalate` — run

```
node $TOOLKIT_PATH/scripts/adlc.mjs trail gate --vault .adlc --req <REQ_PATH> --decision <option> --note "<the user's own words, if any>"
```

`--decision` is the option as chosen; `--note` is what the user typed with it, verbatim, cut at 200 characters, omitted when they typed nothing. The command closes the round the trail hook opened when the card was emitted (`pipeline-state.json` → `phases[<n>].gates[]`), stamps `by` from `git config user.name`, and never touches any other key. `/review` also records each finding's verdict (`trail findings`). Nothing in a phase preflight reads the block; the cockpit mod draws it and `/wrapup` folds it into the record's `## Trail`.

Two habits keep the trail true: keep the card's section labels verbatim (`READY`, `NEEDS YOU`, `CHECKS`, `FINDINGS`, `MY READ`, `Decision →`) — the mod parses them; and start every agent dispatch `description` with the item's id (`REQ-042 · task-implementer TASK-003`), so a reviewer flying for one REQ while another is open in the same checkout lands on the right one.

Three more rounds ride the same command (1.11): `--decision predict` for what the user expected before `/architect` showed its design, `--decision summary` for the user's own account of the change at the ship gate, and `--viewed n/m` on any answer — how many of the changed files the user had opened when they answered. The cockpit appends `[flightdeck] viewed 4/7 files` to a dialog answer at the implement and review gates: pass it as `--viewed 4/7` and leave that trailer out of `--note`, which stays the user's words alone. The predict and summary asks are skipped under `/autopilot` and `/sprint` (nobody is there to answer) and when `config.yml.autonomy.predict_first` / `autonomy.review_summary` is `false`.

## Diagrams

Text-first (invariant 6). Render a structural thing as compact text when it earns space — a DAG as `T1,T2 → T3,T4 → T5`. The full Mermaid stays in the artifact file, where it renders in Obsidian / GitHub / IDE preview. Don't add a dedicated "Diagrams: …" line — the file is already named in what's done.
