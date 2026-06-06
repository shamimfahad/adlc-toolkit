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

### 1. Gather project info from the user

Ask the user (use your assistant's structured-question UI if it has one; otherwise ask in chat):

- **Project name** — used in README header and CLAUDE.md identity section
- **One-line description** — used in README and project-overview
- **Stack snapshot** — languages, frontends, backends, databases (free text; the user can refine in config.yml later)
- **Cross-repo?** — single-repo (default) or multi-repo. If multi-repo, gather sibling repo paths.

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

Build a proposed mapping. Each row: source path → vault destination, with a confidence tag.

- **high** — well-shaped doc that fits the target directly (a README → project-overview, a well-formatted ADR file)
- **medium** — partial match; some synthesis required (a `docs/architecture/` subpage that might be a component, or a lint config with project-specific custom rules)
- **low** — heuristic match; user should especially review

Display in chat:

```
Discovered documentation:

  Source                                              → Vault destination                                Confidence
  ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  README.md                                           → context/project-overview.md                       high
  docs/architecture/overview.md                       → context/architecture.md                           high
  docs/architecture/services.md                       → knowledge/components/services.md                  medium
  CONTRIBUTING.md                                     → context/conventions.md  (workflow)                high
  .eslintrc.json                                      → context/conventions.md  (naming, errors)          high
  .prettierrc                                         → context/conventions.md  (formatting)              medium
  .editorconfig                                       → context/conventions.md  (formatting)              medium
  docs/adr/0001-record-architecture-decisions.md      → architecture/adr-001-record-architecture-decisions.md  high
  docs/adr/0002-database-choice.md                    → architecture/adr-002-database-choice.md           high
  GLOSSARY.md                                         → glossary.md                                       high

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

### 5. Copy vault bootstrap files

Copy from `$TOOLKIT_PATH/templates/vault/` to `.adlc/`:

- `README.md` → `.adlc/README.md`
- `CLAUDE.md` → `.adlc/CLAUDE.md`
- `glossary.md` → `.adlc/glossary.md`
- `now.md` → `.adlc/now.md`
- `hot.md` → `.adlc/hot.md`
- `index.md` → `.adlc/index.md`
- `decisions.md` → `.adlc/decisions.md`
- `context/architecture.md` → `.adlc/context/architecture.md`
- `context/conventions.md` → `.adlc/context/conventions.md`
- `context/project-overview.md` → `.adlc/context/project-overview.md`
- `knowledge/gotchas.md` → `.adlc/knowledge/gotchas.md`

Use file `Read` + `Write` to copy (placeholder substitution happens at step 7).

### 6. Copy in-REQ templates to the project

Copy from `$TOOLKIT_PATH/templates/` (excluding the `vault/` subdir) to `.adlc/templates/`:

- `spec-template.md`
- `architecture-template.md`
- `task-template.md`
- `lesson-template.md`
- `gotcha-template.md`
- `adr-template.md`
- `bug-template.md`
- `assumption-template.md`
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
- `stack.languages` (best effort from the user's free text)
- `repos.<this-repo-id>.primary: true`

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

The `.adlc/` vault contains both **durable knowledge** (specs, ADRs, lessons, gotchas, glossary, concepts, components, cancelled tombstones, revert plans) and **ephemeral runtime state** (pipeline heartbeats, gate markers, draft commit/PR/checklist files, the rolling activity log, the active-focus marker, sprint registries, resume timestamps). The durable side is institutional memory and should be committed. The ephemeral side churns on every pipeline run and would pollute git history.

If `.gitignore` exists at the repo root, **propose** (don't auto-write) appending the block below. Show the user the block, briefly explain the durable-vs-ephemeral split above, and ask whether to add it. Accept three responses: `add`, `add except <pattern>`, `skip`.

```
# ADLC — ephemeral runtime state; the rest of .adlc/ is committed
.adlc/now.md
.adlc/hot.md
.adlc/specs/*/pipeline-state.json
.adlc/specs/*/.awaiting-approval
.adlc/specs/*/commits-draft.md
.adlc/specs/*/pr-draft.md
.adlc/specs/*/merge-checklist.md
.adlc/specs/*/last-seen.json
.adlc/bugs/*/pipeline-state.json
.adlc/bugs/*/.awaiting-approval
.adlc/bugs/*/commits-draft.md
.adlc/bugs/*/pr-draft.md
.adlc/bugs/*/merge-checklist.md
.adlc/bugs/*/last-seen.json
.adlc/sprints/*.json
```

Notes on edge cases:
- `requirement.md`, `architecture.md`, `exploration.md`, `verification.md`, `cancelled.md`, `revert-plan.md`, and `code-revert-plan.md` inside each REQ folder are **committed** — they're the why-trail and the audit record.
- `tasks/` is committed; task plans serve as the "planned vs. shipped" trail.
- `now.md` and `hot.md` are working surfaces for the human + Claude. Their long-term distillate lives in `knowledge/lessons/`, `knowledge/gotchas.md`, `decisions.md`, and per-REQ files — all of which are committed.
- For teams that want shared visibility on `now.md` / `hot.md`, drop those two lines from the block. Solo developers should keep them ignored.

If the user replies `add`, append the block. If `add except <pattern>`, append the block minus the named lines. If `skip`, leave `.gitignore` untouched and surface a one-line reminder that pipeline-state files will appear as unstaged churn until they decide.

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
- **Never commit** the new vault — the user runs that.
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
