---
name: init
description: Bootstrap the .adlc/ vault in a new repo — copies templates, generates the CLAUDE.md schema doc, creates empty vault files (now, hot, index, decisions, glossary, gotchas), and scans for existing documentation (README, ARCHITECTURE, CONTRIBUTING, lint configs, prior ADRs, GLOSSARY) to seed context/ and architecture/ with STATUS-flagged starting content.
---

You are bootstrapping a new project's `.adlc/` vault. Invoke this skill once per repo, then never again — subsequent updates are made directly to the vault files.

## When to use

- A new repo is being set up to use this toolkit.
- `.adlc/` does not exist yet, OR it exists but is empty / incomplete.

## When NOT to use

- `.adlc/` already exists and is populated. Editing established vault files is done directly, not via `/init`.

## Preflight

1. Determine the toolkit installation path (`$TOOLKIT_PATH`) — the directory that contains `core/`, `templates/`, and `ETHOS.md`. Your command/adapter was generated with this path embedded (look for a "Toolkit root:" line in the command that invoked you, or an `ADLC_TOOLKIT_PATH` value). If it is not already known, ask the user where the adlc-toolkit is installed.
2. Determine the repo root: assume cwd unless the user specifies otherwise.
3. Check whether `.adlc/` exists in the repo.
   - **Does not exist** → proceed.
   - **Exists but empty** → proceed, fill it in.
   - **Exists and non-empty** → **stop**. Surface what's there and ask the user whether to abort or overwrite (overwrite is destructive — confirm explicitly).

## Steps

### 0. Read the vault layout

Load `$TOOLKIT_PATH/core/VAULT-LAYOUT.md`. This skill creates the vault's directory tree and proposes its `.gitignore` block, and both come from that file — copy the 18-line pattern set from it rather than retyping (single-`*` globs silently stop matching the moment a vault buckets, and start committing per-developer state with no error).

### 1. Gather project info from the user

