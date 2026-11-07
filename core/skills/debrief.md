---
name: debrief
description: Writes debrief.md — the story of one REQ in eight labelled sections, a pointer on every claim — pitched to who will read it and how cold they are, judged from the trail. Runnable at any phase; /wrapup runs it before the ship card. No gate, no marker, no git writes.
---

You are writing the debrief (the story of one REQ, short enough to retell): what it is, why it exists, what changed, how it was built, what was checked, what to watch, what to say to your lead, and what they may ask. Every claim carries a pointer the reader can follow. The file is the output; nothing here is a gate.

## When to use

- The user runs `/debrief [REQ] [--ask]`, at any phase — before a gate, before handing work over, before a lead asks.
- `/wrapup` runs it after the summary reply is recorded and before the ship card (its step 7c).
- `/autopilot`'s final review runs it with the ask skipped.

`--ask` asks the reader question again even when the trail already holds an answer.

## Preflight

1. **Read the toolkit ETHOS** (`$TOOLKIT_PATH/ETHOS.md`)**, the gate protocol** (`$TOOLKIT_PATH/core/GATE-PROTOCOL.md` — *The trail*, invariant 8)**, the voice guide** (`$TOOLKIT_PATH/core/VOICE.md`)**, and the vault layout** (`$TOOLKIT_PATH/core/VAULT-LAYOUT.md`).
2. **Resolve the REQ** per VAULT-LAYOUT's `resolve` rule. With no argument, take the active REQ (the one with an `.awaiting-approval` marker, else the newest non-terminal one); if two qualify, offer them as options. The result is `<REQ_PATH>`, vault-relative; every path below is written `.adlc/<REQ_PATH>/…`.
3. **Read `pipeline-state.json`** for `currentPhase`, `workPath`, `branch`, `baseBranch` and `phases`. No state file (a teammate's fresh clone: the working set is local to whoever ran the pipeline) → say so in one line and stop; there is no trail to judge the reader from.

This skill writes one file, `.adlc/<REQ_PATH>/debrief.md`, and records one trail round. It runs no git write, writes no marker, and dispatches no agent.

## Steps

### 1. The reader condition

```
node $TOOLKIT_PATH/scripts/adlc.mjs trail reader --vault .adlc --req <REQ_PATH>
```

It prints `<cold|warm|handover> — <why>`. Use it as printed; never recompute it. The rule, for the reader of this skill (it lives once, in `readerOf`, with its tests). It counts gate rounds only — decided rounds whose decision is not `predict`, `summary` or `debrief`. First match wins:

1. **handover** — someone answered the gates, and none was answered by you (`git config user.name`).
2. **cold** — any of: under half the changed files viewed at implement or review, or no `viewed` recorded there; half or more of the rounds sent from the cockpit with nothing viewed; a phase cleared by the decision-maker (`/autopilot`, `/sprint`); 24 hours or more since the last round.
3. **warm** — otherwise.

The condition sets the depth (step 4). It goes into the head line with its `why`.

### 2. The ask

Asked once per REQ. Look in `phases[*].gates[]` for a round with `decision: "debrief"`, in any phase. If there is one and `--ask` was not given, reuse its note (`<reader> · <angle>`, or `skip` → the defaults below) and go to step 3.

It is **skipped under /autopilot and /sprint** (nobody is there to answer), and on an assistant without a question dialog. Then use the defaults and record `--note skip`:

- reader: `handover` when step 1 printed handover, else `lead`;
- angle: the first seeded option below.

Otherwise ask, on Claude with `AskUserQuestion` — the one question dialog the pipeline puts, because this is not a gate and `/wrapup` must not end its turn here (GATE-PROTOCOL → *The trail*; the toolkit's ADR-003). One call, two questions:

- **Reader** — the question text carries the condition: *"Who is this for? The trail says you are cold: viewed 2/7 at review."* Options: `my lead (Recommended)` · `me now` · `a handover`. When step 1 printed handover, put `a handover (Recommended)` first and drop the mark from `my lead`. The dialog's own *Other* covers anyone else.
- **Angle** — *"What do you want to be able to answer?"* Two or three options seeded from the REQ: its accepted ADRs, `architecture.md` → *Risks*, and the requirement's open questions. Each option is a question a lead would ask, short: `why a dialog, not a text ask (ADR-003)`, `what if register.tsx breaks`. The first is the default.

Record the answer at once, before writing anything:

```
node $TOOLKIT_PATH/scripts/adlc.mjs trail gate --vault .adlc --req <REQ_PATH> --decision debrief --note "<reader> · <angle>" --phase <currentPhase>
```

`<reader>` is `lead`, `me`, `handover`, or the *Other* text. `trail gate` records an ask before an open gate round and never closes it, so asking from an open gate leaves that gate as it was.

### 3. Read the inputs — this much and no more

- `requirement.md` — *Problem*, *Goal*, *Behaviour*, the acceptance criteria's ids.
- `architecture.md` — the field table (Related ADRs), *Summary*, *Blast radius* (which files were planned), *Task DAG*, *Risks*.
- `tasks/TASK-*.md` — each task's *Goal* only.
- `verification.md` — read **up to and including the "Findings at a glance" section**, then stop. The findings' detail below it is not read.
- `pipeline-state.json` — the trail (`phases`), `taskStatus`.
- `git -C <workPath> diff --numstat <baseBranch>..HEAD`, plus `git -C <workPath> diff --numstat HEAD` for work not yet committed. Reads only.
- The `summary` round's note, if one is recorded.
- `git -C <workPath> rev-parse --short HEAD` and the time now (UTC) for the head line.

**Warm baseline.** For a warm reader, "what changed since your last answer" is everything after your last decided gate round (yours: `by` is you; a gate round: not `predict`, `summary` or `debrief`). That is the trail's rounds and findings after its `at`, the task notes since, and the files from `git -C <workPath> log --since=<at> --name-only --format=`. Name the baseline round in the head's `why` (`since your approve at review, 2026-11-07 20:44Z`).

Open nothing else. A file the story needs that is not on this list goes in your reply as `Packet-gap: <file> — <why>`, so this list gets fixed.

### 4. Write `debrief.md`

Write `.adlc/<REQ_PATH>/debrief.md` whole, replacing any earlier one. The flightdeck mod (the cockpit) parses it, so the shape is fixed: the head line first, then the eight labels **verbatim, in this order, each alone on its line**; a section runs to the next label.

```
DEBRIEF · <REQ-ID-slug> · for: <lead|me|handover|…> · reader: <cold|warm|handover> — <why> · written <ISO UTC, to the minute> at <short sha>
IN ONE BREATH
<two lines: what this change does and why, for someone who has two seconds>
WHY
today → <the problem, from requirement.md> · after → <the behaviour> — requirement.md
WHAT CHANGED
<at most one mermaid fence of five nodes or fewer, or a rail: before → after>
◆ <path:line> — <what> — <why>
◇ <path> — <what> — <why> (unplanned)
HOW
<T1,T2 → T3> · <N> agents · decisions: <…> — <ADR-NNN or task id>
WHAT WAS CHECKED
✓ <tests n/m> — <verify-output.md:line> · findings <n fixed · n accepted (ids)> · acceptance <n/m> — verification.md
WHAT TO WATCH
⚠ <a risk that is still live> — <pointer>
SAY IT TO YOUR LEAD
"<three lines, first person, plain words, as said aloud>"
QUESTIONS YOU MAY GET
Q <a question> → <the short answer> — <pointer>
```

`◆` is a file the architecture planned (it is in *Blast radius*); `◇` is a file the diff touched that it did not. Line numbers come from the diff; a file with no single place to point at gets the path alone.

**Depth by condition.** The labels and their order never change; what fills them does.

- **cold** — the full story: every section filled, every changed file in `WHAT CHANGED`, the whole DAG in `HOW`.
- **warm** — only the change since the baseline (step 3): files, rounds, findings and notes after it. A section with nothing new says `nothing new since <the baseline round>` and stops.
- **handover** — files first: `WHAT CHANGED` lists every changed file, planned and unplanned, and `IN ONE BREATH`'s second line names the file to open first. `SAY IT TO YOUR LEAD` is what to tell the person taking it over.

The reader answer pitches the voice: `lead` — what a lead asks, in the order they ask it; `me` — what you would forget by tomorrow; `handover` — what a new owner needs before their first change. The angle answer goes first in `QUESTIONS YOU MAY GET` and shapes `WHAT TO WATCH`.

**Rules for every line.**

- **Every claim carries a pointer, or it is left out** (GATE-PROTOCOL invariant 8). In `WHAT CHANGED`, `HOW`, `WHAT WAS CHECKED` and `QUESTIONS YOU MAY GET` each fact names where to look: `path:line`, a finding id, a task id, an ADR id, an artifact file. A fact you cannot point at is cut, not softened.
- **One mermaid fence at most, five nodes or fewer**, and only in `WHAT CHANGED`. A larger shape is a text rail: `before → after`, `T1,T2 → T3`.
- **No money.** Token counts if a cost matters; never a price.
- Plain words per `core/VOICE.md`: gloss a toolkit word the first time (REQ, gate, ADR), lines at or under ~72 characters, no emoji, the marker glyphs only (`✓ ⚠ ?`, plus `◆ ◇` here).
- `SAY IT TO YOUR LEAD` is three lines in the user's first person, with no pointers — it is meant to be said. Every fact in it must also appear, pointed, in a section above.

### 5. Show it

Run on its own, print — and nothing more:

```
DEBRIEF · <REQ-ID-slug>
<IN ONE BREATH, two lines>
<WHAT TO WATCH, the ⚠ lines>
full story: .adlc/<REQ_PATH>/debrief.md
```

The first line starts `DEBRIEF · `, so the trail hook knows this turn is not a gate, even with a gate open. No marker, no gate, no `Decision →` line; the open gate, if any, stays as it was.

Run by `/wrapup` (or `/autopilot`'s final review), print nothing: hand back the file path, the reader and the condition. The caller's card shows the debrief under its own `GATE` header. Inside that card no line may start with `DEBRIEF · `, or the trail hook would take the ship gate for a story turn.

## What this skill never does

- Ask more than once per REQ (unless `--ask`), or ask under `/autopilot` or `/sprint`.
- Ask as text that ends the turn, or put any other question in a dialog.
- Write a marker, a gate card, or anything outside `debrief.md` and the one trail round.
- Grade the user's own summary. It is shown beside the story by `/wrapup`, never corrected.
- Run git writes, dispatch agents, or read `verification.md` past "Findings at a glance".
