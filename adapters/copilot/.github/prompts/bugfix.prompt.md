---
description: "Streamlined pipeline for bug fixes. Slimmer than /proceed — bug report → investigate → fix → verify → ship, with gates between each. Use for defects, not for new features. Larger or scope-creeping bugs should be re-framed as a REQ via /spec."
---

Toolkit root: .adlc-toolkit

Execute the ADLC **bugfix** protocol — defined in `.adlc-toolkit/core/skills/bugfix.md` — against the `.adlc/` vault in the current repository.

Read that file in full and follow **every step literally**. It is a protocol, not a guideline (ADLC ETHOS principle 5 — load `.adlc-toolkit/ETHOS.md`).

**Gate:** this skill ends in an approval gate. Stop and wait for the user's explicit approval before anything proceeds past it. Do not auto-fix-and-continue on a gate failure — surface what failed and wait.

This skill relies on the agents (codebase-explorer, task-implementer). Invoke the matching custom agents (use handoffs) or run each role sequentially.

**Git policy:** never run git write commands (add, commit, push, merge, branch -d, gh pr create/merge, force-push). Read git state and draft commit/PR artifacts; the user runs all git themselves.
