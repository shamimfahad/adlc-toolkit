---
name: bugfix
description: Streamlined pipeline for bug fixes. Slimmer than /proceed — bug report → investigate → fix → verify → ship, with gates between each. Use for defects, not for new features. Larger or scope-creeping bugs should be re-framed as a REQ via /spec.
---

You are running the bug-fix workflow. This is a slimmer cousin of `/proceed` with the same gate discipline but lighter ceremony per phase. Use it for bugs — defective existing behavior — not for new features.

## When to use

- A defect has been reported.
- The fix is bounded: clear symptom, clear repro, expected to touch a small area of the codebase.

## When NOT to use

- The "bug" is actually a missing feature. Use `/spec` + `/proceed`.
- The fix requires designing a new pattern or making an architectural decision. Use `/spec` + `/proceed`.
- Multiple related bugs need fixing together. Use `/spec` with a multi-acceptance REQ.

If during investigation the bug turns out to be larger than expected, **stop and surface** — recommend re-framing as a REQ.

## Preflight

1. **Read the toolkit ETHOS.**
2. **Load vault basics.** `.adlc/CLAUDE.md`, `now.md`, `hot.md` (last 20), `config.yml`, `context/conventions.md`, `context/architecture.md`.
3. **Assign a BUG ID.** Scan `.adlc/bugs/` for the highest `BUG-NNN-*` folder; increment, pad to 3 digits.
4. **Create the bug folder:** `.adlc/bugs/BUG-NNN-<slug>/`.

## Phase 1 — Bug report (gate)

### Draft

Copy `templates/bug-template.md` to `.adlc/bugs/BUG-NNN-<slug>/bug.md`. Substitute placeholders and fill content from the user's description:

- Symptom
- Reproduction steps
- Environment
- Severity estimate (the user provides or you propose)

If repro steps aren't clear, ask follow-ups in chat. Don't proceed to investigate without a runnable repro (or an explicit "I can't reproduce — investigate from this stack trace").

### Initialize pipeline state

`.adlc/bugs/BUG-NNN-<slug>/pipeline-state.json`:

```json
{
  "bug": "BUG-NNN-<slug>",
  "kind": "bugfix",
  "createdAt": "<ISO>",
  "currentPhase": 1,
  "completedPhases": [0, 1],
  "gateState": "awaiting",
  "currentPhaseGate": "report"
}
```

### Gate prompt

```
🛑 Gate: Bug report — BUG-NNN-<slug>

Drafted: .adlc/bugs/BUG-NNN-<slug>/bug.md

Inline check:
[✓ / ⚠] Symptom described in one or two sentences
[✓ / ⚠] Reproduction steps are runnable
[✓ / ⚠] Expected vs actual is concrete
[✓ / ⚠] Environment captured

Reply:
  approve         — proceed to investigation
  revise: <text>  — refine the report
  reframe         — convert this to a feature REQ (will call /spec)
  abort           — discard
```

On `approve`: clear gate, advance.
On `reframe`: archive `bug.md`, call `/spec` with the bug content as input, exit this skill.

## Phase 2 — Investigate (gate)

### Establish the work path

Same pattern as `/architect`'s preflight step 4. Read `config.yml.workflow.isolation`. In `auto` or `branch` mode, verify `git -C <repo-path> status --porcelain` is clean (refuse and surface if not) and then run `git -C <repo-path> checkout -b bugfix/BUG-NNN-<slug>`. In `worktree` mode, run `git -C <repo-path> worktree add <repo>/.worktrees/BUG-NNN-<slug> -b bugfix/BUG-NNN-<slug>`. Update `pipeline-state.json` with `isolation`, `workPath`, `branch`, and `worktree` (null in branch mode). Append to `hot.md`: `## [DATE] work-path-set | BUG-NNN-<slug> | <mode> at <workPath>`.

### Dispatch codebase-explorer

Targeted recon — not blast-radius-wide, but focused on the area suggested by the bug's repro and stack trace.

