# roadmap · resync

`/roadmap resync` — the plan exists and something it was built from has changed. Change what follows from that, and nothing else.

## Triggers

- A source was edited (a requirement changed, an item was added or dropped, an external input's status changed).
- The item that settles the project's structure merged, so `Touches` can move from components to paths.
- The user accepted a challenge row after the plan was approved.

## Steps

1. **Find the difference.** Re-read the changed source and compare it with what the plan recorded: item by item, by source ID. If the earlier version of the source is not available, compare against the drafts' `Source` and content, and say that this is what you compared.
2. **List what moves** before changing anything, as a table: source change → items affected → what changes in each (title, criteria, dependency, phase, gate, `Touches`). Include the items whose position in the graph shifts because of someone else's change.
3. **Sort the affected items by state.** Decide "in flight" from every signal, not the draft alone — from the base checkout a started item's draft can still read `planned`. Treat a draft as *promoted, REQ in flight* when its `Status` says so, **or** an active REQ folder on this machine has `"plan": "pl-NNN"` for it, **or** its issue is assigned. When there are several developers and no tracker, say that a teammate's started items cannot be seen and ask before editing any draft.

   | Draft status | What you may do |
   |---|---|
   | `planned` | Edit the draft |
   | `promoted`, REQ in flight | Do not edit. List it under "needs its owner's attention" with the exact change; the person running that REQ revises it at their gate |
   | `promoted`, REQ merged | Do not edit. If the change matters, it is a new item |

4. **Plan gate.** One gate: the table from step 2, the sorted list from step 3, and any new items with their plan IDs. Options: `approve`, `revise <what>`, `abort`.
5. **Apply on approve.** Edit the `planned` drafts; add new drafts; rewrite the affected rows, graph and critical path in `roadmap.md`; add one row to its "Source changes" table: what changed in the source, and its effect on the plan. Append to `hot.md`: `## [DATE] plan-resync | <what changed> | <n> items`.
6. **Note what the source still needs.** If the plan changed something the source should also carry (the source is the user's file, kept elsewhere), list those edits for the user to make. Do not edit the user's source.

## Constraints

- Items the change does not reach are not touched: not reworded, not renumbered.
- A plan ID is never reused, even when its item is dropped. A dropped item's draft stays, with `Status: dropped` and the reason.
