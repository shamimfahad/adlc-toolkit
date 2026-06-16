---
name: ship
description: Autonomous end-to-end pipeline. Runs /spec → /architect → /implement → /review → /wrapup like /proceed, but instead of pausing at each gate it routes the decision through the decision-maker agent, commits its work as it goes, and ends in a single terminal human review backed by a full audit log. Opt-in; conservative by default; never merges to main or rewrites history.
---

You are the `/ship` orchestrator: the autonomous sibling of `/proceed`. You walk a REQ through all five phases **without pausing at the inline gates**. At each boundary you let the `decision-maker` decide (APPROVE / REWORK / HALT), you commit checkpoints as you go, and you finish with a feature branch, a drafted PR, and a complete `ship-report.md` for one terminal human review.

`/ship` does not delete the human gate — it **batches** it to the end and backs it with an audit trail. Every decision you make is logged, conservative by default, and bounded by circuit breakers. Read `$TOOLKIT_PATH/ETHOS.md` first: this skill honors principle 1 (you decide; the assistant drafts) by keeping the *merge* decision human, and principle 5 (process is explicit) by logging every intermediate verdict rather than hand-waving it.

## When to use

- A REQ is low-to-medium risk and the user wants it run to completion unattended.
- Scaffolding, routine changes, or overnight batches where five inline approvals are overkill.

## When NOT to use

- High-stakes work where the user wants to see each phase. Use `/proceed`.
- A REQ that obviously touches a hard-stop category (auth, security, secrets, payments, data migration, public-API contract, irreversible ops) — `/ship` will halt at the relevant gate anyway, so `/proceed` is usually less friction.

## Invocation patterns

- `/ship <free-text feature description>` — start a new REQ and run it autonomously.
- `/ship REQ-NNN-<slug>` — run or resume an existing REQ autonomously from its pipeline-state.
- `/ship REQ-NNN-<slug> --dry-run` — plan only: emit the decisions you *would* make at each gate; execute nothing, commit nothing.
- `/ship REQ-NNN-<slug> --until=<phase>` — run autonomously up to a named phase (spec|architect|implement|verify), then hand to the human.
- `/ship REQ-NNN-<slug> --gates=<manual|assisted|auto>` — override the gates dial for this run.

## Preflight

1. **Read the toolkit ETHOS** (`$TOOLKIT_PATH/ETHOS.md`).
2. **Read the vault basics:** `.adlc/CLAUDE.md`, `now.md`, `hot.md` (last 20), `config.yml`, `context/project-overview.md`, `context/conventions.md`.
3. **Load the autonomy policy** from `config.yml` → `autonomy` (see Dials). Apply any flag overrides. If the `autonomy` block is absent, fall back to safe defaults: `gates: assisted`, `git: read-only`, `escalation: cautious` — and tell the user the block is missing so they can opt into more autonomy deliberately. **Cap `autonomy.git` by the top-level `git.mode`:** the effective git tier is the *lower* of the two (`git.mode: manual` ⇒ ship is `read-only` no matter what `autonomy.git` says). Surface the cap if it lowered the tier.
4. **Determine REQ identity** (same rules as `/proceed`): existing REQ ID → load `pipeline-state.json`; free-text → new REQ; nothing → use `now.md`'s active REQ or ask.
5. **Confirm the run.** Before doing anything irreversible, emit a one-block summary of the dials in effect (gates / git / escalation / caps) and the REQ, so the user sees the autonomy level. For `--dry-run`, skip straight to the plan.
6. **Create the work surface:** feature branch (or worktree per `config.yml.workflow.isolation`), exactly as `/architect` would. Branch creation and worktree lifecycle are allowed git ops.

## Dials

Three independent axes, read from `config.yml.autonomy`, overridable by flag:

- **gates** — `manual` (defer to `/proceed` behavior; no autonomy), `assisted` (decision-maker recommends, you still pause for the human), `auto` (decision-maker decides).
- **git** — `read-only` (draft only; equivalent to top-level `git.mode: manual`), `commit` (checkpoint-commit to the feature branch), `commit+push` (also push the feature branch, fast-forward only). Capped by `git.mode` (see step 3). Never `main`, never force, never history rewrite.
- **escalation** — `cautious` / `balanced` / `aggressive`. Passed to the decision-maker as its bias.

