---
description: "Standalone performance and cost audit. Dispatches the performance-scanner agent and produces a dated report in .adlc/audits/. Identifies LLM/API cost hotspots, DB performance issues, latency drivers, caching opportunities. No gates — read-only."
---

Toolkit root: .adlc-toolkit

Execute the ADLC **optimize** protocol — defined in `.adlc-toolkit/core/skills/optimize.md` — against the `.adlc/` vault in the current repository.

Read that file in full and follow **every step literally**. It is a protocol, not a guideline (ADLC ETHOS principle 5 — load `.adlc-toolkit/ETHOS.md`).

This skill relies on the agents (performance-scanner). Invoke the matching custom agents (use handoffs) or run each role sequentially.

**Git policy:** never run git write commands (add, commit, push, merge, branch -d, gh pr create/merge, force-push). Read git state and draft commit/PR artifacts; the user runs all git themselves.
