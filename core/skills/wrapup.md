---
name: wrapup
description: Final phase of /proceed. Drafts the PR (title, body, change summary), updates the vault (lessons, gotchas, index, hot, decisions, concepts, components), and prints the git/gh checklist for the user to run. Claude does NOT commit, push, PR, or merge.
---

You are running Phase 5 of the ADLC pipeline: drafting the PR, capturing knowledge, and preparing the merge checklist.

## When to use

- The verify gate has been cleared.
- The user invokes `/wrapup REQ-NNN-<slug>` directly, or `/proceed` is moving past the verify gate.

## Preflight

1. **Resolve the REQ folder, then verify the verify gate cleared.** Resolve the REQ per `$TOOLKIT_PATH/core/VAULT-LAYOUT.md`'s `resolve` rule. The result is `<REQ_PATH>` — vault-relative, no `.adlc/` prefix — and every path below is written `.adlc/<REQ_PATH>/…`. Read `.adlc/<REQ_PATH>/pipeline-state.json`: `currentPhase >= 4`, `gateState: "cleared"` for verify.
2. **Read the toolkit ETHOS** (`$TOOLKIT_PATH/ETHOS.md`) **, the gate protocol** (`$TOOLKIT_PATH/core/GATE-PROTOCOL.md`)**, the voice guide** (`$TOOLKIT_PATH/core/VOICE.md`)**, and the vault layout** (`$TOOLKIT_PATH/core/VAULT-LAYOUT.md` — where work records live on disk; never hard-code a path under `specs/`, `bugs/`, or `sprints/`) — the shared gate-card format used at step 8.
3. **Load only what the steps below actually read.** `requirement.md` (goal + acceptance criteria), `verification.md` (reflector findings, follow-ups), and `architecture.md`'s **blast-radius section only**. `commits-draft.md` is step 2's input — but run the git-log check (next item) first; if the commit subjects plus `--stat` already tell the change story, don't open the draft. Do **not** load `tasks/*.md`, `exploration.md`, or `review-log.md`: no step below reads them, and `exploration.md` is usually the largest file in the REQ folder. If a step turns out to need one, open it *at that step* and add a `**Packet-gap:**` line to the gate card so this list gets tightened.

   **Do not pre-load the vault write targets.** `hot.md`, `index.md`, `now.md`, `decisions.md`, and `glossary.md` are step 4's *outputs*, and a typical REQ touches two of them. Open each at the step that writes it, and read only the section being edited. Pre-loading the set costs the same tokens on every REQ and grows as the vault does — exactly backwards: wrap-up must not get more expensive the better the vault gets.
4. **Verify the commits exist.** Read `pipeline-state.json.workPath` and `.branch`. `git -C <workPath> log <base-branch>..<branch> --oneline` should show all the drafted commits actually committed by the user. If any draft isn't in the log, halt and ask the user to finish committing.

## Steps

### 1. Final diff sanity check

Run `git -C <workPath> diff <base-branch>..<branch> --stat` and compare against architecture.md's blast radius. Surface any mismatch — files changed that weren't in the architecture, or files in architecture that weren't actually touched.

**Generated-file check.** If the diff touched `.adlc/context/conventions-paths.md`, run `node $TOOLKIT_PATH/scripts/adlc.mjs rules --vault .adlc` so the `.claude/rules/adlc-*.md` files match it, and say so in the gate card.

**Repo documentation sweep.** This is where user-facing docs get checked and fixed — one place, at the end, instead of a review finding plus a fix round. Read `config.yml` → `docs:` for the doc surface (files/dirs/globs); absent means `README*` at the repo root plus `docs/` if it exists; `docs: []` skips the sweep, say so on the gate card. Two passes, grep scopes and you judge:

1. **Candidate-find.** From `git diff --stat` and the commit subjects, list the changed surface: renamed/removed/added symbols, CLI flags, config keys, env vars, routes, file paths, defaults, test counts a README quotes. `grep` the doc surface for each. Every hit is a candidate.
2. **Judge.** Grep only finds docs that name the symbol. Also read each doc in the changed area's neighbourhood and ask whether what it *claims* still matches what the code now *does*. The reflector's summary may carry a `docs likely affected:` line — start there.

