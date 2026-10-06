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

1. **Read the toolkit ETHOS** (`$TOOLKIT_PATH/ETHOS.md`) **, the gate protocol** (`$TOOLKIT_PATH/core/GATE-PROTOCOL.md`)**, the voice guide** (`$TOOLKIT_PATH/core/VOICE.md`)**, and the vault layout** (`$TOOLKIT_PATH/core/VAULT-LAYOUT.md` — where work records live on disk; never hard-code a path under `specs/`, `bugs/`, or `sprints/`) — the shared gate-card format used at every gate below.
2. **Load vault basics.** `.adlc/CLAUDE.md`, `now.md`, `hot.md` (last 20), `config.yml`, `context/conventions.md`, `context/architecture.md`.
3. **Assign the BUG ID.** Mint it per `config.yml` → `req.id_scheme` (default `sequential`), applied to the `BUG` namespace, using the one scan from VAULT-LAYOUT's `mint` rule: `find .adlc/bugs -maxdepth 4 -type d -name 'BUG-*'` — depth 4 so it covers every month bucket and every author folder, not just yours. `sequential` takes max+1, padded to 3 (`BUG-NNN`); `prefixed` (`BUG-<req.prefix>-NNN`) narrows the `-name` to `BUG-<req.prefix>-*` and keeps the depth — scoped to your own author folder it would re-mint someone else's live IDs; `ticket` takes the issue key when invoked with an issue ref + `sources.issues` (e.g. `BUG-842`), else falls back to prefixed/sequential, noting it. Throughout, `BUG-NNN` denotes the assigned ID in whatever form the scheme produced.
4. **Create the bug folder.** Read `config.yml` → `layout.partition`: `none` gives `bugs/BUG-NNN-<slug>`; `month-author` gives `bugs/<YYYY-MM>/<author>/BUG-NNN-<slug>`, where `<YYYY-MM>` is today's month (the month the bug folder is created — it never changes afterwards) and `<author>` is the first of `layout.author`, `req.prefix`, initials from `git config user.name`, or `_`. `mkdir -p` the parents, then create the folder. **That vault-relative path is `<BUG_PATH>` for the rest of this protocol** — it carries no `.adlc/` prefix, so every path below reads `.adlc/<BUG_PATH>/…`. Agent dispatch prompts get it written out in full — the agents resolve nothing.
5. **Resolve a source reference (optional).** If invoked with an issue reference (e.g. `/bugfix #8`) or an issue URL, and `config.yml.sources.issues` is set (not `none`), resolve it with the same mechanism order as `/spec` (CLI such as `gh issue view <n> --json title,body,labels,comments,author,createdAt` first → MCP → URL fetch; default repo from `sources.repo`, a full URL overrides). This is the *same resolver* `/spec` uses. If a label indicates the issue is a feature rather than a defect, note it — the Phase 1 gate's `reframe` path will route it to `/spec`. If nothing resolves or no service is configured, print one line (`couldn't reach <service> for <ref> — drafting the report manually`) and continue; the seed is strictly additive.

## Phase 1 — Bug report (gate)

### Draft

Copy `templates/bug-template.md` to `.adlc/<BUG_PATH>/bug.md`. Substitute placeholders and fill content from the user's description — **or, if a source reference was resolved at preflight step 5, seed from the issue**:

- Symptom — issue title + body
- Reproduction steps — issue body and **comments** (repro steps and stack traces usually live in the thread, not the opening post)
- Environment — any OS/browser/runtime/version mentioned; leave blank fields for the user to confirm
- Severity estimate — map from labels (`P0`/`critical` → critical, etc.) or propose one
- Reporter / Reported — issue author and creation date
- Add the issue link to the bug's "Related" section for provenance.

Seeded content is a **draft, not truth**. The gate's runnable-repro requirement is unchanged: a tracker issue often lacks clean repro steps, so fill what the issue gives, then — if repro steps still aren't runnable — ask follow-ups in chat. **Don't proceed to investigate without a runnable repro** (or an explicit "I can't reproduce — investigate from this stack trace"), seeded or not.

### Initialize pipeline state

`.adlc/<BUG_PATH>/pipeline-state.json`:

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

### Gate card

Emit per `$TOOLKIT_PATH/core/GATE-PROTOCOL.md` (loaded at preflight). A bug-report gate is lean and adds a `reframe` option:

- **Verdict** — "report ready — recommend approve", or "needs a runnable repro".
- **NEEDS YOU** — a missing / still-non-runnable repro, or a label suggesting this is a feature not a defect (→ reframe). Omit if none.
- **CHECKS** — symptom concise · repro runnable · expected-vs-actual concrete · environment captured.
- **MY READ** — recommendation + why (never approve without a runnable repro).
- **Decision** — on Claude, an `AskUserQuestion`: **approve** (→ investigate), **revise** (refine the report), **reframe** (convert to a feature REQ — calls `/spec`), **abort** (discard).

```
GATE 1/5 · Bug report · BUG-NNN-<slug>
   report ready — recommend approve

