---
name: review
description: Multi-perspective code review for a REQ. Phase 4 of /proceed. Dispatches 4 read-only review agents in parallel (correctness, quality, architecture, reflector), consolidates findings by severity, and ends in the verify gate.
---

You are running Phase 4 of the ADLC pipeline: reviewing the implemented code through four lenses and consolidating findings.

## When to use

- The implement gate has been cleared and the user has run the drafted commits.
- The user invokes `/review REQ-NNN-<slug>` directly, or `/proceed` is moving past the implement gate.

## Preflight

1. **Verify implement gate cleared and code is committed.** Read `pipeline-state.json` (`currentPhase >= 3`, `gateState: "cleared"` for implement). Check that `git -C <workPath> log <base-branch>..<branch> --oneline` shows commits — if the branch has no commits past the base, **stop and remind** the user to run the commits first.
2. **Read the toolkit ETHOS.**
3. **Load context.** `.adlc/CLAUDE.md`, `config.yml`, `context/conventions.md`, `specs/REQ-NNN-<slug>/requirement.md`, `architecture.md`, `commits-draft.md`.
4. **Verify the work path and branch.** Read `pipeline-state.json.workPath`, `isolation`, and `branch`. Check `workPath` is a valid directory. Verify the branch ref exists: `git -C <workPath> rev-parse --verify <branch>`. (In `branch` mode, HEAD may be on a different branch — that's fine; comparisons below use `<branch>` by name.)
5. **Identify the diff.** Determine the base branch from `config.yml` (default `main`). Capture the list of changed files: `git -C <workPath> diff --name-only <base-branch>...<branch>`.

## Steps

### 1. Initialize verification.md

Create or truncate `.adlc/specs/REQ-NNN-<slug>/verification.md`:

```markdown
# REQ-NNN-<slug> — Verification

| Field | Value |
|---|---|
| Generated | YYYY-MM-DD |
| Work path | <path> |
| Isolation | branch \| worktree |
| Branch | <branch> |
| Files changed | <count> |
| Commits | <count> |
| Base | <base-branch> |

## Summary

_(populated after reviewers complete)_

---

## Correctness findings

_(written by correctness-reviewer)_

## Quality findings

_(written by quality-reviewer)_

## Architecture findings

_(written by architecture-reviewer)_

## Reflection findings

_(written by reflector)_

---

## Consolidated by severity

_(populated after all reviewers complete)_
```

### 1.5. Build the review packet

Write `.adlc/specs/REQ-NNN-<slug>/review-packet.md`. This bundles the context all four reviewers need so they don't each re-read the same files.

Compose from:

- The manifest paragraph at the top (verbatim, including the packet-gap note — reviewers act on this language)
- `git -C <workPath> diff <base-branch>...<branch> --unified=99999` — the full-context diff (one stream covers added, removed, and surrounding lines for every changed file)
- Verbatim content of `requirement.md`
- Verbatim content of `architecture.md`
- Verbatim content of `exploration.md` if it exists on disk, else `_(no exploration report)_`

Shape:

`````markdown
# REQ-NNN-<slug> — Review Packet

This packet contains the diff with full file context, the REQ spec, the REQ architecture, and the prior codebase reconnaissance. **Do not re-read these via Read — cite this packet.** If you Read anything beyond this packet — vault content (gotchas, lessons, ADRs, conventions, concepts) or an off-diff code collaborator — add a `**Packet-gap:**` line in your section: `**Packet-gap:** <path> — <why the packet didn't cover it>`, whether or not it produced a finding. That list is how we tighten the packet from real data.

## Diff with full context (vs <base-branch>)

```diff
<git diff --unified=99999 output>
```

## REQ spec

<verbatim requirement.md>

## REQ architecture

<verbatim architecture.md>

## Codebase reconnaissance

<verbatim exploration.md, or "_(no exploration report)_">
`````

### 2. Dispatch four reviewers in parallel

In a single message, launch all four agents:

- **correctness-reviewer** (Sonnet)
- **quality-reviewer** (Sonnet)
- **architecture-reviewer** (Sonnet)
- **reflector** (Sonnet)

Each agent receives:

```
REQ: REQ-NNN-<slug>
Work path: <workPath>
Branch: <branch>
Files changed: <list>
Base branch: <base-branch>
Packet: .adlc/specs/REQ-NNN-<slug>/review-packet.md
Output file: .adlc/specs/REQ-NNN-<slug>/verification.md
Candidates file: .adlc/specs/REQ-NNN-<slug>/lesson-candidates.md

Read the packet first. It contains the diff with full file context, the REQ spec and architecture, and the prior codebase reconnaissance. Do not re-read those files. If you Read anything beyond the packet, add a `**Packet-gap:**` line in your section so we can tighten the packet.

Append your findings under your section heading in the output file.
Append any lesson candidates to the candidates file per your skill instructions (bar: when in doubt, surface).
Follow your skill instructions for output format.
```

### 3. Wait for all four to complete

Each reviewer writes its findings to its section of `verification.md`. Collect terminal claims from each:

- All four return findings → proceed to consolidation
- Any reviewer fails (tool error, timeout) → halt and surface

### 4. Consolidate findings

Read `verification.md` after the reviewers finish. Build the **Consolidated by severity** section:

For each finding across all four sections:

- Deduplicate: if two reviewers flagged the same file + line + concern, merge into one entry citing both
- Sort by severity (Critical > Major > Minor > Trivial)
- Tag with originating reviewer(s)
- Group by file

```markdown
## Consolidated by severity

### Critical (<count>)

#### <File>:<line> — <short title>

- **Source:** correctness, reflector
- **What:** ...
- **Recommendation:** ...
- **Vault refs:** [[...]]

### Major (<count>)

...

### Minor (<count>)

...

### Trivial (<count>)

(usually omit from gate prompt — listed here for completeness)
```

### 5. Populate the summary

Edit the **Summary** section at the top of `verification.md`:

- Counts by severity
- Top patterns observed (e.g., "Three correctness findings around null handling; suggest review of the pattern in src/foo/")
- Whether any finding directly contradicts an accepted ADR (calls out reflector findings of category `adr-conflict`)
- Whether any finding is `vault-stale` (reflector suggests the vault, not the code, should change)

### 6. Cross-check against acceptance criteria

Re-read the spec's acceptance criteria. For each one, verify it's met by the implemented code. Add to `verification.md`:

```markdown
## Acceptance criteria check

- [✓ / ⚠] Criterion 1 — short note
- [✓ / ⚠] Criterion 2 — short note
```

If any criterion isn't met, flag it as a Critical finding.

### 7. Update pipeline state

```json
"currentPhase": 4,
"completedPhases": [0, 1, 2, 3, 4],
"gateState": "awaiting",
"currentPhaseGate": "verify",
"findings": {
  "critical": <count>,
  "major": <count>,
  "minor": <count>,
  "trivial": <count>
}
```

### 8. Write the gate marker

```
Phase: verify
REQ: REQ-NNN-<slug>
Awaiting: review the findings, decide which to fix.
Files:
  - .adlc/specs/REQ-NNN-<slug>/verification.md
```

### 9. Emit the gate prompt

```
🛑 Gate: Verify — REQ-NNN-<slug>

4 reviewers dispatched. Findings:

  Critical: <N>  ← must fix
  Major:    <N>  ← strongly recommend fix
  Minor:    <N>  ← your call
  Trivial:  <N>  ← noise filter

Lesson candidates surfaced: <total> (corr: <N>, qual: <N>, arch: <N>, reflect: <N>)
  See lesson-candidates.md. Verdicts come at /wrapup.

Top findings (Critical + Major):

  1. <file>:<line> — short title (correctness)
  2. <file>:<line> — short title (architecture)
  3. <file>:<line> — short title (reflector — repeats LESSON-007)

Acceptance criteria check:
[✓ / ⚠] Criterion 1
[✓ / ⚠] Criterion 2

Reviewer reports special items:
- <reflector flagged vault-stale finding — read it carefully>
- <architecture flagged new ADR needed for X>

Reply with one of:
  approve                 — accept findings as-is, no fixes needed. Proceed to /wrapup.
  fix: <ids or "all-major"> — fix listed findings. I'll dispatch task-implementer for them.
  revise: <text>          — other revisions to the review or findings
  abort                   — escalate; halt this REQ
```

## Gate clearance

If `approve` (no fixes needed):

1. Delete `.awaiting-approval`.
2. Update `pipeline-state.json`: `gateState: "cleared"`.
3. Append to `hot.md`: `## [DATE] verify-gate-cleared | REQ-NNN-<slug> | findings: C<critical>/M<major>/m<minor>`.
4. Tell the user: ready for `/wrapup`.

If `fix: <ids>` (or `fix: all-major`):

1. For each finding to fix, dispatch a `task-implementer` agent scoped to that fix:
   ```
   Fix: <finding-id>
   Source: verification.md
   File: <path>:<line>
   Recommendation: <from finding>

   Apply the fix. Append a commit message to commits-draft.md (new section: "Fix commits").
   Run tests, verify they pass.
   ```
2. **Patch the review packet's diff section.** Use `Edit` on `.adlc/specs/REQ-NNN-<slug>/review-packet.md` to replace the contents of the `## Diff with full context (vs <base-branch>)` section with the output of `git -C <workPath> diff <base-branch>...<branch> --unified=99999` against the updated branch. Spec, architecture, and reconnaissance sections are unchanged — leave them alone.
3. After fixes complete, re-run the affected reviewers on the new diff (not all four — only those whose findings were addressed).
4. Re-emit the gate prompt with updated counts.

If `abort`:

1. Confirm explicitly.
2. Append to `hot.md`: `## [DATE] verify-aborted | REQ-NNN-<slug>`.
3. Update state to reflect rollback.

## Constraints

- **Reviewers are read-only.** They do not modify code. If a reviewer reports a fix was made, that's a protocol violation — surface it.
- **Don't apply fixes during the review pass.** Fixes happen only after the user approves them at the gate.
- **Deduplicate honestly.** Two reviewers flagging the same issue from different angles is a strong signal — don't lose that by collapsing too aggressively.
- **Surface vault-stale findings.** Reflector findings recommending the vault (not the code) change need special attention — the user decides whether to update the lesson/gotcha/ADR.
- **Review applies code fixes but does not itself commit.** Committing follows `git.mode` (`.adlc/config.yml`, default `manual`) and happens at the implement/wrapup gate boundaries — never here, and never on a protected branch.

## Output artifacts

- `.adlc/specs/REQ-NNN-<slug>/verification.md` (consolidated review)
- `.adlc/specs/REQ-NNN-<slug>/lesson-candidates.md` (appended to by the four reviewers; persists for /wrapup to verdict)
- Updates to `pipeline-state.json` (findings counts, gateState)
- Updates to `commits-draft.md` if fixes were applied
- Updates to `hot.md` on gate clearance
