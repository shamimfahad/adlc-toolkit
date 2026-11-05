# {{PROJECT_NAME}} — `.adlc/` Vault

This directory is the project's knowledge vault and ADLC workspace. It's an Obsidian-compatible vault — open it in Obsidian for graph view and backlinks, or just edit the markdown directly.

## Read this first

- [[CLAUDE]] — the rulebook: how Claude reads and writes this vault. Claude reads this at the start of every session.
- [[now]] — what's actively in flight right now.
- [[hot]] — the activity log. New entries go on top; old ones are never edited.
- [[index]] — content catalog. Drill into specific pages from here.

## Layout

| Path | What lives here |
|---|---|
| `context/` | Project-wide architecture, conventions, overview |
| `knowledge/lessons/` | **Write side only.** One 9-row stub per lesson, named `LESSON-<REQ_ID>-<n>-<slug>.md` with a `^L-<REQ_ID>-<n>` anchor — the ID carries the REQ that produced it, so two people can't mint the same one. Nothing reads this folder; a lesson grows sections here only when it recurs |
| `knowledge/lessons.md` | **Read side.** Generated, one line per lesson carrying the whole minimal lesson (severity · tags · the sentence · where it was seen · what enforces it); rebuilt by every skill that writes a lesson, never hand-edited. Agents, the architect's relevance grep and the Claude knowledge hook read this and only this |
| `knowledge/gotchas.md` | Consolidated codebase quirks with `^g##` anchors |
| `knowledge/concepts/` | Patterns, invariants, domain models |
| `knowledge/components/` | One page per major module |
| `architecture/` | High-level architecture + ADRs |
| `specs/` | Per requirement: a **record** `specs/REQ-042-slug.md` (one committed file, written once at wrap-up, ≤6KB — goal, criteria, what changed, decisions, verdict, knowledge IDs, follow-ups) beside its **working set** `specs/REQ-042-slug/` (everything the pipeline produced; local, gitignored, deleted on `merged` when you say so). Bucketed vaults keep the same tail: `specs/2026-08/sf/REQ-042-slug.md` + `/` |
| `specs/_archive/` | Working sets you chose to **keep** after merge, moved here whole (offered at `merged` only when the folder was kept). Records never move — they are the history |
| `templates/` | Per-project copies of toolkit templates |
| `config.yml` | Stack config — deploy targets, repo layout |

### Month and author buckets

`config.yml` → `layout.partition` sets the on-disk shape of `specs/`, `bugs/`, and `sprints/`:

- **`none`** — `specs/REQ-042-payment-retries/`. A flat list.
- **`month-author`** — `specs/2026-08/sf/REQ-042-payment-retries/`, where `2026-08` is the month the REQ was created and `sf` is who created it. `sprints/` takes the month only, no author folder.

The month is set once and never changes: a REQ opened in July and merged in August stays in `2026-07/` forever. Both shapes are readable at the same time and always will be, so a vault can hold a mix of them and switching is safe. `/config migrate` moves existing folders into buckets — it shows the whole move plan first and is safe to run twice.

Don't type these paths, and don't assume a shape. Refer to a REQ by its ID and let the pipeline find the folder.

**`knowledge/`, `architecture/`, `context/`, and `audits/` are never bucketed.** Nobody asks which month they learned the auth-token thing; they ask whether there's a lesson about auth tokens. That's a question a flat folder and a search answer well and a dated tree answers badly — so those paths stay stable whatever `layout.partition` says.

## Conventions

- **Wikilinks** for cross-references: `[[concepts/idempotency]]`, `[[knowledge/gotchas#^g05|G05]]`
- **Block anchors** for stable references: `^L-<REQ_ID>-<n>` (lessons; older vaults also have `^L##`), `^g##` (gotchas), `^ADR-##` (ADRs)
- **`STATUS: needs verification`** flags provisional content — never silently assume it's confirmed
- **Field table at the top** of every spec, ADR, concept, and component page
- **"Related" and "Backlinks" sections** at the bottom of substantive pages
- **Obsidian tip:** add `specs/_archive` and `knowledge/lessons` (the write-side stubs — `lessons.md` carries every lesson) to Settings → Files & Links → *Excluded files* so search and graph stay focused (the files remain openable)

## Size budgets

The hot-path files are loaded at every phase entry — their size is a recurring token tax, so each has a budget. Three things hold them: `/wrapup` rotates `hot.md` and keeps `now.md` to its table on every REQ; the Claude adapter's optional `adlc-budget.mjs` hook refuses a write that leaves a file over budget; `/config budgets` repairs a vault that drifted, gated per file and moving text rather than deleting it. `/status` prints the strip; `/analyze` reports the history.

| File | Budget |
|---|---|
| `CLAUDE.md` | 5KB |
| each `context/*.md` | 8KB |
| `now.md` | 1KB |
| `hot.md` | 500 lines (20 newest visible); older entries rotate to `hot-archive-<YYYY>.md` |
| each REQ's `verification.md` | 8KB (verdict only — narrative goes in `review-log.md`) |
| each REQ's `review-packet.md` | 120KB target, 250KB ceiling (read in full by every reviewer; `config.yml → review.packet.exclude` keeps generated code out) |
| each reviewer section of `review-log.md` | 12KB |
| each REQ's / BUG's record (`<REQ_PATH>.md`) | 6KB (IDs and links, not copies — the knowledge lives in `knowledge/`) |
| `knowledge/lessons.md` | no byte budget — one line per lesson; the reflector reads it whole, everything else greps it. `/analyze` reports lessons cited twice without `Enforced by` as the promotion queue |

## How the pipeline writes here

Each phase of `/proceed` creates or updates artifacts in this vault. `<REQ>` below is that REQ's own folder — `specs/REQ-042-slug/` in a flat vault, `specs/2026-08/sf/REQ-042-slug/` in a bucketed one. The skills resolve it from the ID; you never type it.

1. `/spec` → `<REQ>/requirement.md`
2. `/architect` → `<REQ>/architecture.md`, `<REQ>/tasks/TASK-*.md`
3. `/implement` → code changes (in your repo, not the vault) + `commits-draft.md`
4. `/review` → `<REQ>/verification.md` (compact verdict) + `review-log.md` (full narratives)
5. `/wrapup` → `pr-draft.md`, the REQ's record `<REQ>.md`, updates to `lessons/` (+ `lessons.md` rebuilt), `gotchas.md`, `concepts/`, `index.md` (rebuilt), `hot.md`

By default you commit everything yourself (`git.mode: manual`). You can let the assistant commit or push on the feature branch — see `config.yml` → Git policy.
