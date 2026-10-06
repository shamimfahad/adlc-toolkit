---
name: implement
description: Execute the task DAG for a REQ. Phase 3 of /proceed. Dispatches task-implementer agents (tier-based parallel where possible), drafts commit messages to commits-draft.md, runs tests, then ends in the implement gate.
---

You are running Phase 3 of the ADLC pipeline: implementing the tasks for a REQ.

## When to use

- The architecture gate has been cleared for the REQ.
- The user invokes `/implement REQ-NNN-<slug>` directly, or `/proceed` is moving past the architect gate.

## Preflight

1. **Resolve the REQ folder, then verify the architecture gate cleared.** Resolve the REQ per `$TOOLKIT_PATH/core/VAULT-LAYOUT.md`'s `resolve` rule. The result is `<REQ_PATH>` — vault-relative, no `.adlc/` prefix — and every path below is written `.adlc/<REQ_PATH>/…`. Then read `.adlc/<REQ_PATH>/pipeline-state.json`. If `currentPhase < 2` or `gateState != "cleared"` for the architect phase, **stop** — direct the user to run `/architect`.
2. **Read the toolkit ETHOS** (`$TOOLKIT_PATH/ETHOS.md`) **, the gate protocol** (`$TOOLKIT_PATH/core/GATE-PROTOCOL.md`)**, the voice guide** (`$TOOLKIT_PATH/core/VOICE.md`)**, and the vault layout** (`$TOOLKIT_PATH/core/VAULT-LAYOUT.md` — where work records live on disk; never hard-code a path under `specs/`, `bugs/`, or `sprints/`) — the shared gate-card format used at step 9.
3. **Load context.** `.adlc/CLAUDE.md`, `now.md`, `config.yml`, `context/conventions.md`, `<REQ_PATH>/requirement.md`, `architecture.md`, `exploration.md`, all `tasks/TASK-*.md`.
4. **Verify the work path exists.** Read `pipeline-state.json.workPath`, `isolation`, and `branch`. Check `workPath` is a valid directory. In `worktree` mode, also verify the worktree is still registered (`git -C <repo-path> worktree list`). In `branch` mode, verify the branch ref exists (`git -C <workPath> rev-parse --verify <branch>`). If anything is missing, stop and surface — `/architect` should have established the work path.
5. **Confirm cwd discipline.** All Bash calls must use absolute paths or `git -C <workPath>` form. Shell cwd does not persist between Bash calls.
6. **Work out where the assistant may edit freely, and when it must ask.** Read `config.yml.workflow.edits` (default `confirm-out-of-scope`). The REQ's **blast radius** is its work path (`pipeline-state.json.workPath`) plus the union of files named in the `tasks/TASK-*.md` "Files to touch" tables. This is the zone the implementer may edit freely. The *edge* of the radius — where the implementer must stop and surface instead of editing — is: a file no task named, a new top-level dependency, a schema/migration change, or anything touching auth/security/secrets. In `confirm-each` mode, every write is surfaced regardless. Carry this rule into every dispatch below (ETHOS principle 1: edit freely inside the scope, hard stop at the edge). When a task's "Files to touch" names a user-facing doc (README, `docs/`, API reference), updating it is part of completing that task — write the doc change in the same diff as the code, so it's reviewed at `/review` rather than discovered stale later.

## Steps

### 1. Read the task DAG

Parse the dependency graph from the task files. For each task, read `depends on:` and `blocks:` fields.

Build the tier structure:

- Tier 0: tasks with no dependencies
- Tier N: tasks whose dependencies are all in tier < N

If you find a circular dependency that wasn't caught at the architect gate, **stop and surface** — request `/architect` redo.

### 2. Execute tier 0 in parallel

For each task in tier 0, launch a `task-implementer` agent (deep tier) with the following prompt. Write the resolved path out in full — the agent resolves nothing, so `<REQ_PATH>` must already be substituted when it arrives:

```
Task: TASK-NNN
Task file: .adlc/<REQ_PATH>/tasks/TASK-NNN.md
REQ folder: .adlc/<REQ_PATH>/
Work path: <workPath from pipeline-state.json>
Architecture: .adlc/<REQ_PATH>/architecture.md
Exploration: .adlc/<REQ_PATH>/exploration.md

Implement the task per your skill instructions. Write code in the worktree.
Edit posture: <workflow.edits>. Blast radius = this work path + the files this
task names. Edit freely inside it. STOP and report (do not edit) if the work
needs to cross the edge: a file no task named, a new top-level dependency, a
schema/migration, or anything touching auth/security/secrets.
Draft commit messages to .adlc/<REQ_PATH>/commits-draft.md (append). Hard caps apply: ≤10 body lines per commit, ≤12 lesson candidates of ≤4 lines, status report ≤15 lines — narrative goes in your task file's ## Notes.
Run tests, verify they pass.
Surface lesson candidates to .adlc/<REQ_PATH>/lesson-candidates.md per your skill instructions (bar: when in doubt, surface).
Do NOT run any git mutation commands.
Report when done.
```

