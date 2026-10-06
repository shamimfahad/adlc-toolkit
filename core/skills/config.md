---
name: config
description: View and change ADLC project settings in .adlc/config.yml — git policy, isolation, how freely the assistant may edit, external sources, autonomy levels, stack, protected branches, repos — through guided options, then re-sync any derived files. Also migrates an existing vault's config to pick up new keys after a toolkit update. Use to change how the pipeline behaves without hand-editing YAML. Vault-only; never commits.
---

You are viewing or changing this project's ADLC settings in `.adlc/config.yml`. This is a utility skill: no phase, no gate, no sub-agents. It edits **only** the vault, never source code, and never runs git.

It exists for one reason hand-editing YAML can't satisfy: some settings have a **derived file** — a second copy elsewhere that must stay in sync (changing `git.mode` must also refresh the git-policy block in `.adlc/CLAUDE.md`). This skill owns "validate → write → re-sync → report."

## Preconditions

- `.adlc/config.yml` must exist. If it doesn't, tell the user to run `/init` first and stop.
- Determine `$TOOLKIT_PATH` (the "Toolkit root:" line in the command that invoked you) — needed to read canonical templates when re-syncing derived files.
- If the user asked for `migrate`, or is setting any `layout.*` key, read `$TOOLKIT_PATH/core/VAULT-LAYOUT.md` first — it owns the path grammar the layout step rearranges.

## Modes of invocation

**A. Show (no arguments, or `show`).** Read `.adlc/config.yml` and print the current effective settings, grouped (see Output). Read-only — write nothing. End by listing the changeable keys so the user knows what they can set.

**B. Shortcut (`<key>=<value>`, may be repeated).** e.g. `/config git.mode=commit`, `/config workflow.isolation=worktree autonomy.gates=assisted`, `/config workflow.edits=confirm-each`, `/config sources.issues=github sources.repo=acme/web`. Validate each (see Settings catalog); if all valid, show the before→after and apply. Reject any invalid value by presenting its allowed options, and change nothing.

**C. Interactive (any other free text, or a bare request to "change settings").** Present the editable groups as labeled options (ETHOS principle 6 — use the assistant's structured-question UI if it has one). When the user picks a setting, present its **allowed values as options** with the current one marked. Confirm the before→after, then apply.

**D. Migrate (`migrate`, `update`, or "pick up new settings after updating the toolkit").** Add keys/blocks the toolkit has gained since this vault was created, without changing any existing value; append any `.gitattributes` lines the toolkit has gained; append the missing `.gitignore` lines (the 1.9.0 working-set patterns); regenerate `knowledge/lessons.md`, `index.md`, `decisions.md` and the `.claude/rules/adlc-*.md` files; offer records for merged folders that have none; then **offer** a template refresh (mode E). See "Migrate" below. This is the supported way to refresh an existing `.adlc/` after a `git pull` of the toolkit — `/init` is one-shot and won't touch a populated vault.

**E. Refresh templates (`templates`, `refresh-templates`, or offered at the end of `migrate`).** Update this vault's `.adlc/templates/` copies to match the toolkit's current `templates/` after an update — gated, per file, never silent. See "Template refresh" below.

**F. Budgets (`budgets`, or offered by `/status` when its strip shows `⚠`).** Bring the hot-path files back under the vault README's size budgets, gated per file, nothing deleted. See "Budgets" below.

**G. Generated files (`lessons`, `index`, or the legacy alias `ledger`).** Rebuild `knowledge/lessons.md` and/or `index.md` + `decisions.md` with the toolkit's generators — the one-off repair after a merge left duplicated lines, after lessons or ADRs were edited by hand, or after a record was written outside a skill. Whole-file rewrite, no gate needed (they are generated; nothing in them is authored except `index.md`'s `## Reference` section, which the generator preserves). See "Derived-file sync" below.

**H. Rules (`rules`).** Generate the Claude adapter's path-scoped rules from `context/conventions-paths.md` — `node $TOOLKIT_PATH/scripts/adlc.mjs rules --vault .adlc` writes one `.claude/rules/adlc-<slug>.md` per `##` section that carries a `<!-- paths: … -->` line, removes generated rules whose section is gone, and reports sections without a paths line. Before generating, if `conventions.md` is over its 8KB budget or carries sections that name a path family in their heading or first line, **offer** to move those sections verbatim into `conventions-paths.md` with a paths line (every byte moves, nothing summarized, one approve per section — the same contract as Budgets; the user supplies or confirms each glob list). On other assistants the generator still runs (the rule files are harmless) and the skills grep `conventions-paths.md` directly. See "Rules" below.

