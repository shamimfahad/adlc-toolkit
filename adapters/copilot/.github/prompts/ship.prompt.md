---
description: "Autonomous end-to-end pipeline. Runs /spec → /architect → /implement → /review → /wrapup like /proceed, but instead of pausing at each gate it routes the decision through the decision-maker agent, commits its work as it goes, and ends in a single terminal human review backed by a full audit log. Opt-in; conservative by default; never merges to main or rewrites history."
---

Toolkit root: .adlc-toolkit

Execute the ADLC **ship** protocol — defined in `.adlc-toolkit/core/skills/ship.md` — against the `.adlc/` vault in the current repository.

Read that file in full and follow **every step literally**. It is a protocol, not a guideline (ADLC ETHOS principle 5 — load `.adlc-toolkit/ETHOS.md`).

This skill relies on the agents (codebase-explorer, task-implementer, correctness-reviewer, quality-reviewer, architecture-reviewer, reflector, decision-maker). Invoke the matching custom agents (use handoffs) or run each role sequentially.

**Git policy:** never run git write commands (add, commit, push, merge, branch -d, gh pr create/merge, force-push). Read git state and draft commit/PR artifacts; the user runs all git themselves.
