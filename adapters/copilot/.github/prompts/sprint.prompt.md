---
description: "Parallel multi-REQ orchestrator. Launches one pipeline-runner agent per REQ in an isolated worktree. Each runner pauses at its first gate; the orchestrator maintains a unified queue of waiting gates across all REQs. Who clears that queue follows the autonomy.gates dial — the user (manual, default), the user with a decision-maker recommendation attached (assisted), or the decision-maker itself with only exceptions surfacing (auto)."
---

Toolkit root: .adlc-toolkit

Execute the ADLC **sprint** protocol — defined in `.adlc-toolkit/core/skills/sprint.md` — against the `.adlc/` vault in the current repository.

Read that file in full and follow **every step literally**. It is a protocol, not a guideline (ADLC ETHOS principle 5 — load `.adlc-toolkit/ETHOS.md`).

**Paths:** `.adlc-toolkit/core/VAULT-LAYOUT.md` owns where work records live under `.adlc/specs`, `.adlc/bugs`, and `.adlc/sprints`. A vault may hold flat and month-bucketed folders at the same time, so never hard-code a path under those trees — resolve it.

This skill relies on the agents (pipeline-runner, decision-maker). Invoke the matching custom agents (use handoffs) or run each role sequentially.

**Git policy:** follow `git.mode` in `.adlc/config.yml` (default `manual`). `manual` — never run git writes; read git state and draft commit/PR artifacts for the user. `commit` / `commit+push` — you may commit (and push, fast-forward only) the REQ's own feature branch once that phase's gate is approved. Never a protected branch, force-push, history rewrite, branch delete, `gh pr create`/`gh pr merge`, or `--no-verify` — in any mode.