In every mode, **confirm before writing** when a value actually changes: show `key: old → new` and any derived-file re-sync that will follow, and proceed only on explicit confirmation. There's no formal gate, but a settings change is consequential — don't write silently.

## Settings catalog

Validate against this. Allowed values are closed sets unless noted "free text."

| Key | Allowed values | Notes / validation |
|---|---|---|
| `project.name` | free text | non-empty |
| `project.description` | free text | one line |
| `git.mode` | `manual` \| `commit` \| `commit+push` | **derived-file sync** (see below). Lowering it below `autonomy.git` silently caps `/autopilot`; mention that. |
| `git.protect` | list of branch globs | must be non-empty; warn (don't block) if `main`/`master` is removed |
| `workflow.isolation` | `auto` \| `branch` \| `worktree` | explain the trade-off when changing (branch keeps the editor session; worktree tolerates a dirty checkout) |
| `workflow.edits` | `confirm-out-of-scope` \| `confirm-each` | how often the implementer asks before editing within a phase. `confirm-out-of-scope` = free inside the REQ's blast radius, stop at the edge; `confirm-each` = surface every write. **Phase gates are unaffected either way** — say so when changing. |
| `layout.partition` | `none` \| `month-author` | on-disk shape of `specs/`, `bugs/`, `sprints/` — see `$TOOLKIT_PATH/core/VAULT-LAYOUT.md`. Changing it affects **new** folders only; existing ones move when the user runs `/config migrate` (mode D, layout step). Both shapes stay readable, so a half-migrated vault is fine. |
| `layout.author` | free text, `[a-z0-9-]`, 1–8 chars | initials used as the folder bucket under `month-author`. Falls back to `req.prefix`, then initials from `git config user.name`, then `_`. Lowercase it; if the user gives something outside the charset, offer the sanitized form rather than writing it raw. |
| `sources.issues` | `github` \| `linear` \| `jira` \| `none` | issue tracker `/spec` and `/bugfix` seed from. Setting non-`none` enables read-seeding (mechanism auto-resolved: CLI → MCP → URL). If set, prompt for `sources.repo` too. |
| `sources.design` | `figma` \| `none` | design tool `/architect` seeds UI/component specs from. |
| `sources.repo` | free text (`owner/name`) | default repo for bare refs like `/spec #8`. |
| `sources.write` | list — subset of the configured services | **default empty (reads only).** Listing a service enables gated write-back (`/wrapup`, `/bugfix` P5). **Warn before enabling:** this permits external writes (issue comments/transitions); every write is still drafted and approved at a gate, never silent. |
| `sources.mechanism` | `auto` \| `gh` \| `mcp` \| `url` | override the auto resolution order. Rarely needed; default `auto`. |
| `autonomy.gates` | `manual` \| `assisted` \| `auto` | only consumed by `/autopilot` |
| `autonomy.git` | `read-only` \| `commit` \| `commit+push` | **capped by `git.mode`** — refuse to set it higher than `git.mode` (offer to raise `git.mode` too, or set the capped value) |
| `autonomy.sources` | `read-only` \| `write` | only consumed by `/autopilot`. **Capped by `sources.write`** — refuse to set `write` if `sources.write` is empty (offer to populate it first). External writes always stop for your explicit OK. |
| `autonomy.escalation` | `cautious` \| `balanced` \| `aggressive` | how cautious the automatic gate-keeper is |
| `autonomy.rework_cap_per_gate` | integer ≥ 0 | |
| `autonomy.rework_budget_total` | integer ≥ 0 | |
| `autonomy.confidence_floor` | number 0.0–1.0 | |
| `autonomy.hard_stops` | list | free-text categories; keep the safety defaults unless the user is explicit |
| `autonomy.notify.on_halt` / `.on_complete` | `true` \| `false` | |
| `stack.languages` / `.frontends` / `.backends` / `.databases` | list | free text |
| `review.packet.exclude` | list of globs | generated code, lockfiles, snapshots — never enters the review packet; listed in its manifest with +/− counts |
| `repos.*` | map | advanced — primary flag, sibling ids, paths. Warn that cross-repo configs must mirror each other (each repo marks itself `primary: true` and lists the others). |
| `read_only_sources` / `forbidden_paths` | list of paths | free text |
| `deploy.*`, `services.*`, `merge_order` | as templated | free text; only used by external/deploy-aware tooling |

If the user names a key not in this catalog, don't invent behavior — show the catalog and ask.

## Editing rules

- **Edit surgically. Preserve the file's comments and structure.** `.adlc/config.yml` ships with extensive explanatory comments — do **not** parse-and-rewrite the whole file (that strips them). Change the specific value in place. If a setting lives in a commented-out block (e.g. `autonomy:`), uncomment the minimal lines needed to set it, leaving the rest of the guidance intact.
- **Preserve unknown/custom keys** the user added.
- **Keep YAML valid.** After editing, the file must parse. If you can't make a clean surgical edit, show the user the exact change and ask them to confirm a small rewrite of just that block.

## Migrate (pick up new keys after a toolkit update)

When the toolkit gains new settings (e.g. `workflow.edits`, the `sources` block, `autonomy.sources`), a vault created before the update won't have them. Their skills default safely when absent, so nothing breaks — but a user who wants the new capability shouldn't have to hand-paste YAML. Migration scaffolds the missing pieces in, additively.

**This is strictly additive.** It never changes an existing value, never removes a key (including custom keys the user added), and never reorders the file. It only inserts blocks/keys that the canonical template has and the project config lacks, carrying the template's explanatory comments with them.

**`layout.partition` is inserted as `none`, always.** The template ships `none` for exactly this reason: a vault created before 1.6.0 has flat folders on disk, and injecting `month-author` would leave its config claiming a shape its files don't have. An existing vault adopts partitioning only by an explicit choice — either the user sets the key, or they accept the layout step in the migration below. Never infer it from the folders present.

### Layout step (only when `layout.partition` is not `none`)

Offered as a separate, separately-gated step after the config keys are handled. Read `$TOOLKIT_PATH/core/VAULT-LAYOUT.md` first — it owns the path grammar this step rearranges.

This is a **reconciler**: it computes the gap between what's on disk and what the config asks for, and closes it. Running it twice is a no-op by construction, because the second run finds no work. There is no "already migrated" marker to get out of sync, and nothing is backed up to `.bak` — `git mv` keeps the history.

1. **Find the work — two passes, different depths.** Folders that still sit directly under the tree root are un-bucketed:
   - Active: `find .adlc/specs -mindepth 1 -maxdepth 1 -type d -name 'REQ-*'`
   - Archived: `find .adlc/specs/_archive -mindepth 1 -maxdepth 1 -type d -name 'REQ-*'`

   Anything deeper is already bucketed. **The archive pass is not optional** — skip it and the vault stays half-partitioned forever (active work bucketed, archive flat). Nothing breaks, because both shapes resolve; it just never finishes.
2. **Derive the month** for each folder, first hit wins:
   - `git log --diff-filter=A --format=%ad --date=format:%Y-%m -- <path> | tail -1`
   - `pipeline-state.json`'s created timestamp
   - the folder's mtime — mark this row `(guessed)`
3. **Derive the author** from that same first commit's `%an`, reduced to initials. No commit, or unparseable → `_`.
4. **Show the whole move plan before touching anything** — a table of old path → new path, plus where the month came from. Group `(guessed)` rows at the top so they get looked at. Gate on it: `move all`, `move except <ID>`, or `skip`.
5. **Move, per folder:** `mkdir -p` the destination's parent, **then** plain `mv` — the move fails outright if the parent doesn't exist. Use `mv`, **not `git mv`**: this skill never runs git writes, and `git mv` stages a rename. Git detects the rename from content when the user commits, so `git log --follow` still traces the files. Gitignored files inside the folder (`pipeline-state.json` and friends) come along with the directory either way.
6. **Repoint and log.** Update each moved REQ's row in `.adlc/index.md`, then append one line to `.adlc/hot.md`: `## [DATE] layout-migrated | <N> REQs, <M> bugs, <K> sprints`.
7. **Offer the `.gitignore` replacement** as its own gated diff. The old block's single-`*` globs stop matching the moment folders are bucketed, which silently starts committing per-developer state. The `**` set from `VAULT-LAYOUT.md` covers both shapes, so it's worth offering even to vaults staying flat.

Same procedure for `bugs/` (active only — there is no `bugs/_archive/`) and for `sprints/`, which take the month bucket but no author segment.

Durable artifacts — lessons, ADRs, concept pages — reference REQs by **ID**, not path, so nothing outside these trees needs rewriting. If you find yourself sweeping `knowledge/` for path strings, something upstream wrote a path where it should have written an ID.

**Steps:**

1. **Load both files.** Read `$TOOLKIT_PATH/templates/config-template.yml` (canonical, current) and `.adlc/config.yml` (this project's, possibly older).
2. **Diff structurally, not textually.** Identify:
   - **Top-level blocks** present in the template but absent in the project file (e.g. a whole `sources:` block).
   - **Sub-keys** missing inside a block the project already has (e.g. `edits:` under an existing `workflow:`, or `sources:`/`notify:` lines inside an existing `autonomy:`).
   - **New entries in templated lists** that are pure scaffolding (e.g. a new `hard_stops:` category). Offer these but don't assume — the user may have intentionally trimmed a list.
   Ignore the project's `<placeholder>` values, custom keys, and any value differences — those are the user's, not drift.
3. **Preserve the commented/default shape.** If the template ships a block commented-out (like `sources:`), insert it commented-out too — migration makes the option *available*, it doesn't enable it. Setting a real value is a separate `/config <key>=<value>` action afterward.
4. **Preview before writing.** Show the user the exact additions (as a unified-diff-style preview), grouped by block, with a one-line note on what each new setting does. Nothing is written until they confirm. Offer `add all`, `add except <block>`, or `skip`.
5. **Insert surgically.** Place each addition next to its sibling keys in the same order the template uses (e.g. `workflow.edits` right after `workflow.isolation`), comments intact. Keep the file valid YAML.
6. **Report.** List what was added (and what was already current), append one `.adlc/hot.md` line: `## [DATE] config-migrate | added: <keys/blocks>`, and remind the user that newly added blocks do nothing until they set a value (e.g. "run `/config sources.issues=github` to start seeding from GitHub").

If the project config is already current, say so and write nothing.

7. **Reconcile `.adlc/.gitattributes` — additive, like the config keys.** The vault's live `.gitattributes` is copied once at `/init` and is *not* covered by the template refresh below (mode E diffs `$TOOLKIT_PATH/templates/` against `.adlc/templates/`; the live file sits at the vault root). So do it here: for each non-comment line in `$TOOLKIT_PATH/templates/vault/.gitattributes` whose path is absent from `.adlc/.gitattributes`, append that line (with the toolkit's comment above it). Never remove, reorder, or change an existing line — a project may have added its own. Show the additions before writing; if there are none, say so. Then log: `## [DATE] config-migrate | gitattributes: +<paths>`.

8. **Regenerate the generated files** — part of derived-file sync (below): `node $TOOLKIT_PATH/scripts/adlc.mjs lessons --vault .adlc` and `node $TOOLKIT_PATH/scripts/adlc.mjs index --vault .adlc`. `knowledge/lessons.md` replaced `lesson-ledger.md` in 1.9.0: when a `lesson-ledger.md` exists, move it to `.adlc/_archive/` (never delete) and say so; `index.md` keeps its `## Reference` section and loses the hand tables — show the before/after sizes (a measured vault went 216KB → ~12KB). Legacy lesson files (the pre-1.9.0 40-line template) are read as-is by the generator; **offer, don't force,** rewriting their headers into the 9-row stub (one gated batch: the generator's output is identical either way, so the rewrite is cosmetic until a lesson is edited). A vault whose generated files are already current produces byte-identical output — that's the no-op; say so rather than logging a change.

