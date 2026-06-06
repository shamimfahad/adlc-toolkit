---
name: analyze
description: Standalone codebase health audit. Dispatches the health-auditor agent and produces a dated report in .adlc/audits/. No pipeline state, no gates — read-only audit that you run periodically or on demand.
---

Toolkit root: .adlc-toolkit

Execute the ADLC **analyze** protocol — defined in `.adlc-toolkit/core/skills/analyze.md` — against the `.adlc/` vault in the current repository.

Read that file in full and follow **every step literally**. It is a protocol, not a guideline (ADLC ETHOS principle 5 — load `.adlc-toolkit/ETHOS.md`).

This skill dispatches sub-agents (health-auditor). Run them as subagents and consolidate their reports.

**Git policy:** never run git write commands (add, commit, push, merge, branch -d, gh pr create/merge, force-push). Read git state and draft commit/PR artifacts; the user runs all git themselves.
