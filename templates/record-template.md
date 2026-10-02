# {{REQ_ID}} — {{TITLE}}

> **File:** `<REQ_PATH>.md` — the folder note beside `<REQ_PATH>/` (`specs/REQ-042-slug.md` next to `specs/REQ-042-slug/`; partitioned vaults keep the same tail). Written once by `/wrapup` step 3b (or `/task` wrapup-lite, `/bugfix` Phase 5). **Budget 6KB** — the budget hook refuses more. Never edited after that, except the append-only `## Later` section. Links out are by ID; nothing links into the working set, which is local and may be gone.

| Field | Value |
|---|---|
| Status | merged \| ready-to-merge \| cancelled |
| Path kind | /proceed \| /task \| /bugfix \| /sprint |
| Opened → merged | {{OPENED}} → {{MERGED}} |
| Branch · PR | `{{BRANCH}}` · {{PR_LINK}} |
| Commits | `{{FIRST_SHA}}..{{LAST_SHA}}` ({{N}} commits, +{{ADDED}}/−{{REMOVED}} lines) |
| Review rounds | {{ROUNDS}} |
| Cost | {{USD}} · {{WEIGHTED_M}}M weighted _(from `usage.json`; "—" when absent)_ |
| Source | {{ISSUE_OR_TICKET_LINK}} _(optional)_ |

## Goal

One paragraph, past tense — the spec's Goal rewritten as what shipped. If scope changed at a gate, one sentence on how.

## Acceptance criteria

Copied from `requirement.md`, each ticked or marked with the follow-up that owns it.

- [x] AC1 — …
- [x] AC2 — …
- [ ] AC3 — deferred → see Follow-ups

## What changed

Two to four sentences on the approach — where the code lives, which pattern it follows, what it deliberately did not do. Then the blast radius, paths only:

| Area | Files / modules | Kind |
|---|---|---|
| `src/api/payments/` | `RetryPolicy.cs`, `PaymentsController.cs` | changed |
| `src/store/` | `payments.ts` | new |
| docs | `README.md` §Retries | updated |

## Decisions

One line each. ADRs by ID; gate decisions in plain words.

- ADR-031 accepted — retries are idempotent by request key, not by payment id
- Spec gate: dropped the admin override (out of scope; tracked as follow-up)
- Review gate: kept the 3-attempt cap after the correctness reviewer's finding on backoff

## Verification

- Verdict: **PASS** after round {{ROUNDS}} — {{CRITICAL}}C/{{MAJOR}}M/{{MINOR}}m, all critical/major fixed
- Tests added: `RetryPolicyTests.cs` (5), `payments.test.ts` (3)
- `verify:` runs quoted in `verification.md`: typecheck ✓ · tests ✓ (412 passed) · lint ✓
- UI: reviewed in Chrome, 2 screens, screenshots were in the working set

## Knowledge

IDs and links only — the content lives in `knowledge/`.

- Lessons: [[knowledge/lessons#^L-REQ-042-1|L-REQ-042-1]], [[knowledge/lessons#^L-REQ-042-2|L-REQ-042-2]]
- Gotchas: [[knowledge/gotchas#^g87|G87]]
- Concepts / components touched: [[knowledge/components/payments]], [[knowledge/concepts/idempotency-keys]]
- Candidates discarded: 3 (verdict table was in the working set)

## Follow-ups

Open items that outlive the REQ. Each names an owner or "unassigned".

- Admin override for stuck retries — unassigned, needs a spec
- `needs-decision` finding from architecture-reviewer on the queue abstraction — deferred, see hot.md {{DATE}}

## Later

_Append-only. `/bugfix` adds a line when a bug traces back here; `/analyze` may add a line when a follow-up closes. Nothing else writes here._

- {{DATE}} — BUG-011 traced to this REQ (retry storm on 5xx)
