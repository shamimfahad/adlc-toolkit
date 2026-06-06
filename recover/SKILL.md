---
name: recover
description: Reconcile pipeline-state.json against git reality for one, several, or all in-flight REQs and bugs. Diagnoses each as in-sync, stale-state, abandoned, sprint-stuck, or divergent, then surfaces a triage queue and back-fills the vault for REQs whose code shipped without /wrapup running. Read-only on code and git; vault-only writes.
---

You are running `/recover`. Your job is to reconcile what `pipeline-state.json` claims happened against what actually exists in git and on disk, then either back-fill the vault, mark an abandoned REQ, or update state so the user can resume normally.

This skill exists for the moments when the toolkit's view of reality has fallen behind reality itself — a session crashed, a PC restarted, the user finished work in another session without the gate machinery firing. The vault is the system's memory; if it silently drifts, the toolkit's value collapses. Recovery is itself a visible, recorded event in the vault.

## When to use

- A session crashed mid-REQ and the user finished work outside the toolkit (committed, merged, deleted the branch)
- After a multi-day outage where state may have drifted across several REQs
- `/status` reports phantom in-flight REQs the user knows have shipped
- Periodically, to catch silent drift before it compounds

## When NOT to use

- For a clean, alive REQ — that's `/proceed` or the per-phase skills
- For a known-aborted REQ — edit `pipeline-state.json` and `hot.md` directly, or invoke `/recover` by name and accept the `abort` recommendation
- For codebase health audits — `/analyze`
- For per-REQ code review — `/review`

## Inputs

Zero or more REQ/BUG IDs as arguments.

- `/recover` — scan everything in flight; surface a triage queue
- `/recover REQ-101` — reconcile one entry
- `/recover REQ-101 BUG-007 REQ-103` — selective sweep

## Preflight

1. **Read the toolkit ETHOS.**
2. **Load vault basics:** `.adlc/CLAUDE.md`, `.adlc/config.yml`, `.adlc/now.md`, `.adlc/hot.md` (last 20 entries).
3. **Determine scope:**
   - If IDs were provided, verify each exists in `specs/`, `bugs/`, or `sprints/`. If any are unknown, halt and ask.
   - If no IDs, walk `.adlc/specs/`, `.adlc/bugs/`, and `.adlc/sprints/`. Collect every entry that isn't `prState: "merged"` with `mergedAt` older than 7 days. Skip any REQ that already has `recoveredAt` set unless the user invoked it by name.

## Steps

### 1. Diagnose each candidate

For each REQ/BUG/sprint, gather signals.

**From `pipeline-state.json` (or sprint registry):**

- `currentPhase`, `gateState`, `currentPhaseGate`
- `isolation`, `workPath`, `worktree`, `branch`
- `prState`, `mergedAt`, `terminal` (if present)
- `recoveredAt`, `recoveryNotes` (if previously recovered)

**From git (read-only operations only):**

- Branch exists: `git -C <repo-path> rev-parse --verify <branch>` (exit code 0/non-zero)
- Commits past base: `git -C <repo-path> log <base-branch>..<branch> --oneline` (count lines)
- Branch merged into base: `git -C <repo-path> branch --merged <base-branch>` (look for `<branch>`)
- PR merged in the squash-and-delete case (branch ref gone, PR landed): if `gh` is available, `gh pr list --state merged --head <branch> --json number,mergedAt,url`. Fall back to searching the base log for the REQ ID: `git -C <repo-path> log <base-branch> --grep "<REQ-ID>" --oneline`.
- Worktree registered (worktree mode only): `git -C <repo-path> worktree list`

**From disk:**

- `pipeline-state.workPath` exists as a directory?
- If `isolation: "branch"` and the work path is the repo root, `git -C <workPath> status --porcelain` — surface uncommitted changes but don't act on them.

**From the REQ folder:**

Inventory which artifact files exist: `requirement.md`, `architecture.md`, `tasks/`, `exploration.md`, `verification.md`, `commits-draft.md`, `pr-draft.md`, `merge-checklist.md`.

### 2. Classify each candidate

| Signals | Classification | Recommended action |
|---|---|---|
| Branch alive, unmerged, work path exists, artifacts match `currentPhase` | **in-sync-alive** | suggest `/proceed` to resume |
| Branch merged (or PR found merged), `currentPhase < 5` or `prState != merged` | **stale-state-reality-further** | back-fill missing phases, mark merged |
| Branch merged AND `currentPhase == 5` cleared but vault capture missing (no recent hot.md entry, no `recoveredAt`) | **stale-state-reality-matches** | back-fill vault capture only |
| No branch, no merge detected, no commits in base referencing the REQ, work path missing | **abandoned** | mark aborted with reconciliation note |
| State claims shipped (`prState == "merged"`) but branch is alive and unmerged | **divergent** | surface raw signals; user decides |
| Sprint registry `status: "running"`, all its REQs already classified non-running | **sprint-stuck** | mark sprint ended |

If signals don't cleanly fit any bucket, classify as `divergent` and surface the raw signals — let the user judge. Never guess.