For each stale claim, write the corrected fact. Then, **after the user approves the list at the gate** (it appears under NEEDS YOU as `docs: <file> — <claim> → <fact>`, one line each), apply the edits directly — prose docs are not source code, and this is the one repo write `/wrapup` makes. Append a `docs(...)` commit to `commits-draft.md` for them. Also confirm the cheap case: any doc file `architecture.md` listed in the blast radius that the diff didn't touch is a likely missed update — same list. Skip the sweep on a diff that touches no behaviour (pure refactor, tests only) and say so.

Check for residual artifacts one more time:

- No `console.log`, `print(`, debug logging
- No `TODO` without a tracking link
- No `.skip()` or `xit(`
- No `--no-verify` traces
- No commented-out code from this REQ

Surface any findings. The gate prompt will ask the user to clean before merging.

### 2. Draft the PR

Write `.adlc/<REQ_PATH>/pr-draft.md` from `.adlc/templates/pr-template.md` — read the template *here*, not at preflight. (Fall back to `$TOOLKIT_PATH/templates/pr-template.md` if this vault predates it; `/config templates` adds the vault copy.)

Filling notes the template can't carry:

- **Title** — match the project's commit/PR title convention from `context/conventions.md`. Conventional Commits if the project uses it; otherwise mirror recent merged PRs.
- **Summary** — the spec's Goal, rewritten in past tense.
- **Acceptance criteria** — reproduce the spec's checklist, each item marked ✓ with a short note on how `/review` verified it.
- **Changes** — grouped by module or file group; structural, not a file-by-file diff.
- **Lessons captured / Vault references consulted** — leave until after step 3; the verdicts don't exist yet.

### 3. Update the vault — knowledge

Knowledge capture happens in two halves: candidates were surfaced upstream (during /implement and /review) into `.adlc/<REQ_PATH>/lesson-candidates.md`. This step issues a verdict on each candidate and writes the resulting lessons, gotchas, and other vault entries.

#### Process candidates

1. **Read `lesson-candidates.md`.** If the file doesn't exist, do a sweep over `verification.md` and `commits-draft.md` asking "did anything recurring or instructive surface that should become a candidate?" (Open `review-log.md` only if a verdict entry lacks the detail to judge.) Append any to `lesson-candidates.md`, then continue. A complete REQ that genuinely produced zero candidates is rare — the more common cause of an empty file is missed capture upstream.

2. **Check each candidate against what already exists — on this branch and on the base branch.** Existing lessons are found by filename, not by reading them: `ls .adlc/knowledge/lessons/` for the working tree, and for the team's merged state:

   ```sh
   git -C <workPath> ls-tree --name-only origin/<base-branch>:<vaultDir>/knowledge/lessons/
   git -C <workPath> log -1 --format=%cr origin/<base-branch>      # how stale that view is — goes in the gate card
   ```

   `<workPath>` and `<base-branch>` come from `pipeline-state.json` (you already used them at step 1). **Always the `git -C <workPath>` form**: run from a subdirectory, `ls-tree` exits 0 with *empty* output and the check silently passes everything. If `origin/<base-branch>` does not exist (no remote, not fetched) git exits 128 and touches nothing — skip this half and say so in the gate card (`cross-branch dedup skipped: origin/<base> not found`). These are git **reads**; the git-mutation ban does not cover `ls-tree` or `log`. Fetching is the user's job — the toolkit never runs a network git op — which is why the merge checklist starts with `git fetch`.

   A candidate whose Claim matches a lesson that exists only on `origin/<base-branch>` is a duplicate of something a teammate already promoted: `discard — duplicate of LESSON-… (on <base>, not merged here yet)`.

3. **For each candidate, issue exactly one verdict:**
   - **`promote`** — write a full lesson. See "Lessons" below.
   - **`demote-to-gotcha`** — write a file-scoped gotcha. See "Gotchas" below.
   - **`discard`** — explain in one line why (trivial, already captured by LESSON-…, duplicate of CAND-M, etc.).

