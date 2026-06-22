---
name: config
description: View and change ADLC project settings in .adlc/config.yml — git policy, isolation, edit posture, external sources, autonomy dials, stack, protected branches, repos — through guided options, then re-sync any derived files. Also migrates an existing vault's config to pick up new keys after a toolkit update. Use to change how the pipeline behaves without hand-editing YAML. Vault-only; never commits.
---

You are viewing or changing this project's ADLC settings in `.adlc/config.yml`. This is a utility skill: no phase, no gate, no sub-agents. It edits **only** the vault, never source code, and never runs git.

It exists for one reason hand-editing YAML can't satisfy: some settings have a **derived twin** that must stay in sync (changing `git.mode` must also refresh the git-policy block in `.adlc/CLAUDE.md`). This skill owns "validate → write → re-sync → report."

## Preconditions

- `.adlc/config.yml` must exist. If it doesn't, tell the user to run `/init` first and stop.
- Determine `$TOOLKIT_PATH` (the "Toolkit root:" line in the command that invoked you) — needed to read canonical templates when re-syncing derived files.

## Modes of invocation

**A. Show (no arguments, or `show`).** Read `.adlc/config.yml` and print the current effective settings, grouped (see Output). Read-only — write nothing. End by listing the changeable keys so the user knows what they can set.

**B. Shortcut (`<key>=<value>`, may be repeated).** e.g. `/config git.mode=commit`, `/config workflow.isolation=worktree autonomy.gates=assisted`, `/config workflow.edits=confirm-each`, `/config sources.issues=github sources.repo=acme/web`. Validate each (see Settings catalog); if all valid, show the before→after and apply. Reject any invalid value by presenting its allowed options, and change nothing.

