---
description: "Reconcile pipeline-state.json against git reality for one, several, or all in-flight REQs and bugs. Diagnoses each as in-sync, stale-state, abandoned, sprint-stuck, or divergent, then surfaces a triage queue and back-fills the vault for REQs whose code shipped without /wrapup running. Read-only on code and git; vault-only writes."
---

Toolkit root: .adlc-toolkit

Execute the ADLC **recover** protocol — defined in `.adlc-toolkit/core/skills/recover.md` — against the `.adlc/` vault in the current repository.

Read that file in full and follow **every step literally**. It is a protocol, not a guideline (ADLC ETHOS principle 5 — load `.adlc-toolkit/ETHOS.md`).

**Paths:** `.adlc-toolkit/core/VAULT-LAYOUT.md` owns where work records live under `.adlc/specs`, `.adlc/bugs`, and `.adlc/sprints`. A vault may hold flat and month-bucketed folders at the same time, so never hard-code a path under those trees — resolve it.

**Git policy:** follow `git.mode` in `.adlc/config.yml` (default `manual`). `manual` — never run git writes; read git state and draft commit/PR artifacts for the user. `commit` / `commit+push` — you may commit (and push, fast-forward only) the REQ's own feature branch once that phase's gate is approved. Never a protected branch, force-push, history rewrite, branch delete, `gh pr create`/`gh pr merge`, or `--no-verify` — in any mode.
