# roadmap · frame

Selected when no source states the problem, who it is for, and where the scope stops. Output: `.adlc/plan/brief.md`, one page.

## 1. Interview

Ask only what the sources do not answer. Two or three questions a round, the highest-impact first, each as discrete options with a trade-off and one marked recommended (ETHOS: offer choices). Stop when another round would not change the item list.

What the brief needs:

- **Problem** — what hurts today and for whom, in the user's words.
- **Outcome** — what is true when this is done. Observable.
- **Users** — who uses it, and who else is affected.
- **Non-goals** — what this plan will not do. At least two.
- **Constraints** — platform, stack, things already decided, things that must not change.
- **Verification limits** — what cannot be checked automatically in this project.
- **Open questions for the client or stakeholder** — each with what it blocks.

## 2. Write the brief

Use the headings above. No solution design, no item list, no dates. Mark anything you supplied yourself `Added by Claude`.

If there is a client or stakeholder outside the team, the open questions are the part they will read. Write each so it can be sent as-is: the question, why it matters, what you will assume if no answer comes.

## 3. Settled decisions

Each decision the user confirms here that constrains how the product is built is written as an ADR in the vault (status `accepted`, with the user's reason). Decisions the user is still weighing stay as open questions. Do not record a preference as a decision.
