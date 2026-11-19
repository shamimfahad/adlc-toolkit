# roadmap · breakdown

Turn the work into items, each of which will become one REQ. Output: the item table shown at plan gate 2 (it is written into `roadmap.md` by the `roadmap` module).

## 1. Start from the source's own items

If a source already lists work items, the default is **one plan item per source item**. Do not regroup a source's breakdown into a shape you prefer.

If no source lists them, derive items from the brief or the product statement: one item per outcome a user or a caller can observe, cut vertically (it works end to end, however thinly) rather than by layer. Mark the table `derived`.

## 2. Split, merge, or leave out — and say why

| Decision | When | Record |
|---|---|---|
| **Split** | A source item has two halves with different prerequisites, or one half is an interface others need early | Both new items carry the same source ID; one line of reason |
| **Merge** | Two source items change the same thing and make no sense apart | The merged item carries both source IDs; one line of reason |
| **Not an item** | The source line is an allowance or an ongoing activity, not a deliverable: review time, defect fixing, testing rounds, project management, hand-over | Listed in a separate table with where it goes instead (the review gate, `/bugfix`, a non-development track) |
| **Spike** | An item cannot be specified until something is found out | A small item of its own, placed before the item it unblocks; its output is a finding in the vault, not a feature |

Every split, merge and exclusion is listed at gate 2. If the user suggested a split or merge and you did not follow it, say that too, with the reason.

## 3. Seams

A **seam** is something several items depend on: a shell, a contract between two parts, a shared component set, a configuration schema, a mock of an outside system. If several items would otherwise wait for one big item to finish, cut the seam out as a small early item whose job is to **publish the interface and a stub** — so the dependants start against the stub.

A seam item's draft says, under Acceptance criteria, exactly what it publishes and where. Changing a published interface later is a `public-api-contract` matter (see `autonomy.hard_stops`).

Seams you add that the source does not name are `Added by Claude`.

## 4. Dependencies

For every item, list the items that must exist first.

- Take edges the source states.
- Infer the rest from what logically has to exist before what, and mark each inferred edge `Added by Claude`.
- An item that needs only a seam's *interface* depends on the seam, not on the items that fill it in.
- No cycles. A cycle means an item is too big or a seam is missing: fix the items, do not order around it.

External inputs are not dependencies. They go in the item's `External gates` with the mitigation the source gives (a mock, a test mode, a sample). An external input never blocks an item from starting; it blocks only the acceptance criteria that need the real thing.

## 5. Per item, record

| Field | From |
|---|---|
| Plan ID | `pl-NNN`, next free number over `.adlc/plan/drafts/` |
| Source | the source item IDs, as written in the source |
| Title | the source's wording, shortened only if needed |
| Depends on | step 4 |
| External gates | the source's external inputs, by its IDs |
| Scope tier | the source's own tiers, if it has them |
| Risk | `high` if it touches a sensitive surface (`autonomy.hard_stops`), or the source itself marks the item as high risk; else `normal` |
| Effort | the source's figure, in the source's unit; blank if none |
| Run with | see `specs` |

Under a tracker backlog, `Issue` is filled from the start and the item's title is the issue's.

## 6. Check before the gate

- Every source item is accounted for: it became an item, part of one, or is in the not-an-item table. State the counts.
- No item has more than about seven acceptance checks' worth of scope. Larger: split.
- Every `Added by Claude` line is visible in the table.