### 3. Present the triage queue

Build a queue with one entry per classified candidate. Show:

- ID and one-line title (from `requirement.md` first H1, or `bug.md`)
- Claimed state: `phase / gateState`
- Detected reality: classified phase
- Classification + recommended action

Format:

```
ADLC recovery queue — YYYY-MM-DD HH:MM

Scanned: <count> entries (<spec-count> REQs, <bug-count> bugs, <sprint-count> sprints)

  1. REQ-042-firestore-indexes
     Claimed: phase 3 (implement) / gateState: awaiting
     Reality: merged via PR #117 on 2026-05-09
     Class:   stale-state-reality-further
     Recommend: recover (back-fill phases 4-5, mark merged)

  2. REQ-051-export-button
     Claimed: phase 2 (architect) / gateState: cleared
     Reality: branch deleted, no merge, no commits in base
     Class:   abandoned
     Recommend: abort

  3. BUG-009-cookie-domain
     Claimed: phase 4 (verify) / gateState: awaiting
     Reality: branch alive, 3 commits past base, unmerged
     Class:   in-sync-alive
     Recommend: resume (run /proceed BUG-009-cookie-domain)

  4. SPRINT-2026-04-30-1400
     Claimed: status running, 3 REQs
     Reality: all 3 REQs are merged or abandoned
     Class:   sprint-stuck
     Recommend: end sprint

Reply with one of:
  recover N             — execute the recommended action for entry N
  resume N              — leave as-is; user will run /proceed
  abort N               — mark aborted (confirm)
  skip N                — leave untouched; reappears in next scan
  show N                — full diagnosis for one entry
  more                  — next page (if >10 entries)
  recover all-abandoned — bulk-mark all abandoned-class entries (confirm)
```

If more than 10 entries are classified, show the first 10 with a `more` prompt at the bottom. Page through; don't dump a 30-entry queue in one shot.

### 4. Execute approved actions

Process one entry at a time as the user replies.

#### `recover` with classification `stale-state-reality-further`

1. **Prompt for knowledge capture.** Ask the user one tight question in chat:

   ```
   REQ-NNN-<slug> shipped outside the pipeline. Any lessons or gotchas worth capturing?
   Reply with one of:
     lessons: <one-line>; <one-line>; ...
     gotchas: <one-line>; <one-line>; ...
     both:    lessons: ...; gotchas: ...
     none     — back-fill structural files only; capture nothing
   ```

   Don't fabricate. If the user replies `none`, skip step 4 entirely.

2. **Write `verification.md` placeholder** if missing:

   ```markdown
   # REQ-NNN-<slug> — Verification (recovered)

   > **STATUS: recovered** — this REQ shipped without /review running. No findings were captured at the gate. If a retrospective code review is wanted, file a follow-up REQ or run reviewers manually against the merged diff.

   ## Acceptance criteria check

   _(populate from requirement.md; mark each item with the best evidence available — ✓ if the merge demonstrates it, ⚠ if uncertain.)_
   ```

3. **Write `pr-draft.md`** if missing, as a historical record:

   ```markdown
   # PR Draft — REQ-NNN-<slug> (recovered)

   > **STATUS: historical** — this REQ shipped outside the pipeline. PR draft generated retroactively from spec + git log.

   | Field | Value |
   |---|---|
   | Branch | <branch> |
   | Base | <base-branch> |
   | PR | <pr-number-if-found-or-"unknown"> |
   | Merged | <mergedAt-if-found-or-"yes (date unknown)"> |
   | Commits | <count from git log> |
   ```

   Summary section drawn from `requirement.md`'s Goal (rewritten in past tense). Changes section listing the touched files from `git diff <base>..<branch> --stat`.

4. **Capture user-provided knowledge.** For each lesson the user named, create `.adlc/knowledge/lessons/LESSON-NNN-<slug>.md` from `templates/lesson-template.md`. Use the next sequential lesson ID. Add a banner: `> **STATUS: needs verification** — captured during recover of REQ-NNN; expand from memory when you have time.` For each gotcha, append to `.adlc/knowledge/gotchas.md` with the next sequential `^g##` anchor, same banner style.

5. **Update navigation files:**

   ```markdown
   ## [YYYY-MM-DD] req-recovered | REQ-NNN-<slug> | back-filled from <old-phase>/<old-gate> to merged
   ```

   Plus one entry per captured artifact: `## [YYYY-MM-DD] lesson | L-NNN — <title> (recovered)` and `## [YYYY-MM-DD] gotcha | G-NN — <title> (recovered)`.

   Update `index.md` for new lessons/gotchas. Update `now.md` to remove the REQ from active focus if present.

6. **Update `pipeline-state.json`:**

   ```json
   {
     "currentPhase": 5,
     "completedPhases": [0, 1, 2, 3, 4, 5],
     "gateState": "cleared",
     "currentPhaseGate": "ship",
     "prState": "merged",
     "mergedAt": "<detected-or-best-guess>",
     "recoveredAt": "<now>",
     "recoveryNotes": "back-filled from <old-phase>/<old-gate> to merged; user-captured: <N> lessons, <M> gotchas"
   }
   ```