4. **Append verdicts** to `lesson-candidates.md` under a `## Candidate verdicts` heading at the bottom:

   ```markdown
   ## Candidate verdicts

   | Candidate | Verdict | Target / Reason | Detectable |
   |---|---|---|---|
   | CAND-001 | promote | LESSON-REQ-042-1 | no |
   | CAND-002 | promote | LESSON-REQ-042-2 | grep — `firestore.indexes.json` must list every compound `where` |
   | CAND-003 | demote-to-gotcha | ^g14 | no |
   | CAND-004 | discard | duplicate of LESSON-REQ-031-2 (on main, not merged here yet) | |
   | CAND-005 | discard | trivial — one-off, no recurring pattern | |
   ```

   `Detectable` asks one question of every `promote` and `demote-to-gotcha`: could a machine catch a violation — a grep over the diff, a lint rule, a test? Anything but `no` goes on the gate card under **Promotion candidates** with the one-line check written out, and into the stub's `Detectable` row. The user decides whether it becomes a `verify.sensors` entry in `config.yml`, a rule line in `context/conventions.md`, or a lint rule they write; when one exists, the lesson's `Enforced by` row is filled and the lesson leaves the reflector's repeated-mistake pass and the knowledge hook — a sensor owns it now. Knowledge a machine can check becomes a check; prose keeps only what needs judgment.

#### Lessons

- For each `promote` verdict, draft a new `.adlc/knowledge/lessons/LESSON-<REQ_ID>-<n>-<slug>.md` from `templates/lesson-template.md`. The ID is namespaced under this REQ — grammar and scan in `$TOOLKIT_PATH/core/VAULT-LAYOUT.md` → `mint(lesson)`:

  ```sh
  ls .adlc/knowledge/lessons/ | sed -n 's/^LESSON-<REQ_ID>-\([0-9][0-9]*\)-.*/\1/p' | sort -n | tail -1
  ```

  → that + 1, or `1`. Never a vault-wide count, and never by reading the lesson files. Legacy `LESSON-NNN` files in the vault are frozen; do not continue their sequence. Fill the `^L-<REQ_ID>-<n>` anchor.
