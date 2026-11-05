# adlc-flightdeck

A Claude Code mod that turns the pipeline into a flightdeck above the prompt: the REQs in
flight, phase by phase. A phase page is the evidence behind the gate — the plan against the
tree, every file a link and a diff, findings as a grid, what approving sets in motion — with
the recommendation last — and the gate's options beside it, to answer from. It reads what the
vault already writes and asks git read-only; it never writes `.adlc/`, never runs a git write,
and never answers a tool call. A gate reply it sends arrives as your own message.

Everything is drawn in the band directly above the prompt (0.7.0), laid out as the flightdeck mockup
draws it (0.8.0): GATE first, then the phase's evidence, one titled block each. There is no pane: Claude
Code docks a pane beside the transcript from 110 columns and its placement is the engine's,
so a pane could never sit above the prompt on a wide terminal. The band always does.

The band exists in the terminal and the desktop app only; no other surface draws it. What other
mods draw in the band stays: the flightdeck draws first and theirs follows under it.

## The band: three heights

**band** — one row about the REQ you are flying:

```
✈ REQ-sf-034 · review · gate: fix all? · 2 in flight · 1 at gate                         ⤢ [-]
```

Clicking the text or `⤢` opens the flightdeck. `resume` appears before `⤢` only for a gate this
session has no card for (opened in another session): it runs `/proceed <id>`, which re-emits it.
`[-]` is the engine's own mark (ctrl+x ctrl+a): it collapses the band.

