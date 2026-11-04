# ADLC Toolkit — pipeline conventions

This repository uses the **ADLC toolkit**: a spec-driven development pipeline with a human approval gate at every phase boundary. You are running inside GitHub Copilot.

**Knowledge vault:** `.adlc/` holds specs, architecture, conventions, decisions (ADRs), lessons, gotchas, and glossary. Read `.adlc/context/conventions.md`, `.adlc/context/project-overview.md`, and `.adlc/now.md` before non-trivial work. The toolkit itself lives at `.adlc-toolkit/`. Work records under `specs/`, `bugs/`, and `sprints/` may be flat or bucketed by month and author — `.adlc-toolkit/core/VAULT-LAYOUT.md` is the only place that grammar is written down; resolve paths through it rather than assuming a shape.

**The seven principles (full text: `.adlc-toolkit/ETHOS.md`):**
1. **You decide; the assistant drafts.** Every phase boundary pauses for the user. Git writes follow `.adlc/config.yml` → `git.mode` (default `manual` = the assistant drafts; you run git).
2. **Spec first, code second.** Never implement without a validated spec.
3. **Read-only reviewers.** Review/audit agents are read-only on your code — they write only their own findings, never source. The user decides what gets fixed.
4. **Knowledge compounds.** Every change leaves the vault smarter — lessons, gotchas, concepts, ADRs.
5. **Process is explicit.** Skill steps are a protocol, not a guideline. No shortcuts; no `--no-verify`.
6. **Offer choices, don't ask open-ended questions.** When you need a decision from the user, present discrete labeled options with a recommendation. A gate ends your turn and waits for the reply, never a question dialog; for other choices, on Claude use `AskUserQuestion`, elsewhere a short numbered list inline. The user can always go off-menu.
7. **Speak plainly.** Everything shown to the user follows `.adlc-toolkit/core/VOICE.md`: everyday words, toolkit terms glossed on first use, machine tags beside a plain sentence, every option stating its consequence.

**Git policy — set by `.adlc/config.yml` → `git.mode` (default `manual`):** In `manual`, never run git writes — read git state and draft the commit message, PR body, and merge checklist for the user. In `commit`, you may `git add`/`git commit` on the REQ's feature branch after that phase's gate is approved; in `commit+push`, you also `git push` that branch (fast-forward only). **Invariant in every mode:** only the REQ's own feature branch — never a protected branch (`git.protect`, e.g. main/master/release/*), never force-push, rebase, amend published commits, `reset --hard` away commits, delete branches, `gh pr create`/`gh pr merge`, or `--no-verify`. Where any skill or agent below says "the user commits" or "never commit," that is the `manual`-mode description.

**Workflow:** `spec → architect → implement → review → wrapup`, each ending in a gate. Run the commands below, or the whole pipeline with `proceed`. Bugs use `bugfix`. **Small changes use `task`** — a slim two-gate pipeline that still writes a REQ to the vault and escalates to `proceed` if the work turns out large, so small work is never done outside the ADLC. See per-command stubs for how each maps in GitHub Copilot.