- Fill the **table only** — title with anchor, then the 9 rows (`Tags` 2–5 tokens naming the component or domain as the blast radius names them; `Lesson` is the one sentence, written as a do/don't; `Saw in` is a repo-relative `path:line` — the knowledge hook matches on its directory, so name the real one; `Detectable` from the verdict table; `Enforced by` is `—` until a sensor exists). Nothing below the rule: the grown sections are filled when the lesson recurs in a future REQ, per the template's "born minimal, grown on demand" instruction. `critical` severity means *always-read* — every implementer sees it at dispatch — so reserve it for what must never repeat, not for what merely hurt.
- If the new lesson replaces an existing one, fill `Supersedes` and add the `STATUS: superseded by …` banner to the top of the old file (template header says how). Never delete the old file.
- `knowledge/lessons.md` is rebuilt at step 4 — no `index.md` row to add, and nothing to edit in `lessons.md` by hand.

If the verify phase produced reflector findings tagged `vault-stale`, draft updates to existing lessons (don't auto-apply — show them to the user as part of the gate prompt). When the finding says a lesson is outdated rather than wrong, supersession is usually the right shape.

#### Gotchas

- For each `demote-to-gotcha` verdict, **plus** any "non-obvious codebase behavior we discovered or preserved" that emerged this REQ (even if not in `lesson-candidates.md`), append a new entry to `.adlc/knowledge/gotchas.md`.
- Get the next `^g##` anchor by grepping anchors only — `grep -o '\^g[0-9]\+' .adlc/knowledge/gotchas.md | tail -1` — not by reading the file. `gotchas.md` is consolidated and grows forever; reading it whole makes wrap-up cost more with every REQ it succeeds at.
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

### 3b. Write the record

The record is the one file about this REQ that outlives its folder. It lives **beside** the folder, not in it — `.adlc/<REQ_PATH>.md` (`specs/REQ-042-slug.md` next to `specs/REQ-042-slug/`; `VAULT-LAYOUT.md` → `record(ID)`). It is committed; the folder is the local working set. Write it once, here; after this step nothing edits it except the append-only `## Later` section (`/bugfix` adds a line when a bug traces back).

Copy `.adlc/templates/record-template.md` (toolkit fallback `$TOOLKIT_PATH/templates/record-template.md`, same rule as step 2) to `.adlc/<REQ_PATH>.md` and fill it from what you already have open — do not open anything new for it:

| Section | Source |
|---|---|
| Header table | `pipeline-state.json` (path kind, branch, rounds, PR), `git log --oneline <base>..HEAD` and `--shortstat` (commits, lines), `usage.json` if present |
| Goal | `requirement.md` Goal, past tense (you wrote this for the PR body at step 2 — reuse it) |
| Acceptance criteria | `requirement.md`, ticked from `verification.md`'s cross-check |
| What changed | `architecture.md` blast-radius table, paths only; two to four sentences of approach |
| Decisions | ADRs touched this REQ; gate decisions from `pipeline-state.notes` |
| Verification | `verification.md` verdict line, tests added, the `verify:` runs it quotes, the ui line |
| Knowledge | IDs from step 3's verdict table and the gotcha/concept/component pages you touched |
| Follow-ups | `verification.md` follow-ups + anything deferred at a gate |

**Budget 6KB** — the budget hook refuses more; if you are over, the Goal or What-changed prose is too long, not the tables. Links go to `knowledge/…` by anchor and to work items by ID; never link into `<REQ_PATH>/` — on a teammate's clone that folder does not exist.

### 4. Update the navigation files

#### `.adlc/hot.md`

**Never load the whole file.** Entries go at the top, so read at most its first few lines to match the format — the body below is never needed to write a new entry.

Append:

```markdown
## [YYYY-MM-DD] req-ready-to-merge | REQ-NNN-<slug> | <one-line description>
```

Plus one entry per artifact created:

```markdown
## [YYYY-MM-DD] lesson | L-REQ-NNN-1 — <title>
## [YYYY-MM-DD] gotcha | G-NN — <title>
## [YYYY-MM-DD] adr-accepted | ADR-NNN — <title>
## [YYYY-MM-DD] concept | <name> — first captured
```

**Rotate past 500 lines — here, every time.** After appending, `wc -l`. If the file is over 500 lines, cut everything from the 501st line down (the oldest entries — newest are at the top) and prepend it to `.adlc/hot-archive-<YYYY>.md` (the year of the oldest cut entry; create with a one-line header if absent). Add or keep one row for the archive in `index.md`. Nothing is deleted; Obsidian still searches both. Measured before this rule: 3,860 lines, 754KB, "truncate when unwieldy" never fired because nobody was the one to call it unwieldy.

#### `.adlc/knowledge/lessons.md`, `.adlc/index.md`, `.adlc/decisions.md` — generated, never edited

Run the generators; do not open these files:

```sh
node $TOOLKIT_PATH/scripts/adlc.mjs lessons --vault .adlc    # one line per lesson, from the stubs' header tables
node $TOOLKIT_PATH/scripts/adlc.mjs index   --vault .adlc    # index.md (records, in-flight folders, ADRs, concepts, components) + decisions.md (ADR ledger)
```

Each prints a one-line summary (`lessons.md rebuilt: 312 lessons · 4 critical · …`, `index: 94 REQ · 12 BUG · …`) — put both lines in the gate card. They rewrite the **whole file** from header lines only, so cost does not grow with the vault; a `merge=union` duplicate on `lessons.md` is cleared by the rebuild. The Claude adapter refuses a hand edit to any of the three (they carry `<!-- GENERATED`); on another adapter the rule is the same, just unenforced. `index.md` keeps everything under its `## Reference` heading verbatim — that section is the one hand-maintained part.

#### `.adlc/now.md`

If this was the focus, update the "Active focus" line. If multiple REQs are in flight (in `/sprint`), update the active-REQ table.

**Budget: 1KB, and this step is where it holds.** `now.md` is the active-REQ table plus a one-line focus, read at every phase start by every skill. If it holds anything else — a sprint retrospective, a merge plan, notes — move that text verbatim to `sprints/<SPRINT-ID>.md` or the REQ folder it describes and leave a one-line pointer. A measured vault carried a 680-line retrospective here for two months after the REQs merged; every preflight paid ~17k tokens to read it. (The Claude adapter's budget hook refuses the write otherwise.)

#### `.adlc/glossary.md`

If new project-specific terms emerged, add them — test each candidate term with `grep` rather than reading the file to find out. Mark provisional definitions with `STATUS: needs verification`.

### 5. Draft the merge checklist

Write `.adlc/<REQ_PATH>/merge-checklist.md` from `.adlc/templates/merge-checklist-template.md` — read it *here*, not at preflight, same toolkit fallback as step 2. Substitute every `<placeholder>` with real values from `pipeline-state.json` and `config.yml`, and keep **only** the post-merge cleanup block matching `pipeline-state.isolation`: the template carries both `worktree` and `branch`, the written file carries one.

### 5a. Draft source write-back (optional, gated)

Only if `config.yml.sources.write` includes the issue tracker **and** this REQ was seeded from (or links to) an issue. Otherwise skip this step entirely.

- **Draft, don't send.** Write the proposed write-back into `.adlc/<REQ_PATH>/source-writeback.md`: the target issue, the comment text (e.g. "Addressed in PR <link> — REQ-NNN-<slug>"), and any status transition (e.g. `→ In Review`). Use the PR link only if one exists yet; otherwise leave a placeholder the user fills after opening the PR.
- **Never auto-submit.** This is surfaced at the wrap-up gate as a proposed action and executed only on explicit approval, using the resolved mechanism (`gh issue comment` / MCP / etc.). External writes always stop for your explicit OK — even under `/autopilot`.
- **Capped.** Under `/proceed`, the user approves it at the gate like everything else. Under `/autopilot`, it is additionally capped by `autonomy.sources` (default `read-only` ⇒ never auto-sent) and `sources.write`.

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
  - .adlc/<REQ_PATH>/pr-draft.md
  - .adlc/<REQ_PATH>/merge-checklist.md
  - .adlc/<REQ_PATH>.md   (the record)
  - New / updated vault files (see below)
```

### 8. Emit the gate card

Emit the gate per `$TOOLKIT_PATH/core/GATE-PROTOCOL.md`. A wrap-up gate's body is the **PR + vault capture + merge checklist**, and it carries an extra `merged` option (used after the user runs the merge). Map:

- **Header** — `Gate 5 of 5 · Wrap up · REQ-NNN-<slug>`.
- **Verdict** — e.g. "PR + vault ready — run the checklist when you're set", or flag if the final sanity check surfaced anything.
- **READY** — PR title + `pr-draft.md` (files changed, +/-); `merge-checklist.md`; the record (`<REQ_PATH>.md`, size); vault capture in one compact line (candidates considered `<N>`; promoted `<L-REQ-NNN-n>`; gotchas `<^gNN>`; ADRs/concepts/components/glossary/hot as applicable), then the dedup basis: `dedup vs origin/<base> as of <age>` or `cross-branch dedup skipped: origin/<base> not found`. The age is the honest signal — a week-old fetch makes the check weaker, and the card shows it rather than hiding it.
- **NEEDS YOU** — only genuine calls: the repo-doc list from step 1 (`docs: <file> — <claim> → <fact>`, applied on approve); **Promotion candidates** from step 3 (`L-REQ-NNN-n — detectable by <grep|lint|test>: <the check>` — pick a home for the check, or `later`); a drafted issue-tracker write-back awaiting your OK (never auto-sent); a "no knowledge captured — is that right?" confirmation; any unresolved final-sanity item. Omit if none.
- **CHECKS** — final diff sanity as one compact `✓ / ⚠` line: blast radius matches architecture · user-facing docs swept (`N` stale claims listed / none / skipped) · no debug artifacts · no `--no-verify` · commit drafts all in git log.
- **MY READ** — recommendation + one-line why.
- **Decision** — on Claude, an `AskUserQuestion`: **approve** (gate cleared — run the merge checklist), **revise** (adjust PR draft or vault updates), **merged** (after you merge — finalize state, log to `hot.md`), **abort** (halt without merging). Mark approve *(Recommended)* per `MY READ`.

Example shape:

```
GATE 5/5 · Wrap up · REQ-NNN-<slug>
   PR + vault ready — run the checklist when you're set

READY       PR: feat(pay): retry with backoff — pr-draft.md · 9 files, +240/-37
            merge-checklist.md
            knowledge saved: lesson L-REQ-042-1 · gotcha g14 · ADR-007 confirmed
            dedup vs origin/main as of 2 days ago · 1 candidate already on main
NEEDS YOU   ⚠ drafted, not sent: comment on issue #842 and a move to
            'In Review' — see source-writeback.md

CHECKS      ✓ changed files match the plan · ✓ docs updated · ✓ no debug
            ✓ no --no-verify · ✓ commits in log

MY READ     approve — clean wrap; the write-back is the only thing awaiting you

Decision →  approve · revise <what> · merged · abort
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
4. Update `now.md`: remove this REQ from active focus. Fill the record's header `Status` → `merged` and `Opened → merged` date if they were still `ready-to-merge` (the one edit a record ever takes besides `## Later`).
5. **Offer to clean up the working set.** One question, with the numbers in it:

   > Record written at `.adlc/<REQ_PATH>.md`. The working set `.adlc/<REQ_PATH>/` (N files, M MB — exploration, tasks, review log, packets, evidence, drafts, state) is local and nothing links into it. **Delete it now, or keep it?**

   Default is **keep**. On `delete`: `rm -rf .adlc/<REQ_PATH>/` — the folder only; the record and every `knowledge/` page stay, and `/spec`, `/status`, `mint` all still see the item through its record (`VAULT-LAYOUT.md` → `record(ID)`). Append `## [DATE] req-cleaned | REQ-NNN-<slug> | M MB` to `hot.md`. On `keep`: leave it; `/analyze`'s vault-health lists working sets of merged items older than 30 days with their sizes, so the question comes back with a total attached. A vault without git (no `.git` at the repo root, or `.adlc/` ignored by it) gets the same question with one more sentence: *"This vault is not under version control — deleted means gone."*
6. **Archive is for kept folders only.** If the working set was kept and the user wants `specs/` to show active work only, offer the `_archive/` move: the destination **mirrors the source's tail** (`specs/2026-08/sf/REQ-042-slug/` → `specs/_archive/2026-08/sf/REQ-042-slug/`; flat archives flat; never mint a month here — that would bucket by merge date). `mkdir -p` the destination's parent, then plain `mv` — **not `git mv`**, which stages a rename and would be a git write in `manual` mode. The record does not move. Append `## [DATE] req-archived | REQ-NNN-<slug>` to `hot.md`. A deleted working set needs no archive: the record already sits in `specs/` at its month/author position, which is the browsable history.
7. Rebuild `index.md` (`node $TOOLKIT_PATH/scripts/adlc.mjs index --vault .adlc`) so the item moves from in-flight to done.

If `abort`:

1. Confirm. Roll back what makes sense.
2. Append to `hot.md`: `## [DATE] ship-aborted | REQ-NNN-<slug>`.

## Constraints

- **Git follows `git.mode`** (`.adlc/config.yml`, default `manual`). In `manual`, NEVER run `git add/commit/push` — the merge checklist exists because you don't run those. In `commit`/`commit+push`, you may commit the vault/lesson updates on the REQ's feature branch (and push it, ff-only, in `commit+push`) after the wrapup gate is approved. In **every** mode, NEVER run `gh pr create`, `gh pr merge`, branch deletes, force-pushes, or anything touching a protected branch — opening and merging the PR is always the user's.
- **Vault updates** go on the REQ's feature branch: committed by you in `commit`/`commit+push`, or left for the user's final commit in `manual`.
- **`pr-draft.md` is a draft.** The user can paste it into `gh pr create --body-file` or copy/paste into a web form. Don't auto-submit anywhere.
- **Source write-back is off unless `sources.write` lists the tracker, and always gated.** Even when configured, the comment/transition is drafted to `source-writeback.md` and sent only on explicit approval — never as a silent side effect. It's an external write: it always stops for your OK, and under `/autopilot` it is further limited by `autonomy.sources`.
- **Lessons are team artifacts.** They are namespaced under this REQ (never a vault-wide count), checked against the base branch before promotion, and land in the PR diff under `knowledge/lessons/` where the reviewer can push back on them like on code. A lesson that duplicates one already on the base branch is a discard, not a second copy.
- **Capture liberally as candidates, prune deliberately at verdict.** Candidates are cheap — one line in a scratch file. Lessons are precious — the vault stays high-signal because the verdict step is rigorous, not because the candidate bar is high. Silent zero-capture is a failure mode: if no candidates surfaced upstream and the sweep over `verification.md` finds nothing either, ask the user at the gate — "We didn't capture any lessons from this one. Does that sound right, or should I take another look?" — don't pass silently.

## Output artifacts

- `.adlc/<REQ_PATH>/pr-draft.md`
- `.adlc/<REQ_PATH>/merge-checklist.md`
- `.adlc/<REQ_PATH>/lesson-candidates.md` (now includes the `## Candidate verdicts` table appended at the bottom; retained after wrapup as decision history)
- `.adlc/<REQ_PATH>/source-writeback.md` (only when `sources.write` is configured and a write-back was drafted at step 5a)
- `.adlc/<REQ_PATH>.md` — the record (new, ≤6KB, committed)
- New / updated vault files: `lessons/` stubs, `knowledge/lessons.md` (generated), `gotchas.md`, `concepts/`, `components/`, `architecture/`, `index.md` + `decisions.md` (generated), `hot.md`, `now.md`, `glossary.md`
- On `merged`: the working set `<REQ_PATH>/` deleted (on `delete`) or kept — and, if kept and asked, moved under `specs/_archive/` with its tail preserved; the record stays where it is
- Updates to `pipeline-state.json`
