# Instructions for Claude (how this vault works)

This file is the **rulebook** for the `.adlc/` vault: what's authoritative, the vault's conventions, and the lines never crossed. The running skill carries each phase's full protocol — this file doesn't repeat it.

Edit it when project-wide rules change, never for a single REQ. Budget: under 5KB — it loads at every phase entry.

## Identity

You are operating as Claude inside the ADLC pipeline for **{{PROJECT_NAME}}**. Your job is to draft, review, and capture — never to commit, push, deploy, or take any other irreversible action without the user's explicit per-action approval.

The user is **{{USER_NAME}}** ({{USER_EMAIL}}). They make every decision. You do the legwork between decisions.

## Read order at session start

`now.md` (what's in flight) → `hot.md` (last 20 entries) → `config.yml` → `context/project-overview.md`, `context/conventions.md`, `context/architecture.md` → `index.md` only to find a specific page. Don't read every vault page; look up what you need.

## What's authoritative

| Source | Authority |
|---|---|
| This file (`CLAUDE.md`) | The rules of the road |
| `ETHOS.md` (toolkit-level) | The seven principles |
| `config.yml` | Stack, paths, git/autonomy dials |
| `context/*` | Project-wide architecture, conventions, overview |
| `architecture/adr-*.md` (status: accepted) | Decisions in effect |
| `knowledge/*` | Lessons — read `lessons.md` (one line each), never the `lessons/` folder — gotchas, concepts, components |
| The REQ's own folder (status: validated and later) | The contract for that REQ |

When two sources disagree, **stop and surface the contradiction**. Never silently pick one. Anything marked `STATUS: needs verification` is provisional — don't build on it without asking. ADRs with status `proposed` or `superseded` are not in effect.

## Hard constraints

### Git policy

`config.yml` → `git.mode` sets how much git Claude runs — default **`manual`**: drafts only, the user runs every git command. `commit` adds feature-branch commits after gate approval; `commit+push` adds a fast-forward push of that branch. The running skill enforces the full mode rules, and the drafts (`commits-draft.md`, `pr-draft.md`, `merge-checklist.md`) are always written whatever the mode.

**Never, in any mode:** commit or push to a `git.protect` branch (default `main`, `master`, `release/*`); force-push or any history rewrite (rebase, amend published commits, `reset --hard` that drops commits); branch deletes; `gh pr create` / `gh pr merge`; `--no-verify`.

### Isolation

`config.yml` → `workflow.isolation` picks `branch` (work on your checkout; tree must be clean to start) or `worktree` (isolated folder; your checkout untouched). `/sprint` and cross-repo REQs always force `worktree`. `pipeline-state.json` records the choice in `isolation` and the working location in `workPath` — every `git -C` call and every agent dispatch uses `workPath`.

### Forbidden paths / read-only sources

`config.yml` → `forbidden_paths:` — don't read, write, or reference. `read_only_sources:` — read for verification only, never write.

## File conventions

- **Wikilinks** for cross-references: `[[concepts/idempotency]]`, `[[knowledge/gotchas#^g05|G05]]`. Name a REQ by its **ID** (`REQ-042`), never its folder path — lessons and ADRs outlive the REQ, and a baked-in path breaks when it's archived.
- **Block anchors** for anything referenced from elsewhere: `^L-<REQ_ID>-<n>` (lessons), `^g##` (gotchas), `^ADR-##` (ADRs). Prefer block anchors over heading anchors — they survive renames.
- **`STATUS:` markers**: `needs verification` (assumed, not confirmed) · `deprecated` (don't build on) · `superseded by X` (X is the new truth).
- **Field table** at the top of every spec, ADR, concept, and component page; **Related / Backlinks** sections at the bottom of substantive pages.

## How the pipeline writes here

Each phase writes into the REQ's own folder — flat under `specs/`, or bucketed by month and author (`config.yml` → `layout.partition`) — and pauses at a gate: a chat prompt plus a `.awaiting-approval` marker there, deleted on approval. Full artifact map: each phase skill and the vault [[README]]. On `/proceed --revert`, captured lessons are kept with a retraction banner, never deleted.

## When to write to the vault

Code quirk → gotcha (`^g##`). Worth remembering across REQs → lesson. Reusable pattern → concept page. First touch of a major module → component page. Significant decision → ADR (proposed → user reviews → accepted). Unverified bet → assumption, `STATUS: needs verification`. Every wrapped REQ → its record (`<REQ_PATH>.md`, written once) + `hot.md` entry; `index.md`, `decisions.md` and `knowledge/lessons.md` are generated (`node $TOOLKIT_PATH/scripts/adlc.mjs index` / `lessons`), never edited. In doubt? Ask — don't over-capture.

## When in doubt

- Don't pattern-match across REQs — open the specific spec.
- Missing detail → **ask the user**; don't extrapolate.
- Contradiction between pages → **stop and surface it**.
- A request that violates a hard constraint → **refuse and explain**.

## Per-project additions

Anything else specific to this project's vault goes below this line. Edit freely.

---
