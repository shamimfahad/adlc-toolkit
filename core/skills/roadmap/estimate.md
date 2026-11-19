# roadmap · estimate

Selected only when the user asks for an estimate. Output: a workbook **outside** `.adlc/` (ask where). It is the one artefact that carries dates and people-counts, and nothing in the plan copies those back.

If the user already supplied an estimate, this module is not selected: that estimate is a source.

## 1. Ask for the inputs — never invent them

Ask, in options where there are sensible ones:

| Input | Used for |
|---|---|
| Unit (hours or days) and hours per day | every figure |
| Whether to estimate three points or one | the method |
| Acceptance-effort tiers and what each means here | test effort per sub-item |
| Allowances and their rates (for example review, defect fixing) | separate lines |
| A productivity factor, if the user applies one | stated on the overview; blank by default |
| Scope tiers the price or report is split by | summary |
| Team shape and calendar (start, non-working days, fixed end) | delivery plan only |
| Rounding rule | every total |

A figure the user does not give is left blank and listed as needed. Do not fill it from another project or from general knowledge.

## 2. Estimate

1. **Per item:** optimistic, likely and pessimistic effort, combined as (O + 4·L + P) / 6. Keep all three in columns. With one-point estimating, keep the single figure and say so on the overview.
2. **Split into sub-items** where the item has distinct pieces of work. Sub-item figures sum to the item's.
3. **Acceptance tier per sub-item**, and from it the acceptance effort, by the user's tier table. Each sub-item states what is verified — this line becomes an acceptance criterion in the item's draft.
4. **Allowances** as their own lines: base, rate, result. Never spread into the items.
5. **Count each thing once.** A shared piece (an error model, a component set, a harness) is estimated in its own item and reused; say so in an overview note.

State every assumption next to the item it belongs to, with its reference into the sources.

## 3. Workbook

Build it with a spreadsheet library when one is available (for example Python `openpyxl`); otherwise write one CSV per tab and say that totals are not live. Tabs, each optional:

| Tab | Content |
|---|---|
| Overview | Totals, scope, included and not included, method, how to read the workbook |
| Summary | Effort by workstream and by scope tier |
| Items | One row per item: source ID, plan ID, effort, external inputs, assumption |
| Sub-items | Parent, effort, acceptance tier and effort, what is verified |
| Delivery plan | A calendar view from the team shape — only if the user gave one |
| External inputs | ID, who supplies it, needed by, status, mitigation, linked items |

- Totals, the three-point combination and the allowances are **formulas**, not typed values. After writing, reopen the file, recalculate, and check the overview totals equal the sum of the item rows.
- One rounding rule, stated on the overview, applied in formulas — never hand-adjusted cells.
- Use the source's IDs for items if it has them; add the plan ID as a second column so the estimate and the plan can be matched in both directions.

## 4. Back into the plan

Only effort figures and the acceptance lines go back: effort into the item table (it weights the critical path), "what is verified" into each draft's acceptance criteria. Dates, team size and the delivery plan stay in the workbook.

## 5. At plan gate 2

Show the totals by scope tier, the three largest items, every blank input, and the method in two lines.
