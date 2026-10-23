---
name: sprint
description: Parallel multi-REQ orchestrator. Launches one pipeline-runner agent per REQ in an isolated worktree. Each runner pauses at its first gate; the orchestrator maintains a unified queue of waiting gates across all REQs. Who clears that queue follows the autonomy.gates dial — the user (manual, default), the user with a decision-maker recommendation attached (assisted), or the decision-maker itself with only exceptions surfacing (auto).
---

You are the `/sprint` orchestrator. Your job is to run multiple REQs through the ADLC pipeline concurrently, while preserving the per-gate approval discipline the user expects.

This is the **gate-pause** model: each pipeline-runner runs autonomously until its next gate, then pauses. You — the orchestrator — collect all waiting gates from all active runners into a unified triage queue. The queue exists in every mode; **who clears it** follows the `autonomy.gates` dial: the user, one gate at a time (`manual`); the user, with the decision-maker's recommendation attached to each gate (`assisted`); or the decision-maker, with only exceptions reaching the user (`auto`). See "Gate adjudication" below. Whoever clears a gate, the corresponding runner advances to its next phase.

## When to use

- Multiple independent REQs are ready to ship.
- The user wants throughput across features (not single-feature speed within one REQ).

## When NOT to use

- A single REQ — use `/proceed`.
- A bug fix — use `/bugfix`.
- REQs with strong inter-dependencies — sequence them through `/proceed` one at a time.

## Inputs

- One or more REQ IDs (`/sprint REQ-101 REQ-102 REQ-103`), OR
- One or more feature descriptions (`/sprint "fix login redirect" "add export button"`) — these get drafted as new REQs via `/spec` before the sprint starts.
- Optional flag: `--gates=<manual|assisted|auto>` — override `config.yml → autonomy.gates` for this sprint only.

A reasonable upper bound is **5 concurrent REQs**. Beyond that, gate triage becomes the bottleneck and overall throughput drops. Hard-cap at 5 unless the user explicitly overrides.

## Preflight

1. **Read the toolkit ETHOS** (`$TOOLKIT_PATH/ETHOS.md`) **, the gate protocol** (`$TOOLKIT_PATH/core/GATE-PROTOCOL.md`)**, the voice guide** (`$TOOLKIT_PATH/core/VOICE.md`)**, and the vault layout** (`$TOOLKIT_PATH/core/VAULT-LAYOUT.md` — where work records live on disk; never hard-code a path under `specs/`, `bugs/`, or `sprints/`) — each per-REQ gate in the queue renders as a gate card.
2. **Load vault.** `.adlc/CLAUDE.md`, `now.md`, `hot.md` (last 20), `config.yml`. From `config.yml → autonomy`, read `gates` (plus `escalation`, the rework caps, `confidence_floor`, `packet_max_bytes`, `hard_stops`) — apply any `--gates` flag override. Absent `autonomy` block ⇒ `manual`.
3. **Validate input.** For each argument:
   - If it's a REQ ID, resolve it per VAULT-LAYOUT's `resolve` rule — `find .adlc/specs -maxdepth 4 -type d -name 'REQ-NNN-*'` — and check the folder has a `requirement.md`. The hit minus the leading `.adlc/` is that REQ's `<REQ_PATH>`. Two hits is a collision: show both and ask. If the only hit is under `specs/_archive/`, it's completed and archived — say so and drop it from the sprint list; don't offer to re-create it. If nothing resolves, surface and ask: should we create it via `/spec` first?
   - If it's free text, treat as a new feature and call `/spec` for each, sequentially (or interactively).
4. **Check global REQ counter.** REQ IDs must be unique across all in-flight work. Read `~/.adlc/.global-next-req` (a global atomic counter). Increment for each new REQ created during this sprint setup. Honor the lock — concurrent sprints across projects share this counter.
5. **Check for collisions.**
   - Active REQs already in flight — enumerate them per VAULT-LAYOUT's `enumerate(active)` rule, then read each folder's `pipeline-state.json`. Don't start a sprint that includes an already-active REQ.
   - Worktree path collisions: each REQ's worktree must be a unique path.
6. **Confirm with the user.** Show the list of REQs about to be launched, the worktree paths, the model used per pipeline-runner, and the gate mode. In `assisted`/`auto`, say in one line what that means for this sprint ("auto: I clear routine gates via the decision-maker; you see hard-stops, critical findings, HALTs, and every final review"). Get explicit confirmation before dispatching.

