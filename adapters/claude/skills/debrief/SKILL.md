---
name: debrief
description: "Writes debrief.md — the story of one REQ in eight labelled sections, a pointer on every claim — pitched to who will read it and how cold they are, judged from the trail. Runnable at any phase; /wrapup runs it before the ship card. No gate, no marker, no git writes."
---

Toolkit root: .adlc-toolkit
(If that folder doesn't exist on this machine, read `toolkit.path` from `.adlc/local.yml` — this developer's own, gitignored; inside a git worktree it is in the main checkout: `$(git rev-parse --path-format=absolute --git-common-dir)/../.adlc/local.yml`. Use that path in place of the root everywhere below. If neither exists, ask the user where their toolkit clone is and offer to record it there.)

Execute the ADLC **debrief** protocol — defined in `.adlc-toolkit/core/skills/debrief.md` — against the `.adlc/` vault in the current repository.

Read that file in full and follow **every step literally**. It is a protocol, not a guideline (ADLC ETHOS principle 5 — load `.adlc-toolkit/ETHOS.md`).

**Paths:** `.adlc-toolkit/core/VAULT-LAYOUT.md` owns where work records live under `.adlc/specs`, `.adlc/bugs`, and `.adlc/sprints`. A vault may hold flat and month-bucketed folders at the same time, so never hard-code a path under those trees — resolve it.

**Git policy:** follow `git.mode` in `.adlc/config.yml` (default `manual`). `manual` — never run git writes; read git state and draft commit/PR artifacts for the user. `commit` / `commit+push` — you may commit (and push, fast-forward only) the REQ's own feature branch once that phase's gate is approved. Never a protected branch, force-push, history rewrite, branch delete, `gh pr create`/`gh pr merge`, or `--no-verify` — in any mode.
