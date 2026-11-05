# Plan v1.8.0 — team-safe lessons

> **Reconstructed after the fact.** The original plan and review record for this
> cut were never committed. This page is rebuilt from commit `a266f5a` and the
> `[1.8.0]` CHANGELOG entry, and records only what those two sources state. The
> review record is not recoverable; nothing here adds to it.

Toolkit 1.7.0 → 1.8.0 · landed 2026-09-23 as `a266f5a`.

## §1 Why

The lesson layer was designed solo-first, and three of its steps break once two
developers land REQs in the same week:

1. **Minting.** `/wrapup` took the next `LESSON-NNN` from an `ls` count. Two
   branches that both see 41 files both write `LESSON-042-<slug>.md`; git merges
   the two filenames cleanly, so the collision is silent and `[[LESSON-042]]` is
   ambiguous everywhere.
2. **The index.** Each lesson added a row to `index.md`'s Lessons table — a
   hand-edited shared row set, so a merge conflict on most team merges.
3. **Dedup.** Candidates were checked only against the lessons on the current
   branch, so a lesson a teammate had already promoted was promoted again.

## §2 Decisions

- **D1 · IDs namespaced by work item.** `LESSON-<REQ_ID>-<n>` (anchor
  `^L-REQ-042-1`, short form `L-REQ-042-1`), minted by a scan scoped to the one
  REQ, so uniqueness comes from `req.id_scheme` and nothing is shared across
  branches. Grammar and scan in `core/VAULT-LAYOUT.md` → `mint(lesson)`. Legacy
  `LESSON-NNN` files are frozen, never renumbered; both shapes stay readable.
- **D2 · A generated ledger.** `knowledge/lesson-ledger.md` replaces the Lessons
  table: one row per lesson from the files' header lines, rebuilt whole by every
  skill that writes a lesson and by `/config ledger`. It carries `merge=union`;
  `index.md` does not — union is safe only in a file that is regenerated.
- **D3 · Dedup against the base branch.** Candidates are checked against
  `origin/<base-branch>` via `git -C <workPath> ls-tree` (a read). Always `-C`:
  from a subdirectory `ls-tree` exits 0 with empty output. The base branch is
  `pipeline-state.json`'s, never a hardcoded `main`. The gate card prints the
  fetch age; the merge checklist starts with `git fetch`.
- **D4 · Supersession, not deletion.** An optional `Supersedes` row plus a
  `STATUS: superseded by …` banner on the old file; the reflector skips it, the
  ledger strikes it through.
- **D5 · `Tags` required.** The tiered-loading ADR filters on it.
  `health-auditor` gains near-duplicate, untagged and stale-ledger findings.

## §3 Rejected

- A single hand-written lessons digest — the highest-conflict shape there is,
  and already rejected by the tiered-loading ADR.
- Per-developer lessons in the shared vault.
- Changing who decides a lesson: `/wrapup`'s operator, then the PR reviewer.

## §4 Verification (as recorded)

- `merge=union` checked on a scratch repo: two branches' rewrites of the same
  ledger row merge with exit 0, no markers, both versions kept.
- The two `ls-tree` traps in D3 were found by running it, and are stated inline
  in the skills.

## §5 On update

`/config migrate` once per vault: generates the ledger, appends the missing
`.gitattributes` line, offers the `index.md` template diff. Existing lessons need
nothing.
