---
name: review
description: Multi-perspective code review for a REQ. Phase 4 of /proceed. Dispatches 4 read-only review agents in parallel (correctness, quality, architecture, reflector) — plus a 5th ui-reviewer that runs the app in a browser when the change touches a UI surface — consolidates findings by severity, and ends in the verify gate.
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
6. **Decide whether the UI reviewer runs.** Condition (a) is mandatory: `config.yml` → `stack.frontends` must be non-empty (the project has a frontend at all). If it's empty, never dispatch — there is no UI to review. With a frontend present, dispatch if **either** of these holds:

   - **(b) Direct UI change** — the diff touches a UI surface: component / page / view / route / style / template files (`*.jsx/tsx/vue/svelte`, `*.css/scss/less`, paths under `components/`, `pages/`, `views/`, `app/`, `routes/`, `public/`, `templates/`), or the spec has UI-facing acceptance criteria implicated by the change.
   - **(c) Indirect UI impact — an API/contract change the frontend consumes.** A back-end-only diff is *not* automatically safe. If the change alters an API the frontend calls — a changed response shape, a renamed/removed field, a new required request param, a new error or status code, a changed default, a modified shared DTO/type or GraphQL schema/OpenAPI spec — then a screen that consumes it can break (crash on a missing field, mis-render, swallow a new error) even though no frontend file changed. **Check for the coupling:** take the endpoints/paths/fields/types the diff changed and grep the frontend for references (its API client, fetch/axios/RTK-Query/react-query calls, shared types package, generated client) — and consult `exploration.md`'s integration points. If any frontend code consumes the changed contract, the condition holds.

   If (a) holds and (b) or (c) does, dispatch the ui-reviewer. Pass it the **trigger reason** and the relevant surface: for (b), the changed UI files; for (c), the changed endpoints/contracts **and** the frontend call sites that consume them, so the reviewer knows which screens to exercise against the new contract. If only (a) holds (a truly back-end-internal change with no frontend consumer — e.g. an API purely for outside consumers), do **not** dispatch; record in `verification.md`'s UI section that no direct or indirect UI surface was present, and note the coupling check was run.

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

## UI/UX findings

_(written by ui-reviewer — only when the change touches a UI surface; otherwise "_(no UI surface in this change — ui-reviewer not dispatched)_")_

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

### 2. Dispatch the reviewers in parallel

In a single message, launch the four static reviewers — **plus the ui-reviewer when preflight step 6 said the change touches UI**:

- **correctness-reviewer** (balanced)
- **quality-reviewer** (balanced)
- **architecture-reviewer** (balanced)
- **reflector** (balanced)
- **ui-reviewer** (balanced) — *only if the UI-surface condition held*

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

The **ui-reviewer**, when dispatched, additionally receives (it needs runtime context the packet doesn't carry):

```
Trigger: direct-ui-change | indirect-api-impact
UI surface (changed): <changed UI files — for a direct change>
Changed API contract: <endpoints/fields/types the diff changed — for indirect impact>
Frontend consumers: <the frontend call sites that consume the changed contract — for indirect impact>
Frontends: <config.yml stack.frontends>
UI config: <config.yml ui: block, or "infer dev script from package.json">
Design reference: <Figma link from architecture.md → Related / requirement.md, or "none">
UI acceptance criteria: <the UI-facing ACs from requirement.md>

Run the app and review per your skill instructions. Resolve the browser mechanism
(Claude in Chrome → headless → static + checklist), exercise the affected screens —
for indirect-api-impact, the screens that consume the changed contract, verified
against the NEW contract — apply the interaction & state-correctness lens, cover
every UI AC, and tear down any dev server you start.
The packet-gap discipline does NOT apply to you — your job is inherently outside the
packet (you run the app and read config); reading those is expected, not a gap.
```

### 3. Wait for all reviewers to complete

Each reviewer writes its findings to its section of `verification.md`. Collect terminal claims from each:

- All dispatched reviewers (four, or five with the ui-reviewer) return findings → proceed to consolidation
- Any reviewer fails (tool error, timeout) → halt and surface
- The ui-reviewer degrading to its static tier (no browser available) is **not** a failure — it still returns findings plus a manual checklist; carry both forward

### 4. Consolidate findings

Read `verification.md` after the reviewers finish. Build the **Consolidated by severity** section:

For each finding across all reviewer sections (including UI/UX findings when the ui-reviewer ran):

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
- Whether any finding is `repo-doc-stale` (reflector found user-facing docs the change left out of date) — count these out separately; they're fixed by updating the doc in this REQ's diff, ideally before the gate clears
- Whether the ui-reviewer ran and at what tier (chrome / headless / static-only), its severity counts, and whether it left a manual-verification checklist the user still needs to run

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

<4 or 5> reviewers dispatched <(+ ui-reviewer: this change touches UI)>. Findings:

  Critical: <N>  ← must fix
  Major:    <N>  ← strongly recommend fix
  Minor:    <N>  ← your call
  Trivial:  <N>  ← noise filter

Lesson candidates surfaced: <total> (corr: <N>, qual: <N>, arch: <N>, reflect: <N>, ui: <N>)
  See lesson-candidates.md. Verdicts come at /wrapup.

UI/UX review: <ran @ chrome|headless tier — C<crit>/M<major>/m<minor>, <N> screenshots>
             <— or — static-only (no browser available): manual checklist left for you>
             <— or — not run: no UI surface in this change>
  (omit this block entirely when there is no frontend in the project)

Stale repo docs (repo-doc-stale): <N>
  <doc-path> — <the claim that's now wrong>
  Fix in this diff before merging; /wrapup re-checks any left unresolved.
  (omit this line when <N> is 0)

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
