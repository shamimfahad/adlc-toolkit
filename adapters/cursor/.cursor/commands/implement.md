---
description: "Execute the task DAG for a REQ. Phase 3 of /proceed. Dispatches task-implementer agents (tier-based parallel where possible), drafts commit messages to commits-draft.md, runs tests, then ends in the implement gate."
---

Toolkit root: .adlc-toolkit

Execute the ADLC **implement** protocol — defined in `.adlc-toolkit/core/skills/implement.md` — against the `.adlc/` vault in the current repository.

Read that file in full and follow **every step literally**. It is a protocol, not a guideline (ADLC ETHOS principle 5 — load `.adlc-toolkit/ETHOS.md`).

**Gate:** this skill ends in an approval gate. Stop and wait for the user's explicit approval before anything proceeds past it. Do not auto-fix-and-continue on a gate failure — surface what failed and wait.

This skill relies on the agents (task-implementer). Cursor has no isolated read-only subagents — run each role sequentially in your own context, and honor a read-only agent's constraint by NOT editing files during its pass.

**Git policy:** never run git write commands (add, commit, push, merge, branch -d, gh pr create/merge, force-push). Read git state and draft commit/PR artifacts; the user runs all git themselves.