**open** — the summary: the header, the tabs and the GATE card, with a `⤢ FINDINGS · …` line naming
what the phase page holds. **max** — the summary and the evidence. The band can never grow past the
app's cap (half the terminal's rows, prompt included; the desktop app sets its own), so the two differ in
what they hold, not in a height; nothing is cut, and a tree taller than the band scrolls in the engine's
window (wheel or keys, with its `n more` row). `⤢` / `⤡` toggles, `×` collapses back to one row; nothing
here removes the band (the engine's own `[-]` and `/flight band` do).

```
✈ REQ-sf-033 ✓ ship · REQ-sf-034 ● review · REQ-sf-035 ○ spec     history · settings · ⤢ · ×
1 spec ✓          2 architect ✓     3 implement ✓      4 review ●         5 ship ○
approve · 1 round approve · 2 rounds 2 rounds · viewed… 15 findings · 7 n… opens after review
GATE ● awaiting — review · round 1
…the phase page
```

Level 1 is the REQ strip and the global views: `✈`, one chip per REQ in flight by ID number (the
current one highlighted), then `history` and `settings`, which sit above the phases and toggle back to
them. `✈` goes to the REQ in flight: while a sprint runs, its first member still flying; else the REQ this
session is flying; else the first one at a gate.
Level 2 is the five phase tabs, each with a one-line status under it from 110 columns. No key
hints in either header.

### In flight

A REQ is in flight when it has started (past phase 0), is not merged or aborted, and either has not
reached its last phase (ship, or a BUG's last) or is waiting at a gate — so a REQ at the ship gate stays
on the strip, and the band stays up for it. Everything else is History, whatever sprint registries it
still carries.
`k at gate` counts in-flight REQs with a marker. Chips never shrink: as many as fit the width, the
selected one always among them, then `+n more ▾`, which opens the whole list — every REQ in flight by
ID, the one shown marked `▸`, scrolled into view; a row opens that REQ's phases. Settings → *show all
unshipped* puts every unshipped REQ back on the strip.

## The cockpit: `/flight`

`/flight` (or `/flight REQ-079`) opens the flightdeck on that REQ's live phase; `/flight max` at
full height; `/flight close` collapses it to its row; `/flight toggle` switches; `/flight
history` / `settings` open those views.

### A phase tab

Every tab opens with **GATE**: `● awaiting — review · round 2` with, under it, the summary (findings that
need a call, files not viewed, the marker's ask), the options inline (`a: fix all (recommended)  b: …`),
the consequence of the recommended one, and `[⟳ compact first]` with the context fill. A cleared gate is one
line (`✓ cleared · approve · round 1 · 10-22 14:05 · viewed 4/7`), a phase in progress says so and lists the
agents flying for it under **SO FAR**, and a phase not reached says when it opens and shows nothing else.
Then the evidence, built from the files the templates already mandate plus git:

| Tab | Evidence |
|---|---|
| **spec** | `BEHAVIOUR` today / after · `ACCEPTANCE CRITERIA`, numbered, each by its bold lead |
| **architect** | `YOU SAID` (your predict answer) beside `CLAUDE FOUND` (the Approach) · `TASKS` as rails, tiers and parallel lanes |
| **implement** | `FILES` — one row per changed file: viewed mark, link, a dot per task that names it, `+a −d` (opens the diff) |
| **review** | `FINDINGS` grid (id · sev · where · finding · split · pick) · `ACCEPTANCE CRITERIA` met / not · `PLAN VS ACTUAL` |
| **ship** | `WHAT APPROVING SETS IN MOTION`, numbered · `DIFFSTAT` with a `+`/`-` bar per file (opens the diff) |

`/flight REQ-042 review` (or a phase number) opens a tab directly. Press a diff to read it in the flightdeck
(`‹ back`) — that marks the file viewed; Ctrl+click a path to open it in your editor at the line.

### Answering a gate

The gate is the turn: the skill writes the marker, emits the card and ends its turn, and your
next message is the answer. Type it in the prompt as always, or pick it on the action bar under
the open gate's GATE line: one row per option with its consequence, the one `MY READ` recommends
first, marked `▸`. Once the band has focus (a click, or ctrl+x tab) the letters `a b d e f g i j`
press them in order. There are no digit keys: the engine presses a band Button keyed with a digit
typed into an empty prompt, so a digit there would answer a gate by accident.

- A button sends the option as **your own message** (`$.prompt.submit` with `asUser`). At the
  implement and review gates it carries `[flightdeck] viewed 4/7 files` on its last line, in
  plain sight; elsewhere `[flightdeck] pane`. `trail gate` lifts the trailer into the round
  (toolkit 1.12.1); an older `trail gate` leaves it in the note, which is harmless.
- An option with an argument (`fix <ids>`, `revise <what>`) is an input with *send*; on a
  surface without inputs (the phone) it fills the prompt with its head for you to finish.
- One press, one reply: after a send the GATE line reads *sent* — "Sent to Claude. The flightdeck
  reopens at the next gate for this REQ." — until the turn completes. A reply sent while a background agent runs waits for the
  session to be idle.
- The options come from the marker's `Options:` block (toolkit 1.12.1). With a 1.11 marker they
  come from the captured card's `Decision →` line; with neither, the phase's standard options
  (as its skill defines them) stand in, said so in a faint line. An older marker's `Awaiting:`
  line is read as the ask. The approve-like options name the changed files not yet viewed.
- The mod records its own round for every reply that names an option, typed or sent, with
  `via`; the vault's `phases` block wins where both exist. A reply that names no option (a
  question) records nothing — the gate stays open.
- The AskUserQuestion dialog is no longer touched. 0.5.0 rewrote its answer to carry the viewed
  count, and the option you picked never reached Claude; under a 1.11 toolkit the dialog still
  appears and its answer now arrives intact.

### Compact at a gate

A gate is the cheapest place to compact: the phase is on disk and the next has not started. Under the
options, `[⟳ compact first]` is a toggle: on, the next option you press compacts first — with
instructions built from the REQ (what to keep verbatim, what is on disk, what to re-read after) — and
then sends. A compaction that is vetoed or refused (a turn running) sends nothing. Beside it, the context
fill.

Settings → *compact mode*: `button` (default), `suggest` (dim until the context is past *compact at*,
60–90%, default 70), `never`.

### Narrow

Below 84 band columns (Settings → *narrow below*) the chips shrink to their number (`034 ●`),
`history` / `settings` to `h` / `s`, and the tab row becomes a **list home**: one row per phase —
its state, the last decision and rounds, findings that need a call at review, the viewed count at
implement and review, predict / summary answered. The open gate's row takes the focus. A row opens
its page in the list's place with `‹ back` at its top left — the only back control there is.
The rows have no key; click them, or Tab / Enter once the band has focus.

IDs are read whole: `REQ-sf-033` (a `prefixed` vault) is never `REQ-033`, and `L-REQ-035-1` (a
lesson) is not `REQ-035`. A prompt that names an id the vault does not hold leaves the focus alone.

### Plan vs actual

The left column is what `architecture.md`'s blast radius and the task files' *Files to touch*
name; the right is what git says changed on the REQ's own branch (`pipeline-state.json →
branch`, else HEAD) against its base — committed and, when that branch is what the work path
has checked out, not yet committed alike. With another branch checked out (two REQs in `branch`
isolation) the matrix is committed-only and says `committed only — <branch> is not checked out
here`. The base is the merge-base with the branch the work path rides (from hot.md), else
`origin/HEAD`, `main`, `master`, `develop`; with none, HEAD. A planned file nobody touched and a
touched file nobody planned are the two surprises, in amber. Git is asked with
`--no-optional-locks` and never told anything.

### Viewed marks

A mark is the file's blob hash at the moment you opened its diff (or pressed `[ ]`). A file
edited again after that shows `[~] changed since you viewed`. There is no "mark all". At the
implement and review gates the approve-like options on the action bar say `3 of 7 changed files
not viewed`, the page shows the count, and the reply the flightdeck sends carries it. Marks are
per vault in `$.store`; Settings forgets them.

### The findings grid

One row per finding from `verification.md`'s *Findings at a glance*; `your call` and disputed
rows come first. Pick fix / accept / defer per row; *send* (`c`) sends `fix C1,M1 · accept m2`
as your reply (with the viewed trailer), *edit first* puts it in the prompt box instead.
`/review` records the verdicts as it always has.

### History

By ID number; every row opens that REQ's phases, the one shown is marked `▸` and scrolled into view.
Every REQ and BUG the vault knows — folders in flight on this clone, kept folders, and the
committed records of finished work (so teammates' merged items appear with their author and
month from a partitioned vault). Filter by state, author, text. Pick one and the tabs
retarget to it; it shows as the selected chip. The band's row keeps pointing at the REQ this
session is flying.

### Keys

No header control has a key: the terminal draws a plain Button that has a hotkey as `k: label`, so a
key there would put its hint in the header. Headers are click, or ctrl+x tab then Tab / Enter. Keys
live in the page body and are letters only, which fire once the band has focus: `a b d e f g i j` on
the gate's options by position (they skip `c`, `m`, `h` and `s`, so nothing in one view shares a key),
`c` sends the composed findings reply, `m` opens a diagram's source. No band Button has a digit: the
engine presses one from an empty prompt. The keys are `KEYS` and `OPTION_KEYS` in `hooks/register.tsx`.

### Settings

Per user, per machine (`$.store`), never in the vault: the editor link template
(`vscode://file/{path}:{line}:{col}`, Cursor, Rider, `file://`, or your own), compact mode and compact at,
narrow below, open on session start, gate cards, show all unshipped, and buttons that forget this vault's
trail and its viewed marks — each a row of `[choices]`, the current one in the accent. History's filter
sits on the History view. `/flight band` hides or shows the whole flightdeck.

## Links

Paths are OSC 8 hyperlinks built from the editor template; VS Code's terminal and Windows
Terminal open them with Ctrl+click. In the desktop app, whose links are https-only, the same cell is
a button that runs `code -g path:line`; that needs `$.process`, which the CLI has, so where it is not
available the button does nothing. The in-flightdeck reader is the floor wherever links do not land.

## Diagrams

The first ` ```mermaid ` fence of `architecture.md` (or `requirement.md`'s flow) is piped
through `mermaid-ascii --max-width <band width>` when that binary is on PATH and drawn as Unicode
boxes; otherwise the source fence is shown. Task DAGs are always rails, never boxes — boxes
outgrow the band past a handful of nodes.

## The trail

What this machine saw, kept per vault in `$.store` so it survives sessions:

- **rounds** — each gate reply, from the pane or typed: the option it names, your words, the viewed count it carried, and `via` (`pane` or `typed`). A reply that names no option is not a round
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
  hooks/register.tsx   the hooks: events, band, cards, /flight, the cockpit and its pages
  hooks/model.ts       pure helpers: phase rail, gate-card parser, timeline, numbers
  hooks/vault.ts       pure readers: hot.md, records, notes[], artifacts per phase, history filters
  hooks/evidence.ts    pure readers: blast radius, task files, findings, acceptance, git's text, plan vs actual, pointers, consequences
  types/index.d.ts     the $.state contract
  tests/               claude plugin test .
```

`claude plugin validate .` · `claude plugin test .` · `tsc -p .` once the engine has laid the types.
