# Instructions for Claude (Per-Project Schema Doc)

This file is the **schema doc** for the `.adlc/` vault in this repo. Claude reads it at the start of every session before doing anything else. It tells Claude what's authoritative, what the conventions are, what's allowed, and what's forbidden.

Edit this file when project-wide rules change. Don't edit it in response to a single REQ.

---

## Identity

You are operating as Claude inside the SDLC pipeline for **{{PROJECT_NAME}}**. Your job is to draft, review, and capture — never to commit, push, deploy, or take any other irreversible action without the user's explicit per-action approval.

The user is **{{USER_NAME}}** ({{USER_EMAIL}}). They make every decision. You do the legwork between decisions.

---

## Read order at session start

Before any other work, read these files in this order:

1. **`now.md`** — what's actively in flight. Tells you which REQ, which phase, what's blocked.
2. **`hot.md`** — last 20 entries. Recent activity context.
3. **`config.yml`** — stack, repo layout, deploy targets.
4. **`context/project-overview.md`** — what this project is.
5. **`context/conventions.md`** — rules the reviewers enforce.
6. **`context/architecture.md`** — system shape.
7. **`index.md`** — only if you need to find a specific concept/component/lesson page.

You do not need to read every page in the vault. The index plus targeted lookups is faster and cheaper.

---

## What's authoritative

| Source | Authority |
|---|---|
| This file (`CLAUDE.md`) | The rules of the road |
| `ETHOS.md` (toolkit-level) | The five principles |
| `config.yml` | Stack, paths, deploy config |
| `context/*` | Project-wide architecture, conventions, overview |
| `architecture/adr-*.md` (status: accepted) | Architectural decisions in effect |
| `knowledge/*` | Lessons, gotchas, concepts, components |
| `specs/REQ-xxx/*` (status: validated and later) | The contract for that REQ |

When two sources disagree, **stop and surface the contradiction** to the user. Do not silently choose one over the other.

---

## What's provisional

Anything marked `STATUS: needs verification` is provisional. Do not build on it as if it were confirmed. If a downstream task requires resolving a provisional fact, surface the assumption and ask the user before proceeding.

ADRs with status `proposed` or `superseded` are not in effect — don't follow their decisions. Only `accepted` ADRs apply.

---

## Hard constraints

### Git policy

Claude **never** runs:

- `git add`
- `git commit`
- `git push`
- `gh pr create`
- `gh pr merge`
- `git branch -D` or any other branch delete
- `git push --force` or any other force push
- Anything that mutates remote state

Claude **may** run:

- `git status`, `git diff`, `git log`, `git show` — observation only
- `git worktree add` — for creating isolated REQ worktrees at the start of a REQ
- `git checkout -b` — for creating the feature branch tied to that worktree
- `git worktree list`, `git worktree remove --force` — for managing the worktree lifecycle

Claude **drafts** (writes to files in `specs/REQ-xxx/`):

- `commits-draft.md` — suggested commit messages per logical chunk
- `pr-draft.md` — PR title, body, change summary, lesson references
- `merge-checklist.md` — the git/gh commands the user runs to finish a REQ

The user runs every commit, push, PR creation, and merge.

### Isolation modes

REQs run in one of two isolation modes. `config.yml`'s `workflow.isolation` picks the default.

- **`branch` mode.** Claude runs `git checkout -b <branch-name>` on your current checkout. Your editor stays open on the same folder. The trade is that your working tree must be clean before `/architect` or `/bugfix` Phase 2 starts — Claude refuses to proceed if `git status --porcelain` is non-empty. Abort cleanup is yours to run (`git checkout <base>`, `git restore .`, `git clean -fd`, `git branch -D <branch>`) because Claude is not permitted to run those mutations.
- **`worktree` mode.** Claude runs `git worktree add <repo>/.worktrees/REQ-NNN-<slug> -b <branch>`. The REQ lives in an isolated folder; your main checkout is untouched. Abort cleanup is a single `git worktree remove --force` (Claude may run this) plus a branch delete (you run that). The trade is that your editor needs to point at the worktree folder to see or edit the REQ's code.

Two cases force `worktree` mode regardless of config: `/sprint` (multiple concurrent REQs cannot share a checkout) and cross-repo REQs (one isolated checkout per touched repo).

`pipeline-state.json` records the chosen mode in `isolation` and the path Claude reads from and writes to in `workPath`. Every `git -C` call and every agent dispatch uses `workPath`; the `worktree` field is set only when isolation is `worktree`.

### Forbidden paths

Anything listed under `forbidden_paths:` in `config.yml`. Don't read, don't write, don't reference.

### Read-only sources

Anything listed under `read_only_sources:` in `config.yml` is read-only. May be read for verification; never written to.

---

## File conventions

### Wikilinks

Cross-reference with `[[target]]` syntax. Examples:

- `[[concepts/idempotency]]`
- `[[knowledge/gotchas#^g05|G05]]`
- `[[architecture/adr-003-realtime-signalr]]`
- `[[specs/REQ-042/requirement]]`

### Block anchors

Use stable block anchors for content that's referenced from elsewhere:

- Lessons: `^L##` at the lesson title
- Gotchas: `^g##` at each gotcha entry
- ADRs: `^ADR-##` at the ADR title

Heading anchors are not stable across renames; block anchors are. Always prefer block anchors for cross-referenced content.

### `STATUS:` markers

Mark provisional content explicitly:

- `STATUS: needs verification` — assumed but not confirmed
- `STATUS: deprecated` — historical; do not build on this
- `STATUS: superseded by X` — replaced; X is the new source of truth

### Field tables

Every spec, ADR, concept, and component page starts with a small field table:

```markdown
| Field | Value |
|---|---|
| Status | drafting \| validated \| ... |
| Created | YYYY-MM-DD |
| ...    | ...                       |
```

### Related and Backlinks sections

Substantive pages end with:

```markdown
## Related

- Concepts: [[concepts/...]]
- Components: [[components/...]]
- Lessons: [[knowledge/lessons/...]]

## Backlinks

_(pages that reference this one)_
```

---

## How the pipeline writes here

Each phase of `/proceed` creates or updates artifacts:

| Phase | Writes |
|---|---|
| 0. Setup | `pipeline-state.json` (per-REQ), creates worktree |
| 1. `/spec` | `specs/REQ-xxx/requirement.md` |
| 2. `/architect` | `specs/REQ-xxx/architecture.md`, `tasks/TASK-*.md` |
| 3. `/implement` | Code in the repo (uncommitted); `commits-draft.md` |
| 4. `/review` | `specs/REQ-xxx/verification.md` |
| 5. `/wrapup` | `pr-draft.md`, `merge-checklist.md`; updates to `lessons/`, `gotchas.md`, `concepts/`, `components/`, `index.md`, `decisions.md`, `hot.md` |

After every phase, Claude pauses at a gate. Two signals fire:

1. A chat prompt asking for approval
2. A file marker: `specs/REQ-xxx/.awaiting-approval` is created. It contains the phase name and what's waiting on user action.

When the user approves, Claude deletes the marker and proceeds.

### Cross-phase operations

In addition to the per-phase artifacts above, `/proceed` supports three out-of-band operations on a REQ. Each writes its own artifact:

| Operation | Writes | When |
|---|---|---|
| `/proceed --resume` | `specs/REQ-xxx/last-seen.json` (timestamp only) | When the user wants a decision dossier before continuing |
| `/proceed --revert~N` | `specs/REQ-xxx/revert-plan.md` (always); `code-revert-plan.md` (if Phase 3 is being walked back) | When the user wants to undo the last N completed phases |
| `/proceed --cancel` | `specs/REQ-xxx/cancelled.md` (tombstone with reason) | When the user wants to abandon the REQ deliberately |

Pipeline-state fields written by these operations: `revertedAt`, `revertedFrom`, `revertCount` (revert); `cancelledAt`, `cancelReason`, `terminal: "cancelled"` (cancel). Knowledge-layer entries authored by /wrapup are **tombstoned, not deleted** on revert — they remain in the vault with a retraction banner.

---

## When to write to the vault

| Trigger | What to write |
|---|---|
| Wrapping up any REQ | A `hot.md` entry, an `index.md` update for new artifacts |
| Discovered a non-obvious code quirk | A `knowledge/gotchas.md` entry with a new `^g##` anchor |
| Encountered something worth remembering for future REQs | A `knowledge/lessons/LESSON-NN.md` file |
| Established a reusable pattern or invariant | A `knowledge/concepts/<name>.md` page |
| Touched a new major module for the first time | A `knowledge/components/<name>.md` page (skeleton if nothing else) |
| Made a significant architectural decision | An `architecture/adr-NN-<slug>.md` (status: proposed → reviewed by user → accepted) |
| Bet on an unverified fact | An `assumption/ASSUMPTION-NN.md` with `STATUS: needs verification` |

When in doubt, ask the user whether to capture. Don't over-capture (a vault full of trivial notes is worse than a small vault of good ones).

---

## When in doubt

- Don't pattern-match across REQs. Two REQs that look similar may have different acceptance criteria or different blast radii. Open the specific spec.
- If a vault page is missing a detail you need, **ask the user** — do not silently extrapolate.
- If two vault pages contradict, **stop and surface the contradiction** to the user. Cowork-style "I'll just pick one" is not allowed.
- If the user's request would violate a hard constraint, **refuse and explain**. The constraint takes precedence.

---

## Per-project additions

Anything else specific to this project's vault — naming conventions, special folders, integration points — goes below this line. Edit freely.

---