## Setup

### 1. Validate prerequisites

For each REQ:

- Spec exists and the spec gate has been cleared (or the spec phase will run inside the pipeline-runner — for this orchestrator, prefer that specs are pre-validated before invoking `/sprint`).
- No conflicting REQ in flight (no two REQs touching the exact same file at the same time — for cross-repo, scope to per-repo).

If conflicts exist, surface and stop. The user must resolve.

### 2. Launch pipeline-runners

For each REQ, dispatch a `pipeline-runner` agent (deep tier) with:

```
REQ ID: REQ-NNN-<slug>
REQ folder: .adlc/<REQ_PATH>/
Repository path: <repo-path from config.yml>
WORKTREE PATH (mandatory): <repo-path>/.worktrees/REQ-NNN-<slug>
Subagent mode: true (you cannot dispatch sub-agents)
Base branch: <base from config.yml>

Run the full /proceed pipeline for this REQ per your skill instructions.
Pause at every gate; emit terminal claim `gate-blocked:<phase>` when paused.
Do NOT run git mutations beyond worktree creation.
Update pipeline-state.json after every phase.
```

Write the REQ folder out in full — the runner resolves nothing. The worktree path is not a vault path: worktrees live in the repo, so name each one by REQ ID and slug, never by `<REQ_PATH>`.

Dispatch all runners in a single message so they run concurrently. **Dispatch by exact agent name.** If the agent type isn't available (not installed, or the sync hasn't run since it was added), **stop and tell the user**: "`<agent>` isn't installed — run the toolkit sync, then re-run this step." Never absorb the agent's work into the main session as a fallback: inline work runs at the session's model instead of the agent's tier (a haiku-priced exploration silently becomes an opus-priced one), and for reviewers it destroys the independence the gate depends on — the same context that wrote the code would be reviewing it.

### 3. Initialize the sprint registry

Read `config.yml` → `layout.partition`. With `none`, the registry is `.adlc/sprints/SPRINT-YYYY-MM-DD-<HHMM>.json`; with anything else it goes in this month's bucket — `.adlc/sprints/<YYYY-MM>/SPRINT-YYYY-MM-DD-<HHMM>.json`. Sprints take the month and **no author folder**; that's deliberate, don't add one. `mkdir -p` the parent first, then write:

```json
{
  "sprint": "SPRINT-YYYY-MM-DD-<HHMM>",
  "startedAt": "<ISO>",
  "gates": "<manual|assisted|auto>",
  "reqs": [
    {"id": "REQ-101-...", "worktree": "...", "branch": "...", "status": "running"},
    {"id": "REQ-102-...", "worktree": "...", "branch": "...", "status": "running"},
    {"id": "REQ-103-...", "worktree": "...", "branch": "...", "status": "running"}
  ],
  "currentGateQueue": []
}
```

Append to `hot.md`:

```markdown
## [DATE] sprint-launched | SPRINT-... | <count> REQs: REQ-101, REQ-102, REQ-103
```

## Gate adjudication — who clears the queue

The dial: `manual` — every waiting gate goes to the user, exactly as described in the triage loop; no decision-maker involved. `assisted` — you adjudicate each gate first (below) and the queue entry carries the verdict as a recommendation with its confidence; the user still clears every gate, but a clean one is a one-keystroke confirm. `auto` — you route each gate's verdict yourself; only exceptions reach the user. Auto is the exception-queue mode: five REQs in flight, and the user hears about the handful of decisions that need a human.

### The routing (assisted and auto)

When a REQ's gate turns `awaiting`, apply `/autopilot`'s gate logic from the orchestrator's seat:

1. **Forced halt** — the gate touches a `hard_stops` category → straight to the human queue. Auto mode never clears it.
2. **Fast path — deterministic, no agent call.** Clean validation, zero findings, low risk → APPROVE. Any critical or major finding → the human queue.
3. **Slow path — the ambiguous middle.** Assemble the size-capped gate packet exactly as `/autopilot` does (the artifact under judgment, findings summary, risk profile, acceptance-criteria status, autonomy policy, this gate's rework history; `packet_max_bytes` cap) and dispatch one `decision-maker` per gate. **Dispatch by exact agent name** — if it isn't installed, stop and tell the user to run the toolkit sync. Concurrent gates get concurrent decision-makers; each appends to its own REQ's `gate-decisions.md`.

Route the verdict:

- **APPROVE** — `assisted`: attach it to the queue entry; the user decides. `auto`: clear the gate exactly as a user approval would (delete `.awaiting-approval`, set `gateState: "cleared"`, append to `hot.md` tagged `auto`); the runner advances.
- **REWORK** — send the requested fixes to that REQ's runner as a `revise`, bounded by the same caps `/autopilot` honors: `rework_cap_per_gate` at one gate, `rework_budget_total` across that REQ's run. Cap exhausted → escalate to the human queue.
- **HALT** — the gate enters the human queue with the open question first. A verdict below `confidence_floor` is a HALT (the agent enforces this; you honor it).

### What always reaches the human, in every mode

The launch confirmation; hard-stop gates; critical/major findings; every HALT and confidence-floor trip; exhausted rework caps; runners that go `blocked` or `failed`; and each REQ's ship gate — the final review and the merge order are never adjudicated away. Merges are the user's, always.

### The ledger — visibility without interruption

Auto-cleared gates still show. Each queue render (and `status`) opens with a ledger of what was adjudicated since the last render, one line per verdict:

```
CLEARED FOR YOU (auto)
  ✓ REQ-101 architect — approved 0.86 · design matches spec, low risk
  ✓ REQ-102 spec      — approved (fast path: clean, no findings)
  ↻ REQ-103 implement — rework 1/2 · two tests missing for T4
```

No reply needed — these lines are for tracking, not deciding. The audit trail is each REQ's `gate-decisions.md`: every verdict is written there, approvals included, same as `/autopilot`.

One independence note: in sprint mode each runner reviews inline by design (its report sections say so) — the decision-maker is the only fresh pair of eyes at these gates. It always runs as a true sub-agent of the orchestrator, never inline, and its entries must say `Judged independently: yes`.

## The triage loop

Once runners are launched, your job is to **monitor and present**, not to drive. Each pipeline-runner advances autonomously until it hits its next gate.

### Monitoring

Every 60 seconds (or on user nudge), poll each REQ's `pipeline-state.json`:

- `gateState == "awaiting"` → route by gate mode: `manual` — the gate joins the queue; `assisted`/`auto` — adjudicate first (see "Gate adjudication"), then queue it with the recommendation (assisted) or clear/queue per the verdict (auto)
- `terminal == "merged"` → REQ is done, remove from active list
- `terminal == "blocked"` → REQ is blocked, surface to user
- `terminal == "failed"` → REQ failed, surface to user

Update the sprint registry's `currentGateQueue` with all REQs in `awaiting` state.

### Presenting the queue

When a gate becomes available (or the user asks for an update), surface the unified queue:

```
SPRINT GATE QUEUE · SPRINT-...

3 REQs in flight. 2 gates awaiting your decision:

  1. REQ-101-add-export-button
     Phase: architect (gate)
     Files affected: 6
     ADR proposed: yes (ADR-014)
     Drafted: .adlc/<REQ_PATH>/architecture.md
     Worktree: <path>

  2. REQ-103-fix-cookie-domain
     Phase: implement (gate)
     Tasks complete: 4/4
     Tests pass: ✓
     Drafted commits: .adlc/<REQ_PATH>/commits-draft.md
     Worktree: <path>

Not yet at gate:
  - REQ-102-refactor-auth: phase implement, running task 2/5

Reply with one of:
  approve <N>       — clear gate N; that runner advances
  revise <N>: <txt> — send revisions to gate N's runner
  fix <N>: <ids|all> — review gates only; fix the listed findings,
                       or every actionable finding (`all`)
  show <N>          — render gate N's full gate card (per the gate protocol)
  pause <N>         — pause REQ N (don't clear, don't revise — leave for later)
  abort <N>         — abort REQ N (with confirmation)
  status            — refresh the queue
```

### Clearing gates

When the user clears gate N for REQ-X:

1. Find REQ-X's `.awaiting-approval` file.
2. Update REQ-X's `pipeline-state.json`: `gateState: "cleared"`, append to `hot.md`.
3. Delete `.awaiting-approval`.
4. The pipeline-runner for REQ-X picks up where it left off (it polls for the marker; alternatively, dispatch a continuation message).
5. The runner advances to its next phase.
6. After the runner completes the next phase, it pauses at its next gate and the cycle repeats.

If a gate response requires revisions (`revise`, `fix`), the runner applies them and re-emits the gate prompt for the same phase.

### Cross-REQ concerns

#### Conflicts during implementation

If two runners' implementations touch the same file:

- Each runner operates in its own worktree, so they don't see each other.
- The conflict appears at **merge time**, not during implementation.
- Surface this to the user during sprint setup ("REQ-A and REQ-B both modify `src/foo.ts`; consider sequencing them or merging in order").

#### Merge order

When all REQs reach `gate-blocked:ship`:

1. Surface the merge order: the order in which the user should run each REQ's `merge-checklist.md`.
2. Default order: by REQ-ID (oldest first) unless `config.yml.merge_order` specifies otherwise.
3. Suggest rebasing each later REQ on top of the earlier ones' merged base before running its merge checklist.

### Failures and blockers

If any runner emits `blocked` or `failed`:

1. Halt that REQ in the queue (mark as `blocked` or `failed`).
2. Surface the details to the user immediately, even if other REQs are still progressing.
3. Other REQs continue unaffected unless the user decides to halt the sprint.

The user can:

- Resolve the blocker and resume that REQ
- Abort that specific REQ (other runners continue)
- Abort the whole sprint

## Cleanup

When all REQs reach `merged` (or are aborted):

1. Update the sprint registry: `endedAt`, `status: "complete"`, final stats per REQ.
2. Append to `hot.md`: `## [DATE] sprint-complete | SPRINT-... | <merged-count> merged, <aborted-count> aborted`.
3. Update `now.md` to remove the active sprint and any active REQs that landed.
4. Surface a summary in chat:
   ```
   Sprint complete — SPRINT-...

   Duration: <time>
   Merged: <list>
   Aborted: <list>
   Lessons captured: <count>
   Gotchas captured: <count>
   ADRs accepted: <count>
   ```

## Constraints

- **The orchestrator itself runs no git writes.** Worktree creation and any commits/pushes happen inside the pipeline-runner agents, governed by `git.mode` (`.adlc/config.yml`, default `manual` — drafts only). Merges always happen via the user running each REQ's `merge-checklist.md`. The orchestrator's job is monitoring and queueing, not git.
- **Worktree mode is forced.** `/sprint` ignores `config.yml.workflow.isolation` and always runs each REQ in an isolated worktree — parallelism cannot share a checkout. Each pipeline-runner records `isolation: "worktree"` in its REQ's `pipeline-state.json`.
- **Runners never ask the predict-first or review-summary questions** (`autonomy.predict_first`, `autonomy.review_summary`, 1.11): a `pipeline-runner` has no one to ask. The cockpit shows those sections only for REQs that ran under `/proceed`.
- **You never collapse multiple gates into one human approval.** "approve all" is not a valid command in any mode. In `manual` and `assisted`, each gate is the user's discrete decision; in `auto`, each gate is individually adjudicated and logged. If queue volume is the pain, the answer is the `autonomy.gates` dial, not a bigger rubber stamp.
- **You route verdicts; you don't render them.** The fast path is deterministic; everything ambiguous goes to the decision-maker as a real sub-agent. Never approve a slow-path gate from your own judgment, and never run the decision-maker inline.
- **You never override a runner.** If a pipeline-runner reports a phase complete with a finding the user should see, you surface it — you don't paper over it to keep the sprint moving.
- **Hard-cap concurrent REQs at 5** unless explicitly overridden. Beyond that, gate triage cost exceeds parallelism benefit — and `auto` mode doesn't lift the cap; the final reviews and merges still land on one human.
- **Honor the global REQ counter lock.** Don't bypass it.
- **No `--no-verify` ever.** Same rule as everywhere else — fix the underlying issue.

## Output artifacts

- The sprint registry — `.adlc/sprints/SPRINT-YYYY-MM-DD-<HHMM>.json`, or under this month's bucket when `layout.partition` isn't `none`
- One pipeline run per REQ (with all the artifacts that produces — see `/proceed`'s output list)
- Updates to `.adlc/hot.md` for sprint lifecycle events
- `gate-decisions.md` per REQ (`assisted`/`auto` — every adjudicated verdict, approvals included)
- Updates to `.adlc/now.md` to track the active sprint
