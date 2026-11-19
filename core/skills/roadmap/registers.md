# roadmap · registers

Three small outputs. Write each only when its role exists in the sources.

## 1. Risk register — `.adlc/plan/risk-register.md`

When the sources name external inputs. From `$TOOLKIT_PATH/templates/risk-register-template.md`. One row per input: the source's ID, who supplies it, status as the source states it, the items it affects, the mitigation, and what happens to those items if it never arrives. Append-only (the file is union-merged): a status change is a new row naming what happened ("delivered — see REQ-…"), not an edit of the old one.

No needed-by dates unless the user asked for them (hard rule 5).

## 2. Gap register — `.adlc/plan/gap-register.md`

When a source describes a product larger than this plan delivers. From `$TOOLKIT_PATH/templates/gap-register-template.md`. One row per gap: the decision or section of the vision it comes from, what the full product does, what this plan delivers instead, and where it sits in whatever order the vision gives.

Nothing in it is a defect. It is the distance between this milestone and the vision, written down so it is not rediscovered. Append-only: a REQ that defers something adds a row; no row is edited. Say in the playbook's team rules that deferring something at a spec or review gate means adding the row in that REQ. Do not add the register to `config.yml → docs`: that list replaces the default documentation sweep, and the sweep corrects lines in place, which an append-only file must not have.

## 3. Issue text — `.adlc/plan/issues/pl-NNN.md`

When `config.yml → sources.issues` is set, or the plan is for more than one developer.

A plan for several developers needs a place where a claim is visible to everyone at once, and the vault is not that place: working folders are local, and `hot.md` merges both of two competing claims without complaint. So:

- If no tracker is configured and the plan is for several developers, say this plainly at gate 3 and recommend setting `sources.issues` and `req.id_scheme: ticket`. Do not invent a substitute lock.
- Write one file per item: a title line, then the body — the draft's goal, its acceptance criteria, its `Depends on` as a list, and a line `Plan: pl-NNN`. Plain markdown a person can paste or pipe to their tracker's CLI.
- **You never post them** (hard rule 7; `external-write` is a hard stop). The user posts, then runs `/roadmap issues pl-012=<ref> …`, which writes each reference into its draft's `Issue` row. Under `ticket`, that reference becomes the REQ's ID at promotion.

Under a tracker backlog (the issues already exist), skip this: the `Issue` rows are already filled.
