---
description: "Final phase of /proceed. Drafts the PR (title, body, change summary), updates the vault (lessons, gotchas, index, hot, decisions, concepts, components), and prints the git/gh checklist for the user to run. Claude does NOT commit, push, PR, or merge."
---

Toolkit root: .adlc-toolkit

Execute the ADLC **wrapup** protocol — defined in `.adlc-toolkit/core/skills/wrapup.md` — against the `.adlc/` vault in the current repository.

Read that file in full and follow **every step literally**. It is a protocol, not a guideline (ADLC ETHOS principle 5 — load `.adlc-toolkit/ETHOS.md`).

**Gate:** this skill ends in an approval gate. Stop and wait for the user's explicit approval before anything proceeds past it. Do not auto-fix-and-continue on a gate failure — surface what failed and wait.

**Git policy:** never run git write commands (add, commit, push, merge, branch -d, gh pr create/merge, force-push). Read git state and draft commit/PR artifacts; the user runs all git themselves.
