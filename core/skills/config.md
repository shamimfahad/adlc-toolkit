---
name: config
description: View and change ADLC project settings in .adlc/config.yml — git policy, isolation, autonomy dials, stack, protected branches, repos — through guided options, then re-sync any derived files. Use to change how the pipeline behaves without hand-editing YAML. Vault-only; never commits.
---

You are viewing or changing this project's ADLC settings in `.adlc/config.yml`. This is a utility skill: no phase, no gate, no sub-agents. It edits **only** the vault, never source code, and never runs git.

It exists for one reason hand-editing YAML can't satisfy: some settings have a **derived twin** that must stay in sync (changing `git.mode` must also refresh the git-policy block in `.adlc/CLAUDE.md`). This skill owns "validate → write → re-sync → report."

## Preconditions

- `.adlc/config.yml` must exist. If it doesn't, tell the user to run `/init` first and stop.
- Determine `$TOOLKIT_PATH` (the "Toolkit root:" line in the command that invoked you) — needed to read canonical templates when re-syncing derived files.

## Modes of invocation

**A. Show (no arguments, or `show`).** Read `.adlc/config.yml` and print the current effective settings, grouped (see Output). Read-only — write nothing. End by listing the changeable keys so the user knows what they can set.

**B. Shortcut (`<key>=<value>`, may be repeated).** e.g. `/config git.mode=commit`, `/config workflow.isolation=worktree autonomy.gates=assisted`. Validate each (see Settings catalog); if all valid, show the before→after and apply. Reject any invalid value by presenting its allowed options, and change nothing.

**C. Interactive (any other free text, or a bare request to "change settings").** Present the editable groups as labeled options (ETHOS principle 6 — use the assistant's structured-question UI if it has one). When the user picks a setting, present its **allowed values as options** with the current one marked. Confirm the before→after, then apply.

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
| `autonomy.gates` | `manual` \| `assisted` \| `auto` | only consumed by `/ship` |
| `autonomy.git` | `read-only` \| `commit` \| `commit+push` | **capped by `git.mode`** — refuse to set it higher than `git.mode` (offer to raise `git.mode` too, or set the capped value) |
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

## Derived-file sync

After writing config, refresh anything that mirrors a setting:

- **`git.mode` → `.adlc/CLAUDE.md` "### Git policy" section.** Replace that section's body with the canonical version from `$TOOLKIT_PATH/templates/vault/CLAUDE.md` (it already describes all three modes and the invariants, keyed off `git.mode`, so it's correct for any value). If the user's `.adlc/CLAUDE.md` has local edits around it, replace only the `### Git policy` section, not the whole file.

No other setting currently has a derived file — `workflow.isolation` and the `autonomy.*` dials are read from `config.yml` at runtime. If a future setting gains a derived twin, extend this section.

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

The edited `.adlc/config.yml` (minimal diff), a possibly-updated `.adlc/CLAUDE.md` git-policy section, one `hot.md` line, and a change summary in chat. In show mode: nothing written, current settings printed in chat.
