# Planning — the layer above the REQ

`/spec` drafts one requirement. `/roadmap` decides which requirements exist, what each depends on, and what a developer needs in order to pick one up. Use it when the work is more than one REQ: a new product, a large feature, or a PRD, RFQ, estimate or backlog that has to become work people can start.

## What it reads

Whatever the project has. It does not expect a format. It reads sources for what each part *does*:

| Role | Example |
|---|---|
| Work items | tasks in an estimate, sections of a PRD, issues in a tracker |
| Dependencies between items | which item has to exist before which |
| Acceptance evidence | what someone will check |
| External inputs | things another party supplies, and what to build against meanwhile |
| Effort | hours, days or sizes |
| Scope tier and drop order | core, optional, what goes first if time runs out |
| Settled decisions | choices the work must follow |
| Vision beyond this milestone | what this plan leaves out |

A role no source fills is asked for, derived and marked, or left out. Nothing is invented: a line the sources do not support carries `Added by Claude` so you can drop it.

## What it writes

```
.adlc/plan/
  roadmap.md               phases by dependency, the graph, the critical path, seams, shared-file rules
  drafts/pl-012-<slug>.md  one minimal draft spec per item
  playbook.md              which pipeline for which work, Ready / Done, team rules      (product-size plans)
  risk-register.md         external inputs and their mitigations                        (when the sources name them)
  gap-register.md          what the plan leaves out of the product vision               (when there is one)
  issues/pl-012.md         issue text for you to post                                   (with a tracker)
```

An estimate, when you ask for one, is a workbook outside the vault. It is the only place dates and team size appear.

## It sizes itself

The first thing you see is the **run plan**: how big the work is and which of the modules above it will run, for you to approve.

| Size | What happens |
|---|---|
| One REQ | No plan. It tells you to use `/spec` or `/task` |
| A feature | Breakdown, roadmap, drafts, a light challenge pass |
| A product | Everything the sources support |

There are up to three gates: the run plan, the item list (before one draft is written per item), and the finished plan.

## Starting work from a plan

```
/roadmap next        what can start now
/spec pl-012         start that item
```

`/task pl-012`, `/proceed pl-012` and `/autopilot pl-012` work the same way. Starting an item **promotes** its draft: it gets a real REQ ID under your vault's scheme, the draft becomes its `requirement.md`, and the spec gate opens on that text. Once you approve and the REQ's branch exists, the approved spec is written back over the draft on that branch, marked `promoted`; after the merge, the plan folder shows the approved text. Commit the plan before starting any item: an uncommitted draft cannot be promoted. The rule is `promote(draft)` in [`core/VAULT-LAYOUT.md`](../core/VAULT-LAYOUT.md).

Drafts live in `plan/`, not `specs/`, because in `specs/` a REQ folder is local to one developer and means "in flight", and a `REQ-*.md` file means "merged". A planned item is neither.

## No owners

A plan never assigns work to people. Any developer picks any item that is **ready**: its dependencies are merged (or have published their interface), its external inputs are delivered or mitigated, and nothing in flight shares its `Touches`.

With one developer that is all there is to it. With several, "in flight" has to be visible to everyone at once, and a vault cannot do that: working folders are local, and `hot.md` is a log that merges two competing claims without complaint. So a team plan uses a tracker: `/roadmap` drafts the issue text, you post it and record the references with `/roadmap issues pl-012=#842 …`, and **assigning an issue to yourself is the claim**. Set `sources.issues` and `req.id_scheme: ticket`.

Files several items change get one of three rules in the roadmap instead of an owner: define every entry up front in one early item; run the item alone; or make later changes as small `/task` items chained to that early item.

## The challenge pass

Before the last gate, the `plan-challenger` agent attacks the plan through four lenses (platform facts, alternatives, sequencing, risk), checking it against what is true today. A suggestion reaches you only if it quotes the plan line it contradicts, quotes what it found, and would not be equally true of an unrelated project. You accept or reject each row. Rejected rows are logged in `plan/challenge-log.md` and not raised again.

On an assistant without isolated sub-agents the pass runs in the same context that wrote the plan, and the card says so.

## When the source changes

`/roadmap resync` compares the changed source with the plan and lists what moves before touching anything. Drafts not yet started are edited. An item already in flight is not: the change is listed for whoever is running it. In flight is judged from the draft, from REQ folders on your machine and from issue assignment — without a tracker, a teammate's started work cannot be seen, and resync asks before editing.

## Away from a repo

The same method runs as a chat skill, for planning before a repository exists:

```
node scripts/adlc.mjs pack-chat
```

writes `dist/chat/plan-with-adlc/SKILL.md`, packed from the same module files `/roadmap` reads (`core/skills/roadmap/`). It produces the plan as a bundle you place at `.adlc/plan/`.

## Changing how it plans

Each step is a module in `core/skills/roadmap/`. To change one for your team, copy it to `local/skills/roadmap/<module>.md`; `/roadmap` and `pack-chat` both read the local file in its place.
