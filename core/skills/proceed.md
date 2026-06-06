---
name: proceed
description: End-to-end pipeline orchestrator. Runs /spec → /architect → /implement → /review → /wrapup in sequence with gate-pause between every phase. Resumable from any phase via pipeline-state.json. Use this when you want the full pipeline rather than invoking each phase skill separately.
---

You are the `/proceed` orchestrator. Your job is to walk a REQ through all five phases of the ADLC pipeline, pausing at every gate for human approval, and resuming cleanly across sessions.

## When to use

- The user wants to run the full pipeline for a feature, not invoke each phase by hand.
- The user wants to resume a partially-completed REQ after a session interruption or context compression.

Invocation patterns:

- `/proceed` — pick up the active REQ from `now.md` if there's one in flight; otherwise ask the user.
- `/proceed REQ-NNN-<slug>` — resume the named REQ from wherever its pipeline-state left off.
- `/proceed <free-text feature description>` — start a new REQ from scratch.
- `/proceed [REQ-NNN-<slug>] --resume` — produce a decision dossier (drift checks, recent activity, gate question re-rendered, menu) before continuing. Use after a break, a session crash, or any time you want context before pressing forward.
- `/proceed [REQ-NNN-<slug>] --revert~1` / `--revert~2` / `--revert~3` — walk back N completed phases via a `revert-plan.md` you approve. N is capped at 3; further walkbacks usually mean `--cancel` and re-running is cleaner.
- `/proceed [REQ-NNN-<slug>] --cancel` — abandon the REQ; writes a `cancelled.md` tombstone with a user-provided reason, frees the worktree (worktree mode), and drafts branch cleanup commands for the user to run.

Each flag's full protocol is in **Invocation flags** below. If the REQ ID is omitted with a flag, use `now.md`'s active REQ; if none, ask.

These flags assume `pipeline-state.json` is in sync with git reality. If state has drifted (session crash, work shipped outside the toolkit, branch deleted without /wrapup), run `/recover` first — it reconciles state-vs-reality. `--revert`, `--resume`, and `--cancel` are for deliberate operations on a healthy pipeline.

## Preflight

1. **Read the toolkit ETHOS.**
2. **Read `.adlc/CLAUDE.md`** for the per-project schema doc, and the navigation files: `now.md`, `hot.md` (last 20), `config.yml`, `context/project-overview.md`, `context/conventions.md`.
3. **Determine REQ identity.** Strip any `--resume`, `--revert~N`, or `--cancel` tokens out of the argument list before parsing the rest — flags are not REQ IDs and not free-text descriptions.
   - If a REQ ID was given, verify it exists; load its `pipeline-state.json`.
   - If a free-text description was given (and no flag was set), treat as a brand-new REQ — skip ahead to Phase 1 via `/spec`.
   - If only a flag was given, or no argument at all:
     - Check `now.md`'s active-REQ table. If exactly one REQ is in flight, use it.
     - If multiple, ask the user which one.
     - If none and no flag was set, ask the user for a feature description. If none and a flag was set, halt — the flag needs a target REQ.
4. **Route on invocation flags.** If any of `--resume`, `--revert~1`/`~2`/`~3`, or `--cancel` was set, dispatch to the matching protocol in **Invocation flags** below and exit this skill's main flow. The flag protocols own their own gate prompts and state updates; the standard phase walk does not run when a flag was invoked.

5. **Determine starting phase** (no flag set).
   - For a new REQ, start at Phase 1 (spec).
   - For an existing REQ, read `pipeline-state.json.currentPhase` and `.gateState`:
     - If `gateState: "awaiting"`, you're paused at a gate — re-emit the gate prompt for that phase.
     - If `gateState: "cleared"`, the next phase is ready to run.
     - If `currentPhase == 5` and `gateState: "cleared"`, the REQ is shipped — surface that and ask whether to mark `merged`.

## Invocation flags

These three flags branch out of preflight step 4. Each owns its own flow — they do not run the standard phase walk. All three require an in-sync `pipeline-state.json`; if state has drifted from git reality, run `/recover` first.

### `--resume` — decision dossier before continuing

