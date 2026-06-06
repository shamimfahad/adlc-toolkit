---
description: "Parallel multi-REQ orchestrator. Launches one pipeline-runner agent per REQ in an isolated worktree. Each runner pauses at its first gate; the orchestrator presents a unified queue of waiting gates across all REQs and lets the user triage them one at a time. Gate-pause model — preserves human-in-the-loop discipline while gaining cross-REQ parallelism."
---

Toolkit root: .adlc-toolkit

Execute the ADLC **sprint** protocol — defined in `.adlc-toolkit/core/skills/sprint.md` — against the `.adlc/` vault in the current repository.

Read that file in full and follow **every step literally**. It is a protocol, not a guideline (ADLC ETHOS principle 5 — load `.adlc-toolkit/ETHOS.md`).

This skill relies on the agents (pipeline-runner). Cursor has no isolated read-only subagents — run each role sequentially in your own context, and honor a read-only agent's constraint by NOT editing files during its pass.

**Git policy:** never run git write commands (add, commit, push, merge, branch -d, gh pr create/merge, force-push). Read git state and draft commit/PR artifacts; the user runs all git themselves.
