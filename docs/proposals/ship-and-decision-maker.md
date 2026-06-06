# Proposal: `/ship` (autonomous pipeline) + `decision-maker` agent

| Field | Value |
|---|---|
| Status | drafting — awaiting approval |
| Kind | New skill + new agent |
| Affects | `core/skills/ship.md`, `core/agents/decision-maker.md`, `core/manifest.json`, `templates/config-template.yml`, `scripts/build.mjs` (no change needed — generator picks it up), all `adapters/*` (regenerated) |
| Related | `[[core/skills/proceed]]`, `[[ETHOS]]` (esp. principles 1, 3, 5) |

## Problem

`/proceed` pauses for human approval at all five gates. That's the right default for high-stakes work, but it makes unattended or low-stakes runs impossible — scaffolding, routine REQs, or overnight batches still require a human at each boundary. There's no way to say "run this REQ to completion and let me review the whole thing at the end."

## Goal

A `/ship` skill that walks a REQ through all five phases **without stopping at the inline gates**, making sound decisions at each boundary autonomously, committing its work as it goes, and ending with a single terminal review — a feature branch, a PR draft, and a complete audit trail of every decision it made. The human gate isn't removed; it's **batched to the end** and backed by evidence.

The guiding principle: **autonomy with accountability.** Every autonomous decision is conservative-by-default, cites its evidence, is bounded by circuit breakers, and is logged so the human can audit exactly what happened and why.

## Non-goals

- Not a replacement for `/proceed`. `/proceed` stays the default for high-stakes work; `/ship` is opt-in.
- Not "autonomy = no human ever." `/ship` always ends in one human review and never merges to `main` itself.
- Not a license to rewrite git history. Commits yes; force-push, rebase, amend-of-published, reset-that-drops-commits, history rewrite — never.

## The reframe that makes this principled

ETHOS principle 1 ("you decide; Claude drafts") and principle 5 ("process is explicit") seem to forbid this. They don't — they forbid *silently* hand-waving decisions. `/ship` honors both by converting **five inline gates into one terminal gate + a full audit log**. The human still decides what merges. They just decide once, at the end, with a complete record of every intermediate verdict, its rationale, and what *would* have escalated. Nothing is hidden; the ceremony is preserved, just relocated.

## The three axes of autonomy

The user controls how much rope `/ship` gets along three independent dials (set in `.adlc/config.yml`, overridable per-run by flag):

1. **Gate decisions** — who approves each phase boundary. `manual` (falls back to `/proceed` behavior), `assisted` (decision-maker recommends, human confirms), or `auto` (decision-maker decides).
2. **Git operations** — `read-only` (draft only, like `/proceed`), `commit` (commit to the feature branch as it goes), or `commit+push` (also push the feature branch, fast-forward only). **Never** merge to `main`, force-push, or rewrite history at any level.
3. **Escalation tolerance** — `cautious` (escalate on any doubt), `balanced` (escalate on major+ findings or low confidence), or `aggressive` (proceed unless hard-blocked). This sets the decision-maker's bias.

Separating the dials matters: "autonomous gates" should never silently imply "autonomous git." You can run `auto` gates with `read-only` git, or `commit` git with `assisted` gates.

## The `decision-maker` agent

