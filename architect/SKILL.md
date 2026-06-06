---
name: architect
description: Design the architecture and task breakdown for a REQ. Phase 2 of /proceed. Dispatches codebase-explorer to inform the design, then drafts architecture.md and tasks/TASK-*.md. Ends in the architecture gate — user must approve before /implement.
---

You are running Phase 2 of the ADLC pipeline: designing the architecture and breaking the work into tasks.

## When to use

- The spec gate has been cleared for the REQ.
- The user invokes `/architect REQ-NNN-<slug>` directly, or `/proceed` is moving past the spec gate.

## Preflight

1. **Verify spec gate cleared.** Read `.adlc/specs/REQ-NNN-<slug>/pipeline-state.json`. If `currentPhase < 1` or `gateState != "cleared"` for the spec phase, **stop** — direct the user to run `/spec` first.
2. **Read the toolkit ETHOS.**
3. **Load vault context.** `.adlc/CLAUDE.md`, `now.md`, `config.yml`, `context/architecture.md`, `context/conventions.md`, all accepted ADRs in `architecture/`, the spec at `specs/REQ-NNN-<slug>/requirement.md`.
4. **Establish the work path.** If `pipeline-state.json.workPath` is null:

   a. Read `config.yml.workflow.isolation` (default: `auto`).
   b. Resolve the mode:
      - `auto` → `branch` (architect is a single-REQ skill).
      - `branch` → `branch`.
      - `worktree` → `worktree`.
      - If `config.yml.repos` declares siblings and this REQ's spec touches more than one repo, force mode to `worktree` regardless of the config value. Surface the override in chat so the user knows why.
   c. Read the primary repo path from `config.yml`. Derive the branch name from `conventions.md`'s branch-naming rule, default `feat/REQ-NNN-<slug>`.
   d. Execute by mode:
      - **`branch` mode.** Verify the working tree is clean: `git -C <repo-path> status --porcelain`. If the output is non-empty, **stop and surface** — direct the user to commit or stash, or to set `workflow.isolation: worktree` in `config.yml` if they want parallel uncommitted work to coexist with this REQ. If clean, run `git -C <repo-path> checkout -b <branch-name>`. Update `pipeline-state.json` with `isolation: "branch"`, `workPath: <repo-path>`, `branch: <branch-name>`, `worktree: null`.
      - **`worktree` mode.** Derive the worktree path: `<repo-path>/.worktrees/REQ-NNN-<slug>`. Run `git -C <repo-path> worktree add <worktree-path> -b <branch-name>`. Update `pipeline-state.json` with `isolation: "worktree"`, `workPath: <worktree-path>`, `worktree: <worktree-path>`, `branch: <branch-name>`.
   e. Append to `hot.md`: `## [DATE] work-path-set | REQ-NNN-<slug> | <mode> at <workPath>`.

## Steps

### 1. Dispatch codebase-explorer

Launch the `codebase-explorer` agent (Haiku tier) with the following prompt:

```
REQ: REQ-NNN-<slug>
Spec path: .adlc/specs/REQ-NNN-<slug>/requirement.md
Work path: <work-path>
Vault root: .adlc/

Do a structured recon pass per your skill instructions. Write the report to:
  .adlc/specs/REQ-NNN-<slug>/exploration.md
```

Wait for the agent to complete. Verify `exploration.md` exists and has all four sections.

If the agent reports a contradiction with the spec, **stop and surface** to the user before continuing.

### 2. Draft architecture.md

Copy `.adlc/templates/architecture-template.md` to `.adlc/specs/REQ-NNN-<slug>/architecture.md`. Fill it based on:

- The spec (`requirement.md`)
- The exploration report (`exploration.md`)
- Project conventions (`context/conventions.md`)
- Existing ADRs (`architecture/adr-*.md` with status `accepted`)
- Relevant lessons, gotchas, and concepts from the vault

Sections to fill:

- **Summary** — what changes, where, why (one paragraph)
- **Blast radius** — table populated from exploration findings
- **Approach** — how the change is structured. Where the new code lives, what patterns it follows
- **Task DAG** — tasks broken into dependency tiers
- **Test strategy** — what gets tested at what level
- **Convention alignment** — explicit statement of which conventions apply; call out any deviations with justification
- **Risks** — what could go wrong and mitigations
- **Open questions** — anything that couldn't be resolved

### 3. Create task files

For each task in the DAG, create `.adlc/specs/REQ-NNN-<slug>/tasks/TASK-NNN.md` from `templates/task-template.md`.

Tasks should be:

- **Atomic** — one task touches one logical concern. Don't bundle "add endpoint" and "add migration" into one task.
- **Independently testable** — each task has its own acceptance criteria.
- **Tier-labeled** — tier 0 has no dependencies; tier N depends only on earlier tiers.
- **Right-sized** — too granular (10+ tasks for a small change) is as bad as too coarse (1 mega-task).

Each task file includes:

- Goal (one sentence)
- Files to touch (table)
- Approach (2-3 bullets)
- Acceptance criteria (checklist)
- Dependencies (`depends on: TASK-001, TASK-002`)
- Notes

### 4. Decide if a new ADR is needed

If the architecture introduces a decision that's not already covered by an accepted ADR — choice of library, structural pattern, integration approach — **draft an ADR**.

- Create `.adlc/architecture/adr-NNN-<slug>.md` from `templates/adr-template.md`.
- Status: `proposed`.
- The gate review covers ADR acceptance alongside the architecture itself.
- Update `.adlc/decisions.md` with a new row.

If no new decision: skip this step.