9. **Append the 1.9.0 `.gitignore` lines** (`.adlc/specs/**/REQ-*/`, `.adlc/bugs/**/BUG-*/`) if absent — additive, shown first, one approve; the old per-file lines stay. Explain in one sentence: from now on a work item's folder is the local working set and only its record `<REQ_PATH>.md` is committed. Files already tracked under those folders stay tracked until the user runs `git rm -r --cached` on them (print the exact command in the summary; never run it — it is a git write).

9b. **Offer the per-repo Claude extras** (Claude Code only): if `<repo>/.claude/settings.local.json` does not carry the ADLC hooks, offer `node $TOOLKIT_PATH/scripts/adlc.mjs settings --repo <repo-root>` — this repo and this developer only, never the global file. Quote its summary; mention hooks load next session.

10. **Offer records for merged folders that have none.** `find .adlc/specs -maxdepth 4 -type d -name 'REQ-*'` minus those with a sibling `REQ-*.md`; for each with `pipeline-state.prState == merged` (or under `_archive/`), write the record as `/recover` step 3b does (from `requirement.md`, `verification.md`, `pipeline-state.json`, git log) with `- <date> — record back-filled by /config migrate` under `## Later`. One gated batch; show the count and three sample records first. Unmerged folders are skipped — their record is written at wrap-up.