Ask the user (use your assistant's structured-question UI if it has one; otherwise ask in chat):

- **Project name** — used in README header and CLAUDE.md identity section
- **One-line description** — used in README and project-overview
- **Stack snapshot** — languages, frontends, backends, databases (free text; the user can refine in config.yml later)
- **Cross-repo?** — single-repo (default) or multi-repo. If multi-repo, gather sibling repo paths.
- **Your initials** — 1–8 lowercase characters; offer the ones from `git config user.name` ("Shamim Fahad" → `sf`). Record them as both `req.prefix` and `layout.author`, and set `req.id_scheme: prefixed` so IDs read `REQ-sf-007`. Per-person IDs are what stop two teammates minting `REQ-042` on parallel branches — folders don't. If the user skips, leave `id_scheme: sequential`; `layout.author` then falls back at runtime.
- **Vault layout** — the on-disk shape of `specs/`, `bugs/`, and `sprints/`. Present as discrete options (ETHOS principle 6) and record as `layout.partition`:
  - **month-author** (default for a new vault) — `specs/2026-08/sf/REQ-042-slug/`, so `specs/` shows a month of work instead of a year of it.
  - **none** — every REQ folder sits directly under `specs/`, flat.

  A new vault has no folders to move yet, so this choice is free now; both shapes stay readable, and `/config migrate` switches later either way. The shipped `config-template.yml` says `none` because it also serves vaults created before layouts existed — for a fresh vault, write `month-author` over it unless the user picks flat.
- **Git policy** — how much git the assistant may run. Present these as discrete options (ETHOS principle 6) and record the answer as `git.mode`:
  - **manual** (default, recommended) — the assistant never runs git writes; it drafts the commit message, PR body, and merge checklist, and you run every git command.
  - **commit** — the assistant may `git add` + `git commit` on the REQ's feature branch after a phase's gate is approved; you still push and open/merge the PR.
  - **commit+push** — also pushes the feature branch (fast-forward only); you still open and merge the PR.

  Default to **manual** if the user is unsure or skips. In every mode the hard invariants still hold: only the REQ's feature branch, never a `protect:` branch, never force-push / rebase / amend-published / branch-delete / `gh pr create` / `gh pr merge` / `--no-verify`.

- **External sources** — where this project's requirements and designs live, so `/spec` and `/bugfix` can seed a draft from a ticket and `/architect` can seed from a design. Present as discrete options (ETHOS principle 6) and record under `sources`:
  - **Issue tracker** — `github` (recommended if the repo is on GitHub), `linear`, `jira`, or `none`. If a tracker is chosen, also capture the default `repo` (e.g. `owner/name`) for bare references like `/spec #8`.
  - **Design tool** — `figma` or `none`.
  - **Write-back?** — default **none** (reads only). Only if the user explicitly wants it, add the issue tracker to `sources.write` so `/wrapup` and `/bugfix` can offer (always gated) to post a PR link or transition the issue.

  Default every source to `none` if the user is unsure or skips — the pipeline then runs fully self-contained — no external services, exactly as before. The *mechanism* (gh CLI / MCP / URL) is auto-resolved at runtime and need not be asked; mention only that for GitHub the `gh` CLI, if installed and authed, is used first.

If the user prefers to skip and fill `config.yml` themselves, accept that and proceed with placeholder values.

### 2. Discover existing documentation

Scan the repo for known documentation patterns. **Read-only.** Don't modify any source file.

**Project overview sources** (one is enough; prefer the first that matches):

- `README.md`, `README.markdown`, `README.rst`, `Readme.md`
- `OVERVIEW.md`
- `docs/overview.md`, `docs/README.md`, `docs/index.md`

**Architecture sources** (collect all that match):

- `ARCHITECTURE.md`, `Architecture.md`
- `docs/architecture.md`, `docs/ARCHITECTURE.md`
- `docs/architecture/` (folder — collect all `*.md` inside)
- `docs/design.md`, `docs/system-design.md`, `docs/system.md`

**Conventions sources** (collect all that match):

- Prose docs:
  - `CONTRIBUTING.md`, `Contributing.md`
  - `STYLE.md`, `STYLE-GUIDE.md`, `style-guide.md`
  - `docs/style-guide.md`, `docs/conventions.md`, `docs/coding-standards.md`
- Lint / format configs (parse for rules):
  - `.editorconfig`
  - ESLint: `.eslintrc`, `.eslintrc.{json,js,cjs,yml,yaml}`, `eslint.config.{js,mjs,cjs,ts}`
  - Prettier: `.prettierrc`, `.prettierrc.{json,js,cjs,yml,yaml,toml}`, `prettier.config.{js,cjs,mjs}`
  - Python: `pyproject.toml` (black / ruff / isort sections), `.flake8`, `setup.cfg`, `.pylintrc`
  - TypeScript: `tsconfig.json` (strict-mode and related flags)
  - Go: `.golangci.{yml,yaml}`
  - Rust: `rustfmt.toml`, `.rustfmt.toml`, `clippy.toml`
  - C#: `.editorconfig` (with `dotnet_*` / `csharp_*` rules), `Directory.Build.props`, `stylecop.json`
- Commit conventions:
  - `.gitmessage`, `.git-commit-template`
  - `commitlint.config.{js,cjs,mjs}`
  - `.commitlintrc`, `.commitlintrc.{json,yml,yaml}`

**ADR sources** (collect all `*.md` files in any of these folders):

- `docs/adr/`, `docs/adrs/`
- `doc/adr/`, `doc/adrs/`
- `adr/`, `adrs/`
- `architecture/decisions/`, `docs/architecture/decisions/`
- `docs/decisions/`, `doc/decisions/`

**Glossary sources** (one is enough):

- `GLOSSARY.md`, `Glossary.md`
- `docs/glossary.md`

### 3. Surface findings to the user

Build a proposed mapping. Each row: source path → vault destination, with a confidence tag. When presenting it, group by destination with short indented lines (example below) — a wide three-column table wraps badly in chat; keep lines under ~72 characters.

- **high** — well-shaped doc that fits the target directly (a README → project-overview, a well-formatted ADR file)
- **medium** — partial match; some synthesis required (a `docs/architecture/` subpage that might be a component, or a lint config with project-specific custom rules)
- **low** — heuristic match; user should especially review

Display in chat:

```
Discovered documentation:

  context/project-overview.md
    ← README.md  (high)
  context/architecture.md
    ← docs/architecture/overview.md  (high)
  context/conventions.md
    ← CONTRIBUTING.md  (workflow — high)
    ← .eslintrc.json  (naming, errors — high)
    ← .prettierrc  (formatting — medium)
    ← .editorconfig  (formatting — medium)
  knowledge/components/services.md
    ← docs/architecture/services.md  (medium)
  architecture/adr-001, adr-002
    ← docs/adr/0001-record-architecture-decisions.md  (high)
    ← docs/adr/0002-database-choice.md  (high)
  glossary.md
    ← GLOSSARY.md  (high)

Skipped (not imported — let me know if any should be reconsidered):
  CHANGELOG.md         — release history, not vault content
  LICENSE              — irrelevant to the vault
  docs/api/            — typically generated from code; canonical there
  docs/tutorials/      — user-facing; not vault content

Reply with one of:
  approve              — import all listed mappings
  approve except X, Y  — import all except listed sources
  approve only X, Y    — import only listed sources
  skip                 — skip the import; create vault empty
```

Wait for the user's response. Parse it into an `approved_sources` list. If the user replies with anything else, ask for clarification.

If no documentation was discovered, surface that explicitly and skip ahead — the vault will be created empty.

### 4. Create the directory structure

Inside the repo root, create:

```
.adlc/
  context/
  knowledge/
    lessons/
    concepts/
    components/
  architecture/
  specs/
  audits/
  bugs/
  sprints/
  templates/
```

Use `mkdir -p` (or platform equivalent). Don't fail if a directory already exists.

`specs/`, `bugs/`, and `sprints/` are created empty. Under `layout.partition: month-author` the month and author folders inside them are made by `/spec`, `/task`, and `/bugfix` when the first REQ or bug lands — don't create any here.

### 5. Copy vault bootstrap files

Copy from `$TOOLKIT_PATH/templates/vault/` to `.adlc/`:

- `README.md` → `.adlc/README.md`
- `.gitattributes` → `.adlc/.gitattributes`  (union-merge for append-only logs — see step 12)
- `CLAUDE.md` → `.adlc/CLAUDE.md`
- `glossary.md` → `.adlc/glossary.md`
- `now.md` → `.adlc/now.md`
- `hot.md` → `.adlc/hot.md`
- `index.md` → `.adlc/index.md`
- `decisions.md` → `.adlc/decisions.md`
- `context/architecture.md` → `.adlc/context/architecture.md`
- `context/conventions.md` → `.adlc/context/conventions.md`
- `context/conventions-paths.md` → `.adlc/context/conventions-paths.md`  (path-scoped rules; one `<!-- paths: -->` line per section; the Claude adapter generates `.claude/rules/adlc-*.md` from it at step 13)
- `context/project-overview.md` → `.adlc/context/project-overview.md`
- `knowledge/gotchas.md` → `.adlc/knowledge/gotchas.md`
- `knowledge/lessons.md` → `.adlc/knowledge/lessons.md`  (generated — one line per lesson, the read side; `.gitattributes` gives it `merge=union`; `index.md` and `decisions.md` above are generated too — the copies are their empty shape)

Use file `Read` + `Write` to copy (placeholder substitution happens at step 7).

### 6. Copy in-REQ templates to the project

Copy from `$TOOLKIT_PATH/templates/` (excluding the `vault/` subdir) to `.adlc/templates/`:

- `spec-template.md`
- `architecture-template.md`
- `task-template.md`
- `lesson-template.md`
- `record-template.md`
- `gotcha-template.md`
- `adr-template.md`
- `bug-template.md`
- `assumption-template.md`
- `design-system-template.md`
- `pr-template.md`
- `merge-checklist-template.md`
- `config-template.yml` → also copy to `.adlc/config.yml`

### 7. Substitute placeholders

In the files copied at steps 5 and 6, replace placeholder tokens with the gathered project info:

- `{{PROJECT_NAME}}` → project name
- `{{USER_NAME}}` → from `git config user.name`, fall back to "the developer"
- `{{USER_EMAIL}}` → from `git config user.email`, fall back to "(not set)"
- `{{DATE}}` → today's date in `YYYY-MM-DD`
- `{{PATH}}` → repo root absolute path

Apply across all copied vault files. Don't touch the template files in `.adlc/templates/` — those keep their placeholders for future use.

### 8. Initialize `config.yml`

Open `.adlc/config.yml` and pre-fill what you gathered:

- `project.name`
- `project.description`
- `git.mode` (the value chosen in step 1; default `manual`)
- `req.id_scheme` and `req.prefix` (the initials from step 1 — `prefixed` unless the user skipped)
- `layout.partition` and `layout.author` (step 1; write `month-author` over the template's `none` unless the user chose flat)
- `stack.languages` (best effort from the user's free text)
- `review.packet.exclude` — keep the template's lockfile/snapshot defaults and add the generated outputs the stack implies: an OpenAPI/NSwag/Prisma client path if one exists in the tree (`grep -rl "auto-generated\|<auto-generated>\|DO NOT EDIT" --include=*.ts --include=*.cs -l | head`), minified bundles, `*.g.cs`. Say what you added; the user can trim it
- `verify` — uncomment the block and seed each command from what the tree says: `package.json` scripts (`lint`, `test`, `typecheck`/`tsc`), `*.sln` / `*.csproj` (`dotnet build`, `dotnet test`, `dotnet format --verify-no-changes`), `Makefile` targets, `pyproject.toml` (`ruff`, `pytest`, `mypy`). Set `scope: project` only for a command that checks the whole program (a build, `tsc --noEmit`, a full test run); everything else is `changed`. Mark every guess `# STATUS: needs verification`, and leave a key out rather than invent a command. These are the commands the implementer quotes and `/review` runs first — a wrong one is worse than none
- `repos.<this-repo-id>.primary: true`
- `sources` (the services chosen in step 1). If the user picked an issue tracker or design tool, uncomment the `sources:` block and fill `issues`, `design`, `repo`, and `write` accordingly. If they chose `none` for everything, leave the block commented out so the pipeline stays self-contained.

Leave everything else as commented placeholders for the user to fill.

### 9. Import approved existing docs

For each source in `approved_sources` (from step 3), perform the appropriate import.

**Universal banner.** Every imported / synthesized section MUST begin with this banner (placed at the top of the relevant section, not the file):

```markdown
> **STATUS: needs verification** — synthesized from `<source-path>` on <date>. Review and edit; remove this banner when confirmed.
```

**Per-source synthesis rules:**

#### `README.md` → `context/project-overview.md`

- Read the README.
- Extract project description from the intro / first non-badge paragraphs.
- Extract stack info from sections matching "Tech Stack", "Built With", "Requirements", "Prerequisites", "Stack".
- Extract core flows from "Features", "Usage", or "Getting Started" sections.
- Skip: badge blocks, license, contributing CTAs, build status, contributors list, sponsors.
- Fill the `project-overview.md` template sections (What this is, Who uses it, Core flows, Stack snapshot, Constraints) with extracted content. Leave sections empty (with placeholder text) where the README has nothing to offer — don't invent content.

#### `ARCHITECTURE.md` / `docs/architecture/*.md` → `context/architecture.md`

- Preserve section structure where it maps.
- Copy mermaid / ASCII / SVG diagrams verbatim inside fenced code blocks.
- Use component descriptions to populate the "Major components" table.
- Use service / integration descriptions to populate "External integrations".
- For multiple architecture files (e.g., a `docs/architecture/` folder with separate pages), route each to the appropriate target:
  - The overview / top-level file → `context/architecture.md`
  - Component-specific files (`services.md`, `database.md`, etc.) → `knowledge/components/<slug>.md` (creating the file if it doesn't exist)
  - Cross-cutting concern files (`auth.md`, `logging.md`, etc.) → `knowledge/concepts/<slug>.md`

#### `CONTRIBUTING.md` → `context/conventions.md`

- Extract sections on PR process, commit message format, branch naming, code review workflow.
- Map into the "Git" section of `conventions.md`.
- Also extract any guidance on testing requirements, code style, documentation expectations — map into the appropriate sections.

#### Lint / format configs → `context/conventions.md`

Parse each config for rules. Translate machine-format rules into prose entries in `conventions.md`:

- **ESLint** — extract rules with `error` severity. Map common rules:
  - `camelcase` → "Use camelCase for variables and functions"
  - `@typescript-eslint/naming-convention` → translate each rule entry
  - `no-console`, `no-debugger` → "No console.log / debugger in production code"
  - `no-magic-numbers` → "Use named constants instead of magic numbers"
  - Custom rules → "Project enforces: <rule-name>" with a note that the user may want to expand
- **Prettier** — extract: `semi`, `singleQuote`, `tabWidth`, `printWidth`, `trailingComma`. Phrase as "Use semicolons", "Single quotes for strings", "Indent: N spaces", "Line length: N chars".
- **`.editorconfig`** — extract: `indent_style`, `indent_size`, `end_of_line`, `charset`, `insert_final_newline`. Phrase plainly.
- **Python `pyproject.toml`** — under `[tool.black]`, `[tool.ruff]`, `[tool.isort]` — extract `line-length`, `target-version`, enabled rule families.
- **TypeScript `tsconfig.json`** — extract `strict`, `noImplicitAny`, `strictNullChecks`, `noUncheckedIndexedAccess`. Phrase as enforcement rules.
- **C# `.editorconfig` `dotnet_*` rules** — extract naming and style rules.
- **Commit conventions** (`.gitmessage`, commitlint configs) — populate the Git section's "Commit message format" with the actual format used.

For each lint config imported, add an entry at the top of `conventions.md`:

```markdown
> The Naming, Formatting, and Error Handling sections below were partly synthesized from:
> - `.eslintrc.json` (rules with severity "error")
> - `.prettierrc`
> - `.editorconfig`
>
> STATUS: needs verification — review each entry; the source configs may have rules I didn't translate.
```

#### `GLOSSARY.md` → `glossary.md`

- Transcribe each term + definition into the glossary table.
- Mark each imported row with `STATUS: needs verification` in the Meaning column (e.g., `Domain | A Vantage installation boundary... — STATUS: needs verification`).
- Preserve any cross-links the source had; rewrite them as wikilinks where they target other vault pages.

### 10. Import existing ADRs

For each ADR source in `approved_sources`:

1. **Read** the source ADR.
2. **Detect the original ID** from the filename: extract leading digits. `0001-foo.md` → ID 1. `adr-007-foo.md` → ID 7. `decision-23-bar.md` → ID 23. If no ID is detectable, assign the next sequential.
3. **Detect status** from headers / metadata in the source:
   - "Status: Accepted" / "STATUS: accepted" → `accepted`
   - "Status: Superseded" / "Status: Superseded by X" → `superseded`, capture the superseder
   - "Status: Proposed" / "Status: Draft" → `proposed`
   - "Status: Deprecated" → `superseded` (treat deprecated as a kind of superseded)
   - "Status: Rejected" → `rejected`
   - No detectable status → `imported` (an extra status meaning "came from prior tooling; user should confirm")
4. **Re-encode** in our template format at `.adlc/architecture/adr-<NN>-<slug>.md`:
   - Use the field table at the top with detected status and any detectable Decided date
   - Add the `^ADR-<NN>` block anchor at the title
   - Preserve the Context, Considered Options (if present), Decision, Consequences sections verbatim
   - Add the STATUS banner: `> **STATUS: imported from <source-path>** — review the encoding; cross-references may need updating.`
5. **Add a row** to `.adlc/decisions.md`.
6. **Update** the ADRs section of `.adlc/index.md`.

If imported ADRs have gaps in their numbering (1, 2, 5, 7 — missing 3, 4, 6), **preserve the original IDs**. Future new ADRs continue from `max(existing) + 1`.

If two source ADRs collide on the same numeric ID (different filenames, same number — happens when folders get merged), surface the collision and ask the user to resolve before writing.

If a source ADR has cross-references to other ADRs (`[See ADR-003](...)`, `Supersedes ADR 002`), rewrite the references as wikilinks pointing to the new IDs (`[[architecture/adr-003-...]]`).

### 11. Initialize empty starter files

Fill these with starting content:

- **`.adlc/now.md`** — under "Active focus" write: `> Just initialized the vault. Run /spec to start the first REQ.`
- **`.adlc/hot.md`** — append a first entry: `## [{{DATE}}] init | Vault initialized` followed by one entry per imported source: `## [{{DATE}}] init-import | <source> → <vault-target>`
- **`.adlc/glossary.md`** — if not seeded from GLOSSARY.md, leave the table empty.

### 12. Create a `.gitignore` entry (optional)

The `.adlc/` vault contains three tiers: **durable knowledge** (specs, ADRs, lessons, gotchas, glossary, concepts, components, cancelled tombstones, revert plans), **shared append-only logs** (the activity log `hot.md`, `decisions.md`, `glossary.md`), and **per-developer ephemeral state** (pipeline heartbeats, gate markers, draft commit/PR/checklist files, the active-focus view `now.md`, sprint registries, resume timestamps). The durable side and the append-only logs are institutional memory and should be **committed** — the shipped `.adlc/.gitattributes` gives the logs `merge=union` so parallel branches never conflict on them (see the activity-log note below). Only the per-developer ephemeral state is gitignored: it churns on every run, is regenerable, and would otherwise pollute history and cause merge conflicts.

If `.gitignore` exists at the repo root, **propose** (don't auto-write) appending the block below. Show the user the block and explain it in two sentences: shared knowledge files are committed so the team keeps its memory; per-developer scratch files (drafts, state, gate markers) are gitignored so they don't churn history or cause merge conflicts. Then ask whether to add it. Accept three responses: `add`, `add except <pattern>`, `skip`.

```
# ADLC — per-developer scratch state. Shared knowledge files stay committed;
# the shared logs (hot.md, decisions.md, glossary.md) are committed too.
# A work item's FOLDER is the local working set; its RECORD (REQ-042-slug.md,
# beside the folder) is the one committed file per item.
.adlc/now.md
.claude/settings.local.json
.adlc/specs/**/REQ-*/
.adlc/bugs/**/BUG-*/
.adlc/specs/**/pipeline-state.json
.adlc/specs/**/.awaiting-approval
.adlc/specs/**/commits-draft.md
.adlc/specs/**/pr-draft.md
.adlc/specs/**/merge-checklist.md
.adlc/specs/**/source-writeback.md
.adlc/specs/**/last-seen.json
.adlc/bugs/**/pipeline-state.json
.adlc/bugs/**/.awaiting-approval
.adlc/bugs/**/commits-draft.md
.adlc/bugs/**/pr-draft.md
.adlc/bugs/**/bug-fix-pr-draft.md
.adlc/bugs/**/merge-checklist.md
.adlc/bugs/**/source-writeback.md
.adlc/bugs/**/last-seen.json
.adlc/sprints/**/*.json
.adlc/ui-auth.env
```

Notes on edge cases:
- Everything **inside** a REQ or BUG folder — `requirement.md`, `architecture.md`, `exploration.md`, `tasks/`, `verification.md`, `review-log.md`, packets, evidence, drafts, state — is the **working set**: local, gitignored by the two folder patterns, deleted on `merged` if the user says so. The why-trail and audit record is the **record** `<REQ_PATH>.md` beside the folder (≤6KB, written once at wrap-up) — that is what the team receives and what the PR carries. The per-file lines after the folder patterns are kept for vaults that opt out of the folder patterns (`add except`).
- `cancelled.md`, `revert-plan.md`, and `code-revert-plan.md` live in the folder too; a cancelled or reverted item still gets a record saying so.
- `hot.md` is the shared activity log. It's **committed** and carries `merge=union` from `.adlc/.gitattributes`, so concurrent appends on different branches combine instead of conflicting — teams get a single shared history with no merge pain. (Newest-first ordering may interleave across a union merge, but every entry is dated, so the log stays readable.) `decisions.md` and `glossary.md` work the same way.
- `knowledge/lessons/` is one committed stub per lesson (the write side), and each lesson's ID is namespaced under the REQ that produced it (`LESSON-REQ-042-1`) — so two developers promoting lessons on parallel branches can't mint the same ID. `knowledge/lessons.md` is the generated read side — one line per lesson, the only thing agents read; it carries `merge=union` (a duplicated line after a merge is cleared by the next rebuild). `index.md` and `decisions.md` are generated too and deliberately *not* union-merged: a conflict there is resolved by rebuilding.
- `now.md` is the **active-focus view** — small, mutable, edited in place, and therefore conflict-prone. It's gitignored and per-developer; `/status` and `/recover` regenerate the active-REQ picture from each REQ's `pipeline-state.json`, which is the real source of truth. Don't commit it.
- `.adlc/ui-auth.env` holds local UI test credentials for the ui-reviewer (`ui.auth` in config) — per-developer, never committed.
- Solo developers can additionally ignore `hot.md` if they don't want it in history; on a team, keep it committed for shared visibility — the union driver makes that safe.

If the user replies `add`, append the block. If `add except <pattern>`, append the block minus the named lines. If `skip`, leave `.gitignore` untouched and surface a one-line reminder that pipeline-state files will appear as unstaged churn until they decide.

### 12b. Generate the path-scoped rules

If step 9 put per-area rules into `context/conventions-paths.md` (anything whose heading or first line names a folder, a layer, or a file kind belongs there, with a `<!-- paths: … -->` line you propose from the repo map and the user confirms), run `node $TOOLKIT_PATH/scripts/adlc.mjs rules --vault .adlc` and quote its summary. If nothing went there, say so and leave the template's two example sections for the user to replace — the generator will produce two example rules until they do, which is why `/config rules` is the follow-up to name in the report. On assistants other than Claude Code the rule files are inert; the skills grep `conventions-paths.md` instead.

### 12c. Offer to wire the Claude Code extras — this repo, this developer (Claude Code only)

On Claude Code, offer one yes/no: *"Wire the ADLC extras for this repo? Budget enforcement, knowledge injection, gate toast and statusline go into `.claude/settings.local.json` — your own file, gitignored, active only in this repo; your global settings are not touched."* On yes, run `node $TOOLKIT_PATH/scripts/adlc.mjs settings --repo <repo-root>` and quote its summary line; hooks load in the next session, so say that. On no, name the command so they can do it later. Never offer `--global` here — that is a per-machine decision the developer makes outside any one project. On other assistants skip this step silently; the fidelity matrix says why.

### 13. Report

Output a summary:

```
Vault initialized: <repo-root>/.adlc/

Files created: <count>
  Bootstrap files:    <count>
  Templates copied:   <count>

Imports from existing docs:
  → context/project-overview.md          (from README.md)
  → context/architecture.md              (from docs/architecture/overview.md)
  → knowledge/components/services.md     (from docs/architecture/services.md)
  → context/conventions.md               (from CONTRIBUTING.md + .eslintrc.json + .prettierrc + .editorconfig)
  → glossary.md                          (from GLOSSARY.md)
  → architecture/adr-001-…                (from docs/adr/0001-…)
  → architecture/adr-002-…                (from docs/adr/0002-…)

Sections marked `STATUS: needs verification`: <count>
  Review these before running your first /proceed — the reviewers rely on context/conventions.md.

Next steps:
  1. Edit .adlc/config.yml — fill stack details, deploy targets if applicable
  2. Open .adlc/context/conventions.md — verify the imported rules; add anything the lint configs didn't cover
  3. Open .adlc/context/project-overview.md — fix anything the README didn't capture cleanly
  4. (optional) Open the vault in Obsidian for graph view and live backlinks
  5. Run /spec to draft your first REQ
```

Suggest the user `cd .adlc` and open the vault in Obsidian if they want the view layer.

## Constraints

- **Never overwrite** an existing populated `.adlc/` without explicit confirmation.
- **Never modify source documentation.** Discovery is read-only — source files stay where they are, untouched.
- **Always mark synthesized content** with `STATUS: needs verification` and cite the source path.
- **Never invent content.** If a source has no info for a target section, leave the section empty with the template placeholder, not with fabricated text.
- **Never commit** the new vault, regardless of `git.mode` — bootstrapping happens before any REQ branch exists, so the user reviews and commits the initial `.adlc/` themselves.
- **Never write outside** `.adlc/` and (with explicit confirmation) `.gitignore`.
- **Preserve original ADR IDs** when importing — don't renumber.

## Done condition

- All directory structure exists
- All bootstrap files copied with placeholders substituted
- `config.yml` exists with primary fields filled
- All approved sources have been imported with `STATUS: needs verification` banners and source citations
- `decisions.md` and `index.md` reflect any imported ADRs
- `hot.md` has init + per-import entries
- Report emitted to user with explicit next-step instructions