CHECKS   ✓ symptom concise · ✓ repro runnable · ✓ expected vs actual · ✓ environment

MY READ  approve — repro is clean and reproduces the symptom

Decision →  approve · revise <what> · reframe · abort
```

On `approve`: clear gate, advance.
On `reframe`: archive `bug.md`, call `/spec` with the bug content as input, exit this skill.

## Phase 2 — Investigate (gate)

### Establish the work path

Same pattern as `/architect`'s preflight step 4. Read `config.yml.workflow.isolation`. In `auto` or `branch` mode, verify `git -C <repo-path> status --porcelain` is clean (refuse and surface if not) and then run `git -C <repo-path> checkout -b bugfix/BUG-NNN-<slug>`. In `worktree` mode, run `git -C <repo-path> worktree add <repo>/.worktrees/BUG-NNN-<slug> -b bugfix/BUG-NNN-<slug>`. Update `pipeline-state.json` with `isolation`, `workPath`, `branch`, and `worktree` (null in branch mode). Append to `hot.md`: `## [DATE] work-path-set | BUG-NNN-<slug> | <mode> at <workPath>`.

### Dispatch codebase-explorer

**Dispatch by exact agent name.** If the agent type isn't available (not installed, or the sync hasn't run since it was added), **stop and tell the user**: "`<agent>` isn't installed — run the toolkit sync, then re-run this step." Never absorb the agent's work into the main session as a fallback: inline work runs at the session's model instead of the agent's tier (a haiku-priced exploration silently becomes an opus-priced one), and for reviewers it destroys the independence the gate depends on — the same context that wrote the code would be reviewing it.

Targeted recon — not blast-radius-wide, but focused on the area suggested by the bug's repro and stack trace.

```
BUG: BUG-NNN-<slug>
Bug report: .adlc/<BUG_PATH>/bug.md
Work path: <workPath>
Focus: <function or module suggested by repro>

Find:
1. The code path the bug runs through
2. Existing tests covering the area
3. Similar past bugs (grep `hot.md`, `gotchas.md`, `knowledge/lessons.md`, and the records `specs/**/REQ-*.md` / `bugs/**/BUG-*.md` for the symptom's component — a record's `## Later` says which bugs already traced to it)
4. Any gotcha or lesson that applies to the affected file

Write to: .adlc/<BUG_PATH>/investigation.md
```

### Diagnose

After the explorer returns, write the root cause to `.adlc/<BUG_PATH>/bug.md` under "Investigation log":

```markdown
### YYYY-MM-DD — root cause

