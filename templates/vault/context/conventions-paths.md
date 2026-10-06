# Conventions by path

Rules that apply to **part** of the tree, not all of it. `conventions.md` is the always-on rulebook every agent loads at preflight (budget 8KB); this file is read **on demand** — a rule here reaches an agent only when it touches a matching file, so it costs nothing on REQs that never go near that area.

How it works: each `##` section carries one `<!-- paths: glob, glob -->` line right under its heading. `node $TOOLKIT_PATH/scripts/adlc.mjs rules --vault .adlc` (run by `/config rules`, by `/init`, and by `/wrapup` when this file changed) generates one `.claude/rules/adlc-<slug>.md` per section. Claude Code loads that rule natively the first time a matching file is **read**; the `adlc-knowledge.mjs` hook injects it on the first **write** in the family (a new file is never read). On other assistants the skills grep this file for the directories in play. The generated files are write-blocked; edit here, then regenerate. A section without a `paths:` line is skipped and reported — move it to `conventions.md` if it is cross-cutting.

Globs are Claude Code's: `**` any depth, `*` within a segment, braces allowed (`src/**/*.{ts,tsx}`). Keep a section under ~2KB; a long one usually wants splitting by path. Quality- and architecture-reviewer read the sections whose globs match the diff (the review packet lists them under **Rules in scope**).

## Example — API handlers
<!-- paths: src/api/**, src/**/*Controller.cs -->

- Response shape is `{ data, error }` — never a bare DTO. _(replace with your rule)_
- Pagination is cursor-based; page size ≤ 100.
- Auth is the bearer middleware; handlers never read headers themselves.

## Example — UI components
<!-- paths: src/components/** -->

- Presentational only: no data fetching, no store imports; data and handlers arrive as props.
- Styling via theme tokens, never literal colours or font sizes.

_(delete the examples; one section per area that has rules of its own — API, components, data access, workers, migrations, tests)_
