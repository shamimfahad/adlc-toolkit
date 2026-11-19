---
name: roadmap
description: Plan the work above a single REQ. Reads whatever the project has (an idea, a PRD, an RFQ, a kickoff doc, an estimate, a tracker backlog, an existing repo) and produces a dependency roadmap, one minimal draft spec per REQ, and, when asked, an estimate and a playbook. Sizes its own workload to the task and hands a one-REQ job straight to /spec or /task. Never assigns work to people. Ends in plan gates the user approves.
---

You are running `/roadmap` — the planning layer above the REQ. `/spec` drafts one requirement; this skill decides which requirements exist, what each depends on, and what a developer needs in order to pick one up and start.

It is modular. You load a module's file only when the run plan selects it — do not read them all up front.

## When to use

- A new product or project, a large feature, or a change that will take more than one REQ.
- An existing source (a PRD, an RFQ, an estimate, a backlog) has to become work developers can start.
- The source behind an existing plan changed and the plan must follow (`/roadmap resync`).
- Someone asks what can be started now (`/roadmap next`).

## When NOT to use

- The work is one REQ. Use `/spec`, or `/task` if it is small. Step 2 checks this and hands off.
- A defect. Use `/bugfix`.
- Designing how something is built. That is `/architect`, per REQ.

## Invocation

- `/roadmap` — plan from the sources named in chat or attached.
- `/roadmap resync` — a source changed; load `resync` only.
- `/roadmap next` — list the planned items that can start now; see *Next* below. No gate, no writes.
- `/roadmap challenge` — re-run the challenge pass on the existing plan.
- `/roadmap issues pl-012=#842 pl-013=#843 …` — record the issue references once a human has posted the issues: writes only the `Issue` row of each named draft whose `Status` is `planned`. No gate. A draft that is `promoted` or `dropped` is skipped and named.

## Hard rules

These hold in every module. A module never relaxes one.