9. **Offer template refresh.** A toolkit update usually changes the templates too (e.g. new diagram sections), and those live in `.adlc/templates/`, not `config.yml`. After the config keys are handled, offer to run the template refresh (mode E / below) as a separate, clearly-labeled gated step. The user can decline it independently of the config migration.

## Template refresh (vault templates vs. the toolkit's)

Each vault carries its own copy of the in-REQ and vault templates under `.adlc/templates/`, seeded once at `/init`. When the toolkit's `templates/` change (e.g. new Mermaid diagram sections in the spec and architecture templates), existing vaults keep the old copies until refreshed here. This is **not additive** — a template is a whole file — so it is always gated and always resolved per file.

The hazard mirrors the `local/` overlay-shadow problem: a vault template may have been hand-edited for this project, and we can't distinguish an intentional customization from staleness. So we never overwrite silently — show the difference and let the user decide, file by file.

**Steps:**

1. **Enumerate.** Walk `$TOOLKIT_PATH/templates/` recursively (including `templates/vault/`) and compare each file with the matching path under `.adlc/templates/`. Classify each:
   - **current** — byte-identical. Skip.
   - **missing in vault** — the toolkit ships it, the vault lacks it (a newly added template). Low-risk to add.
   - **differs** — both exist but differ. Could be a toolkit improvement, a project customization, or both. Flag for review.
