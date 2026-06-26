# Changelog

All notable changes to the ADLC toolkit. The toolkit version lives in `core/manifest.json` → `version`.

Labels used below: **[breaking]** needs action on update, **[protocol]** changes how a skill behaves, **[vault-format]** changes on-disk vault layout, **[tooling]** install/build only.

## [1.1.0] — 2026-06-26

### Install / update system — rebuilt **[tooling]**

- **One idempotent command** for install *and* update: `node scripts/adlc.mjs sync --tool=<...>`. Re-running reconciles against a saved receipt — newly added skills/agents are linked, removed ones are pruned, content changes flow through automatically. `--pull` git-pulls the toolkit first.
- `scripts/install.mjs` and `scripts/build.mjs` are now thin aliases for `adlc.mjs sync` / `adlc.mjs build`; existing commands keep working.
- **Pre-commit hook** (`scripts/hooks/pre-commit`, activated with `node scripts/adlc.mjs hooks` → `core.hooksPath`): rebuilds and stages `adapters/` whenever a commit touches `core/`, `local/`, or the generator, so the committed snapshot never drifts from the source. No npm/husky dependency. Bypass with `git commit --no-verify`.
- Fixed the corruption mode where re-running the installer onto a symlinked target produced self-referential symlinks and `.bak` litter. `dist/` is now wiped and regenerated cleanly each run, the linker refuses any destination that resolves back inside the toolkit, and old flat-file skill installs are auto-migrated to `SKILL.md` folder form.
- **Auto-heal legacy directory-symlinks.** If a prior corrupted install left a whole tool-config dir symlinked into the toolkit (e.g. `~/.claude/skills` → `dist/claude/skills`), `sync` now replaces it with a real directory and links the per-skill children back in, instead of stopping at the loop guard. `--dry-run` previews the heal and changes nothing.

### Engine / overlay seam **[tooling]**

- New **`local/`** overlay directory, resolved *over* `core/` by the generator. Add a skill (`local/skills/<name>.md` + a `local/manifest.json` entry), override a core skill (same filename), or disable one (`{"name":x,"disabled":true}`). Customizations live only in `local/`, so `git pull upstream` merges with no conflicts. See `local/README.md`.

### New skill **[protocol]**

- **`/toolkit-update`** — guided upstream pull + adapter reconcile that also flags any `local/` override shadowing an engine file the update changed.

### Teams **[protocol]**, **[vault-format]**

- **Configurable REQ/BUG IDs** via `config.yml` → `req.id_scheme`: `ticket` (derive from your tracker — collision-proof, recommended for teams), `prefixed` (`REQ-<initials>-NNN`, offline), `sequential` (default). Honored by `/spec`, `/task`, `/bugfix`.
- **Conflict-free shared history.** `.adlc/.gitattributes` gives `hot.md`, `decisions.md`, and `glossary.md` git's `merge=union` driver, so parallel branches' appends combine instead of conflicting — these are now committed for team visibility. Mutable `now.md` and per-developer pipeline state stay gitignored and are regenerated from each REQ's `pipeline-state.json`. `/init` proposes the split.

### Tool-neutral naming **[protocol]**

- Agent tiers renamed `haiku`/`sonnet`/`opus` → **`fast`/`balanced`/`deep`**. Vendor model IDs now live only in `manifest.tierToModel` (on Claude: fast→haiku, balanced→sonnet, deep→opus). No behavior change; override per project in `config.yml`.

### Update notes

- Run `node scripts/adlc.mjs sync --tool=all` once after updating to pick up the new skill and the cleaned install.
- In each existing project, run `/config migrate` to scaffold the new `req:` block, and let `/init`'s gitignore guidance (or a manual edit) adopt the new committed-log split. No existing vault data changes.

## [1.0.0]

- Initial release: tool-agnostic spec-driven pipeline (`spec → architect → implement → review → wrapup`) with a human gate at every phase boundary, the `.adlc/` knowledge vault, per-tool adapters for Claude Code / Cursor / Copilot / Codex / Gemini CLI, and orchestrators (`/proceed`, `/ship`, `/sprint`), slim pipelines (`/bugfix`, `/task`), and utilities (`/status`, `/recover`, `/config`, `/analyze`, `/optimize`).
