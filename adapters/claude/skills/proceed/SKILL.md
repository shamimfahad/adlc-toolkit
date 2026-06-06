---
name: proceed
description: End-to-end pipeline orchestrator. Runs /spec → /architect → /implement → /review → /wrapup in sequence with gate-pause between every phase. Resumable from any phase via pipeline-state.json. Use this when you want the full pipeline rather than invoking each phase skill separately.
---

Toolkit root: .adlc-toolkit

Execute the ADLC **proceed** protocol — defined in `.adlc-toolkit/core/skills/proceed.md` — against the `.adlc/` vault in the current repository.

Read that file in full and follow **every step literally**. It is a protocol, not a guideline (ADLC ETHOS principle 5 — load `.adlc-toolkit/ETHOS.md`).

This skill dispatches sub-agents (codebase-explorer, task-implementer, correctness-reviewer, quality-reviewer, architecture-reviewer, reflector). Run them as subagents and consolidate their reports.

**Git policy:** never run git write commands (add, commit, push, merge, branch -d, gh pr create/merge, force-push). Read git state and draft commit/PR artifacts; the user runs all git themselves.
