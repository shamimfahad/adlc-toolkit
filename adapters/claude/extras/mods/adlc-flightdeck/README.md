# adlc-flightdeck

A Claude Code mod that turns the pipeline into a cockpit: one REQ, phase by phase, pinned
beside the transcript. A phase tab is the evidence behind the gate — the plan against the
tree, every file a link and a diff, findings as a grid, what approving sets in motion — with
the recommendation last. It reads what the vault already writes and asks git read-only; it
never writes `.adlc/`, and a gate reply it composes goes into the prompt box for you to send.

## The band: one line, or nothing

The band speaks only for the REQ **this session** is flying — the last one you named in a
prompt (`/proceed REQ-079`), dispatched an agent for, or wrote into. Other open REQs never
show there; History has them.

```
✈ REQ-079 · review ◑ · 3 flying · 212k tok                         resume  f: cockpit
◆ REQ-079 · gate 4/5 review · waiting 2:10 · 212k tok              r: resume  f: cockpit
```

The number is **fresh** tokens — input + output + cache writes. Cache reads are the whole
context re-sent on every call; summed they say how much context was re-read, not how much
work was done, so they are shown only as a bar on the phase tab (*context re-read*).

`/flight band` turns the line off and on (also under Settings).

## The cockpit: `/flight`

`/flight` (or `/flight REQ-079`) opens the pane and keeps it open: Esc hands the keys back
to the prompt and the pane stays; `/flight close` or its close mark closes it. It docks
beside a fullscreen transcript (from 110 columns) and asks for the width you set under
Settings; a width you drag wins after that.

```
✈ REQ-079  teamcity installer investigation     ◆ waiting on you 2:10 · 212k tok · viewed 4/7

1: spec ✓      2: architect ✓   3: ◆ implement   4: review ○      5: ship ○        h: history   s: settings
━━━━━━━━━━━━   ━━━━━━━━━━━━━━   ━━━━━━━━━━━━━━   ──────────────   ──────────────   ──────────   ━━━━━━━━━━━

GATE ◆ gate 3/5 · waiting on you 2:10                                                       card
#1   2026-10-08 09:40  revise     “keep the 3-retry default but make it config”
2026-10-08   work-path-set     branch at D:/repo (rides main)

PLAN VS ACTUAL                                 6 planned · 7 touched · vs main · 2 surprises
planned                                        touched
  src/pay/RetryPolicy.cs                         +88 −12   TASK-003
  src/pay/Gateway.cs                             +14 −3    TASK-004
○ docs/retries.md                                not touched — document the default
  —                                            ⚠ +2 −0   outside the plan   src/Startup.cs

FILES CHANGED                                                                  viewed 4/7
[✓] src/pay/RetryPolicy.cs                     +88 −12   TASK-003   diff
    tests: RetryPolicyTests.cs · last: sf · 2 days ago
[ ] src/Startup.cs                             +2 −0                diff
    ⚠ outside the plan · last: jd · 7 months ago · not yours lately
[~] src/pay/Gateway.cs  changed since you viewed  +14 −3  TASK-004   diff

TASK ACCEPTANCE
✓ 1  TASK-003 · RetryPolicy backs off exponentially
○ 2  TASK-003 · jitter applied — tests/pay/RetryPolicyTests.cs:40

AGENTS · 2
TASK-003  add the policy
✓  task-implementer         1:12   41k   TASK-003 done — RetryPolicy.cs + 4 tests
…
fresh            48k   ████
wrote            12k   █
context re-read  20.8M ████████████████████
────────────────────────────────────────────────────────────
7/7 tasks landed, 41 tests pass — recommend approve
  ⚠ TASK-005 edited Startup.cs (outside the blast radius)
MY READ   approve — the Startup.cs edit is the DI line TASK-005 needed
[ resume — the dialog in the transcript has the options ]
```

### A phase tab

Every tab opens with the **gate** (state, each round — what you chose, what you typed, how
much of the tree you had viewed — and the dated trail) and closes with the **verdict and
`MY READ`** from the card, then the resume button. What sits between is the phase's evidence,
built from the files the templates already mandate plus git, so nothing here needs a skill
change:

| Tab | Evidence, top to bottom |
|---|---|
| **spec** | `## Behaviour` today / after (when present) · acceptance criteria, numbered · non-goals beside out-of-scope · open questions · the flow diagram |
| **architect** | *you said / Claude found* when the trail holds a prediction (1.11.1) · blast radius with risk and last author · tasks as rails (`├ │ ●` per tier) · the key flow drawn with `mermaid-ascii` · knowledge hits · test strategy · risks |
| **implement** | plan vs actual · files changed with viewed marks, diffs, tests, authors · task acceptance · agents grouped under their task · token bars |
| **review** | needs-a-decision rows first (`your call`, disputed severities) · the findings grid with a fix / accept / defer pick per row and *compose* · claims with their evidence linked · acceptance-criteria check · plan vs actual |
| **ship** | what approving sets in motion (commits, PR target, migrations, files outside the plan, deletions) · diffstat with a diff per file · your review summary against the diff (1.11.1) · lessons · merge checklist |