**C. Interactive (any other free text, or a bare request to "change settings").** Present the editable groups as labeled options (ETHOS principle 6 — use the assistant's structured-question UI if it has one). When the user picks a setting, present its **allowed values as options** with the current one marked. Confirm the before→after, then apply.

**D. Migrate (`migrate`, `update`, or "pick up new settings after updating the toolkit").** Add keys/blocks the toolkit has gained since this vault was created, without changing any existing value. See "Migrate" below. This is the supported way to refresh an existing `.adlc/` after a `git pull` of the toolkit — `/init` is one-shot and won't touch a populated vault.

In every mode, **confirm before writing** when a value actually changes: show `key: old → new` and any derived-file re-sync that will follow, and proceed only on explicit confirmation. There's no formal gate, but a settings change is consequential — don't write silently.

## Settings catalog

Validate against this. Allowed values are closed sets unless noted "free text."

| Key | Allowed values | Notes / validation |
|---|---|---|
| `project.name` | free text | non-empty |
| `project.description` | free text | one line |
| `git.mode` | `manual` \| `commit` \| `commit+push` | **derived-file sync** (see below). Lowering it below `autonomy.git` silently caps `/ship`; mention that. |
| `git.protect` | list of branch globs | must be non-empty; warn (don't block) if `main`/`master` is removed |
| `workflow.isolation` | `auto` \| `branch` \| `worktree` | explain the trade-off when changing (branch keeps the editor session; worktree tolerates a dirty checkout) |
| `workflow.edits` | `confirm-out-of-scope` \| `confirm-each` | in-phase edit friction for the implementer. `confirm-out-of-scope` = free inside the REQ's blast radius, stop at the edge; `confirm-each` = surface every write. **Phase gates are unaffected either way** — say so when changing. |
| `sources.issues` | `github` \| `linear` \| `jira` \| `none` | issue tracker `/spec` and `/bugfix` seed from. Setting non-`none` enables read-seeding (mechanism auto-resolved: CLI → MCP → URL). If set, prompt for `sources.repo` too. |
| `sources.design` | `figma` \| `none` | design tool `/architect` seeds UI/component specs from. |
| `sources.repo` | free text (`owner/name`) | default repo for bare refs like `/spec #8`. |
| `sources.write` | list — subset of the configured services | **default empty (reads only).** Listing a service enables gated write-back (`/wrapup`, `/bugfix` P5). **Warn before enabling:** this permits external writes (issue comments/transitions); every write is still drafted and approved at a gate, never silent. |
| `sources.mechanism` | `auto` \| `gh` \| `mcp` \| `url` | override the auto resolution order. Rarely needed; default `auto`. |
| `autonomy.gates` | `manual` \| `assisted` \| `auto` | only consumed by `/ship` |
| `autonomy.git` | `read-only` \| `commit` \| `commit+push` | **capped by `git.mode`** — refuse to set it higher than `git.mode` (offer to raise `git.mode` too, or set the capped value) |
| `autonomy.sources` | `read-only` \| `write` | only consumed by `/ship`. **Capped by `sources.write`** — refuse to set `write` if `sources.write` is empty (offer to populate it first). External writes are hard-stop-eligible. |
| `autonomy.escalation` | `cautious` \| `balanced` \| `aggressive` | decision-maker bias |
| `autonomy.rework_cap_per_gate` | integer ≥ 0 | |
| `autonomy.rework_budget_total` | integer ≥ 0 | |
| `autonomy.confidence_floor` | number 0.0–1.0 | |
| `autonomy.hard_stops` | list | free-text categories; keep the safety defaults unless the user is explicit |
| `autonomy.notify.on_halt` / `.on_complete` | `true` \| `false` | |
| `stack.languages` / `.frontends` / `.backends` / `.databases` | list | free text |
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
6. **Report.** List what was added (and what was already current), append one `.adlc/hot.md` line: `## [DATE] config-migrate | added: <keys/blocks>`, and remind the user that newly added blocks are inert until they set a value (e.g. "run `/config sources.issues=github` to start seeding from GitHub").

If the project config is already current, say so and write nothing.

## Derived-file sync

After writing config, refresh anything that mirrors a setting:

- **`git.mode` → `.adlc/CLAUDE.md` "### Git policy" section.** Replace that section's body with the canonical version from `$TOOLKIT_PATH/templates/vault/CLAUDE.md` (it already describes all three modes and the invariants, keyed off `git.mode`, so it's correct for any value). If the user's `.adlc/CLAUDE.md` has local edits around it, replace only the `### Git policy` section, not the whole file.

No other setting currently has a derived file — `workflow.isolation`, `workflow.edits`, the `sources.*` block, and the `autonomy.*` dials are all read from `config.yml` at runtime (by `/implement`, the seed/write-back steps, and `/ship` respectively). If a future setting gains a derived twin, extend this section.

## After applying

1. Echo a concise summary: each `key: old → new`, plus any derived file re-synced.
2. Append one line to `.adlc/hot.md`: `## [DATE] config | <key>=<value>[, …]`.
3. If `git.mode` changed to `commit` or `commit+push`, remind the user of the invariants that still hold (feature branch only; never a `protect:` branch, force-push, history rewrite, branch delete, PR create/merge, or `--no-verify`).
4. If you changed settings that only `/ship` reads (`autonomy.*`), note they take effect on the next `/ship` run.

## Constraints

- **Vault-only.** Write nothing outside `.adlc/`. Never modify source files.
- **Never run git** — not even when `git.mode` is `commit`/`commit+push`. Config changes are meta; the user commits `.adlc/` themselves. Stage/commit is out of scope for this skill in every mode.
- **No agents, no gates.** Fast and synchronous.
- **Validate before writing.** An invalid value changes nothing — present the allowed options instead.
- **Confirm consequential changes.** Show before→after and proceed on explicit confirmation.
- **Don't reformat** the file or reorder keys. Minimal diffs only.

## Output

The edited `.adlc/config.yml` (minimal diff), a possibly-updated `.adlc/CLAUDE.md` git-policy section, one `hot.md` line, and a change summary in chat. In show mode: nothing written, current settings printed in chat. In migrate mode: additive insertions only (missing blocks/keys with their template comments), a `config-migrate` line in `hot.md`, and a summary of what was added vs. already current.
