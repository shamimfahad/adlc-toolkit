---
description: "End-to-end pipeline orchestrator. Runs /spec → /architect → /implement → /review → /wrapup in sequence with gate-pause between every phase. Resumable from any phase via pipeline-state.json. Use this when you want the full pipeline rather than invoking each phase skill separately."
---

Toolkit root: .adlc-toolkit

Execute the ADLC **proceed** protocol — defined in `.adlc-toolkit/core/skills/proceed.md` — against the `.adlc/` vault in the current repository.

Read that file in full and follow **every step literally**. It is a protocol, not a guideline (ADLC ETHOS principle 5 — load `.adlc-toolkit/ETHOS.md`).

This skill relies on the agents (codebase-explorer, task-implementer, correctness-reviewer, quality-reviewer, architecture-reviewer, reflector). Cursor has no isolated read-only subagents — run each role sequentially in your own context, and honor a read-only agent's constraint by NOT editing files during its pass.

**Git policy:** follow `git.mode` in `.adlc/config.yml` (default `manual`). `manual` — never run git writes; read git state and draft commit/PR artifacts for the user. `commit` / `commit+push` — you may commit (and push, fast-forward only) the REQ's own feature branch once that phase's gate is approved. Never a protected branch, force-push, history rewrite, branch delete, `gh pr create`/`gh pr merge`, or `--no-verify` — in any mode.
