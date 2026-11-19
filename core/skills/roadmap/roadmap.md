# roadmap · roadmap

Write `.adlc/plan/roadmap.md` from the approved item table, using `$TOOLKIT_PATH/templates/roadmap-template.md`. It is the dependency view: what exists, in what order it can be built, and what the shortest route is. It is written here and by `resync`, and by nothing else.

## 1. Phases by depth

A phase is a depth in the dependency graph, not a period of time.

- Phase 0 holds the items with no dependencies, plus the seams.
- Each later phase holds the items whose dependencies are all in earlier phases.
- Name a phase by what it is for ("contracts and foundation", "features", "hardening"), using the source's words where it has them.

Items that must wait for nearly everything (an audit, a performance pass, a submission) fall into the last phase by themselves; do not force them earlier.

## 2. The graph

One Mermaid `flowchart`, a `subgraph` per phase, one node per item (`pl-NNN · short title`), one edge per dependency. Highlight the critical path with a `classDef`. Inferred edges are listed in a short note under the graph, not styled.

Keep node labels short; the table carries the detail. A graph over about sixty nodes is split into one overview (phases as nodes) plus one graph per phase.

## 3. The critical path

The longest chain through the graph. Weight it by effort when the items carry effort; by item count when they do not, and say which. State it in one line, then list **what shortens it** — only moves this plan can make:

- a dependant starting against a seam's stub instead of the finished item;
- an item built against a mock of an external input;
- a spike pulled out of a larger item.

Each is specific: name the two items and the interface.

## 4. Shared files

Find the places several items will change: any file or area that each of several items adds an entry to or edits. With no owners, each gets one of three rules, written in a table:

| Rule | Meaning |
|---|---|
| **Interface first** | A seam item defines every entry up front; other items only implement |
| **Run alone** | The item that reworks the shared file is never ready while another item touching that file is in flight |
| **Through the seam** | Later changes to the shared file are small `/task` items chained to the seam item, one at a time, reviewed against the seam's record |

Prefer a structure that removes the sharing (one file per feature that a loader merges) over a rule, and say when the plan does that.

## 5. External gates

One table: each external input by the source's ID, who supplies it, the items it affects, and the mitigation to build against. No needed-by dates (hard rule 5) unless the user asked for them.

## 6. Go/no-go points

Where the plan forks on a result — a first real run, a spike's finding, an outside approval — record the condition, what counts as passing, and **what changes if it fails**: which item is dropped first, which shrinks, what stays. These are conditions, not appointments.

## 7. What is not an item

Carry over the not-an-item table from `breakdown`, with where each goes.

## 8. Source changes

Leave an empty "Source changes" table. `resync` fills it.