2. **Preview per file.** For every non-current file, show a unified diff (vault copy → toolkit copy) with a one-line note on what changed. Group them: lead with **missing** (safe additions), then **differs** (call these out as possibly-customized).
3. **Choose per file.** Present options (ETHOS principle 6 — use the assistant's structured-question UI if it has one): **update** (overwrite the vault copy with the toolkit's), **keep** (leave the vault copy untouched), plus batch shortcuts **add all missing** and **update all**. Recommend *update* for `missing` files and for `differs` files whose vault copy shows no project-specific content; recommend *keep* where the diff shows obvious local customization.
4. **Apply** only the chosen updates. Never touch a file the user chose to keep.
5. **Report + log.** List what was updated / added / kept, and append one line to `.adlc/hot.md`: `## [DATE] config-templates | updated: <files>`.

This skill replaces whole template files; it does **not** merge. If a user wants to keep local edits *and* take the upstream changes, that's their manual merge — show both sides and let them do it. If every template is already current, say so and write nothing.

## Budgets (bring the hot path back under budget)

The budgets are in the vault README ("Size budgets"). `/wrapup` keeps `hot.md` and `now.md` inside them on every REQ from 1.7.0 on, and the Claude adapter's `adlc-budget.mjs` hook refuses over-budget writes — but a vault that predates 1.7.0, or one that drifted, needs a one-time repair. Measure first, then offer one action per file, each with a preview and its own approve:

- **`now.md` > 1KB** → keep the active-REQ table and one-line focus; move every other section verbatim to `sprints/<SPRINT-ID>.md` (if it describes a sprint) or `<REQ_PATH>/notes.md` (if it describes one REQ), leaving a one-line pointer. Show what moves where.
- **`hot.md` > 500 lines** → cut from line 501 down into `hot-archive-<YYYY>.md`, newest-first order preserved, one `index.md` row. Same rotation `/wrapup` step 4 does.
- **`context/<name>.md` > 8KB** → split into the rulebook (what reviewers enforce: rules, names, patterns, do/don't) and `context/<name>-rationale.md` (why, history, examples, discussion), read on demand. Propose the split by section heading; the user moves headings between the two lists before approving. The rulebook keeps every rule; nothing is summarized. **For `conventions.md`, offer a third bucket first:** sections that apply to one part of the tree go to `context/conventions-paths.md` with a `<!-- paths: … -->` line (mode H generates the rules from it) — on a measured vault most of a 64KB conventions file was per-area rules that every implementer paid for on every task, whatever it touched.
- **`CLAUDE.md` > 5KB** → same split into `README.md` (explanation) and `CLAUDE.md` (rules).
- **`review-packet.md` / `verification.md` over budget in active REQs** → report only; those are `/review`'s to fix on the next round.

Never merge, summarize, or drop text in this mode. Every byte moves; the diff of the pair is zero. Log one `hot.md` line: `## [DATE] config-budgets | <file>: <before> → <after>, moved to <target>`.

## Rules (path-scoped conventions → `.claude/rules/`)

1. If `context/conventions-paths.md` does not exist, copy it from `$TOOLKIT_PATH/templates/vault/context/conventions-paths.md` (the two example sections included — the user deletes them) and say so.
2. **Offer the move** described in mode H when `conventions.md` has candidates: show each candidate section's heading and the glob list you propose (from the paths it names, the `stack:` block, or the repo map — `src/api/**` for a section called "API conventions"), get a yes/edit/skip per section, then move the text verbatim and leave a one-line pointer in `conventions.md` (`_→ path-scoped: see conventions-paths.md §API conventions_`). Print `conventions.md` before/after sizes.
3. Run `node $TOOLKIT_PATH/scripts/adlc.mjs rules --vault .adlc` and print its summary line. On a soft-budget warning (a section over 2KB), suggest the split but do nothing.
4. If `.claude/rules/` holds hand-written rules of the user's own, leave them alone — the generator only ever writes and removes `adlc-*.md`.
5. One `hot.md` line: `## [DATE] config-rules | <N> rules generated from conventions-paths.md`.

## Derived-file sync

After writing config, refresh anything that mirrors a setting:

- **`git.mode` → `.adlc/CLAUDE.md` "### Git policy" section.** Replace that section's body with the canonical version from `$TOOLKIT_PATH/templates/vault/CLAUDE.md` (it already describes all three modes and the invariants, keyed off `git.mode`, so it's correct for any value). If the user's `.adlc/CLAUDE.md` has local edits around it, replace only the `### Git policy` section, not the whole file.