The heart of `/ship`. A disciplined gate **adjudicator**, not a general-purpose brain. Its quality comes from independence, policy, and calibration — not raw horsepower (a powerful, eager model rubber-stamps; that's the failure mode to design against).

| Property | Value | Why |
|---|---|---|
| Tier | `opus` | Judgment under ambiguity is the one place to spend the strongest model. |
| Read-only re: source | yes | Like the reviewers, it never edits code. It reads the gate packet and writes only its verdict to the decision log. |
| Independence | drafted-by ≠ judged-by | It did not write the artifact it's judging. Self-grading is the weakest check; this is the whole point of a separate role. |
| Default bias | escalate-on-uncertainty | The conservative default is what makes autonomy trustworthy. |

**Inputs (a "gate packet," mirroring the reviewers' `review-packet.md`):**
- The phase and the artifact produced (spec / architecture+tasks / diff / verification findings / PR draft).
- The phase skill's own validation output, plus — at the verify gate — the full reviewer findings by severity.
- The REQ's **risk profile** (see below).
- The autonomy config and escalation tolerance.
- The rework history for this gate (how many loops already spent).

**Output — one of three verdicts**, appended to `gate-decisions.md` with a confidence score and cited evidence:

1. **APPROVE** → proceed to the next phase. Must cite which acceptance criteria / checks are satisfied.
2. **REWORK** `{directives}` → loop back to the current phase with specific, actionable fixes. **Bounded** — capped per gate (default 2) before it's forced to escalate. (This is Brett's 3-strike idea, which the manual pipeline deliberately dropped — but it's exactly right here.)
3. **HALT** `{reason, open-question}` → stop the run, write `.awaiting-approval`, surface to the human. Used for hard-stops, exhausted rework budget, or sub-threshold confidence.

Every verdict records: evidence considered, the decision, a 0–1 confidence, and a one-line rationale. Below the confidence threshold → HALT even if nothing else trips. **No verdict is silent** — `gate-decisions.md` is written at every gate, including the APPROVEs. A passed gate is logged with the same detail as a halted one; that record is what makes the batched terminal review trustworthy.

### Why a separate agent, and not the main chat?

You *can* run the main orchestrator as the decision-maker — but you shouldn't prefer it, for one reason: **independence**. In `/ship`, the main agent is the one running the pipeline — it drafted the spec, dispatched the implementer, watched the code get written. If that same agent also renders the verdict, it's grading its own homework, and it's biased toward APPROVE because it already "knows" the work is fine. A dedicated sub-agent gets a **fresh, isolated context**: it sees only the gate packet (artifact + findings + rubric), not the rationalized history of how the work came to be. That independence *is* the check — the same reason the review agents are separate read-only agents rather than the main agent reviewing its own diff.

So: dedicated `decision-maker` sub-agent wherever the tool supports sub-agents (Claude, Codex, Gemini, Copilot). **Main-chat-as-decision-maker is the Cursor-only fallback** (Cursor has no isolated sub-agents). When it runs inline, independence is reduced; the decision-maker must record `independence: reduced (inline)` in `gate-decisions.md` so the human knows that gate's verdict came from the same context that produced the work. Same rubric in `core/`, two honestly-labeled fidelity levels.

### Keeping the decision-maker cheap: fast-path / slow-path + packet discipline

A sub-agent call costs input tokens for whatever you hand it. Dumping the full diff, spec, architecture, findings, and vault context at all five gates would be wasteful — and redundant, since the reviewers already processed the code and conventions. Two rules keep it lean:

**Fast-path / slow-path.** Most gates are unambiguous and must NOT spend an LLM call. The orchestrator runs cheap deterministic pre-checks first:
- Clean validation + zero findings + low risk → **deterministic APPROVE** (logged, no agent call).
- A hard-stop category present, or any critical/major finding → **deterministic HALT** (logged, no agent call).
- Only the **ambiguous middle** (minor findings, medium risk, partial criteria) dispatches the `decision-maker`.

**Curated packet, not a dump.** When dispatched, the packet is assembled *downstream of review* and is bounded by a size cap (`autonomy.packet_max_bytes`, default 24 KB):
- Consolidated findings **summary** (counts by severity + the minor findings' one-liners), not raw per-file diffs.
- The risk profile and the acceptance-criteria checklist status.
- The specific artifact under judgment (spec / architecture / PR draft) — these are bounded.
- **Pointers** (path + line range) for anything deeper; the agent Reads on demand only if a finding is genuinely in question.

Net: ≤ 5 agent calls per REQ, most short-circuited by the fast path, each with a compact packet. The decision-maker's token spend feeds the resource circuit breaker, so a pathological run trips the fuse rather than burning budget silently.

## Adaptive autonomy: risk scoring

Autonomy shouldn't be all-or-nothing. At the start of a `/ship` run (and refined after `/architect`), compute a **risk profile** for the REQ:

- **Blast radius** — files/modules touched, fan-out of callers.
- **Sensitivity** — does it touch auth, security, payments, data migrations, a public/frozen API contract, infra/CI config, or secrets?
- **Reversibility** — additive/easily-reverted vs. destructive/irreversible (schema drops, data deletion, prod config).

High-risk REQs **auto-downgrade**: sensitive or irreversible work forces `HALT` at the relevant gate regardless of the autonomy dial. So `/ship` runs fully autonomously on the routine 80% and automatically pulls the human in for the dangerous 20%.

## Hard-stop categories (never auto-approved)

Regardless of dials, the decision-maker must HALT for:
- Any review finding at **critical** or **major** severity.
- Changes touching **auth / authz, security, secrets, payments**.
- **Data migrations** or destructive/irreversible operations (schema drops, data deletion).
- Changes to a **public or frozen API contract**.
- Anything the spec flagged as an unresolved **open question**.
- Anything requiring a **git operation outside the granted tier** (e.g., the change wants a force-push to land).

## Circuit breakers

Autonomy needs fuses. `/ship` halts the whole run if any trip:

- **Per-gate rework cap** (default 2) — exhausted → HALT that gate.
- **Global rework budget** (default 5 across the run) — prevents thrash loops.
- **Recurring-failure tripwire** — the same test/finding reappears after a rework → HALT (the fix isn't converging).
- **Confidence floor** (default 0.6) — any verdict below it → HALT.
- **Resource budget** (optional) — max wall-clock or token spend → HALT.

## Git behavior

Under `commit` / `commit+push`, `/ship` is granted a **narrow, history-preserving** set:

| Allowed | Forbidden (always) |
|---|---|
| `git add`, `git commit` (to the REQ's feature branch) | `git push --force` / `--force-with-lease` |
| `git checkout -b` / `git switch -c` (feature branch) | `git rebase`, `git commit --amend` on published commits |
| `git push` **fast-forward only**, feature branch only (in `commit+push`) | `git reset --hard` that drops commits |
| worktree create/remove (existing lifecycle ops) | any push/merge to `main`/protected branches |
| | `git revert` is left to the human (it's a decision, not bookkeeping) |
| | tag deletion, history rewrite of any kind |

**Checkpoint commits**: one commit at each phase boundary (after `/implement`, after each accepted rework), drafted from `commits-draft.md` and executed. This gives a clean, revertible trail — every autonomous decision maps to a commit. The terminal step drafts the PR but **does not** open or merge it; that's the human's.

## `/ship` flow

```
/ship <feature description>           — start a new REQ and run it autonomously
/ship REQ-NNN-<slug>                  — run/resume an existing REQ autonomously
/ship REQ-NNN-<slug> --dry-run        — plan-only: show what it WOULD decide at each gate, execute nothing
/ship REQ-NNN-<slug> --until=verify   — autonomous up to a named phase, then hand to human
/ship REQ-NNN-<slug> --gates=assisted — override the autonomy dial for this run
```

1. **Preflight** — load ETHOS, vault, `config.yml` autonomy block; determine/scaffold the REQ; create the feature branch (or worktree).
2. **Risk profile** — compute it; record in `pipeline-state.json`; note any forced hard-stops.
3. **Phase walk** — for each phase, run the existing phase skill's protocol (reusing `/spec`, `/architect`, `/implement`, `/review`, `/wrapup` unchanged), then at its gate **dispatch the decision-maker** with the gate packet instead of pausing. Route the verdict:
   - APPROVE → checkpoint-commit (if git tier allows) → advance.
   - REWORK → loop the phase with the directives, within the cap.
   - HALT → write `.awaiting-approval`, emit the escalation, stop.
4. **Terminal gate** — at the end: branch + checkpoint commits + `pr-draft.md` + `ship-report.md` (the full audit). Do **not** merge. Emit the one human review prompt.
5. **Resumability** — same `pipeline-state.json` model as `/proceed`; a HALT leaves a normal awaiting-gate that `/proceed` or `/ship` can pick up. `--dry-run` writes nothing but the plan.

### `ship-report.md` (the deliverable that earns trust)

A single file the human reads after an unattended run:
- REQ summary: what was built, against which acceptance criteria.
- **Decision log**: every gate verdict, confidence, rationale, evidence.
- What was reworked and why; what would have escalated but didn't (near-misses).
- Risk profile and any forced hard-stops.
- Commits made; the drafted (un-opened) PR; what's left for the human (open the PR, merge, run any migrations).

## Config (`.adlc/config.yml` additions)

```yaml
autonomy:
  gates: auto              # manual | assisted | auto
  git: commit+push         # read-only | commit | commit+push   (push = feature branch only, FF-only, never main)
  escalation: balanced     # cautious | balanced | aggressive
  rework_cap_per_gate: 2
  rework_budget_total: 5
  confidence_floor: 0.6
  packet_max_bytes: 24576  # cap on the gate packet handed to the decision-maker
  hard_stops:              # categories that always HALT (extend per project)
    - auth
    - security
    - secrets
    - payments
    - data-migration
    - public-api-contract
    - irreversible
  notify:                  # ping on HALT / completion for unattended runs
    on_halt: true
    on_complete: true
```

Defaults above reflect the chosen configuration: `balanced` escalation, rework caps of 2 per gate / 5 total, git = local commits plus fast-forward pushes to the feature branch only (never `main`, never force), and notifications on for both halt and completion.

## Acceptance criteria

- [ ] `/ship <desc>` runs a REQ through all five phases with no human input until the terminal gate (when dials are `auto`).
- [ ] The `decision-maker` agent emits APPROVE / REWORK / HALT with confidence + cited evidence, written to `gate-decisions.md` at **every** gate (approvals included — no silent decisions).
- [ ] When the decision-maker runs inline (Cursor fallback), the log records `independence: reduced (inline)`.
- [ ] Hard-stop categories and a sub-floor confidence force HALT regardless of dials.
- [ ] Per-gate and global rework caps, plus the recurring-failure tripwire, halt runaway loops.
- [ ] Risk profile is computed and high-risk REQs auto-downgrade to HALT at the relevant gate.
- [ ] Git stays within the history-preserving allow-list; no force-push, no history rewrite, no merge to `main`.
- [ ] The run ends with a feature branch, `pr-draft.md`, and a complete `ship-report.md`; nothing is merged.
- [ ] `--dry-run` produces the decision plan and executes nothing.
- [ ] Works as a sub-agent where supported and degrades to inline on Cursor, sharing one rubric.

## Resolved decisions

- [x] **Autonomy default** — `balanced` (escalate on major+ findings or low confidence, proceed otherwise).
- [x] **Rework caps** — 2 per gate, 5 total.
- [x] **Git dial** — `commit+push`: local commits plus fast-forward pushes to the feature branch only. Never `main`, never force, never history rewrite.
- [x] **Notifications** — on, for both HALT and completion (`notify.on_halt` / `notify.on_complete` = true).
- [x] **Token economy** — fast-path/slow-path adjudication + curated, size-capped gate packet (see section above).

## Out of scope (for now)

- A `/sprint`-style autonomous multi-REQ batch (`/ship A B C`). Natural follow-up once single-REQ `/ship` is proven; `pipeline-runner` + `decision-maker` compose for it.
- Auto-merging to `main` behind a protected-branch + required-checks policy. Deliberately excluded — the terminal human gate stays.
- Learning loop: feeding decision-maker verdicts back into the vault as lessons about what was/wasn't safe to auto-approve. Promising, but later.