### 5. Update vault stubs

If the change touches a major module that doesn't have a component page, create a stub:

- `.adlc/knowledge/components/<module-name>.md` with at minimum a one-paragraph description and a "Touched by" list including this REQ.

If a concept is being introduced that's worth capturing now (rather than at `/wrapup`), create the concept page stub.

These are stubs — `/wrapup` fills them in with what was actually learned.

### 6. Inline validation

Walk this checklist:

- [ ] **All acceptance criteria from the spec are covered** by at least one task.
- [ ] **No circular dependencies** in the task DAG.
- [ ] **Tasks have clear acceptance** that's mechanically checkable.
- [ ] **Design follows project conventions** or explicitly justifies the deviation.
- [ ] **Blast radius is accurate** — every file in the radius is referenced by at least one task.
- [ ] **Lessons checked are listed** in the "Related" section of architecture.md.
- [ ] **If a new ADR was drafted**, it's linked from architecture.md.
- [ ] **Test strategy is concrete** — specific test files to add, not just "add tests".

### 7. Update pipeline state

```json
"currentPhase": 2,
"completedPhases": [0, 1, 2],
"gateState": "awaiting",
"currentPhaseGate": "architect"
```

### 8. Write the gate marker

Create `.awaiting-approval` with:

```
Phase: architect
REQ: REQ-NNN-<slug>
Awaiting: review the architecture and tasks, approve to proceed to /implement.
Files:
  - .adlc/specs/REQ-NNN-<slug>/architecture.md
  - .adlc/specs/REQ-NNN-<slug>/tasks/*.md
  - .adlc/specs/REQ-NNN-<slug>/exploration.md
  - .adlc/architecture/adr-NNN-<slug>.md (if drafted)
```

### 9. Emit the gate prompt

```
🛑 Gate: Architect — REQ-NNN-<slug>

Drafted:
- architecture.md (blast radius, approach, task DAG)
- tasks/ — <N> tasks across <M> tiers
- exploration.md (codebase recon)
- [new ADR if drafted]

Task DAG:
  Tier 0: TASK-001, TASK-002
  Tier 1: TASK-003 (depends on T1), TASK-004 (depends on T2)
  Tier 2: ...

Inline validation:
[✓ / ⚠] All acceptance criteria covered by tasks
[✓ / ⚠] No circular dependencies
[✓ / ⚠] Conventions followed or deviations justified
[✓ / ⚠] Test strategy concrete
[✓ / ⚠] Lessons / gotchas / ADRs referenced

Vault references:
- [[knowledge/lessons/LESSON-xxx]] — short note
- [[architecture/adr-NNN-<slug>]] — newly proposed (if applicable)

Open questions in architecture:
- ...

Reply with one of:
  approve         — clear the gate, ready to run /implement
  revise: <text>  — describe what to change
  abort           — discard this architecture (keeps the spec)
```

## Gate clearance

If `approve`:

1. Delete `.awaiting-approval`.
2. Update `pipeline-state.json`: `gateState: "cleared"`.
3. If an ADR was proposed, prompt: "Mark ADR-NNN as `accepted`?" (separate confirmation). Update its status and `decisions.md` if yes.
4. Append to `hot.md`: `## [DATE] architect-gate-cleared | REQ-NNN-<slug>`.
5. Tell the user: ready for `/implement REQ-NNN-<slug>` or `/proceed` to continue.

If `revise: ...`:

1. Apply revisions.
2. Re-run inline validation.
3. Re-emit gate prompt.

If `abort`:

1. Confirm explicitly.
2. Surface the cleanup commands the user must run. The set depends on `pipeline-state.isolation`:

   **`branch` mode** (Claude cannot run any of these — all mutate working-tree or branch state):

   ```
   git -C <repo-path> checkout <base-branch>
   git -C <repo-path> restore .
   git -C <repo-path> clean -fd
   git -C <repo-path> branch -D <branch-name>
   ```

   **`worktree` mode:**

   - Claude runs: `git -C <repo-path> worktree remove --force <worktree-path>`
   - User runs: `git -C <repo-path> branch -D <branch-name>`

3. Delete `architecture.md`, `tasks/`, `exploration.md` from the REQ folder.
4. If an ADR was drafted, mark it `rejected` (don't delete — keep the historical record).
5. Append to `hot.md`: `## [DATE] architect-aborted | REQ-NNN-<slug>`.

## Constraints

- **Branch or worktree creation is the only git mutation** allowed, and only at preflight step 4 (depending on isolation mode). `git checkout -b` for branch mode, `git worktree add` for worktree mode.
- **Working tree must be clean in branch mode.** Refuse to proceed if `git status --porcelain` is non-empty — surface the conflict and let the user choose between cleanup or switching to worktree mode.
- **Branch deletion** on abort is always the user's job — surface the command, don't run it.
- **Never proceed past the gate** without explicit `approve`.
- **Don't write code.** Tasks describe what to write; `/implement` writes it.
- **Cite vault references** for every architectural choice that has prior art.

## Output artifacts

- `.adlc/specs/REQ-NNN-<slug>/architecture.md`
- `.adlc/specs/REQ-NNN-<slug>/exploration.md` (from codebase-explorer)
- `.adlc/specs/REQ-NNN-<slug>/tasks/TASK-*.md`
- `.adlc/architecture/adr-NNN-<slug>.md` (if a new decision was made)
- Updates to `pipeline-state.json`, `.awaiting-approval`, `hot.md`, `decisions.md`
- New stubs in `knowledge/components/` and `knowledge/concepts/` if applicable
