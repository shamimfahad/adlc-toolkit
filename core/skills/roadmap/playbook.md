# roadmap · playbook

Write `.adlc/plan/playbook.md` from `$TOOLKIT_PATH/templates/playbook-template.md`: how this project is built with the toolkit. Selected for `product`-size plans. Keep it to what a developer needs on their first day; link to the roadmap for everything else.

## 1. Check what is installed

Base every statement on the skills actually present (the manifest, or the installed commands). Do not describe a pipeline this install does not have.

## 2. Sections

**Overview.** One paragraph: source → roadmap → drafts → pick an item → pipeline → review → merge → acceptance → defects back through `/bugfix`. Name the seams and say they go first.

**Which pipeline for which work.** A table by *kind of work*, not by item: seams and high-risk work; ordinary features; low-risk, fully specified work; small and non-code work; defects; vault upkeep (`/status`, `/recover`, `/analyze`). One line of reason each. For `/sprint`: it runs several items on one developer's machine, so it is for a developer batching items they have already claimed whose `Touches` do not overlap. Recommend an `autonomy.gates` setting per kind of work, not per person.

**Picking and claiming.** The ready rule from the main file's *Next* section, in the project's terms. How a claim is made here (issue assignment when a tracker is configured), how it is released, and that `hot.md` is a log, not a lock.

**Definition of Ready.** An item may start when: its dependencies are merged or their interface is published; its external gates are delivered or mitigated; nothing in flight shares its `Touches`; its draft has been read by the person starting it.

**Definition of Done.** Review passed with the project's verify commands green; each criterion ticked, or deferred with the item that re-checks it; manual checks done by a person and noted in the record; wrap-up written; merged by a human.

**Shared files.** Point at the roadmap's table and restate the three rules in one line each.

**How it connects.** One Mermaid `flowchart`: source → roadmap → drafts → pipelines → review gate → merge → acceptance → `/bugfix` loop, with the vault as the layer every pipeline reads and writes.

**Team rules.** Only rules this project needs, each one line: one REQ per branch; who merges; the git mode; the ID scheme and where IDs come from; how lessons reach everyone (pull before starting an item); how often to run `/status` and `/recover`.

## 3. Leave out

No owners, no lanes, no per-person load, no dates. If the user asks for a split by person, that is a separate request outside this plan: say so.