Dispatch all tier-0 tasks in a single message so they run concurrently. **Dispatch by exact agent name.** If the agent type isn't available (not installed, or the sync hasn't run since it was added), **stop and tell the user**: "`<agent>` isn't installed — run the toolkit sync, then re-run this step." Never absorb the agent's work into the main session as a fallback: inline work runs at the session's model instead of the agent's tier (a haiku-priced exploration silently becomes an opus-priced one), and for reviewers it destroys the independence the gate depends on — the same context that wrote the code would be reviewing it.

### 3. Wait for tier 0 to complete

Collect status from each agent. For each:

- **Done, tests pass** → mark task complete in `pipeline-state.json.taskStatus`. If you add to `notes[]`, one entry per task, ≤160 characters (`TASK-NN done <date>: <tests> · <outcome>`); the implementer's narrative is in `tasks/TASK-NN.md` → `## Notes`, not in state.
- **Done, tests fail** → STOP. Do not proceed to next tier. Surface failure to user.
- **Blocked** → STOP. Surface the blocker.
- **Deviation surfaced** → STOP. Surface to user; they decide whether to approve the deviation or revise the task.

If any task in the tier failed or surfaced a blocker, halt the tier-based execution. Do not proceed to tier N+1 until the user resolves it.

### 4. Repeat for each tier

For each subsequent tier:

- Verify all dependencies in earlier tiers completed successfully.
- Dispatch all tasks in the current tier in parallel.
- Wait, collect status.
- Halt on any failure.

### 5. Final verification pass

After all tiers complete:

- Verify `commits-draft.md` has an entry for every task.
- Run every command in `config.yml → verify:` once more end-to-end (`format`, `lint`, `typecheck`, `test`, and each `sensors[]` entry; fall back to what `conventions.md` names when the block is absent and say so). All must pass; quote each command's last line in the gate card's CHECKS line — the same `verify:` line the implementers reported per task, now for the whole REQ. A `scope: changed` command does not prove the project type-checks; only a `scope: project` one does.
- Check for forbidden artifacts: `console.log`, `dbg!`, `TODO:` without a tracking link, `.skip()` on tests, commented-out code blocks larger than 2 lines.
  - Forbidden findings are flagged but do not block the gate — they go into the gate prompt for the user to triage.
- Verify no `--no-verify` flags were attempted. If task-implementer reports it tried to use one, escalate (this is a protocol violation).

### 6. Generate the commits-draft summary

Read `commits-draft.md`. Generate a summary block at the top:

```markdown
# Commit drafts — REQ-NNN-<slug>

| # | Subject | Files | Task |
|---|---|---|---|
| 1 | feat(scope): ... | 3 | TASK-001 |
| 2 | feat(scope): ... | 2 | TASK-002 |
| 3 | test(scope): ... | 1 | TASK-003 |

Run these commits in order from the worktree.

---

(detailed drafts below)
```

### 7. Update pipeline state

```json
"currentPhase": 3,
"completedPhases": [0, 1, 2, 3],
"gateState": "awaiting",
"currentPhaseGate": "implement",
"taskStatus": {
  "TASK-001": "complete",
  ...
}
```

### 8. Write the gate marker

`.awaiting-approval` with:

```
Phase: implement
REQ: REQ-NNN-<slug>
Awaiting: review the implementation, run the drafted commits, approve to proceed to /review.
Files:
  - Working diff at: <workPath>
  - .adlc/<REQ_PATH>/commits-draft.md
```

### 9. Emit the gate card

Emit the gate per `$TOOLKIT_PATH/core/GATE-PROTOCOL.md`. Map this phase's content:

- **Header** — `Gate 3 of 5 · Implement · REQ-NNN-<slug>`.
- **Verdict** — e.g. "all tasks done, tests pass — `<k>` items to clean before committing", or "clean — recommend approve".
- **READY** — `<N>` tasks in `<T>` stages; tests `<X>` passed / `<Y>` added; `<count>` commits drafted (`commits-draft.md`); `<count>` possible lessons noted (you decide what to keep at `/wrapup`). Include a one-line `git diff --stat` roll-up (full stat lives in the diff, not the card).
- **NEEDS YOU** — flagged artifacts to clean before committing (debug prints, TODO without link, `.skip()`/commented tests) and any surfaced deviation and whether it's handled or unresolved. Omit if nothing flagged.
- **CHECKS** — one compact line: no debug prints · no untracked TODO · no skipped/commented tests · all tests pass.
- **MY READ** — recommendation + one-line why (don't recommend approve while a deviation is unresolved or tests fail).
- **Decision** — on Claude, an `AskUserQuestion`: **approve** (gate cleared — run the commits from `commits-draft.md`, then `/review`), **revise** (what to change first), **abort** (discard implementation; worktree cleanup required). Mark approve *(Recommended)* per `MY READ`.

Example shape:

```
GATE 3/5 · Implement · REQ-NNN-<slug>
   all tasks done, tests pass — 1 item to clean first

READY       6 tasks in 3 stages · tests 41 passed / 5 added · 6 commits drafted
            diff: 9 files, +240 / -37
NEEDS YOU   ⚠ debug  console.log left in src/checkout/retry.ts:88

CHECKS      ⚠ debug prints · ✓ no untracked TODO · ✓ no skipped tests · ✓ tests pass

MY READ     revise — drop the stray log, then approve

Decision →  approve · revise <what> · abort
```

## Gate clearance

If `approve`:

1. Delete `.awaiting-approval`.
2. Update `pipeline-state.json`: `gateState: "cleared"`.
3. Append to `hot.md`: `## [DATE] implement-gate-cleared | REQ-NNN-<slug>`.
4. Remind the user: run the commits from `commits-draft.md`, then `/review REQ-NNN-<slug>`.

If `revise: ...`:

1. Apply revisions — either dispatch task-implementer for specific fixes, or edit directly for trivial changes.
2. Re-run final verification (step 5).
3. Re-emit gate prompt.

If `abort`:

1. Confirm explicitly. ("This will discard uncommitted code. Confirm?")
2. On confirmation, surface the cleanup commands. The set depends on `pipeline-state.isolation`:

   **`branch` mode** (Claude cannot run these — all mutate working-tree or branch state):

   ```
   git -C <workPath> restore .
   git -C <workPath> clean -fd
   git -C <workPath> checkout <base-branch>
   git -C <workPath> branch -D <branch>
   ```

   **`worktree` mode:**

   - Claude runs: `git -C <repo-path> worktree remove --force <workPath>`
   - User runs: `git -C <repo-path> branch -D <branch>`

3. Update `pipeline-state.json` to mark phase 3 as rolled back.
4. Append to `hot.md`: `## [DATE] implement-aborted | REQ-NNN-<slug>`.

## Constraints

- **Commits follow `git.mode`** (`.adlc/config.yml`, default `manual`). In `manual`, Claude does not commit — it writes `commits-draft.md` and the user commits after the gate clears. In `commit`/`commit+push`, Claude commits the approved work on the REQ's feature branch using `commits-draft.md` as the message (and pushes it, ff-only, in `commit+push`) once the gate clears — never a protected branch.
- **Edits stay inside the blast radius** (`config.yml.workflow.edits`, default `confirm-out-of-scope`). Free editing is confined to the work path and the files the tasks name. Crossing the edge — an unnamed file, a new top-level dependency, a schema/migration, or auth/security/secrets — is a **stop-and-ask**, never a silent reach. The ask is scripted; use plain words, not toolkit jargon: "I need to touch `<file>`, which isn't in the plan, because `<reason>`. OK to proceed, or should I find another way?" Then wait. This reduces in-phase friction without weakening the phase gate; the gate still owns the boundary.
- **Tier discipline.** Don't dispatch tier N+1 until tier N is fully complete.
- **Halt on first failure.** Don't paper over a failed task to keep the pipeline moving. The whole point of explicit gates is catching failures early.
- **Honor task scope.** If a task-implementer reports scope creep or a deviation, surface it to the user — don't approve it autonomously.
- **No `--no-verify`** ever. If a commit hook is failing, fix the underlying issue.

## Output artifacts

- Code changes in the worktree (uncommitted)
- `.adlc/<REQ_PATH>/commits-draft.md` (drafts for the user to run)
- `.adlc/<REQ_PATH>/lesson-candidates.md` (created or appended to by task-implementer; persists for /review and /wrapup)
- Updates to `pipeline-state.json` (taskStatus, currentPhase, gateState)
- Updates to `hot.md` on gate clearance or abort