Use after a break, a session crash, or any time you want context before pressing the gate forward. Differs from bare `/proceed REQ-NNN-<slug>` (which just re-emits the pending gate prompt and waits) by producing a richer pre-flight that surfaces drift before you commit to continuing.

Build and emit the dossier:

```
RESUME — REQ-NNN-<slug>
  Phase: <N> — <name>                  Gate: <awaiting / cleared>
  Last gate cleared: <timestamp> (<X hours/days ago>)

Pending question (from <phase>):
  <re-render the phase's gate prompt verbatim, by reading the phase skill's gate template>

Recent activity (last 5 hot.md entries for this REQ):
  YYYY-MM-DD <kind> | <description>
  …

Files in this REQ folder touched since last pipeline activity:
  <list .adlc/specs/REQ-NNN-<slug>/** with mtime > mtime of pipeline-state.json>
  <if last-seen.json exists, also flag files with mtime > last-seen.json mtime as "since you last resumed">

Repo files changed (Phase 3+ only):
  <git -C <workPath> diff --name-only HEAD; cap at 10 with "…and N more">

Drift checks:
  Vault edits outside the pipeline: <none / N files; list them>
  Worktree:                        <alive at <path> / MISSING>
  Branch ref:                      <alive / MISSING>
  Working tree:                    <clean / N uncommitted files>
  Commits past base:               <N> (drafted: <M>)
```

If any drift check returns a non-clean state, name it explicitly. If the worktree or branch is missing, or the vault has been edited outside the pipeline, recommend `/recover` before continuing — the drift may need reconciliation rather than just resumption.

If the gate has been open for more than 24 hours, add a one-line "you've been away" note at the top of the dossier so the user notices.

Then emit the menu:

```
Choose:
  continue           — proceed with the pending gate (same as bare /proceed)
  revert~1 / 2 / 3   — walk back N phases (runs --revert~N)
  cancel             — abandon this REQ (runs --cancel)
  switch             — list other in-flight REQs to attend to
  status             — full status report (runs /status)
```

Dispatch on the user's reply:

- `continue` → fall back into the standard phase walk at preflight step 5
- `revert~N` → invoke the `--revert~N` protocol below
- `cancel` → invoke the `--cancel` protocol below
- `switch` → list active REQs from `now.md` and `.adlc/specs/`; ask which to switch to; then re-run `--resume` against that REQ
- `status` → delegate to `/status` (read-only); after it returns, re-emit this menu

If invoked without a REQ ID, use `now.md`'s active REQ. If no active REQ, list all in-flight REQs and ask which.

`--resume` writes nothing to disk except an optional `last-seen.json` timestamp under `.adlc/specs/REQ-NNN-<slug>/` that future drift checks can compare against. It is otherwise read-only.

### `--revert~1`, `--revert~2`, `--revert~3` — walk back N completed phases

Use when state is in sync but you've decided the most recent phase(s) need to be redone. The architect produced something you've since judged wrong; verification surfaced findings that mean the implementation needs to start over; a wrapup wrote knowledge entries that shouldn't have shipped. N is capped at 3 by design — beyond three phases, `--cancel` and restart is usually less work.

**Steps:**

1. **Confirm scope.** Read pipeline-state.json. Identify the N most recently completed phases. The set of completed phases is `pipeline-state.completedPhases`. If N exceeds the count of completed phases, halt with an explicit message — do not silently clamp. (Example: `currentPhase: 2`, `gateState: "cleared"` means phases 1 and 2 are completed; `--revert~3` is out of bounds; suggest `--cancel`.)

2. **Build the revert plan.** Write `.adlc/specs/REQ-NNN-<slug>/revert-plan.md`. List, in reverse phase order, every phase being walked back. For each:

   | Phase | Artifacts to delete | Artifacts to tombstone (kept for memory) |
   |---|---|---|
   | 1 — Spec     | `requirement.md` | — |
   | 2 — Architect | `architecture.md`, `tasks/`, any `exploration.md` content authored by /architect | — |
   | 3 — Implement | per-task implementation notes in `tasks/`; reset task completion flags in pipeline-state | — |
   | 4 — Verify    | `verification.md` | — |
   | 5 — Ship      | `pr-draft.md`, `merge-checklist.md` | `knowledge/lessons/L-*` entries this REQ added; `knowledge/gotchas.md` `^g##` anchors this REQ added; `architecture/adr-*` files this REQ added |

   Knowledge-layer entries authored by /wrapup are **tombstoned, not deleted** — they remain in the vault with a banner: `> **STATUS: retracted on YYYY-MM-DD via /proceed --revert from REQ-NNN-<slug>** — kept for historical reference.` Institutional memory is lossy on the way out, never silently wiped.

