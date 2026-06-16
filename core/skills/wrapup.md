---
name: wrapup
description: Final phase of /proceed. Drafts the PR (title, body, change summary), updates the vault (lessons, gotchas, index, hot, decisions, concepts, components), and prints the git/gh checklist for the user to run. Claude does NOT commit, push, PR, or merge.
---

You are running Phase 5 of the ADLC pipeline: drafting the PR, capturing knowledge, and preparing the merge checklist.

## When to use

- The verify gate has been cleared.
- The user invokes `/wrapup REQ-NNN-<slug>` directly, or `/proceed` is moving past the verify gate.

## Preflight

1. **Verify verify gate cleared.** Read `pipeline-state.json`. `currentPhase >= 4`, `gateState: "cleared"` for verify.
2. **Read the toolkit ETHOS.**
3. **Load context.** Everything for this REQ: `requirement.md`, `architecture.md`, `tasks/*.md`, `exploration.md`, `verification.md`, `commits-draft.md`. Plus vault navigation files: `now.md`, `hot.md`, `index.md`, `decisions.md`, `glossary.md`.
4. **Verify the commits exist.** Read `pipeline-state.json.workPath` and `.branch`. `git -C <workPath> log <base-branch>..<branch> --oneline` should show all the drafted commits actually committed by the user. If any draft isn't in the log, halt and ask the user to finish committing.

## Steps

### 1. Final diff sanity check

Run `git -C <workPath> diff <base-branch>..<branch> --stat` and compare against architecture.md's blast radius. Surface any mismatch — files changed that weren't in the architecture, or files in architecture that weren't actually touched.

Check for residual artifacts one more time:

- No `console.log`, `print(`, debug logging
- No `TODO` without a tracking link
- No `.skip()` or `xit(`
- No `--no-verify` traces
- No commented-out code from this REQ

Surface any findings. The gate prompt will ask the user to clean before merging.

### 2. Draft the PR

Write `.adlc/specs/REQ-NNN-<slug>/pr-draft.md`:

```markdown
# PR Draft — REQ-NNN-<slug>

| Field | Value |
|---|---|
| Branch | <branch> |
| Base | <base-branch> |
| REQ | REQ-NNN-<slug> |
| Commits | <count> |
| Files changed | <count> |
| Insertions / deletions | +<N> / -<N> |

## Title

`<type>(<scope>): <description> [REQ-NNN-<slug>]`

Match the project's commit/PR title format from `context/conventions.md`. If the project uses Conventional Commits, use that. If not, mirror the project's existing PR style (check recent merged PRs if available).

## Body

### Summary

One-paragraph what-and-why. Pull from the spec's Goal section, rewritten in past tense.

### Acceptance criteria

Reproduce the checklist from the spec, with each item marked ✓ as verified during /review.

- [✓] Criterion 1 — short note on how it was verified
- [✓] Criterion 2 — short note

### Changes

By module / file group. Not a file-by-file diff — a structural summary.

- **`src/auth/`** — added new password validation; updated session creation to enforce
- **`tests/auth/`** — coverage for valid/invalid password paths, session edge cases
- **`docs/auth.md`** — updated with new validation rules

### Risk / impact

What this could affect that's worth flagging for the reviewer.

### Lessons captured

Links to any new lesson, gotcha, ADR, or concept page created during this REQ.

- [[knowledge/lessons/LESSON-NNN]] — short title
- [[knowledge/gotchas#^gNN|GNN]] — short title
- [[architecture/adr-NNN-...]] — newly accepted

### Vault references consulted

Lessons / gotchas / ADRs that informed this REQ.

### Test plan

How the reviewer can verify locally. Specific commands.

### Follow-ups filed

Out-of-scope work spotted but not bundled. Each linked to a tracking task or REQ-stub.
```

### 3. Update the vault — knowledge

Knowledge capture happens in two halves: candidates were surfaced upstream (during /implement and /review) into `.adlc/specs/REQ-NNN-<slug>/lesson-candidates.md`. This step issues a verdict on each candidate and writes the resulting lessons, gotchas, and other vault entries.

#### Process candidates

1. **Read `lesson-candidates.md`.** If the file doesn't exist, do a sweep over `verification.md` and `commits-draft.md` asking "did anything recurring or instructive surface that should become a candidate?" Append any to `lesson-candidates.md`, then continue. A complete REQ that genuinely produced zero candidates is rare — the more common cause of an empty file is missed capture upstream.

2. **For each candidate, issue exactly one verdict:**
   - **`promote`** — write a full lesson. See "Lessons" below.
   - **`demote-to-gotcha`** — write a file-scoped gotcha. See "Gotchas" below.
   - **`discard`** — explain in one line why (trivial, already captured by LESSON-N, duplicate of CAND-M, etc.).

3. **Append verdicts** to `lesson-candidates.md` under a `## Candidate verdicts` heading at the bottom:

   ```markdown
   ## Candidate verdicts

   | Candidate | Verdict | Target / Reason |
   |---|---|---|
   | CAND-001 | promote | LESSON-042 |
   | CAND-002 | demote-to-gotcha | ^g14 |
   | CAND-003 | discard | duplicate of LESSON-007 |
   | CAND-004 | discard | trivial — one-off, no recurring pattern |
   ```

