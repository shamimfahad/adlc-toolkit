# roadmap · specs

Write one minimal draft per item at `.adlc/plan/drafts/pl-NNN-<slug>.md`. A draft is a real spec in the toolkit's spec template, filled only as far as the sources go. It is refined at its own spec gate, by whoever picks it up.

## 1. Template

Use `.adlc/templates/spec-template.md` (or `$TOOLKIT_PATH/templates/spec-template.md` when the vault has no copy). The template itself has no planning rows — an ordinary REQ never carries them. A draft sets or adds these rows in the header table, the added ones after `Related`:

| Row | Value |
|---|---|
| REQ | `—` (filled at promotion) |
| Status | `planned` (later `promoted`, or `dropped`) |
| Created | `—` (hard rule 5) |
| Plan | `pl-NNN` |
| Source | the source item IDs |
| Issue | the tracker reference, or `—` |
| Depends on | plan IDs |
| External gates | the input by the source's ID, then the mitigation: "`<input ID>` — build against `<mitigation>`" |
| Touches | components; paths only once the structure is decided (see 4) |
| Run with | the pipeline, then why (see 5) |

## 2. Content — only what the sources say

- **Problem / Goal** — one or two lines each, from the source.
- **Behaviour** — Today / After when the source describes it; otherwise the one-line form.
- **Non-goals** — from the source's exclusions and from neighbouring items ("`<that part>` is pl-NNN").
- **Acceptance criteria** — the source's acceptance evidence, one criterion per check, in the source's words. Where the source has none, draft from the goal and prefix the line `Added by Claude`. A criterion that needs a later item to exist says so: "(checked against a stub; re-checked in pl-NNN)".
- **Assumptions** — copied from the source with their references. Drop dates; keep the condition (hard rule 5).
- **Open questions** — only where the source flags one.
- **Verification** — under Acceptance criteria, two short lists when the project has verification limits: what a pipeline run can check, and what a person must check by hand.

No Flow diagram unless the source describes states. No design, no file plan, no task list.

Keep a draft under about 60 lines. If it wants to be longer, the item is too big: go back to `breakdown`.

## 3. Writing many drafts

Above about ten items, fan out: dispatch one agent per group of related items, in a single message, each given the item rows, the role table from intake, the exact source excerpts for its items, this file, and the template. Each agent writes only its own drafts. Then read every draft yourself against these checks before the gate:

- every source ID in the item table appears in exactly the drafts the table says;
- no draft contains a requirement absent from its source excerpt, unless marked `Added by Claude`;
- `Depends on` matches the roadmap graph, edge for edge;
- no dates, no names of people.

On an assistant with no isolated sub-agents, write them yourself in dependency order.

## 4. Touches

`Touches` is how overlapping work is caught without owners, so it must be honest about what is known.

- Before the project's structure is decided (no code yet, or the layout is itself an item): write **components**, in the source's own names for them. Note in the roadmap that `Touches` is provisional and which item settles it.
- After: write paths or globs.

The item that settles the structure triggers a `resync` when it merges.

## 5. Run with

Recommend one pipeline per item, with the reason:

| Item | Pipeline |
|---|---|
| A seam, or anything `high` risk | `/proceed`, every gate human |
| Ordinary feature work | `/proceed`; or `/sprint` when one developer wants to run several ready items whose `Touches` do not overlap |
| Low risk, fully specified by the source, no sensitive surface | `/autopilot` |
| Small or non-code | `/task` |

This is a recommendation on the draft. The developer who picks the item decides.

## 6. Starting a draft

Say this once in the plan's playbook and in the final report: a draft is started with `/spec pl-NNN` (or `/task`, `/proceed`, `/autopilot` with the same argument). That promotes it to a real REQ under the vault's ID scheme and opens the spec gate on the draft's text. See `promote(draft)` in VAULT-LAYOUT.