3. **Quote contents before deletion.** Inside `revert-plan.md`, embed the full text of every file being deleted as a fenced block, captioned with the path. This makes the plan a self-contained undo for the next 24 hours if you change your mind.

4. **Handle Phase 3 (implement) specially.** If implement is one of the phases being walked back, the code itself has changed. Claude does not run `git reset`, `git revert`, or any mutating git command. Instead, write a companion `code-revert-plan.md` listing:
   - The commits in the branch that came from this REQ's implement phase (`git -C <workPath> log <base-branch>..<branch> --oneline` filtered against `commits-draft.md`)
   - Files whose state should return to base (`git -C <workPath> diff <base-branch>..HEAD --name-only`)
   - Suggested commands for the user to run by hand (e.g., `git revert <hash>` or `git reset --hard <base-branch>` depending on whether commits are recoverable)
   - An explicit warning that the vault will be rolled back assuming the user runs the git ops; if they choose not to, the vault and code are now divergent, which is a recovery case — point at `/recover`.

5. **Pause for approval.** Emit:

   ```
   Revert plan written to .adlc/specs/REQ-NNN-<slug>/revert-plan.md.
   This will walk REQ-NNN-<slug> back from phase <old> to phase <new>.
   <If implement included:> A companion code-revert-plan.md was also written. Git operations are yours to run.

   Reply with:
     approve         — execute the vault-side changes
     revise: <text>  — adjust the plan (e.g., keep a specific artifact)
     abort           — leave state unchanged; plan stays on disk marked aborted
   ```

6. **On `approve`:** execute the vault-side changes per the plan. Then update `pipeline-state.json`:

   ```json
   {
     "currentPhase": <new-phase>,
     "completedPhases": <truncated to phases 1..new-phase>,
     "gateState": "cleared",
     "currentPhaseGate": "<new-phase-gate-name>",
     "revertedAt": "<now>",
     "revertedFrom": <old-phase>,
     "revertCount": <N>
   }
   ```

   Append to `hot.md`: `## [DATE] req-reverted | REQ-NNN-<slug> | -<N> phases | <old-phase-name> → <new-phase-name>`.

   If Phase 5 was included and knowledge entries were tombstoned, append per-entry: `## [DATE] knowledge-retracted | L-NNN — <title> (via revert)`.

7. **On `revise`:** edit `revert-plan.md` per feedback, re-emit the approval prompt.

8. **On `abort`:** leave pipeline-state unchanged. Append `> ABORTED — not executed.` to `revert-plan.md`. Append `## [DATE] revert-aborted | REQ-NNN-<slug>` to hot.md so the trail records the consideration.

After execution, the REQ is at the predecessor phase's "cleared" state, ready for normal `/proceed` to advance forward again from there.

### `--cancel` — deliberate abandonment of a REQ

Use when you've decided this REQ should not ship at all. Distinct from `abort` in gate-response routing (which is part of the gate-time flow); `--cancel` is the explicit out-of-gate kill switch.

If the REQ is already `terminal: "merged"` or `terminal: "aborted"` or `terminal: "cancelled"`, halt with a message.

**Steps:**

1. **Confirm.** Show a brief context block and prompt for a reason:

   ```
   Cancel REQ-NNN-<slug>?
     Phase: <N> — <name>
     Gate state: <awaiting / cleared>
     Last activity: <timestamp from pipeline-state>
     Branch: <branch>  Isolation: <branch / worktree>

   The reason is required — it goes into the tombstone for future searches.
   Reply with a one-line reason, or `no` to keep the REQ alive.
   ```

   If the user replies anything but a non-empty reason or `no`, ask again.