Press a file to open its diff in the pane (`b` back) — that marks it viewed; Ctrl+click a
path to open it in your editor at the line. Press an agent for its lane, `card` for the gate
card as Claude wrote it, `m` for a diagram's Mermaid source.

### Plan vs actual

The left column is what `architecture.md`'s blast radius and the task files' *Files to touch*
name; the right is what git says changed under the REQ's work path against the branch's base
— committed on the branch and not yet committed alike. The base is the merge-base with the
branch the work path rides (from hot.md), else `origin/HEAD`, `main`, `master`, `develop`;
with none, HEAD. A planned file nobody touched and a touched file nobody planned are the two
surprises, in amber. Git is asked with `--no-optional-locks` and never told anything.

### Viewed marks

A mark is the file's blob hash at the moment you opened its diff (or pressed `[ ]`). A file
edited again after that shows `[~] changed since you viewed`. There is no "mark all". At the
implement and review gates the approve option's own description says `3 of 7 changed files
not viewed`, the header shows the count, and the round the mod records carries it. Marks are
per vault in `$.store`; Settings forgets them.

### The findings grid

One row per finding from `verification.md`'s *Findings at a glance*; `your call` and disputed
rows come first. Pick fix / accept / defer per row; *compose* puts `fix C1,M1 · accept m2` in
the prompt box. You send it; `/review` records the verdicts as it always has.

### History

Every REQ and BUG the vault knows — folders in flight on this clone, kept folders, and the
committed records of finished work (so teammates' merged items appear with their author and
month from a partitioned vault). Filter by state, author, text. Pick one and the tab row
retargets to it; `f` jumps to its first phase, `l` to its last. The band keeps pointing at the
REQ this session is flying.

### Settings

Per user, per machine (`$.store`), never in the vault: open on session start, the band, gate
cards on or off, pane width, the History default filter, the editor link template
(`vscode://file/{path}:{line}:{col}`, Cursor, Rider, `file://`, or your own), and buttons
that forget this vault's trail and its viewed marks.

## Links

Paths are OSC 8 hyperlinks built from the editor template; VS Code's terminal and Windows
Terminal open them with Ctrl+click. On a surface whose links are https-only (the VS Code
panel) the same cell is a button that runs `code -g path:line`. The in-pane reader is the
floor wherever links do not land.

## Diagrams

The first ` ```mermaid ` fence of `architecture.md` (or `requirement.md`'s flow) is piped
through `mermaid-ascii --max-width <pane>` when that binary is on PATH and drawn as Unicode
boxes; otherwise the source fence is shown. Task DAGs are always rails, never boxes — boxes
outgrow the pane past a handful of nodes.

## The trail

What this machine saw, kept per vault in `$.store` so it survives sessions:

- **rounds** — each gate dialog's answer and free text, with the viewed count at that moment. At the implement and review gates the mod also appends `[flightdeck] viewed 4/7 files` to the dialog answer itself, so the skill records `--viewed` in the vault's own trail (toolkit 1.11.1) and strips it from the note
- **runs** — each subagent that landed: type, task, duration, fresh and written tokens, and the first line of its last message
- **cards** — the last GATE-PROTOCOL card Claude wrote for each phase

It is the stop-gap for the vault's own `phases` block (toolkit 1.10.1, written by the trail hook
and the skills), which wins wherever both exist; the trail stays for what the vault never records.

## Gate cards

The GATE-PROTOCOL text card Claude writes is redrawn in the transcript as a card: the header with
the gate's state (amber while waiting; green once cleared), the phase rail, the verdict, every
section with `✓ ⚠ ?` and severities coloured, MY READ in the accent, and a footer the text card
can't have — what this phase burned, how many agents flew, what the next phase usually costs in
this vault. The stored message is untouched: the model, other tools and ctrl+o still see the text.

## Files

```
adlc-flightdeck/
  .claude-plugin/plugin.json
  hooks/hooks.json
  hooks/register.tsx   the hooks: events, band, cards, /flight, the pane and its pages
  hooks/model.ts       pure helpers: phase rail, gate-card parser, timeline, numbers
  hooks/vault.ts       pure readers: hot.md, records, notes[], artifacts per phase, history filters
  hooks/evidence.ts    pure readers: blast radius, task files, findings, acceptance, git's text, plan vs actual, pointers, consequences
  types/index.d.ts     the $.state contract
  tests/               claude plugin test .
```

`claude plugin validate .` · `claude plugin test .` · `tsc -p .` once the engine has laid the types.