1. **A missing or unreadable source stops the run.** Say what is missing and where you looked. Never rebuild a source from memory.
2. **Never invent a requirement.** What the sources do not say is either asked, or added and marked `Added by Claude` on the line itself so the user can accept or drop it.
3. **Keep the source's own words and IDs.** Do not rename its items, renumber them, or translate its vocabulary into this toolkit's. Every draft carries the source IDs it came from.
4. **No assignment to people.** No owners, no lanes, no "developer A". Any developer may pick any item that is ready. Merge safety comes from the plan (dependencies, `Touches`, seams), not from names.
5. **No time references in the plan.** No dates, weeks, sprints-by-date or deadlines in the plan files or the drafts, unless the user asked for them in this run. (A draft's `Created` row is `—`. The `hot.md` log line this skill appends is dated like every other entry there; that is a log, not the plan.) Order comes from dependencies. When a source line carries a date, keep the condition and drop the date. The estimate is the one place dates live.
6. **No design.** A draft says what, never how. Components, sequencing inside a REQ and file-level plans belong to `/architect`.
7. **Never post to a tracker.** Issue text is drafted for a human to post.
8. **Git follows `git.mode`.** Planning writes only under `.adlc/` (and the estimate's folder); it creates no branch and never pushes.

## Preflight

1. **Read the toolkit ETHOS** (`$TOOLKIT_PATH/ETHOS.md`), **the gate protocol** (`$TOOLKIT_PATH/core/GATE-PROTOCOL.md` — plan gates use its *plan gate* variant), **the voice guide** (`$TOOLKIT_PATH/core/VOICE.md`) and **the vault layout** (`$TOOLKIT_PATH/core/VAULT-LAYOUT.md` — the `plan/` shape and `promote(draft)`).
2. **Read the vault, if there is one:** `.adlc/CLAUDE.md`, `hot.md` (last 20), `config.yml`, `context/project-overview.md`, `context/conventions.md`, and `.adlc/plan/roadmap.md` if a plan already exists. No vault is fine — the run plan will include the bootstrap.
3. **An existing plan is not overwritten.** If `.adlc/plan/roadmap.md` exists and the user did not ask for `resync`, say so and ask: resync it, add to it (new items get the next plan IDs), or stop.
4. **A module override wins.** For each module, if `$TOOLKIT_PATH/local/skills/roadmap/<module>.md` exists, read that file instead of the core one.

## Steps

### 1. Intake

Read `$TOOLKIT_PATH/core/skills/roadmap/intake.md` and follow it. It inventories the sources by role and tells you where this project is. Nothing is written yet.

### 2. The run plan (plan gate 1)

Decide the size, then the modules.

**Size.** One of:

| Size | Meaning | Modules |
|---|---|---|
| `single` | One REQ's worth of work | none — hand off |
| `feature` | A handful of REQs in an existing product | breakdown, roadmap, specs; challenge (light) |
| `product` | A new product, or a body of work with shared foundations | all that the sources support |

`single` exits here: say why it is one REQ, name `/spec` or `/task`, and stop. Use `/task`'s own triage list to choose between them — and its rule that risk only ever sizes work *up*: anything touching a sensitive surface (the `autonomy.hard_stops` categories) is never called small.

**Modules.** Select from this table. A module whose role is missing from the sources is left out, not padded.

| Module | Writes | Select when |
|---|---|---|
| `frame` | `plan/brief.md` | no source states the problem, users and scope |
| `bootstrap` | the vault itself | `.adlc/` is missing, or its `context/` is empty |
| `breakdown` | the item table | more than one REQ |
| `estimate` | a workbook outside `.adlc/` | the user asked for one |
| `roadmap` | `plan/roadmap.md` | more than one REQ |
| `specs` | `plan/drafts/pl-NNN-<slug>.md` | more than one REQ |
| `playbook` | `plan/playbook.md` | `product` size |
| `registers` | `plan/risk-register.md`, `plan/gap-register.md`, issue text | the roles exist (external inputs; a vision beyond this milestone; a tracker, or several developers) |
| `challenge` | `plan/challenge-log.md` | `product` size; light for `feature` |

Emit **plan gate 1** per GATE-PROTOCOL's plan-gate variant: the size and why, a table of selected modules with what each will write, the modules left out and why, the source inventory from intake, any conflicts between sources (as a table with the source you recommend per field), and what you will ask the user for along the way. Options: `approve`, `revise <what>`, `abort`. End the turn.

### 3. Run the selected modules, in this order

`bootstrap` → `frame` → `breakdown` → `estimate` → **plan gate 2** → `roadmap` → `specs` → `playbook` → `registers` → `challenge` → **plan gate 3**.

Before each module, read `$TOOLKIT_PATH/core/skills/roadmap/<module>.md` (or its override) and follow it. `bootstrap` has no module file: when `.adlc/` is missing, run the `init` protocol (`$TOOLKIT_PATH/core/skills/init.md`) with its own confirmations, then fill `context/`, the settled decisions (as ADRs) and the verification limits from the sources — under hard rules 2 and 3.

**Plan gate 2 — the items.** After `breakdown` (and `estimate`, if selected), before anything is fanned out. Show the item table, every split, merge and not-an-item decision with its reason, every inferred dependency, and the estimate totals if there is one. This is the cheap place to be wrong: after this gate you write one draft per item. A `feature`-size run with five items or fewer may fold this gate into gate 3.

**Plan gate 3 — the plan.** After the last selected module. Show the roadmap's phase table and critical path, the seams, the external gates, what the drafts contain, and the challenge table with a row per surviving suggestion. Options: `approve`, `accept <rows>` (apply those challenge rows, re-emit), `revise <what>`, `abort`.

### 4. After approval

1. **Tell the user to commit `.adlc/plan/`** (and push it, when others work on this repo) before anyone starts an item. An uncommitted plan cannot be started: `promote(draft)` stops on an untracked draft. Under `git.mode: manual` the commit is theirs; under `commit` you may make it on the current branch if it is not a protected one — otherwise say which branch it needs.
1a. If `registers` drafted issue text, tell the user where it is, that posting is theirs, and that `/roadmap issues pl-NNN=<ref> …` records the references afterwards.
2. Append to `.adlc/hot.md`: `## [DATE] plan-approved | <plan slug> | <n> items`.
3. Report: the files written, the item count, the critical path in one line, every `Added by Claude` line that was accepted, and how to start — `/spec pl-NNN`, or `/roadmap next` to see what is ready.

## Next

`/roadmap next` answers "what can I start?" It reads and prints; it never writes.

An item is **ready** when all of these hold:

- its draft's `Status` is `planned` (a `promoted` draft is already someone's), **and** no active REQ folder on this machine (VAULT-LAYOUT → `enumerate(active)`) has `"plan": "pl-NNN"` for it in its `pipeline-state.json` — the write-back lives on the REQ's branch, so from the base checkout a started item can still read `planned`;
- every item in its `Depends on` is merged — a record exists for its REQ — or is a seam whose interface is published (the seam's draft says where);
- each external gate is delivered, or its mitigation is something that exists now;
- no item that is in flight shares an entry in `Touches`.

"In flight" is the hard part: a teammate's working folder is not on your machine. So:

- **Tracker configured** (`sources.issues`): an open issue that is assigned is in flight. Read state and assignees through the mechanism `/spec`'s resolver picks (for GitHub, `gh issue view <n> --json state,assignees`; else the MCP server or a fetch), using each draft's `Issue` row. A draft whose `Issue` is `—` cannot be checked: list it as "claim unknown". Assigning the issue to yourself is how an item is claimed; unassigning releases it.
- **No tracker:** the draft's `Status` and the REQ folders on this machine are the only signals, and you say so in the output. They cover one developer's own work; they cannot show a teammate's.

List ready items with the critical-path ones first, each with its `Run with` line. Then list what is blocked and by what, in one line each. If the plan is for several developers and no tracker is configured, say plainly that nothing prevents two people starting the same item, and stop short of recommending one.

## Constraints

- **Never write under `.adlc/specs/` or `.adlc/bugs/`.** Planned work lives in `.adlc/plan/` until a pipeline skill promotes it.
- **Never edit `plan/roadmap.md` outside this skill.** Pipeline skills derive status from records; they do not tick rows.
- **Never overwrite a draft whose `Status` is `promoted`.** It holds an approved spec.
- **Never proceed past a plan gate** without the user's `approve`.

## Output artifacts

- `.adlc/plan/roadmap.md`, `.adlc/plan/drafts/pl-NNN-<slug>.md`
- When selected: `plan/brief.md`, `plan/playbook.md`, `plan/risk-register.md`, `plan/gap-register.md`, `plan/challenge-log.md`, `plan/issues/`, the estimate workbook
- `.adlc/plan/.awaiting-approval` (while a plan gate is open)
- New entry in `.adlc/hot.md` on approval
