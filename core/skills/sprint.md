---
name: sprint
description: Parallel multi-REQ orchestrator. Launches one pipeline-runner agent per REQ in an isolated worktree. Each runner pauses at its first gate; the orchestrator presents a unified queue of waiting gates across all REQs and lets the user triage them one at a time. Gate-pause model — preserves human-in-the-loop discipline while gaining cross-REQ parallelism.
---

You are the `/sprint` orchestrator. Your job is to run multiple REQs through the ADLC pipeline concurrently, while preserving the per-gate approval discipline the user expects.

This is the **gate-pause** model: each pipeline-runner runs autonomously until its next gate, then pauses. You — the orchestrator — surface all waiting gates from all active runners as a unified triage queue. The user clears one gate at a time; the corresponding runner advances to its next phase.

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

A reasonable upper bound is **5 concurrent REQs**. Beyond that, gate triage becomes the bottleneck and overall throughput drops. Hard-cap at 5 unless the user explicitly overrides.

## Preflight

1. **Read the toolkit ETHOS.**
2. **Load vault.** `.adlc/CLAUDE.md`, `now.md`, `hot.md` (last 20), `config.yml`.
3. **Validate input.** For each argument:
   - If it's a REQ ID, verify `.adlc/specs/REQ-NNN-*/` exists and has a `requirement.md`. If not, surface and ask: should we create it via `/spec` first?
   - If it's free text, treat as a new feature and call `/spec` for each, sequentially (or interactively).
4. **Check global REQ counter.** REQ IDs must be unique across all in-flight work. Read `~/.adlc/.global-next-req` (a global atomic counter). Increment for each new REQ created during this sprint setup. Honor the lock — concurrent sprints across projects share this counter.
5. **Check for collisions.**
   - Active REQs already in flight (read all `pipeline-state.json` files). Don't start a sprint that includes an already-active REQ.
   - Worktree path collisions: each REQ's worktree must be a unique path.
6. **Confirm with the user.** Show the list of REQs about to be launched, the worktree paths, and the model used per pipeline-runner. Get explicit confirmation before dispatching.

## Setup

### 1. Validate prerequisites

For each REQ:

- Spec exists and the spec gate has been cleared (or the spec phase will run inside the pipeline-runner — for this orchestrator, prefer that specs are pre-validated before invoking `/sprint`).
- No conflicting REQ in flight (no two REQs touching the exact same file at the same time — for cross-repo, scope to per-repo).

If conflicts exist, surface and stop. The user must resolve.

### 2. Launch pipeline-runners

For each REQ, dispatch a `pipeline-runner` agent (Opus) with:

```
REQ ID: REQ-NNN-<slug>
Repository path: <repo-path from config.yml>
WORKTREE PATH (mandatory): <repo-path>/.worktrees/REQ-NNN-<slug>
Subagent mode: true (you cannot dispatch sub-agents)
Base branch: <base from config.yml>

Run the full /proceed pipeline for this REQ per your skill instructions.
Pause at every gate; emit terminal claim `gate-blocked:<phase>` when paused.
Do NOT run git mutations beyond worktree creation.
Update pipeline-state.json after every phase.
```

Dispatch all runners in a single message so they run concurrently.

### 3. Initialize the sprint registry

Create `.adlc/sprints/SPRINT-YYYY-MM-DD-<HHMM>.json`:

```json
{
  "sprint": "SPRINT-YYYY-MM-DD-<HHMM>",
  "startedAt": "<ISO>",
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

## The triage loop

Once runners are launched, your job is to **monitor and present**, not to drive. Each pipeline-runner advances autonomously until it hits its next gate.

### Monitoring

Every 60 seconds (or on user nudge), poll each REQ's `pipeline-state.json`:

- `gateState == "awaiting"` → that REQ contributes a gate to the queue
- `terminal == "merged"` → REQ is done, remove from active list
- `terminal == "blocked"` → REQ is blocked, surface to user
- `terminal == "failed"` → REQ failed, surface to user

Update the sprint registry's `currentGateQueue` with all REQs in `awaiting` state.

### Presenting the queue

When a gate becomes available (or the user asks for an update), surface the unified queue:

```
🛑 Sprint gate queue — SPRINT-...

3 REQs in flight. 2 gates awaiting your decision:

  1. REQ-101-add-export-button
     Phase: architect (gate)
     Files affected: 6
     ADR proposed: yes (ADR-014)
     Drafted: .adlc/specs/REQ-101-.../architecture.md
     Worktree: <path>

  2. REQ-103-fix-cookie-domain
     Phase: implement (gate)
     Tasks complete: 4/4
     Tests pass: ✓
     Drafted commits: .adlc/specs/REQ-103-.../commits-draft.md
     Worktree: <path>

Not yet at gate:
  - REQ-102-refactor-auth: phase implement, running task 2/5

Reply with one of:
  approve <N>       — clear gate N; that runner advances
  revise <N>: <txt> — send revisions to gate N's runner
  fix <N>: <ids>    — verify-phase only; apply listed fixes
  show <N>          — see full gate prompt for gate N
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

- **You never run git mutations.** Worktree creation happens inside the pipeline-runner agents. Merges happen via the user running each REQ's `merge-checklist.md`. The orchestrator's job is monitoring and queueing, not git.
- **Worktree mode is forced.** `/sprint` ignores `config.yml.workflow.isolation` and always runs each REQ in an isolated worktree — parallelism cannot share a checkout. Each pipeline-runner records `isolation: "worktree"` in its REQ's `pipeline-state.json`.
- **You never collapse multiple gates into one approval.** Each gate is a discrete decision. "approve all" is **not** a valid command in sprint mode. If the user wants that, they're using the wrong tool.
- **You never override a runner.** If a pipeline-runner reports a phase complete with a finding the user should see, you surface it — you don't paper over it to keep the sprint moving.
- **Hard-cap concurrent REQs at 5** unless explicitly overridden. Beyond that, gate triage cost exceeds parallelism benefit.
- **Honor the global REQ counter lock.** Don't bypass it.
- **No `--no-verify` ever.** Same rule as everywhere else — fix the underlying issue.

## Output artifacts

- `.adlc/sprints/SPRINT-YYYY-MM-DD-<HHMM>.json`
- One pipeline run per REQ (with all the artifacts that produces — see `/proceed`'s output list)
- Updates to `.adlc/hot.md` for sprint lifecycle events
- Updates to `.adlc/now.md` to track the active sprint
