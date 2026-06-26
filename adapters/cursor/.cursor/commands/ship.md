---
description: "Autonomous end-to-end pipeline. Runs /spec → /architect → /implement → /review → /wrapup like /proceed, but instead of pausing at each gate it routes the decision through the decision-maker agent, commits its work as it goes, and ends in a single terminal human review backed by a full audit log. Opt-in; conservative by default; never merges to main or rewrites history."
---

Toolkit root: .adlc-toolkit

Execute the ADLC **ship** protocol — defined in `.adlc-toolkit/core/skills/ship.md` — against the `.adlc/` vault in the current repository.

Read that file in full and follow **every step literally**. It is a protocol, not a guideline (ADLC ETHOS principle 5 — load `.adlc-toolkit/ETHOS.md`).

This skill relies on the agents (codebase-explorer, architecture-adversary, task-implementer, correctness-reviewer, quality-reviewer, architecture-reviewer, reflector, ui-reviewer, decision-maker). Cursor has no isolated read-only subagents — run each role sequentially in your own context, and honor a read-only agent's constraint by NOT editing files during its pass.

**Git policy:** follow `git.mode` in `.adlc/config.yml` (default `manual`). `manual` — never run git writes; read git state and draft commit/PR artifacts for the user. `commit` / `commit+push` — you may commit (and push, fast-forward only) the REQ's own feature branch once that phase's gate is approved. Never a protected branch, force-push, history rewrite, branch delete, `gh pr create`/`gh pr merge`, or `--no-verify` — in any mode.