The actual cause, with file:line references. Why it produces the symptom.
```

Sketch a fix approach in the bug.md "Fix approach" section. Two or three bullets — concrete enough that the user can evaluate whether to proceed.

While diagnosing, if the codebase quirk that produced the bug or any insight from `investigation.md` deserves vault capture, append a candidate to `.adlc/<BUG_PATH>/lesson-candidates.md` (source tag `bugfix-investigate`). The Phase 5 verdict step decides whether it becomes a lesson, gotcha, or discard.

### Gate card

Emit per the gate protocol:

- **Verdict** — "root cause found — recommend approve", or "scope looks bigger than a bug (→ reframe)".
- **READY** — root cause `<file>:<line>` in one sentence; fix approach in 2-3 bullets; related vault entries (`[[…]]`).
- **NEEDS YOU** — only if the diagnosis is uncertain or scope is creeping (→ reframe). Omit otherwise.
- **CHECKS** — diagnosis matches repro · fix in scope (no creep) · regression-test plan concrete.
- **MY READ** — recommendation + why.
- **Decision** — on Claude, an `AskUserQuestion`: **approve** (→ fix), **revise** (refine diagnosis/approach), **reframe** (scope too big → feature REQ), **abort** (halt; cleanup worktree).

```
GATE 2/5 · Investigation · BUG-NNN-<slug>
   root cause found — recommend approve

READY    cause: src/pay/retry.ts:88 — retry re-enters before the guard clears
         approach: move the idempotency check above the retry loop; add a guard test
CHECKS   ✓ diagnosis matches repro · ✓ in scope · ✓ regression plan concrete

MY READ  approve — tight diagnosis, contained fix

Decision →  approve · revise <what> · reframe · abort
```

## Phase 3 — Fix (gate)

### Dispatch task-implementer

```
Task: Fix BUG-NNN-<slug>
Bug report: .adlc/<BUG_PATH>/bug.md
Investigation: .adlc/<BUG_PATH>/investigation.md
Work path: <workPath>
Approach: <copy from bug.md "Fix approach">

Implement:
1. The fix itself
2. A regression test that fails before the fix and passes after
3. Any cleanup necessary

Draft commit message to .adlc/<BUG_PATH>/commits-draft.md.
Run tests; verify they pass.
Surface lesson candidates to .adlc/<BUG_PATH>/lesson-candidates.md per your skill instructions (source tag remains `implement-task`; the bugfix folder is the candidates location).
Do NOT run git mutations.
```

### Verify the fix

After task-implementer returns:

- Confirm the regression test exists and passes
- Confirm running the original repro steps no longer produces the bug
- Confirm no other tests broke

### Gate card

Emit per the gate protocol:

- **Verdict** — "fixed, regression test green — recommend approve".
- **READY** — `<count>` files changed; regression test `<name>` (fails before, passes after); all tests pass; commit drafted.
- **CHECKS** — regression test present · original repro no longer triggers · no other tests broke.
- **MY READ** — recommendation + why.
- **Decision** — on Claude, an `AskUserQuestion`: **approve** (→ verify), **revise** (adjust the fix), **abort**.

```
GATE 3/5 · Fix · BUG-NNN-<slug>
   fixed, regression test green — recommend approve

READY    3 files · regression test retry_guard_test — fails without the
         fix, passes with it · all tests pass · commit drafted
CHECKS   ✓ regression test · ✓ repro no longer triggers · ✓ no other tests broke

MY READ  approve — fix is contained and covered

Decision →  approve · revise <what> · abort
```

## Phase 4 — Review (gate)

Slimmer than `/review`, but it starts the same way: run `/review` **step 0** — the `verify:` commands from `config.yml`, the regression test included. A `halt_on` failure stops here and goes back to Phase 3; anything else becomes **Deterministic findings** the reviewers receive as facts. Then dispatch **only** `correctness-reviewer` and `reflector` (the two most likely to find issues in a bug fix). Skip quality and architecture unless the fix touched layering or introduced significant new code.

The user commits before this runs — same as `/proceed`'s Phase 4 protocol.

When dispatching, pass `Candidates file: .adlc/<BUG_PATH>/lesson-candidates.md` so the reviewers append to the bugfix folder (not a REQ folder), and `Output file: .adlc/<BUG_PATH>/review-log.md` — the agents' default. State the write budget in the dispatch prompt as `/review` does: summary ≤5 lines, finding ≤8 lines after its table, section ≤12KB, ≤12 candidates of ≤4 lines. Tags from those agents remain `review-corr` and `review-reflect`. The verdict/narrative split applies from the first pass, same as `/review` and `/task`: reviewer narrative goes to the log, `verification.md` holds the digest. Re-review rounds follow `/review` step 6 — the log keeps every round, the verdict file collapses resolved findings, and from round 3 the gate card leads with `Re-review round <N> · verdict file <N>KB`.

### Findings

Consolidate from `review-log.md` into `.adlc/<BUG_PATH>/verification.md` with the same shape as `/review`'s verdict file — digest table, roster line, consolidated findings — but only two reviewer sections.

### Gate card

Emit per the gate protocol — findings-led like `/review`, but only two reviewers (correctness, reflector):

- **Verdict** — "`<total>` findings — `<k>` need a call", or "clean — recommend approve".
- **FINDINGS** — one line each, `crit / maj / min` + reviewer. This block is the `NEEDS YOU`.
- **MY READ** — recommendation + why (never approve while a Critical stands).
- **Decision** — on Claude, an `AskUserQuestion`: **approve** (→ ship), **fix** (`<ids>`), **revise**, **abort**.

```
GATE 4/5 · Review · BUG-NNN-<slug>
   clean — no findings, recommend approve