#### `recover` with classification `stale-state-reality-matches`

Same as above but skip steps 2 and 3 (those files already exist or were skipped intentionally). Run the knowledge-capture prompt and the navigation/state updates only.

#### `abort` (or `recover` of an `abandoned` entry)

1. Confirm explicitly if not already classified as `abandoned` (skip the confirm for `recover all-abandoned`).
2. Surface cleanup commands depending on `pipeline-state.isolation`:
   - **`branch` mode** (Claude cannot run these — all mutate working-tree or branch state):

     ```
     git -C <repo-path> checkout <base-branch>
     git -C <repo-path> restore .
     git -C <repo-path> clean -fd
     git -C <repo-path> branch -D <branch>
     ```

   - **`worktree` mode:**
     - Claude runs: `git -C <repo-path> worktree remove --force <workPath>` (only if the worktree still exists)
     - User runs: `git -C <repo-path> branch -D <branch>` (only if the branch ref is still there)

3. Update `pipeline-state.json`:

   ```json
   {
     "terminal": "aborted",
     "recoveredAt": "<now>",
     "recoveryNotes": "abandoned; reconciled on <date>"
   }
   ```

4. Append to `hot.md`: `## [DATE] req-aborted-via-recover | REQ-NNN-<slug>`.

#### `resume`

No vault changes. Just confirm:

```
REQ-NNN-<slug> looks alive. State and git agree. Run /proceed REQ-NNN-<slug> to continue.
```

#### `recover` with classification `sprint-stuck`

1. Read the sprint registry at `.adlc/sprints/SPRINT-YYYY-MM-DD-<HHMM>.json`.
2. Update: `status: "ended"`, `endedAt: <now>`, `endedReason: "recovered-out-of-band"`.
3. Append to `hot.md`: `## [DATE] sprint-recovered | SPRINT-... | manually ended after drift`.

#### `divergent`

Don't auto-execute. Surface the raw signals one more time and ask the user to choose between `recover N` (treat as stale-state — they probably know which side is right), `abort N`, or `skip N`. If they choose `recover`, ask explicitly whether reality (branch alive, not merged) or claimed state (merged) is correct, and proceed accordingly.

### 5. Final report

After all queued actions are processed:

```
Recovery complete — YYYY-MM-DD HH:MM

Recovered (back-filled):       <count>
Aborted:                       <count>
Resumed (no action needed):    <count>
Skipped:                       <count>
Still uncertain (divergent):   <count> — surface these for manual decision

Lessons captured:              <count>
Gotchas captured:              <count>
Sprints ended:                 <count>

Vault entries written: <count>
hot.md entries appended: <count>
```

If any `divergent` entries remain, list them with the raw signals so the user can decide what to do next.

## Constraints

- **Read-only on git and code.** No commits, no pushes, no branch deletes, no checkouts, no merges. Same policy as everywhere else. The only git mutation allowed is `git worktree remove --force` for cleanup of an abandoned worktree.
- **Vault-only writes.** Updates flow into `.adlc/`; source code is never touched.
- **Per-entry approval.** No "recover all" except for the abandoned bucket, which gets a bulk-confirm shortcut because abandoned entries are low-risk to mark.
- **Don't fabricate lessons.** If the user replies `none` to the knowledge prompt, capture nothing. The vault is most valuable when it stays high-signal.
- **Preserve the audit trail.** Every recovered entry gets `recoveredAt` and `recoveryNotes` in pipeline-state, plus a `hot.md` entry. Recovery is itself a visible event in the vault's history.
- **Don't re-recover.** If `recoveredAt` is set, skip in scan mode unless the user invokes the entry by name explicitly.
- **Page the queue.** Show 10 entries at a time; offer `more` to continue. A 30-entry queue dumped at once is unreadable.
- **Never trust state over reality.** If `pipeline-state.json` and git disagree, git is the truth. State exists to be reconciled to it, not the other way around.

## Output artifacts

Per recovered REQ:

- Updated `.adlc/specs/REQ-NNN-<slug>/pipeline-state.json` with `recoveredAt`, `recoveryNotes`, terminal/merged state
- `.adlc/specs/REQ-NNN-<slug>/verification.md` (placeholder, if missing)
- `.adlc/specs/REQ-NNN-<slug>/pr-draft.md` (historical record, if missing)
- User-captured `.adlc/knowledge/lessons/LESSON-NNN-<slug>.md` files
- User-captured entries appended to `.adlc/knowledge/gotchas.md`
- Updates to `.adlc/hot.md`, `.adlc/index.md`, `.adlc/now.md`, `.adlc/decisions.md`

Per recovered BUG:

- Same shape, scoped to `.adlc/bugs/BUG-NNN-<slug>/`

Per recovered sprint:

- Updated `.adlc/sprints/SPRINT-*.json` with `status: "ended"`
- `hot.md` entry

## Done condition

- Every requested or scanned entry has been classified
- Each has either had an action executed, been explicitly skipped, or been left as `divergent` for the user's manual decision
- A final report has been emitted in chat
