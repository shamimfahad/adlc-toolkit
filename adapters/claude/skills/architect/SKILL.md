---
name: architect
description: "Design the architecture and task breakdown for a REQ. Phase 2 of /proceed. Dispatches codebase-explorer to inform the design, then drafts architecture.md and tasks/TASK-*.md. Ends in the architecture gate — user must approve before /implement."
---

Toolkit root: .adlc-toolkit

Execute the ADLC **architect** protocol — defined in `.adlc-toolkit/core/skills/architect.md` — against the `.adlc/` vault in the current repository.

Read that file in full and follow **every step literally**. It is a protocol, not a guideline (ADLC ETHOS principle 5 — load `.adlc-toolkit/ETHOS.md`).

**Gate:** this skill ends in an approval gate. Stop and wait for the user's explicit approval before anything proceeds past it. Do not auto-fix-and-continue on a gate failure — surface what failed and wait.

This skill dispatches sub-agents (codebase-explorer). Run them as subagents and consolidate their reports.

**Git policy:** never run git write commands (add, commit, push, merge, branch -d, gh pr create/merge, force-push). Read git state and draft commit/PR artifacts; the user runs all git themselves.