- **`context/conventions-paths.md` → `.claude/rules/adlc-*.md`.** Regenerate on `migrate` (mode D) and on `rules` (mode H): `node $TOOLKIT_PATH/scripts/adlc.mjs rules --vault .adlc`. `--check` exits 1 when a rule is stale or its section is gone.
- **`knowledge/lessons/*` → `knowledge/lessons.md`; records + ADR headers + knowledge pages → `index.md`, `decisions.md`.** Not derived from a setting but from vault files, and they belong here because they are the things that must be regenerated rather than edited. Rebuild on `migrate` (mode D) and on request (`/config lessons`, `/config index`, or `ledger` as the legacy alias for both): `node $TOOLKIT_PATH/scripts/adlc.mjs lessons --vault .adlc` and `node $TOOLKIT_PATH/scripts/adlc.mjs index --vault .adlc`. Whole-file rewrites from header lines only; `lessons.md` carries `merge=union` and a rewrite is what clears a duplicated line. Never a partial edit, never by hand — the Claude adapter refuses the write. `--check` on either exits 1 when the file on disk is stale, which is what `/analyze` uses.

No other setting currently has a derived file — `workflow.isolation`, `workflow.edits`, the `sources.*` block, and the `autonomy.*` dials are all read from `config.yml` at runtime (by `/implement`, the seed/write-back steps, and `/autopilot` respectively). If a future setting gains a derived file, extend this section.

## After applying

1. Echo a concise summary: each `key: old → new`, plus any derived file re-synced.
2. Append one line to `.adlc/hot.md`: `## [DATE] config | <key>=<value>[, …]`.
3. If `git.mode` changed to `commit` or `commit+push`, remind the user of the invariants that still hold (feature branch only; never a `protect:` branch, force-push, history rewrite, branch delete, PR create/merge, or `--no-verify`).
4. If you changed settings that only `/autopilot` reads (`autonomy.*`), note they take effect on the next `/autopilot` run.

## Constraints

- **Vault-only.** Write nothing outside `.adlc/`. Never modify source files.
- **Never run git** — not even when `git.mode` is `commit`/`commit+push`. Config changes are meta; the user commits `.adlc/` themselves. Stage/commit is out of scope for this skill in every mode.
- **No agents, no gates.** Fast and synchronous.
- **Validate before writing.** An invalid value changes nothing — present the allowed options instead.
- **Confirm consequential changes.** Show before→after and proceed on explicit confirmation.
- **Don't reformat** the file or reorder keys. Minimal diffs only.

## Output

The edited `.adlc/config.yml` (minimal diff), a possibly-updated `.adlc/CLAUDE.md` git-policy section, one `hot.md` line, and a change summary in chat. In show mode: nothing written, current settings printed in chat. In migrate mode: additive insertions only (missing blocks/keys with their template comments), a `config-migrate` line in `hot.md`, and a summary of what was added vs. already current, followed by the offer to refresh templates. In templates mode: per-file overwrites of `.adlc/templates/` for the files the user chose to update, a `config-templates` line in `hot.md`, and a summary of updated / added / kept.
