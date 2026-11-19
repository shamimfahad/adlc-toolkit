# roadmap · intake

Work out what the project has, before deciding what to make. Nothing is written in this module.

## 1. Gather the sources

Take every source the user named or attached: documents, spreadsheets, links, a tracker, a repository, a vault. Open each one and read it in full. A link you cannot open, a file that is not there, a sheet with fewer tabs or rows than the user said: stop and say so (hard rule 1). Do not carry on with the part you could read.

Then ask, once, whether there is anything else — in options, not open prose: `that's everything` · `there is also <what>`.

## 2. Read for roles, not for a format

Sources differ in shape from project to project. Do not look for a particular column name, ID pattern, tab name or heading. Look for what each part of a source *does*:

| Role | What it is | If no source fills it |
|---|---|---|
| Work items | The things to be built, at whatever grain the source uses | `breakdown` derives them, marked as derived |
| Dependencies between items | Which item needs which first | Inferred in `breakdown`; every inferred edge marked `Added by Claude` |
| Acceptance evidence | What someone will check to call an item done | Drafted from the goal; flagged for the spec gate |
| External inputs | Things someone outside the team must supply, and what to do meanwhile | The section is left out |
| Effort | Hours, days, points or sizes per item | Sizes only, or the `estimate` module |
| Scope tier and drop order | What is core, what is optional, what goes first if time runs out | One tier |
| Settled decisions | Choices already made that the work must follow | Asked in `frame` |
| Vision beyond this milestone | What the product should become that this plan does not deliver | No gap register |
| Verification limits | What cannot be checked automatically here (no device, no deploy, no production data) | Asked once at gate 1 |

Record, for each role: which source fills it, where in that source, and in what form (for example "a column of free text per sub-item", "a list in section 4"). Keep the source's own name for the thing. If a source has its own IDs, those are the IDs you will carry.

One source can fill several roles; several sources can fill one. Where two sources disagree on the same fact, do not pick silently: list the disagreement for gate 1 with the source you would trust and why.

## 3. Find where the project is

| What the sources amount to | The plan starts at |
|---|---|
| An idea, a conversation, a few lines | `frame` |
| A statement of the product or feature (a PRD, an RFQ, a kickoff document) | `breakdown` |
| A list of work already broken down (an estimate, a task list) | `roadmap` and `specs`; `breakdown` only maps items to REQs |
| A tracker backlog | The issues are the items. `breakdown` maps them; their keys are kept; nothing is duplicated; existing assignees are left alone and reported |
| A repository and a vault | Plan against the code: read `context/` and dispatch `codebase-explorer` for the area the change touches |
| Several of these | The furthest point every source supports. An estimate without a problem statement still needs `frame` for the non-goals |

Never regenerate something a source already gives you. If the user supplied an estimate, the `estimate` module is not selected unless they ask for a new one.

## 4. Hand back

Return to the main file with: the role table filled in, the start point, the list of conflicts, and the questions that only the user can answer. These go on the gate 1 card.

One question is always among them, because the claim model depends on it: **will one developer work from this plan, or several?** Ask it as two options. It is not an assignment and no names are taken — it decides only whether the plan needs a tracker (`registers` → issue text) and what `/roadmap next` can promise.
