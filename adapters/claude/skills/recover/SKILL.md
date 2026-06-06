---
name: recover
description: "Reconcile pipeline-state.json against git reality for one, several, or all in-flight REQs and bugs. Diagnoses each as in-sync, stale-state, abandoned, sprint-stuck, or divergent, then surfaces a triage queue and back-fills the vault for REQs whose code shipped without /wrapup running. Read-only on code and git; vault-only writes."
---

Toolkit root: .adlc-toolkit

Execute the ADLC **recover** protocol — defined in `.adlc-toolkit/core/skills/recover.md` — against the `.adlc/` vault in the current repository.

Read that file in full and follow **every step literally**. It is a protocol, not a guideline (ADLC ETHOS principle 5 — load `.adlc-toolkit/ETHOS.md`).

**Git policy:** never run git write commands (add, commit, push, merge, branch -d, gh pr create/merge, force-push). Read git state and draft commit/PR artifacts; the user runs all git themselves.