2. **Write the tombstone** at `.adlc/specs/REQ-NNN-<slug>/cancelled.md`:

   ```markdown
   # REQ-NNN-<slug> — Cancelled

   | Field | Value |
   |---|---|
   | Cancelled at | YYYY-MM-DD HH:MM |
   | Phase at cancellation | <N> — <name> |
   | Gate state | <awaiting / cleared> |
   | Reason | <user-provided one-liner> |
   | Branch | <branch> |

   ## Artifacts present at cancellation

   <bulleted list of files that exist in this REQ folder, so future vault searches surface what was tried>

   ## Why this REQ was cancelled

   <user-provided reason, optionally expanded with the last 3 hot.md entries for context>

   ## Notes for future readers

   This REQ was abandoned deliberately, not lost or crashed. The partial artifacts are kept so future work in this area can see what was considered and rejected. If you find yourself solving a problem this REQ touched, read what's here before starting fresh — at minimum read `requirement.md` and any `architecture.md` that exists.
   ```

3. **Update `pipeline-state.json`:**

   ```json
   {
     "terminal": "cancelled",
     "cancelledAt": "<now>",
     "cancelReason": "<user-provided>"
   }
   ```

   Do not change `currentPhase` or `completedPhases` — the tombstone reflects where work stopped.

4. **Free the worktree (worktree mode only).** Claude runs `git -C <repo-path> worktree remove --force <workPath>` if `pipeline-state.isolation == "worktree"` and the worktree still exists. This is one of the few git mutations Claude is allowed under the toolkit policy.

5. **Surface branch cleanup (do not execute).** Print commands for the user:

   - **worktree mode:**
     ```
     git -C <repo-path> branch -D <branch>
     ```
   - **branch mode:**
     ```
     git -C <repo-path> checkout <base-branch>
     git -C <repo-path> restore .
     git -C <repo-path> clean -fd
     git -C <repo-path> branch -D <branch>
     ```

6. **Append to `hot.md`:** `## [DATE] req-cancelled | REQ-NNN-<slug> | <reason>`.

7. **Update `now.md`** if this REQ was the active focus — remove it from the active table; leave focus blank or move to another in-flight REQ if there is one.

8. **Final report:**

   ```
   REQ-NNN-<slug> cancelled.
     Reason: <reason>
     Tombstone: .adlc/specs/REQ-NNN-<slug>/cancelled.md
     Worktree: <removed / n/a — branch mode>
     Branch cleanup: run the commands above to delete the branch.
   ```

`--cancel` does NOT delete the REQ folder. The cancellation is institutional memory; the folder remains so future vault searches can find it.

## Phase walk

For each phase, in order, follow this protocol:

### Phase advance loop

```
while currentPhase < 5:
    if gateState == "awaiting":
        re-emit the gate prompt for currentPhase
        WAIT for user response
        continue (loop)

    if gateState == "cleared":
        nextPhase = currentPhase + 1
        invoke the skill for nextPhase
        # The skill writes .awaiting-approval and sets gateState = "awaiting"
        re-emit the gate prompt
        WAIT for user response
        continue (loop)
```

The phase-to-skill mapping:

| Phase | Skill |
|---|---|
| 1 — Spec | `/spec` |
| 2 — Architect | `/architect` |
| 3 — Implement | `/implement` |
| 4 — Verify | `/review` |
| 5 — Ship | `/wrapup` |

Each phase skill knows how to:

- Read `pipeline-state.json` to confirm preconditions
- Do its work
- Write `.awaiting-approval`
- Update `gateState` to `"awaiting"`
- Emit its gate prompt

Your job as `/proceed` is the **outer loop**: invoke the skill, wait for user response, route the response (approve / revise / abort) to the right handler.

### Gate response routing

When the user replies at a gate, route the response:

- **`approve`** → the phase skill handles cleanup (delete marker, set `gateState: "cleared"`, log to hot.md). You advance to the next phase.
- **`revise: <text>`** → the phase skill handles revision. You stay in the same phase, re-emit the gate prompt after revision.
- **`fix: <ids>`** (verify phase only) → the verify skill dispatches task-implementer for the fixes. You stay in the verify phase, re-emit gate prompt after fixes.
- **`merged`** (ship phase) → the wrapup skill finalizes state. You exit the loop with a "REQ complete" summary.
- **`abort`** → the phase skill rolls back its work. You exit the loop. The REQ is not deleted (unless the user explicitly confirms), but `pipeline-state.json` reflects the aborted state.