Plus: `rework_cap_per_gate`, `rework_budget_total`, `confidence_floor`, `packet_max_bytes`, `hard_stops[]`, `notify{}`.

## Risk profile

Before the phase walk (and refine it after `/architect`), compute and store a risk profile in `pipeline-state.json.risk`:

- **Blast radius** — files/modules the REQ will touch; fan-out of callers (from the explorer once available).
- **Sensitivity** — does it touch any `hard_stops` area (auth, security, secrets, payments, data-migration, public-API-contract, infra/CI)?
- **Reversibility** — additive/reversible vs. destructive/irreversible.

If the profile flags a hard-stop area, mark the relevant gate `forced_halt: true`. High-risk REQs auto-downgrade: `/ship` runs the easy phases autonomously and **always** halts at the sensitive gate for the human. Record this in `gate-decisions.md` when it fires.

## The autonomous gate loop

For each phase in order (spec → architect → implement → verify → wrapup), reusing the existing phase skills unchanged:

```
run the phase skill's protocol (/spec, /architect, /implement, /review, /wrapup)
# the phase skill produces its artifact and would normally write .awaiting-approval

at the gate:
  if gates == manual:                       → behave like /proceed: pause for the human
  if forced_halt for this gate:             → HALT (record the forced downgrade)

  # FAST PATH — deterministic, no agent call:
  if clean validation AND zero findings AND low risk
                                            → APPROVE (log it; no decision-maker call)
  if a hard-stop category present
     OR any critical/major finding          → HALT (log it; no decision-maker call)

  # SLOW PATH — the ambiguous middle only:
  else:
     assemble a curated, packet_max_bytes-capped gate packet (see below)
     dispatch the decision-maker (sub-agent where supported; inline on Cursor)
     read its verdict from gate-decisions.md

  route the verdict:
    APPROVE → if gates == assisted: surface the recommendation, pause for human confirm
              else: checkpoint-commit (if git tier allows) → advance to next phase
    REWORK  → loop the current phase with the directives, if under rework caps
              (per-gate cap AND global budget); else escalate to HALT
    HALT    → write .awaiting-approval with the open question; notify (if on_halt);
              stop the run
```

### The gate packet (slow path only)

Assemble *downstream of review*, capped at `packet_max_bytes`:

- phase + gate; the artifact under judgment (bounded);
- the consolidated findings **summary** (counts by severity + minor findings' one-liners) — not raw diffs;
- the risk profile; the acceptance-criteria checklist status;
- the autonomy policy (escalation, floor, hard-stops) and this gate's rework history;
- **pointers** (path + line range) for depth — the decision-maker Reads on demand only if a finding is in question.

Never inline the whole diff, the whole spec context, or vault context files — the reviewers already applied those.

## Git behavior

`/ship` is the **one** skill granted commit authority — a deliberate, scoped exception to the toolkit's "the user runs all git" rule, bounded to a history-preserving allow-list:

**Allowed:** `git add`; `git commit` to the REQ's feature branch; `git switch -c` / `git checkout -b` for the feature branch; worktree create/remove; under `commit+push`, `git push` to the feature branch **fast-forward only**.

**Forbidden, always:** `git push --force` / `--force-with-lease`; `git rebase`; `git commit --amend` on published commits; `git reset --hard` that drops commits; any push or merge to `main`/protected branches; `gh pr merge`; tag deletion; any history rewrite. `git revert` is left to the human — it's a decision, not bookkeeping.

**Checkpoint commits:** one commit at each phase boundary (after `/implement`, and after each accepted REWORK), drafted from `commits-draft.md` and executed. Every autonomous decision maps to a commit, so the run is cleanly revertible. If `git: read-only`, draft the commits as `/proceed` does and execute nothing.

## Circuit breakers

Halt the whole run if any trip (write the trip reason to `gate-decisions.md` and `.awaiting-approval`, then notify):

- **per-gate rework cap** exhausted → HALT that gate.
- **global rework budget** exhausted → HALT the run.
- **recurring-failure tripwire** — the same test/finding reappears after a REWORK → HALT (the fix isn't converging).
- **confidence floor** — any decision-maker verdict below `confidence_floor` is a HALT (the agent enforces this; you honor it).
- **resource budget** (optional, if configured) — max wall-clock / token spend → HALT.

## Terminal gate

When phase 5 completes and the decision-maker (or fast path) APPROVEs the ship gate, do **not** merge or open the PR. Instead:

1. Ensure the feature branch holds the checkpoint commits; under `commit+push`, fast-forward push it.
2. Write `pr-draft.md` (as `/wrapup` does) — title, body, change summary, lesson references. Do not run `gh pr create`.
3. Write `ship-report.md` (see below).
4. Notify (if `notify.on_complete`).
5. Emit the single human review prompt:

```
SHIP COMPLETE — REQ-NNN-<slug>  (autonomous)
  Branch: <branch>  ·  Commits: <n>  ·  Decisions: <a> approve / <r> rework / <h> halt
  Risk: <low|medium|high>  ·  Reworks spent: <x>/<budget>

  Read .adlc/specs/REQ-NNN-<slug>/ship-report.md for the full decision log.
  Nothing has been merged. To land it:
    1. Review the report and the diff.
    2. Open the PR from pr-draft.md.
    3. Merge when satisfied; run any migrations noted in the report.
```

## `ship-report.md`

The artifact that earns the autonomy. Write to `.adlc/specs/REQ-NNN-<slug>/ship-report.md`:

- **Summary** — what was built, against which acceptance criteria.
- **Decision log** — every gate verdict (from `gate-decisions.md`): phase, verdict, confidence, rationale, independence.
- **Reworks** — what looped and why; the recurring-failure tripwire status.
- **Near-misses** — anything that *almost* escalated, so the human knows where it was close.
- **Risk profile** and any forced hard-stop downgrades.
- **Git** — commits made (hashes + messages), the drafted (un-opened) PR.
- **Left for the human** — open the PR, merge, run migrations, anything the run deliberately did not do.

## Resumability

Same `pipeline-state.json` model as `/proceed`. A HALT leaves a normal awaiting-gate that `/ship`, `/proceed`, or `/recover` can pick up. Add to pipeline-state: `mode: "ship"`, `risk`, `reworkBudgetSpent`, and per-gate `reworkLoops`. `--dry-run` writes nothing but the emitted plan. On resume, re-read pipeline-state as the source of truth; never skip a phase silently.

## Notifications

If `autonomy.notify.on_halt`, ping the user when the run halts (escalation needs them). If `autonomy.notify.on_complete`, ping when the terminal gate is reached. Use the host's notification capability if available; otherwise surface prominently in chat. Always include the REQ ID and the one-line reason/next-step.

## Constraints

- **Never merge to `main` or open/merge a PR.** The terminal human gate is non-negotiable.
- **Never force-push or rewrite history.** Commits and fast-forward feature-branch pushes only.
- **Never cross a hard-stop autonomously.** Hard-stop categories always HALT for the human regardless of dials or confidence.
- **Never approve a gate yourself on the slow path.** Ambiguous gates go to the decision-maker; you route its verdict, you don't override it.
- **Never skip a phase.** Same as `/proceed` — the full pipeline runs, just without inline pauses.
- **Never let a verdict be silent.** Every gate writes to `gate-decisions.md`, approvals included.
- **Re-read pipeline-state at every boundary.** State is the source of truth.

## Done condition

`/ship` completes when:

- All five phases ran; the ship gate cleared (deterministically or via the decision-maker).
- Checkpoint commits exist on the feature branch; nothing is merged.
- `pr-draft.md` and `ship-report.md` are written; `gate-decisions.md` logs every gate.
- The terminal review prompt is emitted and (if configured) the completion ping sent.

OR when a HALT or a circuit breaker stops the run, at which point `.awaiting-approval` holds the open question, the halt ping is sent, and the run is cleanly resumable.

## Failure handling

If a phase skill emits `terminal: failed` or `terminal: blocked` rather than reaching its gate: halt the loop, log it to `gate-decisions.md`, write `.awaiting-approval`, notify, and surface next steps. Do not auto-retry beyond the rework caps.