```
BUG: BUG-NNN-<slug>
Bug report: .adlc/bugs/BUG-NNN-<slug>/bug.md
Work path: <workPath>
Focus: <function or module suggested by repro>

Find:
1. The code path the bug runs through
2. Existing tests covering the area
3. Similar past bugs (search hot.md, gotchas.md, lessons/)
4. Any gotcha or lesson that applies to the affected file

Write to: .adlc/bugs/BUG-NNN-<slug>/investigation.md
```

### Diagnose

After the explorer returns, write the root cause to `.adlc/bugs/BUG-NNN-<slug>/bug.md` under "Investigation log":

```markdown
### YYYY-MM-DD — root cause

The actual cause, with file:line references. Why it produces the symptom.
```

Sketch a fix approach in the bug.md "Fix approach" section. Two or three bullets — concrete enough that the user can evaluate whether to proceed.

While diagnosing, if the codebase quirk that produced the bug or any insight from `investigation.md` deserves vault capture, append a candidate to `.adlc/bugs/BUG-NNN-<slug>/lesson-candidates.md` (source tag `bugfix-investigate`). The Phase 5 verdict step decides whether it becomes a lesson, gotcha, or discard.

### Gate prompt

```
🛑 Gate: Investigation — BUG-NNN-<slug>

Root cause: <file>:<line> — <one-sentence summary>

Fix approach:
- <bullet>
- <bullet>

Reviewer-style cross-check:
[✓ / ⚠] Diagnosis matches the repro (the cause would produce the observed symptom)
[✓ / ⚠] Fix approach is in scope (no scope creep)
[✓ / ⚠] Regression test plan is concrete

Related vault entries:
- [[knowledge/gotchas#^gNN|GNN]] — short note (if applicable)
- [[knowledge/lessons/LESSON-NNN]] — short note (if applicable)

Reply:
  approve         — proceed to fix
  revise: <text>  — refine the diagnosis or approach
  reframe         — convert to a feature REQ (scope too big)
  abort           — halt; cleanup worktree
```

## Phase 3 — Fix (gate)

### Dispatch task-implementer

```
Task: Fix BUG-NNN-<slug>
Bug report: .adlc/bugs/BUG-NNN-<slug>/bug.md
Investigation: .adlc/bugs/BUG-NNN-<slug>/investigation.md
Work path: <workPath>
Approach: <copy from bug.md "Fix approach">

Implement:
1. The fix itself
2. A regression test that fails before the fix and passes after
3. Any cleanup necessary

Draft commit message to .adlc/bugs/BUG-NNN-<slug>/commits-draft.md.
Run tests; verify they pass.
Surface lesson candidates to .adlc/bugs/BUG-NNN-<slug>/lesson-candidates.md per your skill instructions (source tag remains `implement-task`; the bugfix folder is the candidates location).
Do NOT run git mutations.
```

### Verify the fix

After task-implementer returns:

- Confirm the regression test exists and passes
- Confirm running the original repro steps no longer produces the bug
- Confirm no other tests broke

### Gate prompt

```
🛑 Gate: Fix — BUG-NNN-<slug>

Files changed: <count>
Tests added: <count> (regression: <name>)
All tests pass: ✓

Commit drafted: .adlc/bugs/BUG-NNN-<slug>/commits-draft.md

Reply:
  approve         — proceed to verify
  revise: <text>  — adjust the fix
  abort
```

## Phase 4 — Verify (gate)

Slimmer than `/review`. Dispatch **only** `correctness-reviewer` and `reflector` (the two most likely to find issues in a bug fix). Skip quality and architecture unless the fix touched layering or introduced significant new code.

The user commits before this runs — same as `/proceed`'s Phase 4 protocol.

When dispatching, pass `Candidates file: .adlc/bugs/BUG-NNN-<slug>/lesson-candidates.md` so the reviewers append to the bugfix folder (not a REQ folder). Tags from those agents remain `review-corr` and `review-reflect`.

### Findings