If the user gives a response you don't recognize, ask for clarification — don't guess.

## Cross-session resumption

Sessions get interrupted. Context compresses. The user closes the window. When `/proceed` is invoked again on the same REQ:

1. Read `pipeline-state.json` — this is the source of truth.
2. Verify the work path: `pipeline-state.workPath` should exist as a directory. In `worktree` mode, also verify the worktree is still registered (`git -C <repo-path> worktree list`). In `branch` mode, verify the branch ref still exists (`git -C <workPath> rev-parse --verify <branch>`). If anything is missing, ask the user whether to recreate.
3. Check `.awaiting-approval`:
   - If present → you're paused at a gate. Re-emit the gate prompt for `pipeline-state.currentPhaseGate`.
   - If absent → the most recent gate was cleared. Advance to the next phase.
4. Read `hot.md`'s last 20 entries to refresh on what's happened.

Never skip a phase silently. If the state suggests a phase was skipped (e.g., `currentPhase` jumped from 2 to 4), halt and surface.

## Multi-repo (cross-repo REQs)

If `config.yml` declares sibling repos and the spec marks tasks across multiple `repo:` fields:

- `/architect` creates a worktree in each touched repo. Cross-repo REQs force `worktree` mode regardless of `config.yml.workflow.isolation`. `pipeline-state.json.repos` is a map of repo-id → `{path, workPath, worktree, branch, touched, merged}`.
- `/implement` dispatches task-implementer agents into the correct worktree per task.
- `/review` runs reviewers against each repo's diff; findings are namespaced by repo in `verification.md`.
- `/wrapup` drafts one PR per touched repo and produces a merge checklist that lists them in `mergeOrder` from `config.yml`.

`/proceed` itself doesn't change shape across repos — the phase skills handle the per-repo logic. Just make sure the gate prompts show per-repo status.

## Status surface

At any time, the user might want to see where things stand without advancing. If the user says `status` (or invokes `/status` separately), surface:

- Current phase, gate state
- Work path(s), isolation mode(s), branch(es)
- Files changed so far (`git diff --stat` from base)
- Findings counts (if past Phase 4)
- Blockers list

This is read-only and doesn't change pipeline state.

## Constraints

- **You never skip a phase.** Even if the user asks. The right tool for that is `/bugfix` (which has a different, slimmer pipeline) or invoking specific phase skills directly.
- **You never run git mutations.** Every git action is in the phase skills, and only worktree creation is allowed there. The two exceptions are worktree *creation* in Phase 2 (architect) and worktree *removal* in `--cancel` — both are lifecycle operations, not content mutations. Code commits, branch deletes, pushes, PRs, and merges are always the user's to run.
- **`--revert` never touches code.** The vault is rolled back; code rollback is drafted as `code-revert-plan.md` for the user to execute. If the user declines to run the git ops, the vault and code are now divergent — that's a `/recover` case.
- **`--cancel` is REQ-wide.** Distinct from the gate-time `abort` response, which only aborts the current phase's work. `--cancel` terminates the entire REQ with a tombstone.
- **You never auto-fix gate failures.** A reviewer flag, a test failure, a missing artifact → surface to the user.
- **You never collapse two gates into one.** Each gate is a discrete approval moment.
- **You never assume context.** Re-read `pipeline-state.json` at every phase boundary. State is the source of truth.

## Done condition

`/proceed` completes when:

- `pipeline-state.currentPhase == 5`
- `gateState == "cleared"` for ship
- `prState == "merged"`
- A final summary has been emitted in chat, listing what was built, what was learned, and links to the merged PR

OR when the user explicitly aborts, at which point a clean exit message is emitted.

## Failure handling

If any phase skill emits `terminal: failed` or `terminal: blocked` rather than reaching its gate:

1. Halt the loop.
2. Surface the failure / blocker.
3. Suggest next steps (retry, manual fix, abort).
4. Wait for the user's direction. Do not auto-retry.
