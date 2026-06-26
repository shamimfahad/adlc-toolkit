---
name: architect
description: Design the architecture and task breakdown for a REQ. Phase 2 of /proceed. Dispatches codebase-explorer to inform the design, then drafts architecture.md and tasks/TASK-*.md. On high-stakes REQs, dispatches the architecture-adversary to attack the design before the gate so the user reviews a stress-tested plan. Ends in the architecture gate — user must approve before /implement.
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
5. **Resolve a design reference (optional).** If `config.yml.sources.design` is set (not `none`) and the spec or the user supplies a design reference (a Figma frame/file link, or a node mentioned in `requirement.md`):
   - Resolve the mechanism, first that works wins: an attached MCP server for the design tool, else a plain fetch if the reference is a full URL.
   - If it resolves, pull the frame/flow and carry it into step 2 as draft material for UI structure, component boundaries, and UI-facing acceptance criteria. Add the design link to architecture.md's "Related" section for provenance.
   - If nothing resolves or no design service is configured, print one line (`couldn't reach <design service> — proceeding from the spec alone`) and continue. The seed is strictly additive and never blocks the architecture.

## Steps

### 1. Dispatch codebase-explorer

Launch the `codebase-explorer` agent (fast tier) with the following prompt:

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
- The resolved design reference, if any (preflight step 5) — for UI structure, component boundaries, and UI-facing acceptance criteria. Treat it as draft input the gate still reviews, not a binding contract.

Sections to fill:

- **Summary** — what changes, where, why (one paragraph)
- **Blast radius** — table populated from exploration findings. **Include user-facing docs:** if the change alters behavior the repo's docs describe (the paths in `config.yml` → `docs:`, or `README*` + `docs/` by default) — an API signature, a CLI flag, a default, a documented workflow — list those doc files in the blast radius too. They're part of the change, not an afterthought; scoping them in here is what gets them updated in the diff and reviewed instead of going stale. (`/review`'s reflector runs a doc-drift sweep as the backstop, but catching it here is cheaper.)
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
- Files to touch (table) — when a task changes behavior covered by a doc in the blast radius, list that doc file here so the update is implemented and reviewed alongside the code
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

### 7. Adversarial hardening (proportional)

Inline validation (step 6) confirms the plan has the right *parts*. This step pressure-tests whether the *decisions* are right — before the gate, so the user reviews a stress-tested plan instead of being the first to find the holes. This is the cheapest point in the pipeline to kill an expensive mistake: an architectural error caught here costs a paragraph; the same error caught at `/review` costs a rebuild.

The cost is proportional to the stakes — don't attack a trivial change.

**Decide the depth.** Run the **full pass** if *any* of these hold:

- A new ADR was drafted in step 4 (a real decision is being made).
- The blast radius is large — roughly 8+ files, or it spans 3+ modules/layers.
- The REQ is cross-repo (`config.yml` declares multiple `repos:` and tasks touch more than one).
- The change touches a sensitive surface: auth, security, secrets, a data/schema migration, a public API contract, or anything irreversible.

Otherwise run the **quick self-check** (no dispatch): you yourself ask the four sharpest questions of the plan — what acceptance criterion has no task, what failure mode is unhandled, what's the rollback story, what decision is implicit — and fix or note anything that surfaces. One short paragraph in the gate prompt; move on.

**Full pass — dispatch the adversary.** Launch the `architecture-adversary` agent (read-only) with:

```
REQ: REQ-NNN-<slug>
Work path: <workPath>
Branch: <branch>
Trigger: <new-adr | large-blast-radius | cross-repo | sensitive-surface>
Artifacts:
  - .adlc/specs/REQ-NNN-<slug>/requirement.md
  - .adlc/specs/REQ-NNN-<slug>/architecture.md
  - .adlc/specs/REQ-NNN-<slug>/tasks/*.md
  - .adlc/specs/REQ-NNN-<slug>/exploration.md (if present)
  - <new ADR path, if drafted>
Output file: .adlc/specs/REQ-NNN-<slug>/architecture-adversary.md

Attack the design before the gate. Report findings only — do not edit any artifact.
Follow your skill instructions for lenses, self-refutation, and output format.
```

Dispatch it as a subagent and wait for it to finish (it writes `architecture-adversary.md`).

**Address what survives.** Read the agent's report. For each surviving finding, take exactly one action and record which:

- **Fix** — revise `architecture.md` / `tasks/` to close the gap. Re-run the relevant step-6 checks for anything you changed.
- **Accept + document** — if the risk is acceptable, write it into architecture.md's **Open questions** / **Risks** with the reasoning, so the gate decision is informed rather than blind.

Do not pass an unaddressed `critical` finding to the gate. A critical with no fix and no documented acceptance is a `revise`, not an `approve` — surface it as such.

The gate prompt (step 10) reports what was attacked, what survived, and how each surviving finding was handled. If the quick self-check ran instead, say so in one line.

### 8. Update pipeline state

```json
"currentPhase": 2,
"completedPhases": [0, 1, 2],
"gateState": "awaiting",
"currentPhaseGate": "architect"
```

### 9. Write the gate marker

Create `.awaiting-approval` with:

```
Phase: architect
REQ: REQ-NNN-<slug>
Awaiting: review the architecture and tasks, approve to proceed to /implement.
Files:
  - .adlc/specs/REQ-NNN-<slug>/architecture.md
  - .adlc/specs/REQ-NNN-<slug>/tasks/*.md
  - .adlc/specs/REQ-NNN-<slug>/exploration.md
  - .adlc/specs/REQ-NNN-<slug>/architecture-adversary.md (if the full pass ran)
  - .adlc/architecture/adr-NNN-<slug>.md (if drafted)
```

### 10. Emit the gate prompt

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

Adversarial hardening:
  Depth: full pass (trigger: <new-adr | large-blast-radius | cross-repo | sensitive-surface>)
         — or — quick self-check (low-stakes REQ)
  Surviving findings: <C critical / M major / m minor>   (full pass only; report: architecture-adversary.md)
    1. <locus> — <short title> → fixed
    2. <locus> — <short title> → accepted, documented in Risks
  [⚠ if any critical is unaddressed — this should be a revise, not an approve]

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
2. Re-run inline validation. If the revision materially changed the approach, task DAG, or blast radius — or was prompted by an adversary finding — re-run step 7 (re-attack the changed surface; a quick re-pass is fine if only a narrow part changed).
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
