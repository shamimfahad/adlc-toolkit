---
name: review
description: Multi-perspective code review for a REQ. Phase 4 of /proceed. Dispatches 4 read-only review agents in parallel (correctness, quality, architecture, reflector), consolidates findings by severity, and ends in the verify gate.
---

Toolkit root: .adlc-toolkit

Execute the ADLC **review** protocol — defined in `.adlc-toolkit/core/skills/review.md` — against the `.adlc/` vault in the current repository.

Read that file in full and follow **every step literally**. It is a protocol, not a guideline (ADLC ETHOS principle 5 — load `.adlc-toolkit/ETHOS.md`).

**Gate:** this skill ends in an approval gate. Stop and wait for the user's explicit approval before anything proceeds past it. Do not auto-fix-and-continue on a gate failure — surface what failed and wait.

This skill dispatches sub-agents (correctness-reviewer, quality-reviewer, architecture-reviewer, reflector). Run them as subagents and consolidate their reports.

**Git policy:** never run git write commands (add, commit, push, merge, branch -d, gh pr create/merge, force-push). Read git state and draft commit/PR artifacts; the user runs all git themselves.
