# roadmap · challenge

Before the user sees the plan, have it attacked by someone who did not write it, against what is true today. Output: rows on the gate 3 card, and `.adlc/plan/challenge-log.md`.

The user will reject most suggestions that could be made about any project. This pass exists to find the few that are about *this* one.

## 1. Dispatch

Dispatch the `plan-challenger` agent, once per lens, in a single message so they run together. Dispatch by exact agent name; if it is not installed, stop and say so (run the toolkit sync) — do not do its work in this session, which wrote the plan and cannot review it independently.

| Lens | The question |
|---|---|
| Platform facts | Is anything the plan assumes about a platform, API, store rule, SDK or service no longer true, or about to change? |
| Alternatives | Is there a materially cheaper or safer way to reach one of the plan's outcomes, available now? |
| Sequencing | Is a dependency missing, backwards, or unnecessary? Is the critical path really the longest chain? |
| Risk | Which external gate or go/no-go point has no workable fallback? |

`feature`-size runs dispatch the platform-facts and sequencing lenses only.

Give each: the roadmap, the item table, the drafts' paths, the role table from intake, the source excerpts, `challenge-log.md` if it exists, and its one lens. The agent returns its report as its final message; nothing is written under `plan/` until you record the verdicts in step 4.

On an assistant without isolated sub-agents, run the lenses yourself one at a time and label the card **"challenge pass: not independent"**.

## 2. Admit a row only if it passes all four

For every suggestion that comes back:

1. **It quotes the plan line or source line it contradicts** — item ID and the words.
2. **It quotes or links what it found** — the page, the changelog entry, the document, with enough to check it.
3. **It fails the swap test:** read the suggestion with this project's name removed. If it would be equally good advice for an unrelated project, drop it. Naming an item ID does not make a suggestion specific.
4. **It is not in `challenge-log.md` as rejected.**

Check 1 and 2 yourself: open the quoted line, open the link. A row whose quote does not match is dropped, and you say how many were dropped and why, in one line.

Cap the card at the seven strongest rows. The rest are counted, not shown.

## 3. Present

One table at gate 3:

| # | Lens | Plan line | What was found | Change it would make | Cost of the change |
|---|---|---|---|---|---|

Nothing is applied yet. The user answers per row: `accept 1 4`, or approve the plan as it is.

## 4. Record

- An accepted row is applied to the roadmap and drafts it names, with `Added by Claude` on the changed line and the row number. A draft that is in flight (by the same three signals `resync` step 3 uses) is not edited: the change is listed for whoever is running that REQ.
- Every row shown, accepted or not, is appended to `challenge-log.md` with the verdict. Rejected rows are never raised again in a later run, including by `/roadmap challenge`.