Consolidate into `.adlc/bugs/BUG-NNN-<slug>/verification.md` with the same shape as `/review`'s output but only two reviewer sections.

### Gate prompt

```
🛑 Gate: Verify — BUG-NNN-<slug>

Reviewers: correctness, reflector

Findings:
  Critical: <N>
  Major:    <N>
  Minor:    <N>

Reply:
  approve              — proceed to ship
  fix: <ids>           — apply fixes
  revise: <text>       — other revisions
  abort
```

## Phase 5 — Ship (gate)

Same as `/wrapup`, but with the bug-specific knowledge capture:

### Process candidates and write vault artifacts

Mirrors `/wrapup`'s "Process candidates" step, but bound to the bugfix folder:

1. **Read `.adlc/bugs/BUG-NNN-<slug>/lesson-candidates.md`.** If absent, sweep `bug.md`, `investigation.md`, and `verification.md` for capture-worthy patterns and write them as candidates before continuing.
2. **For each candidate, verdict one of**: `promote` → new lesson, `demote-to-gotcha` → new gotcha entry, `discard` with one-line reason.
3. **Append a `## Candidate verdicts` table** to the bottom of the candidates file with the verdicts and target/reason for each.
4. **Mandatory minimum for bugfix:** at least one non-discard verdict (promote OR demote-to-gotcha). A bug fix that produced zero non-discard verdicts is a missed knowledge opportunity — push back on yourself before issuing the gate prompt; if you genuinely conclude there's nothing to keep, surface that explicitly in the gate prompt for the user's call.
5. Write the resulting lessons (minimum-required fields only per the lesson template) to `knowledge/lessons/` and append gotchas to `knowledge/gotchas.md`.

### PR draft

`bug-fix-pr-draft.md` with:

- Title: `fix(scope): <short description> [BUG-NNN-<slug>]` (or project's bug-fix title format from conventions.md)
- Body: summary, reproduction (from bug.md), fix description, regression test description, lessons/gotchas captured

### Merge checklist

Same shape as `/wrapup`'s `merge-checklist.md`.

### Gate prompt

```
🛑 Gate: Ship — BUG-NNN-<slug>

PR drafted: .adlc/bugs/BUG-NNN-<slug>/bug-fix-pr-draft.md
Merge checklist: .adlc/bugs/BUG-NNN-<slug>/merge-checklist.md

Vault updates from candidates:
  Candidates considered:    <N>
  Promoted to lesson:       <count> — <list of new LESSON-NNN>
  Demoted to gotcha:        <count> — <list of new ^gNN>
  Discarded:                <count> — see lesson-candidates.md verdicts
  Hot log:                  <count> entries

  ⚠ If "Promoted + Demoted = 0" on a bugfix — confirm this fix genuinely
    produced no vault-worthy knowledge, or `revise: capture` to walk back
    through bug.md, investigation.md, and verification.md.

Reply:
  approve         — gate cleared, run the merge checklist
  revise: <text>
  merged          — finalize after merge
  abort
```

## Constraints

- **Never run git mutations.** Same rules as everywhere else.
- **Never expand scope mid-bug.** If during investigation the fix grows past a small area, surface and recommend reframing.
- **Always add a regression test.** No exceptions. A bug fix without a regression test is borrowing against future debugging.
- **Always capture knowledge.** At least one non-discard verdict (promote OR demote-to-gotcha) at Phase 5. The verdict step exists precisely to keep the vault high-signal — discards are allowed, but a bug fix that ends in all-discards needs explicit user confirmation, not a silent skip.

## Output artifacts

Per `BUG-NNN-<slug>`:

- `bug.md` (report, with investigation log appended)
- `investigation.md` (from codebase-explorer)
- `commits-draft.md`
- `verification.md`
- `bug-fix-pr-draft.md`
- `merge-checklist.md`
- `lesson-candidates.md` (created or appended to across phases 2-4; verdicts appended at Phase 5; persists as decision history)
- `pipeline-state.json`
- Vault updates: gotchas, lessons, hot.md, index.md
