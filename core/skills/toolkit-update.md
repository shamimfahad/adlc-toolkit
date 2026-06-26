---
name: toolkit-update
description: Update the ADLC toolkit install itself from upstream and reconcile every tool's adapters. Pulls new core/ engine changes, runs the idempotent installer (added skills linked, removed ones pruned), and — crucially — flags where your local/ overlay shadows an engine file upstream just changed. Operates on the toolkit repo, not a project vault. Use after "a new toolkit version is out" / "pull the latest ADLC" / "update my pipeline".
---

You are updating the **ADLC toolkit itself** — the engine at `$TOOLKIT_PATH`, not any project's `.adlc/` vault. This skill pulls upstream changes into the toolkit clone, then reconciles the per-tool adapters so every assistant picks up new/changed/removed skills and agents. It is a utility skill: no phase, no pipeline gate, no sub-agents — but it **runs git and the installer against the toolkit repo**, so it always shows the plan and waits for explicit approval before any write.

Its highest-value job: because `core/` is upstream-owned and your customizations live in `local/`, an upstream pull normally merges with zero conflicts. The one hazard is a `local/` file that **shadows** a `core/` file upstream has since improved — your override keeps winning silently. This skill surfaces exactly those cases.

## Scope and posture

- **Operates only on the toolkit repo** at `$TOOLKIT_PATH` (the "Toolkit root:" line in the command that invoked you). It never touches a project's source code, and the only thing it does to a project vault is *advise* running `/config migrate` afterward.
- **Git here is the toolkit's own git**, not a project's — the project `git.mode` invariants don't apply. Even so: only fast-forward or a clean merge/rebase of upstream onto the local clone; **never** force-push, rewrite history, or push anything. If the pull can't be clean, stop and surface (see "If the pull won't be clean").
- **Confirm before every write** — the `git pull` and the `sync` are each shown as a plan and run only on approval.

## Preconditions

1. Resolve `$TOOLKIT_PATH` and confirm it's a git working tree (`git -C "$TOOLKIT_PATH" rev-parse --is-inside-work-tree`). If it isn't (e.g. the toolkit was downloaded as a zip, or vendored as per-project `.adlc-toolkit` copies), tell the user updates must come as a fresh download / per-copy replace, and stop.
2. Identify the upstream remote: prefer a remote named `upstream`, else `origin`. If neither exists, show the remotes and ask which to pull from (or how to add one), then stop until told.
3. Note the current state: `git -C "$TOOLKIT_PATH" rev-parse --short HEAD`, the current branch, and the toolkit version (`core/manifest.json` → `version`). If the working tree is dirty, surface it — uncommitted changes in `core/` are a sign the user edited the engine directly (they should be in `local/`); offer to stash, abort, or continue.

## Steps

### 1. Fetch and preview what's incoming

- `git -C "$TOOLKIT_PATH" fetch <remote> --tags`.
- Choose a target: the latest release tag (recommended — stable) or the remote's default branch tip. Show both options.
- Summarize the delta between current HEAD and the target:
  - `git -C "$TOOLKIT_PATH" log --oneline <HEAD>..<target>` for the commit list.
  - If `CHANGELOG.md` exists, show the entries added in that range and **call out anything labeled breaking, protocol, or vault-format** — those are the changes that may need follow-up.
  - The set of skills/agents added or removed: diff `core/manifest.json` (and `core/skills/`, `core/agents/` file lists) between HEAD and target. State plainly: "adds X, removes Y, changes Z."

### 2. Surface overlay shadow risk (the important check)

For every file under `local/skills/` and `local/agents/` that **shadows** a core file of the same name, check whether that core file is modified in the incoming range:

```
git -C "$TOOLKIT_PATH" diff --name-only <HEAD>..<target> -- core/skills/<name>.md core/agents/<name>.md
```

For each shadowed core file that changed upstream, list it as **needs review**: "`local/skills/<name>.md` overrides an engine file that upstream just changed — your override will keep shadowing it. Review the upstream diff and fold anything worth keeping into your local copy." Show the upstream diff on request. This is advisory — it never edits `local/` for the user.

Also flag any `local/manifest.json` entry that `disabled`s or overrides a skill/agent the upstream range **removed or renamed** (the override is now dangling).

### 3. Decide and pull (gated)

Present the choice as options (ETHOS principle 6 — use the assistant's structured-question UI if it has one):

- **Update to `<latest-tag>` (Recommended)** — stable, changelog-backed.
- **Update to `<branch>` tip** — newest, unreleased.
- **Cancel** — change nothing.

On approval, pull. Because the user customizes via `local/` and never edits `core/`, a `git -C "$TOOLKIT_PATH" pull --ff-only <remote> <ref>` should fast-forward cleanly; if the local branch has diverged by commits that are purely additive in `local/`, a plain merge is fine. Show the exact git command before running it.

### 4. Reconcile every install

Run the idempotent installer so adapters match the new engine:

```
node "$TOOLKIT_PATH/scripts/adlc.mjs" sync --tool=all
```

If the user only uses some tools, offer `--tool=<theirs>` instead. `sync` cleanly regenerates `dist/`, links added skills/agents, prunes removed ones, and re-points any overrides — report its added/removed/pruned summary. (Optionally, to refresh the committed portable snapshot, also run `node "$TOOLKIT_PATH/scripts/adlc.mjs" build` — only relevant if the user maintains/commits `adapters/`.)

### 5. Per-project follow-up

The toolkit update does **not** reach into project vaults. Tell the user:

- New `config.yml` settings won't appear automatically. In each active project, run **`/config migrate`** to scaffold any new keys additively (it never changes existing values).
- If the CHANGELOG flagged a **vault-format** change, point them at the relevant note and, if applicable, suggest `/recover` in affected projects to reconcile.

## If the pull won't be clean

A merge conflict on `core/` means someone edited the engine directly — exactly what the `local/` overlay exists to avoid. Do **not** force or auto-resolve. Stop and surface: show the conflicting files, and recommend moving those edits into `local/` (a same-named override file) so future pulls stay clean, then retrying. Offer to abort the pull (`git -C "$TOOLKIT_PATH" merge --abort` / restore prior HEAD) so the toolkit is left exactly as it was.

## Report

End with a concise summary:

- Version / ref: `<old>` → `<new>`.
- Skills/agents: added, removed, changed.
- Overrides needing review (from step 2), if any.
- Reconcile result (tools synced, links added/pruned).
- Follow-ups: run `/config migrate` per project; any vault-format notes.

## Constraints

- **Toolkit repo only.** Never modify project source or vaults; the only project-facing action is *advising* `/config migrate`.
- **No history rewriting, no push, no force.** Fast-forward or clean merge of upstream into the local clone; nothing else.
- **Confirm before every write** — the fetch is safe and may run unprompted, but the pull and the sync are each shown and approved first.
- **No agents, no pipeline gate.** Fast and synchronous; the approvals here are this skill's own, not phase gates.
