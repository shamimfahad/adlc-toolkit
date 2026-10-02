---
name: task
description: Slim ADLC pipeline for small changes — a tweak, a small feature, a contained refactor that's too small for /proceed's five phases but should still live in the vault. Triage → plan (gate) → implement → review + ship (gate). Self-triaging: recommends /proceed if the work is actually large, up front or mid-flight, without losing the REQ folder it created. Use instead of doing small work ad-hoc, so the vault still captures it.
---

You are running `/task` — the slim pipeline for small changes. It exists so that small work stays *inside* the ADLC instead of being done ad-hoc and lost to the vault. It keeps the gate discipline (you still pause for human approval) but compresses five phases into two gates and right-sizes the ceremony behind them.

The defining feature: `/task` is **self-triaging**. Small work runs here; work that turns out to be large is escalated to `/proceed` — and because `/task` writes a real `REQ-NNN-<slug>` from the start, escalating loses nothing.

## When to use

- A small, bounded change: a contained feature, a tweak, a localized refactor.
- You'd otherwise skip `/proceed` because it feels heavy for the size — that's exactly the case `/task` is for.

## When to escalate to `/proceed` instead

`/task` decides this for you (see Phase 1 triage), but the shape of "too big for a task" is:

- It needs a new architectural decision / ADR.
- The blast radius is large — roughly 5+ files or 2+ modules/layers.
- It's cross-repo.
- It touches a **sensitive surface**: auth, security, secrets, a data/schema migration, a public API contract, or anything irreversible (the same categories as `config.yml` → `autonomy.hard_stops` and the architecture-adversary trigger — reuse that list, don't invent a new one).
- It has more than ~3 acceptance criteria, or the scope is genuinely ambiguous and needs real design.

**Risk dominates size, one-directionally:** any sensitive-surface touch forces escalation no matter how few lines it is. You can be sized *up* by risk, never sized *down* into less rigor by a small diff.

## Preflight

1. **Read the toolkit ETHOS** (`$TOOLKIT_PATH/ETHOS.md`) **, the gate protocol** (`$TOOLKIT_PATH/core/GATE-PROTOCOL.md`)**, the voice guide** (`$TOOLKIT_PATH/core/VOICE.md`)**, and the vault layout** (`$TOOLKIT_PATH/core/VAULT-LAYOUT.md` — where work records live on disk; never hard-code a path under `specs/`, `bugs/`, or `sprints/`) — the shared gate-card format used at both gates below.
2. **Load vault basics.** `.adlc/CLAUDE.md`, `now.md`, `hot.md` (last 20), `config.yml`, `context/project-overview.md`, `context/conventions.md`.
3. **Assign the REQ ID.** Mint it per `config.yml` → `req.id_scheme` (default `sequential`), exactly as `/spec` preflight does — one scan, `find .adlc/specs -maxdepth 4 -type d -name 'REQ-*'`, which covers every month bucket, every author folder, and `_archive/`. `sequential` takes max+1 padded to 3 (`REQ-NNN`); `prefixed` (`REQ-<req.prefix>-NNN`) narrows the `-name` to `REQ-<req.prefix>-*` but keeps the depth — scoped to your own author folder it would re-mint someone else's live IDs; `ticket` takes the issue key when invoked with an issue ref + `sources.issues`, else falls back to prefixed/sequential, noting it. `/task` uses the **same ID namespace and `specs/` tree as `/spec`** — this is what makes escalation to `/proceed` a clean handoff rather than a migration. Throughout, `REQ-NNN` denotes the assigned ID in whatever form the scheme produced.
4. **Determine the slug.** Short kebab-case, ≤40 chars.
5. **Create the REQ folder.** Same rule as `/spec` preflight step 5: read `config.yml` → `layout.partition`; `none` gives `specs/REQ-NNN-<slug>`, `month-author` gives `specs/<YYYY-MM>/<author>/REQ-NNN-<slug>` — today's month (the creation month, fixed from here) and `<author>` the first of `layout.author`, `req.prefix`, initials from `git config user.name`, or `_`. `mkdir -p` the parents. **That vault-relative path is `<REQ_PATH>` below** — no `.adlc/` prefix, so paths read `.adlc/<REQ_PATH>/…`, and agent dispatch prompts get it written out in full (the agents resolve nothing).
6. **Resolve a source reference (optional).** Same resolver as `/spec` preflight step 6 (issue ref / URL via `gh` → MCP → fetch when `sources.issues` is set). Additive; never blocks.

## Phase 1 — Plan (gate)

This single phase does triage, a lightweight spec, and a short approach — the work `/spec` and `/architect` split across two gates in the full pipeline.

### 1. Quick recon

A light pass, not a full blast-radius exploration: grep the area the change touches, identify the files likely involved, and grep `hot.md` / `gotchas.md` / `knowledge/lessons.md` (one line per lesson — never the folder) for the directories and component names involved. If the change is non-trivial to scope, you may dispatch `codebase-explorer` for one focused exploration pass — but if you reach for it, that's already a signal the work may belong in `/proceed`.

### 2. Triage — the escalation decision

Using the recon, evaluate the change against the escalation criteria above. Decide one of:

- **task** — small and low-risk; continue here.
- **escalate** — any escalation criterion holds. Do **not** silently proceed. Surface the recommendation with its reasons (ETHOS #6, ask in options):

  ```
  This looks bigger than a task:
    - <signal, e.g. "touches auth/session — sensitive surface (forces escalation)">
    - <signal, e.g. "blast radius ~9 files across 3 modules">
  Recommend /proceed. REQ-NNN-<slug> is already created, so nothing is lost either way.

  Reply:
    proceed   — hand off to /proceed (resumes at the architect phase)
    task      — continue as /task anyway (you accept the lighter rigor)
    abort     — discard
  ```

  On `proceed`, follow **Escalation handoff** below. Respect the user's override either way — risk-forced escalations should be recommended strongly, but the human still decides.

### 3. Draft the lightweight requirement

Write a compact `.adlc/<REQ_PATH>/requirement.md` — not the full spec template. Include:

- **Goal** — one or two sentences: the state of the world after this ships.
- **Acceptance criteria** — 1–3 testable, yes/no statements.
- **Scope / non-goals** — one line each; what this deliberately does not touch.
- **Approach** — 2–4 bullets: where the change lives, the files to touch, the pattern it follows. This is the folded-in architect step; no formal task DAG.
- **Related** — any vault wikilinks found in recon.

Add `kind: task` to the frontmatter so the vault and `/status` can tell task-REQs from full-pipeline REQs.

### 4. Initialize pipeline state

`.adlc/<REQ_PATH>/pipeline-state.json`:

```json
{
  "req": "REQ-NNN-<slug>",
  "kind": "task",
  "createdAt": "<ISO>",
  "currentPhase": 1,
  "completedPhases": [0, 1],
  "gateState": "awaiting",
  "currentPhaseGate": "plan",
  "isolation": null,
  "workPath": null,
  "worktree": null,
  "branch": null
}
```

Work path is created only after this gate clears (so an escalate/abort leaves no branch behind).

### 5. Plan gate card

Emit per `$TOOLKIT_PATH/core/GATE-PROTOCOL.md`. A task plan gate folds spec + architect into one and adds an `escalate` option:

- **Verdict** — "small & low-risk — recommend approve", or "bigger than a task — recommend escalate".
- **READY** — triage call (TASK, one-line why); `requirement.md`: goal (one line), `<N>` acceptance criteria, approach (`<N>` bullets, ~`<M>` files).
- **NEEDS YOU** — only if triage leans escalate (name the signal — sensitive surface / blast radius / ADR needed). Omit when it's cleanly a task.
- **CHECKS** — acceptance testable · scope bounded, no sensitive surface · approach concrete (files named).
- **MY READ** — recommendation + why (risk forces escalate regardless of size).
- **Decision** — on Claude, an `AskUserQuestion`: **approve** (clear the gate; implement), **escalate** (hand to `/proceed`), **revise** (adjust goal/scope/approach), **abort** (discard the REQ).

```
GATE 1/2 · Plan · REQ-NNN-<slug>  (task)
   small & low-risk — recommend approve

READY    triage: TASK — localized, ~3 files, no sensitive surface
         goal: <one line> · 2 acceptance criteria · approach: 3 bullets
CHECKS   ✓ acceptance testable · ✓ scope bounded · ✓ approach concrete

MY READ  approve — clean small change; nothing forces escalation

Decision →  approve · escalate · revise <what> · abort
```

On `approve`: delete any marker, set `gateState: "cleared"`, append `## [DATE] task-plan-cleared | REQ-NNN-<slug>` to `hot.md`, continue to Phase 2.
On `escalate`: follow **Escalation handoff**.

## Phase 2 — Implement (no gate)

### 1. Establish the work path

Same pattern as `/architect`'s work-path step. Read `config.yml.workflow.isolation`; in `auto`/`branch` mode verify a clean tree and `git checkout -b feat/REQ-NNN-<slug>`; in `worktree` mode `git worktree add`. Record `isolation`, `workPath`, `branch`, `worktree` in pipeline-state. Append `## [DATE] work-path-set | REQ-NNN-<slug> | <mode>` to `hot.md`.

### 2. Make the change

Implement against the approach in `requirement.md`. For a genuinely small task, do it directly; if it has 2–3 distinct pieces, dispatch a single `task-implementer` (by exact agent name — if it isn't installed, stop and say so; don't absorb the work silently). Add or update tests for the new behavior. Draft the commit message to `commits-draft.md` per `git.mode`. Run the tests; confirm they pass.

### 3. Mid-flight escalation check

If, while implementing, the change grows past the escalation criteria — it sprawls across modules, needs a decision you didn't foresee, or reaches a sensitive surface — **stop and surface**, don't push through:

```
This grew past a task while implementing:
  - <what changed, e.g. "the fix requires a schema migration">
Recommend escalating to /proceed. Work so far is preserved on <branch>.

Reply: proceed | task (continue anyway) | abort
```

On `proceed`, follow **Escalation handoff** — the branch and the draft requirement carry over; `/proceed` resumes at architect with the work already started.

## Phase 3 — Review & ship (gate)

One consolidated gate covering verification and wrapup.

### 1. Slim review

Dispatch a **reduced reviewer set**, not the full five:

- **correctness-reviewer** and **reflector** — always (the two highest-yield: logic/security, and the vault check for repeated mistakes). The reflector stays even on the smallest task — it's cheap and catches "you're repeating a known lesson / breaking a gotcha" regardless of size. (Repo docs are swept at wrapup-lite, same as `/wrapup`.)
- **ui-reviewer** — only when the change touches UI directly or via a consumed API contract (the same evidence-driven trigger `/review` uses). A task that changes a button or an API a screen calls still gets its UI verified.
- Skip quality and architecture reviewers unless the diff introduced significant new code or moved layering — if it did, that's also a hint it should have been `/proceed`.

Run `/review` **step 0** first — the `verify:` commands from `config.yml`; a `halt_on` failure stops here and goes back to the fix, anything else becomes Deterministic findings the reviewers receive as facts. Then pass `Candidates file: .adlc/<REQ_PATH>/lesson-candidates.md` and `Output file: .adlc/<REQ_PATH>/review-log.md` — the reviewer agents' default, so no special wording is needed. State the write budget in the dispatch prompt as `/review` does: summary ≤5 lines, finding ≤8 lines after its table, section ≤12KB, ≤12 candidates of ≤4 lines. Then consolidate into `.adlc/<REQ_PATH>/verification.md` exactly as `/review` step 4 does: digest table, roster line, consolidated findings with only the dispatched reviewers' sections. The verdict file is the digest; the narrative lives in the log from the first pass. (Until 1.7.0 slim pipelines wrote reviewer narrative straight into `verification.md` and created a log only at the first re-review; measured `/task` verdict files were 43–51KB against an 8KB budget after a single pass, so the split now applies from round 1.) Re-review rounds follow `/review` step 6: the log keeps every round, the verdict file collapses resolved findings, and from round 3 the gate card leads with `Re-review round <N> · verdict file <N>KB`.

### 2. Wrapup-lite — capture knowledge

- Process lesson candidates: read `lesson-candidates.md`, check each against existing lessons on this branch and on `origin/<base-branch>` (exactly `/wrapup` step 2 — `git -C <workPath> ls-tree …`, the age line, the skip line), issue a verdict on each (`promote` / `demote-to-gotcha` / `discard`), append the `## Candidate verdicts` table. **Unlike `/bugfix`, zero non-discard verdicts is allowed** — a small task may legitimately produce no lasting knowledge; sweep honestly and a clean "nothing to keep" is fine, no forced capture.
- Write any promoted lessons / gotchas to the vault (the stub's table only; `Detectable` column in the verdict table as `/wrapup` step 3). Lesson IDs are `LESSON-<REQ_ID>-<n>` — scan per `core/VAULT-LAYOUT.md` → `mint(lesson)`, never a vault-wide count.
- **Write the record** `.adlc/<REQ_PATH>.md` exactly as `/wrapup` step 3b — the slim path writes the same file; a `/task` record is usually under 3KB (`Path kind: /task`).
- Update navigation: `hot.md` (req-ready entry + any artifacts), `now.md` (clear active focus if this was it); then run the generators — `node $TOOLKIT_PATH/scripts/adlc.mjs lessons --vault .adlc` (if a lesson was written) and `node $TOOLKIT_PATH/scripts/adlc.mjs index --vault .adlc` (always — the record is a new row). Never edit `index.md` or `lessons.md` by hand.
- Repo-doc sweep, same as `/wrapup` step 1: grep the doc surface for the changed symbols, list stale claims with corrected facts under NEEDS YOU, apply on approve.
- Draft `pr-draft.md` (title + body, change summary, lessons captured) and `merge-checklist.md` — same shapes as `/wrapup`, slimmer body.
- Source write-back (optional, gated): same rule as `/wrapup` step 5a — only if `sources.write` lists the tracker and this REQ links an issue; drafted, never auto-sent.

### 3. Ship gate card

Emit per the gate protocol — one consolidated review + ship gate:

- **Verdict** — "clean — recommend approve", or "`<k>` findings need a call".
- **FINDINGS** (if any) — `crit / maj / min` + reviewer; this is the `NEEDS YOU`. Omit when clean.
- **READY** — reviewers run (correctness, reflector, +ui if UI touched) with UI tier/counts or "n/a — no UI surface"; files changed `<N>` +a/-b, tests added/updated; commit drafted; knowledge (promoted `L-REQ-NNN-n` / gotcha `^gNN` / "nothing to keep — confirmed"; dedup basis when a lesson was considered); PR draft + merge checklist.
- **CHECKS** — acceptance met · tests pass · no debug artifacts.
- **MY READ** — recommendation + why (never approve while a Critical stands).
- **Decision** — on Claude, an `AskUserQuestion`: **approve** (run the merge checklist), **fix** (`<ids>`, then re-verify), **revise**, **merged** (finalize after you merge), **abort**.

```
GATE 2/2 · Wrap up · REQ-NNN-<slug>  (task)
   clean — recommend approve

READY    reviewers: correctness, reflector · UI: n/a — no UI surface
         4 files, +80/-12 · tests updated · commit drafted
         knowledge: nothing to keep — confirmed
         PR: pr-draft.md · merge-checklist.md
CHECKS   ✓ acceptance met · ✓ tests pass · ✓ no debug

MY READ  approve — small, clean, covered

Decision →  approve · fix <ids> · revise <what> · merged · abort
```

Gate clearance mirrors `/wrapup`: on `approve`, set `gateState: "cleared"`, log to `hot.md`; on `merged`, finalize `pipeline-state` (`terminal`/`prState: merged`), update `now.md`, log `## [DATE] req-merged | REQ-NNN-<slug>`.

## Escalation handoff

When triage or mid-flight escalation routes to `/proceed`, hand off cleanly — nothing is recreated:

1. The `REQ-NNN-<slug>` folder, `requirement.md`, and any branch/worktree already exist and stay.
2. Update `pipeline-state.json`: drop `kind: task`, set the phase so `/proceed` resumes correctly — Phase 1 `cleared` if escalation happened at the plan gate (proceed runs architect next), or keep the current phase if work was already underway (escalation mid-implement resumes at architect over the started branch). Append `## [DATE] task-escalated-to-proceed | REQ-NNN-<slug> | <reason>` to `hot.md`.
3. The lightweight `requirement.md` becomes the seed `/proceed`'s architect phase reads. `/architect` may expand it (full blast radius, task DAG, ADR if needed) — escalation exists precisely because that rigor is now warranted.
4. Invoke `/proceed REQ-NNN-<slug>` and exit `/task`.

## Constraints

- **Gates don't scale; ceremony does.** `/task` has fewer gates than `/proceed` because the *user chose* the slim pipeline — not because Claude decided to skip a decision point. Within `/task`, you still never advance past a gate without approval, and never collapse the two gates into zero.
- **Risk forces escalation, one-directionally.** A sensitive-surface touch (auth/security/secrets/migration/public-contract/irreversible) escalates no matter how small the diff. Never size *down* into `/task` away from rigor the change warrants.
- **Escalation never loses work.** Because the REQ lives in `.adlc/specs/` from the start, handing off to `/proceed` is a state update, not a rebuild.
- **Commits follow `git.mode`** (default `manual`) — same rules as the full pipeline; never a protected branch, force-push, PR, or merge.
- **Always capture honestly, never force it.** Sweep for lessons; a clean "nothing to keep" is allowed for a small task (unlike `/bugfix`'s mandatory capture). The bar is honesty, not a quota.

## Output artifacts

Per `REQ-NNN-<slug>` (kind: task):

- `requirement.md` (compact: goal + ACs + scope + approach)
- `commits-draft.md`
- `verification.md` (verdict digest, reduced reviewer set) and `review-log.md` (reviewer narrative)
- `pr-draft.md`, `merge-checklist.md`
- `lesson-candidates.md` (with verdicts; zero non-discard allowed)
- `source-writeback.md` (only when configured and an issue is linked)
- `pipeline-state.json`
- The record `.adlc/<REQ_PATH>.md`; vault updates: `hot.md`, `now.md`, any promoted lessons/gotchas, and the generated `index.md` / `knowledge/lessons.md`
