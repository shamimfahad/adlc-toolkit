---
description: "Slim ADLC pipeline for small changes — a tweak, a small feature, a contained refactor that's too small for /proceed's five phases but should still live in the vault. Triage → plan (gate) → implement → review + ship (gate). Self-triaging: recommends /proceed if the work is actually large, up front or mid-flight, without losing the REQ folder it created. Use instead of doing small work ad-hoc, so the vault still captures it."
---

Toolkit root: .adlc-toolkit

Execute the ADLC **task** protocol — defined in `.adlc-toolkit/core/skills/task.md` — against the `.adlc/` vault in the current repository.

Read that file in full and follow **every step literally**. It is a protocol, not a guideline (ADLC ETHOS principle 5 — load `.adlc-toolkit/ETHOS.md`).

**Gate:** this skill ends in an approval gate. Stop and wait for the user's explicit approval before anything proceeds past it. Do not auto-fix-and-continue on a gate failure — surface what failed and wait.

This skill relies on the agents (codebase-explorer, task-implementer, correctness-reviewer, reflector, ui-reviewer). Invoke the matching custom agents (use handoffs) or run each role sequentially.

**Git policy:** follow `git.mode` in `.adlc/config.yml` (default `manual`). `manual` — never run git writes; read git state and draft commit/PR artifacts for the user. `commit` / `commit+push` — you may commit (and push, fast-forward only) the REQ's own feature branch once that phase's gate is approved. Never a protected branch, force-push, history rewrite, branch delete, `gh pr create`/`gh pr merge`, or `--no-verify` — in any mode.
