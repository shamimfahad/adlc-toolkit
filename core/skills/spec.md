---
name: spec
description: Draft and validate a requirement spec for a new REQ. Phase 1 of the /proceed pipeline. Ends in the spec gate — user must approve before /architect can run. Writes specs/REQ-xxx/requirement.md and pauses for review.
---

You are running Phase 1 of the ADLC pipeline: drafting and validating a requirement spec.

## When to use

- The user wants to start a new feature or change.
- A bug is large enough to warrant a full spec (smaller bugs use `/bugfix`).
- An existing REQ's spec needs to be redrafted because requirements changed.

## Inputs

- The user's feature description (free text in chat), **or** a source reference — a bare issue number (`#8`), a tracker key (`PROJ-8`), or a full issue URL — when `sources.issues` is configured. The reference seeds the draft; the user still reviews it at the gate.
- An optional REQ ID (if the user is overwriting an existing spec). Default: assign a new sequential ID.

## Preflight

1. **Read the toolkit ETHOS.** Load `$TOOLKIT_PATH/ETHOS.md` into context (`$TOOLKIT_PATH` is the toolkit install dir, stamped into your command/adapter as a "Toolkit root:" line).
2. **Read the vault basics.** Load `.adlc/CLAUDE.md`, `.adlc/now.md`, `.adlc/hot.md` (last 20 entries), `.adlc/config.yml`, `.adlc/context/project-overview.md`, `.adlc/context/conventions.md`.
3. **Determine the REQ ID.** Read `config.yml` → `req.id_scheme` (default `sequential` if absent) and `req.prefix`.
   - If the user passed an explicit ID, use it; verify it doesn't collide with an existing folder in `.adlc/specs/`.
   - Otherwise mint one per the scheme:
     - **`sequential`** — scan `.adlc/specs/` for the highest `REQ-NNN-*`, increment, pad to 3 digits → `REQ-NNN`. (Solo default; numbers can collide across people's branches.)
     - **`prefixed`** — `REQ-<prefix>-NNN`, where `<prefix>` is `req.prefix` (e.g. your initials) and `NNN` is max+1 **within that prefix's** folders. Per-person namespace — safe for teams without a shared tracker, works offline.
     - **`ticket`** — derive from the tracker issue this REQ implements: invoked as `/spec #842` (or an issue URL) with `sources.issues` set → the ID is the issue's key (`REQ-842` for a bare number; the native key like `PROJ-842` for Jira/Linear). Globally unique by construction — the recommended team default. If the scheme is `ticket` but no issue ref was given, fall back to `prefixed` (if `req.prefix` set) else `sequential`, and say so in one line.
   - **Throughout the rest of this protocol, `REQ-NNN` denotes whatever ID the scheme produced** (e.g. `REQ-842`, `REQ-sf-007`) — substitute accordingly.
4. **Determine the slug.** Short kebab-case description from the user's input (e.g., `firestore-composite-indexes`). Keep ≤40 chars.
5. **Create the REQ folder:** `.adlc/specs/REQ-NNN-<slug>/`.
6. **Resolve a source reference (optional).** If the user invoked with an issue reference (e.g. `/spec #8`) or pasted an issue URL, and `config.yml.sources.issues` is set (not `none`):
   - **Resolve the mechanism, first that works wins:** a dedicated CLI if installed and authed (for `github`, `gh issue view <n> --json title,body,labels,comments,author,createdAt`, defaulting the repo to `sources.repo`); else an attached MCP server for that service; else a plain fetch if the reference is a full URL. A full URL may point at a different repo/service than the default — honor it.
   - **If a mechanism resolves,** read the issue title/body/labels/linked discussion and carry them into step 1 as draft material (problem framing, goal, candidate acceptance criteria). Record provenance: add the issue link to the spec's "Related" section so the vault stays traceable.
   - **If nothing resolves** (no CLI, no MCP, not a fetchable URL) or no service is configured, print one line — `couldn't reach <service> for <ref> — drafting the spec manually` — and continue. The seed is strictly additive; its absence never blocks.
   - Seeded content is a **draft, not truth**: every field still passes inline validation (step 4) and the human gate (step 6). Never copy issue prose verbatim into acceptance criteria without making each one testable.

## Steps

### 1. Draft the spec

Copy `.adlc/templates/spec-template.md` to `.adlc/specs/REQ-NNN-<slug>/requirement.md`. Substitute the placeholders using:

- `{{TITLE}}` — one-line summary of the REQ
- `{{REQ_ID}}` — `REQ-NNN`
- `{{DATE}}` — today
- `{{REPO_ID}}` — primary repo from `config.yml`
- `{{REPO_LIST}}` — touched repos (if cross-repo)

Fill the content sections based on the user's description:

- **Problem** — what hurts today, who feels it. Pull this from the user's words; don't editorialize.
- **Goal** — the state of the world after this ships. Concrete.
- **Non-goals** — adjacent things this explicitly does not cover.
- **Acceptance criteria** — testable statements. Each one should be answerable yes/no after implementation.
- **Assumptions** — anything you're treating as true. Mark provisional ones with `STATUS: needs verification`.
- **Open questions** — anything ambiguous that affects scope or design.
- **Out of scope (for now)** — tempting adjacencies that are filed but separate.

If the user's description is too thin to fill any section, **ask follow-up questions in chat** rather than guessing. Don't proceed to validation until you have enough.

### 2. Vault consultation

Before locking the spec, scan the vault for relevant prior work:

- Grep `.adlc/knowledge/lessons/` for lessons tagged with the affected domain or component
- Grep `.adlc/knowledge/gotchas.md` for gotchas in the area
- Check `.adlc/architecture/adr-*.md` for accepted ADRs that constrain the design space
- Check `.adlc/knowledge/concepts/` for relevant patterns

If you find anything, add the wikilinks to the "Related" section of the spec. If a lesson directly affects the acceptance criteria or assumptions, surface it in the chat and adjust the spec.

### 3. Initialize pipeline state

Create `.adlc/specs/REQ-NNN-<slug>/pipeline-state.json`:

```json
{
  "req": "REQ-NNN-<slug>",
  "createdAt": "<ISO timestamp>",
  "currentPhase": 1,
  "completedPhases": [0, 1],
  "gateState": "awaiting",
  "currentPhaseGate": "spec",
  "isolation": null,
  "workPath": null,
  "worktree": null,
  "branch": null,
  "blockers": [],
  "notes": []
}
```

Isolation, workPath, worktree, and branch get filled when the user moves to `/architect` (the architect skill or `/proceed` orchestrator creates them).

### 4. Inline validation

Before writing the gate marker, walk this checklist yourself:

- [ ] **Acceptance criteria are testable.** Each one can be confirmed or denied by inspection.
- [ ] **Goal is specific.** A reviewer reading the goal can tell whether the spec achieves it.
- [ ] **Assumptions are explicit.** Any "given that X" has its own line, with `STATUS: needs verification` if not yet validated.
- [ ] **Open questions don't block the spec gate.** If a question must be answered to validate the spec, it's not an open question — it's a blocker. Surface it.
- [ ] **No design.** The spec describes what, not how. If the draft creeps into how, push the design content into a TODO for `/architect`.
- [ ] **Non-goals exist.** If the draft has none, you haven't thought enough about scope. Add at least one.

Each item is reported in the gate prompt with a tick or a flag.

### 5. Write the gate marker

Create `.adlc/specs/REQ-NNN-<slug>/.awaiting-approval` with content:

```
Phase: spec
REQ: REQ-NNN-<slug>
Awaiting: review the requirement and approve to proceed, or reply with revisions.
Files:
  - .adlc/specs/REQ-NNN-<slug>/requirement.md
```

### 6. Emit the gate prompt

In chat, output:

```
🛑 Gate: Spec — REQ-NNN-<slug>

Drafted: .adlc/specs/REQ-NNN-<slug>/requirement.md

Inline validation:
[✓ / ⚠] Acceptance criteria testable
[✓ / ⚠] Goal specific
[✓ / ⚠] Assumptions explicit
[✓ / ⚠] No design content
[✓ / ⚠] Non-goals present

Vault references found:
- [[knowledge/lessons/LESSON-xxx]] — short note
- [[knowledge/gotchas#^gNN|GNN]] — short note

Open questions in the spec:
- ...

Reply with one of:
  approve         — clear the gate, ready to run /architect
  revise: <text>  — describe what to change
  abort           — discard this REQ
```

## Gate clearance

If the user replies `approve`:

1. Delete `.awaiting-approval`.
2. Update `pipeline-state.json`: `gateState: "cleared"`.
3. Append to `.adlc/hot.md`: `## [DATE] spec-gate-cleared | REQ-NNN-<slug>`.
4. Inform the user: spec gate cleared. Next: run `/architect REQ-NNN-<slug>` (or `/proceed REQ-NNN-<slug>` to continue the full pipeline).

If the user replies with `revise: ...`:

1. Apply the requested revisions to `requirement.md`.
2. Re-run inline validation.
3. Re-emit the gate prompt.

If the user replies `abort`:

1. Confirm explicitly ("This will delete the REQ folder. Confirm?").
2. On confirmation, delete the REQ folder.
3. Append to `hot.md`: `## [DATE] spec-aborted | REQ-NNN-<slug>`.

## Constraints

- **Never run git.** Work path creation (branch or worktree) is `/architect`'s or `/proceed`'s job.
- **Never overwrite an existing requirement.md** without explicit confirmation.
- **Never proceed past the gate** without an `approve` response.
- **Don't draft architecture or implementation details.** Resist the urge.

## Output artifacts

- `.adlc/specs/REQ-NNN-<slug>/requirement.md`
- `.adlc/specs/REQ-NNN-<slug>/pipeline-state.json`
- `.adlc/specs/REQ-NNN-<slug>/.awaiting-approval` (until gate cleared)
- New entry in `.adlc/hot.md` (on gate clearance or abort)
