---
name: sprint
description: "Parallel multi-REQ orchestrator. Launches one pipeline-runner agent per REQ in an isolated worktree. Each runner pauses at its first gate; the orchestrator presents a unified queue of waiting gates across all REQs and lets the user triage them one at a time. Gate-pause model — preserves human-in-the-loop discipline while gaining cross-REQ parallelism."
---

Toolkit root: .adlc-toolkit

Execute the ADLC **sprint** protocol — defined in `.adlc-toolkit/core/skills/sprint.md` — against the `.adlc/` vault in the current repository.

Read that file in full and follow **every step literally**. It is a protocol, not a guideline (ADLC ETHOS principle 5 — load `.adlc-toolkit/ETHOS.md`).

This skill dispatches sub-agents (pipeline-runner). Run them as subagents and consolidate their reports.

**Git policy:** follow `git.mode` in `.adlc/config.yml` (default `manual`). `manual` — never run git writes; read git state and draft commit/PR artifacts for the user. `commit` / `commit+push` — you may commit (and push, fast-forward only) the REQ's own feature branch once that phase's gate is approved. Never a protected branch, force-push, history rewrite, branch delete, `gh pr create`/`gh pr merge`, or `--no-verify` — in any mode.