#### Lessons

- For each `promote` verdict, draft a new `.adlc/knowledge/lessons/LESSON-NNN-<slug>.md` from `templates/lesson-template.md`.
- Use the **minimum required fields only** — title, metadata table, "The lesson", "Saw it in". The optional sections are filled when the lesson recurs in a future REQ, per the template's "born minimal, grown on demand" instruction.
- Get the next sequential ID by scanning existing lesson files. Fill in the `^L##` anchor.
- Add to the index `.adlc/index.md` under Lessons.

If the verify phase produced reflector findings tagged `vault-stale`, draft updates to existing lessons (don't auto-apply — show them to the user as part of the gate prompt).

#### Gotchas

- For each `demote-to-gotcha` verdict, **plus** any "non-obvious codebase behavior we discovered or preserved" that emerged this REQ (even if not in `lesson-candidates.md`), append a new entry to `.adlc/knowledge/gotchas.md`.
- Get the next sequential `^g##` anchor by scanning the file.
- Use the shape from `templates/gotcha-template.md`.

#### Concepts

- If a new pattern was introduced, draft `.adlc/knowledge/concepts/<slug>.md`.
- If a stub was created during `/architect`, fill it in now with what was actually learned.

#### Components

- If the REQ touched a major module without a component page, draft `.adlc/knowledge/components/<slug>.md`.
- If a stub exists, update it: add this REQ to the "Touched by" list, refresh the architecture summary if it changed.

#### ADRs

- If an ADR was proposed during `/architect` and the user accepted it at the architect gate, confirm its status is `accepted` and it's in `decisions.md`.
- If an ADR needs to be superseded by something this REQ established, draft the supersession.

### 4. Update the navigation files

#### `.adlc/hot.md`

Append:

```markdown
## [YYYY-MM-DD] req-ready-to-merge | REQ-NNN-<slug> | <one-line description>
```

Plus one entry per artifact created:

```markdown
## [YYYY-MM-DD] lesson | L-NNN — <title>
## [YYYY-MM-DD] gotcha | G-NN — <title>
## [YYYY-MM-DD] adr-accepted | ADR-NNN — <title>
## [YYYY-MM-DD] concept | <name> — first captured
```

Maintain the 20-entry-visible rule by truncation only when the file gets unwieldy (>500 lines). Older entries stay but newest at the top.

#### `.adlc/index.md`

Add rows for new specs, ADRs, lessons, concepts, components.

#### `.adlc/decisions.md`

Update if ADR statuses changed.

#### `.adlc/now.md`

If this was the focus, update the "Active focus" line. If multiple REQs are in flight (in `/sprint`), update the active-REQ table.

#### `.adlc/glossary.md`

If new project-specific terms emerged that aren't in the glossary, add them. Mark provisional definitions with `STATUS: needs verification`.

### 5. Draft the merge checklist

Write `.adlc/specs/REQ-NNN-<slug>/merge-checklist.md`. Substitute all `<placeholder>` with real values from `pipeline-state.json` and `config.yml`, and include only the post-merge cleanup block matching `pipeline-state.isolation`. Template (showing both alternative cleanup blocks):

```markdown
# Merge checklist — REQ-NNN-<slug>

You run these. Claude does not.

## Pre-merge

- [ ] Push the branch:
      `git -C <workPath> push -u origin <branch>`
- [ ] Open the PR (paste title/body from pr-draft.md):
      `gh pr create --base <base-branch> --head <branch> --title "<title>" --body-file .adlc/specs/REQ-NNN-<slug>/pr-draft.md`
      (or use the web UI)
- [ ] Wait for CI to pass
- [ ] Request review (if applicable)
- [ ] Address review feedback (if any)

## Merge

- [ ] Merge the PR:
      `gh pr merge <pr-url> --squash --delete-branch`
      (or use the web UI; match the project's merge strategy)

## Post-merge cleanup — `worktree` mode

- [ ] Remove the worktree:
      `git -C <repo-path> worktree remove --force <workPath>`
- [ ] Delete the local branch if `--delete-branch` didn't run it:
      `git -C <repo-path> branch -D <branch>`
- [ ] Pull latest base branch:
      `git -C <repo-path> checkout <base-branch> && git pull`

## Post-merge cleanup — `branch` mode

- [ ] Switch back to base branch:
      `git -C <repo-path> checkout <base-branch>`
- [ ] Pull latest:
      `git -C <repo-path> pull`
- [ ] Delete the local branch if `--delete-branch` didn't run it:
      `git -C <repo-path> branch -D <branch>`

## Notify Claude (optional)

When merge is complete, tell Claude in chat:
`merged REQ-NNN-<slug>`

This updates pipeline-state and adds a hot.md entry.
```

### 6. Update pipeline state

```json
"currentPhase": 5,
"completedPhases": [0, 1, 2, 3, 4, 5],
"gateState": "awaiting",
"currentPhaseGate": "ship",
"prState": "draft-ready"
```

### 7. Write the gate marker

```
Phase: ship
REQ: REQ-NNN-<slug>
Awaiting: review the PR draft and vault updates, then run the merge checklist.
Files:
  - .adlc/specs/REQ-NNN-<slug>/pr-draft.md
  - .adlc/specs/REQ-NNN-<slug>/merge-checklist.md
  - New / updated vault files (see below)
```

### 8. Emit the gate prompt

```
🛑 Gate: Ship — REQ-NNN-<slug>

PR drafted:
  Title: <title>
  Body:  .adlc/specs/REQ-NNN-<slug>/pr-draft.md
  Files: <count> changed, +<N>/-<N>

Merge checklist: .adlc/specs/REQ-NNN-<slug>/merge-checklist.md

Vault updates from candidates:
  Candidates considered:    <N>
  Promoted to lesson:       <count> — <list of new LESSON-NNN>
  Demoted to gotcha:        <count> — <list of new ^gNN>
  Discarded:                <count> — see lesson-candidates.md verdicts
  Other vault writes:
    ADRs accepted:          <list>
    Concepts:               <list of new / updated>
    Components:             <list of new / updated>
    Glossary:               <terms added>
    Hot log:                <count> entries appended

  ⚠ If "Candidates considered: 0" — confirm this REQ genuinely produced no
    knowledge worth keeping, or `revise: capture` to walk back through
    verification.md and commits-draft.md.

Final diff sanity:
[✓ / ⚠] Blast radius matches architecture
[✓ / ⚠] No residual debug artifacts
[✓ / ⚠] No --no-verify traces
[✓ / ⚠] Commit drafts all landed in git log

Reply with one of:
  approve         — gate cleared. Run the merge checklist when ready.
  revise: <text>  — adjust the PR draft or vault updates
  merged          — (after running the merge) finalize state, log to hot.md
  abort           — halt without merging
```

## Gate clearance

If `approve`:

1. Delete `.awaiting-approval`.
2. Update `pipeline-state.json`: `gateState: "cleared"`, `prState: "awaiting-user-action"`.
3. Append to `hot.md`: `## [DATE] ship-gate-cleared | REQ-NNN-<slug>`.
4. Remind user: run the merge checklist; reply `merged` when done.

If `revise: ...`:

1. Apply revisions to pr-draft.md or vault updates.
2. Re-emit the gate prompt.

If `merged`:

1. Verify the merge: `gh pr view <pr-url> --json state,mergedAt` (if user provided a URL or if it's discoverable).
2. Update `pipeline-state.json`: `prState: "merged"`, `mergedAt: <timestamp>`, terminal status.
3. Append to `hot.md`: `## [DATE] req-merged | REQ-NNN-<slug>`.
4. Update `now.md`: remove this REQ from active focus.
5. Clean up: ask the user if they want to delete the REQ folder's ephemeral files (`.awaiting-approval` if any, the worktree path can be removed since it's likely already gone).

If `abort`:

1. Confirm. Roll back what makes sense.
2. Append to `hot.md`: `## [DATE] ship-aborted | REQ-NNN-<slug>`.

## Constraints

- **Git follows `git.mode`** (`.adlc/config.yml`, default `manual`). In `manual`, NEVER run `git add/commit/push` — the merge checklist exists because you don't run those. In `commit`/`commit+push`, you may commit the vault/lesson updates on the REQ's feature branch (and push it, ff-only, in `commit+push`) after the wrapup gate is approved. In **every** mode, NEVER run `gh pr create`, `gh pr merge`, branch deletes, force-pushes, or anything touching a protected branch — opening and merging the PR is always the user's.
- **Vault updates** go on the REQ's feature branch: committed by you in `commit`/`commit+push`, or left for the user's final commit in `manual`.
- **`pr-draft.md` is a draft.** The user can paste it into `gh pr create --body-file` or copy/paste into a web form. Don't auto-submit anywhere.
- **Capture liberally as candidates, prune deliberately at verdict.** Candidates are cheap — one line in a scratch file. Lessons are precious — the vault stays high-signal because the verdict step is rigorous, not because the candidate bar is high. Silent zero-capture is a failure mode: if no candidates surfaced upstream and the sweep over `verification.md` finds nothing either, surface that as a question to the user at the gate ("REQ produced zero knowledge — confirm or revise"), don't pass silently.

## Output artifacts

- `.adlc/specs/REQ-NNN-<slug>/pr-draft.md`
- `.adlc/specs/REQ-NNN-<slug>/merge-checklist.md`
- `.adlc/specs/REQ-NNN-<slug>/lesson-candidates.md` (now includes the `## Candidate verdicts` table appended at the bottom; retained after wrapup as decision history)
- New / updated vault files: `lessons/`, `gotchas.md`, `concepts/`, `components/`, `architecture/`, `index.md`, `decisions.md`, `hot.md`, `now.md`, `glossary.md`
- Updates to `pipeline-state.json`