FINDINGS  (none)

MY READ   approve — correctness and reflector both clean

Decision →  approve · fix <ids> · revise <what> · abort
```

## Phase 5 — Wrap up (gate)

Same as `/wrapup`, but with the bug-specific knowledge capture:

### Process candidates and write vault artifacts

Mirrors `/wrapup`'s "Process candidates" step, but bound to the bugfix folder:

1. **Read `.adlc/<BUG_PATH>/lesson-candidates.md`.** If absent, sweep `bug.md`, `investigation.md`, and `verification.md` for capture-worthy patterns and write them as candidates before continuing.
2. **Check candidates against existing lessons on this branch and on `origin/<base-branch>`** — exactly `/wrapup` step 2 (`git -C <workPath> ls-tree …`, the age line, the skip line when the ref is missing).
3. **For each candidate, verdict one of**: `promote` → new lesson, `demote-to-gotcha` → new gotcha entry, `discard` with one-line reason.
4. **Append a `## Candidate verdicts` table** to the bottom of the candidates file with the verdicts and target/reason for each.
5. **Mandatory minimum for bugfix:** at least one non-discard verdict (promote OR demote-to-gotcha). A bug fix that produced zero non-discard verdicts is a missed knowledge opportunity — push back on yourself before issuing the gate prompt; if you genuinely conclude there's nothing to keep, surface that explicitly in the gate prompt for the user's call.
6. Write the resulting lessons (the stub's table only, per the lesson template; `Detectable` column in the verdict table as `/wrapup` step 3) to `knowledge/lessons/` as `LESSON-<BUG_ID>-<n>-<slug>.md` — the ID is namespaced under this bug, scan per `core/VAULT-LAYOUT.md` → `mint(lesson)` with `<WORK_ID>` = the BUG ID — and append gotchas to `knowledge/gotchas.md`.
7. **Write the bug's record** `.adlc/<BUG_PATH>.md` from `templates/record-template.md` exactly as `/wrapup` step 3b (`Path kind: /bugfix`; Goal = the symptom and the root cause in two sentences; Verification = the regression test). If the bug traced back to a REQ, append `- <date> — <BUG_ID> traced to this REQ (<one line>)` under that REQ's record `## Later` — resolve it with `VAULT-LAYOUT.md` → `record(ID)`; that section is the only part of a record anything appends to.
8. Run the generators: `node $TOOLKIT_PATH/scripts/adlc.mjs lessons --vault .adlc` and `node $TOOLKIT_PATH/scripts/adlc.mjs index --vault .adlc`.

### Repo-doc sweep

Same as `/wrapup` step 1, scaled to the fix: grep the doc surface (`config.yml` → `docs:`, or `README*` + `docs/`) for any symbol, flag, default, or behaviour the fix changed; list stale claims with corrected facts under NEEDS YOU; apply on approve. A fix that changes no documented behaviour says so in one line.

### PR draft

`bug-fix-pr-draft.md` with:

- Title: `fix(scope): <short description> [BUG-NNN-<slug>]` (or project's bug-fix title format from conventions.md)
- Body: summary, reproduction (from bug.md), fix description, regression test description, lessons/gotchas captured

### Merge checklist

Same shape as `/wrapup`'s `merge-checklist.md`.

### Source write-back (optional, gated)

Same rule as `/wrapup`'s step 5a. Only if `config.yml.sources.write` includes the issue tracker and this bug was seeded from (or links to) an issue: draft the comment/transition into `.adlc/<BUG_PATH>/source-writeback.md` (e.g. "Fixed in PR <link> — BUG-NNN-<slug>", `→ Closed`). Never auto-send; surface it at the ship gate and execute only on explicit approval. An external write — it always stops for your OK (even under `/autopilot`), and is limited by `sources.write` and `autonomy.sources`.

### Gate card

Emit per the gate protocol — mirrors `/wrapup`'s ship gate, bug-scoped:

- **Verdict** — "PR + vault ready — run the checklist".
- **READY** — PR draft (`bug-fix-pr-draft.md`); merge checklist; vault capture in one line (candidates `<N>`; promoted `<L-BUG-NNN-n>`; gotchas `<^gNN>`; hot entries), then the dedup basis (`dedup vs origin/<base> as of <age>` / skipped).
- **NEEDS YOU** — a drafted comment for the issue tracker, shown before sending (it is never sent without your OK); or, if no lesson or gotcha was kept at all, a confirmation — bug fixes usually teach something, so confirm that's right or reply `revise: capture` to take another pass through `bug.md` / `investigation.md` / `verification.md`. Omit if neither applies.
- **CHECKS** — regression test in the diff · commit drafts landed in git log · no debug artifacts.
- **MY READ** — recommendation + why.
- **Decision** — on Claude, an `AskUserQuestion`: **approve** (run the merge checklist), **revise**, **merged** (finalize after you merge), **abort**.

```
GATE 5/5 · Wrap up · BUG-NNN-<slug>
   PR + vault ready — run the checklist

READY       PR: bug-fix-pr-draft.md · merge-checklist.md
            knowledge saved: 1 gotcha (g14) · 1 activity-log entry
NEEDS YOU   (none — knowledge capture done)

CHECKS      ✓ regression test in diff · ✓ commits in log · ✓ no debug

MY READ     approve — fix is shipped-ready; knowledge captured

Decision →  approve · revise <what> · merged · abort
```

## Constraints

- **Commits follow `git.mode`** (`.adlc/config.yml`, default `manual`) — same rules as the full pipeline. In `manual`, draft `commits-draft.md` and the user commits. In `commit`/`commit+push`, commit the fix on the bug's own feature branch after the gate (and push it, ff-only), never on a protected branch.
- **Never expand scope mid-bug.** If during investigation the fix grows past a small area, surface and recommend reframing.
- **Always add a regression test.** No exceptions. A bug fix without a regression test is borrowing against future debugging.
- **Always capture knowledge.** At least one non-discard verdict (promote OR demote-to-gotcha) at Phase 5. The verdict step exists precisely to keep the vault high-signal — discards are allowed, but a bug fix that ends in all-discards needs explicit user confirmation, not a silent skip.
- **Source seeding is additive; source write-back is gated.** Reading an issue to seed the report (Phase 1) never blocks — if it fails, draft manually. Writing back (Phase 5) is off unless `sources.write` lists the tracker, drafted to `source-writeback.md`, and sent only on explicit approval — never silently. Same rules as `/wrapup`.

## Output artifacts

Per `BUG-NNN-<slug>`:

- `bug.md` (report, with investigation log appended)
- `investigation.md` (from codebase-explorer)
- `commits-draft.md`
- `verification.md` (verdict digest) and `review-log.md` (reviewer narrative)
- `bug-fix-pr-draft.md`
- `merge-checklist.md`
- `lesson-candidates.md` (created or appended to across phases 2-4; verdicts appended at Phase 5; persists as decision history)
- `source-writeback.md` (only when `sources.write` is configured and a write-back was drafted at Phase 5)
- `pipeline-state.json`
- The bug's record `.adlc/<BUG_PATH>.md` (+ a `## Later` line on the originating REQ's record, if any); vault updates: gotchas, lesson stubs, hot.md, and the generated `knowledge/lessons.md` / `index.md`
