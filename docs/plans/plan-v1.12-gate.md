# Plan v1.12 — the gate is the turn

Toolkit 1.11.0 → 1.12.0 · `adlc-flightdeck` 0.5.0 → 0.6.0 · written 2026-10-24
against HEAD `168c5df`. Every line number below is from that commit. Line
numbers in `core/extras/claude/mods/adlc-flightdeck` are written `M/…`.

Three tranches, applied in order, each one leaving the toolkit working:

| Tranche | What | Version |
|---|---|---|
| 1.12.0 | the mod: no dialog branch, the pane answers, band ↔ pane, narrow list home, REQ strip, compact button, full-ID resolution | `adlc-flightdeck` 0.6.0 |
| 1.12.1 | the toolkit: GATE-PROTOCOL 5 and 7, every gate step, the marker's option block, `trail gate`, the hooks, `/proceed` resume after compaction, `/recover` | `core/manifest.json` 1.12.0 |
| 1.12.2 | measurement: `trail stats` gains *via pane* and *compactions per gate*; `/status` 4b | — |

---

## §1 Why

**The bug.** A gate answered in the AskUserQuestion dialog at the implement
or review gate reaches Claude as

```
User answered Claude's questions: · [flightdeck] viewed 0/74 files
```

and nothing else. The chosen option is gone. Cause: the mod's `tool.call`
hook (`M/hooks/register.tsx:508-574`) wraps the AskUserQuestion call, and at
`:540-545` replaces the result with `{ ...res, response: <trailer> }`. The
engine formats the answer for the model from `answers` only when `response`
is unset; a hook-set `response` replaces that formatting wholesale. So the
trailer that was meant to ride beside the answer became the answer. The
skill then ran `trail gate --decision <nothing it could see>`, and the
gate's semantics depended on Claude guessing. The `[flightdeck]` trailer
was added in 1.11 so `trail gate --viewed` could record how much of the
tree was looked at — a measurement feature that broke the decision itself.

**Why not patch it.** Setting `annotations` instead of `response`, or
appending to whatever the engine would have produced, depends on an
undocumented formatting path in one engine build. The coupling is the
problem, not the line. A gate today has four moving parts that must agree:
the text card, the `.awaiting-approval` marker, the AskUserQuestion dialog
(rendered by the engine, capped at 12 rows on the terminal) and the mod's
interception of that dialog. Two of those are presentations of the same
options, and the one the user actually clicks is the one the mod cannot
draw and can only corrupt.

**The research already in CHANGELOG 1.11.0** says where the decision
belongs. A developer who approves is accountable for the code; explanation
beside a verdict produces no learning, verifiable evidence does; on agent
PRs file structure predicts outcomes where description text does not; and
reminders, timers and extra gates measure as useless. 1.11 built the
evidence (plan vs actual, the viewed matrix, the findings grid) in the
pane, then made the user leave the pane to answer in a 12-row dialog that
shows none of it. The answer belongs next to the evidence.

**What replaces it.** The gate is the turn. The skill writes the marker
(now carrying the option set), stamps the state, emits the ≤20-line card,
and ends its turn. The user's next message is the answer — typed in the
prompt, or sent by the pane's option button through
`$.prompt.submit({ text, asUser: true })`, which arrives as the user's own
words with the `[flightdeck] viewed n/m files` trailer appended in plain
sight. Claude reads one user turn, as it does on every other assistant the
toolkit supports. The mod draws; it never answers a tool call.

**Two adjacent defects the audit turned up, fixed here because the new
gate leans on them.**

1. *REQ resolution by number.* The pane showed `REQ-035 · not in this
   vault` while the session flew `REQ-sf-033`. Every ID pattern in the mod
   and the trail hook is `(?:REQ|BUG)-\d+`. A `prefixed` vault (`/init`
   recommends it, `init.md:40`) names folders `REQ-sf-033-<slug>`:
   - `splitFolder` (`M/hooks/model.ts:31-35`) fails to match and returns
     the whole folder name as the id, so the deck holds
     `REQ-sf-033-gate-turn`, never `REQ-sf-033`.
   - `touch()` from `prompt.submit` (`register.tsx:485`), `tool.call`
     (`:564`) and `/flight` (`:770`) cannot match `REQ-sf-033` at all, but
     do match `REQ-035` inside any text that mentions it (a lesson id
     `L-REQ-035-1`, a pasted log), and `\b` is satisfied after the hyphen.
     Focus lands on an id the deck does not hold, and the header falls to
     `'not in this vault'` (`:887`).
   - The gate-card `HEADER` (`model.ts:247`) does not match
     `GATE 4/5 · Review · REQ-sf-033`, so prefixed cards are neither
     redrawn nor captured.
   - The trail hook's `folders()` (`adlc-trail.mjs:57`) skips
     `REQ-sf-033-*` folders entirely. Verified on a scratch vault:
     `trail gate --req specs/2026-10/sf/REQ-sf-033-gate-turn` and
     `--req REQ-sf-033` both exit 2 (`no work item matching …`); only an
     `.adlc/`-prefixed path relative to the cwd gets through the fallback
     at `:78`. So in a prefixed vault the Stop hook never opens a round,
     SessionStart never stamps, and every skill's "record the answer
     first" fails. The trail has been dark for prefixed REQs since 1.10.
2. *Plan vs actual diffs HEAD.* `refreshGit` (`register.tsx:299-308`)
   computes `merge-base HEAD <cand>` and diffs to `HEAD`. In `branch`
   isolation the checkout may sit on another branch (`review.md:18` says
   so); then the matrix and the viewed count describe the wrong tree, and
   that count is what the trailer reports.

---

## §2 Decisions

- **D1** The gate is the card + `.awaiting-approval` + the state stamp, and
  the turn ends. The reply is the next user turn. The pane draws the long
  form with option buttons that submit the reply as the user, with
  `[flightdeck] viewed n/m files` at implement and review. The text card
  stays the fallback for every surface without the mod.
- **D2** The mod's AskUserQuestion branch in `tool.call` is deleted, not
  patched.
- **D3** Compaction at a gate is a button (and *approve · compact first*),
  never automatic. Mod setting `compact: button | suggest | never`,
  default `button`; `suggest` highlights past a `context.percent`
  threshold. The hook stamps compactions per round; the mod never writes
  `.adlc/`. `/proceed` re-reads the phase skill after a compaction.
- **D4** Band ↔ pane. The band is the collapsed form; a key toggles the
  pane; closing the pane keeps the band. Dock side stays the engine's.
- **D5** Narrow mode below a column breakpoint: a list home replaces the
  tab row; `‹ back` returns. Wide view unchanged.
- **D6** A REQ strip lists every in-flight REQ; resolution is by full ID;
  plan vs actual uses the REQ's own branch and work path.
- **D7** `/recover` honours `.awaiting-approval` as the gate signal.
- **D8** `/autopilot` and `/sprint` unchanged. The predict and summary asks
  become turn-end asks (text + `skip`), typed or via a pane input.
- **D9** No new agent, gate or skill. Mod 0.6.0; manifest 1.12.0.

---

## §3 Tranches

### 1.12.0 — `adlc-flightdeck` 0.6.0

Mod only. Works against a 1.11 toolkit (it falls back to the card's
`Decision →` line when the marker has no `Options:`), so it can ship and
be lived with before 1.12.1 lands.

#### 3.0.1 One ID grammar

`M/hooks/model.ts`, new export near the top (after `:10`):

```ts
/** A work item id as a skill mints it: REQ-042, REQ-sf-033, BUG-7.
 *  The prefix (req.prefix) starts with a letter so a slug that starts with
 *  a digit never reads as one. Not preceded by a word char or a hyphen, so
 *  L-REQ-035-1 (a lesson) never yields REQ-035. */
export const ID_SRC = '(?:REQ|BUG)-(?:[a-z][a-z0-9]{0,7}-)?\\d+'
export const ID = new RegExp(`(?<![\\w-])(${ID_SRC})`)
export const idOf = (s: string) => ID.exec(s)?.[1] ?? null
```

Use it everywhere the old pattern stands:

| Where | Today | Change |
|---|---|---|
| `model.ts:31-35` `splitFolder` | `/^((REQ\|BUG)-\d+)-?(.*)$/` | `new RegExp('^(' + ID_SRC + ')-?(.*)$')`; kind from the first three letters |
| `model.ts:77` `parseDispatch` | `\b((?:REQ\|BUG)-\d+)` | `idOf(text)` |
| `model.ts:247` `HEADER` | `((?:REQ\|BUG)-\d+)([\w-]*)` | `(${ID_SRC})([\w-]*)` via `new RegExp` |
| `vault.ts:51` `parseHot` | same | `idOf(rest)` |
| `vault.ts:68` `hotTail` | same | `ID_SRC` |
| `vault.ts:95-96` `parseRecord` | same | `ID_SRC` / `idOf` |
| `register.tsx:485, :564, :770` | same | `idOf(...)` |

The `ticket` scheme with a native key (`PROJ-842`, `spec.md:28`) still
falls outside `(REQ|BUG)-`; folders named that way are not seen by the mod,
the statusline, the notifier or the trail today either. Not in this cut;
noted in §4.

#### 3.0.2 Delete the dialog branch (D2)

`M/hooks/register.tsx`:

- `:432` delete `type AskQuestion`.
- `:514-536` delete the `gateFor` / `viewedNow` / `input` block; `:537`
  becomes `const ran = await next(e)`.
- `:538-545` delete the trailer rewrite.
- `:553-560` delete the dialog round; rounds come from the reply (3.0.4).
- `:571` keep `tool === 'AskUserQuestion'` in the rescan condition (non-gate
  asks such as `/ux-doctor` still use the dialog; a rescan is harmless).
- `:35` imports: drop `VIEWED_TRAILER` if unused after 3.0.4 (it is used
  there; keep).
- `M/hooks/vault.ts:196-202` `decisionOf(answers, response)` → replaced by
  `replyOf(text)` (3.0.4).
- `M/hooks/evidence.ts:442` doc comment: "The trailer the pane appends to a
  gate reply it sends …" (no longer an AskUserQuestion result).

#### 3.0.3 The marker and the option set

New pure reader in `M/hooks/vault.ts` (after `:202`):

```ts
export type GateOption = { label: string; consequence: string; needsArg: boolean; recommended: boolean }
export type GateAsk = { phase: string; req: string; ask: string; options: GateOption[] }

/** .awaiting-approval → the ask and its options (1.12 marker). A 1.11
 *  marker has no Options: block and yields options: []. */
export function parseMarker(text: string): GateAsk
/** Fallback for a 1.11 toolkit: the card's `Decision →` line split on ' · ',
 *  each part `label (consequence)` or `label — consequence`. */
export function optionsFromDecision(line: string | null, myRead: string): GateOption[]
```

`needsArg` is true when the label holds `<…>` (`fix <ids>`, `revise <what>`).
`recommended` comes from the marker's `Recommended:` line, else from the
first word of `MY READ`.

`scan()` (`register.tsx:219`) already stats the marker for `waitingSince`;
it now also reads it (≤4KB, through `cached()`), and stores the result in a
new atom `gateA: Record<id, GateAsk>`. Marker absent → entry deleted.

#### 3.0.4 Answering from the pane (D1)

New helper in `M/hooks/vault.ts`:

```ts
/** The text the pane submits for an option: the label (an argument the
 *  user typed substituted for its <…>), then the viewed trailer at
 *  implement and review when files changed. */
export function replyFor(o: GateOption, arg: string | null, phase: number, v: { n: number; m: number } | null): string
/** A user turn → { decision, note, viewed } — the first word or two that
 *  name an option, the rest as the note, the trailer lifted out. */
export function replyOf(text: string, options: GateOption[]): { decision: string; note: string; viewed: string | null }
```

`replyFor` keeps the trailer exactly as 1.11 wrote it,
`\n\n[flightdeck] viewed ${n}/${m} files` (`evidence.ts:444`), at phases 3
and 4 only, and when `m > 0`. At phases 1, 2 and 5 a pane reply carries
`\n\n[flightdeck] pane` so 1.12.2 can count pane answers (`trail gate`
learns the form in 1.12.1; a 1.11 `trail gate` leaves it in the note —
harmless, and `/review`'s parse of `fix C1,M1` reads the first line).

In the Pane render (`register.tsx:1061-1076`, `readBlock`), the button at
`:1068-1073` ("resume — the dialog in the transcript has the options") is
replaced by the **action bar**, drawn when `c.p?.state === 'gate'`:

```
──────────────────────────────────────────────
3 findings — 1 needs a call
MY READ  fix all — the critical must be fixed before this ships
viewed 4/7 · 3 changed files not viewed
 1 approve        accept findings as-is → /wrapup
▸2 fix all        I fix every actionable finding, re-check
 3 fix <ids>      only the findings you name
 4 revise <what>  other changes to the review
 5 abort          stops this REQ; nothing is committed
[ compact first ]  context 71% · approve · compact first
```

- An option without an argument: `Button key="opt-<label>" hotkey="<k>"`,
  `onPress` → `send(replyFor(o, null, n, v))`.
- An option with one: on the terminal and desktop, an `Input` with the
  label's head as placeholder, `submitLabel="send"`; on a surface without
  `Input` (the phone, `:807`), `$.prompt.fill({ text: '<head> ', mode:
  'replace' })` so the user finishes it in the prompt.
- The recommended option draws first-in-tone (`ACCENT`, `▸`); at implement
  and review, when `n < m`, the approve-like options (`/^(approve|fix|merge|
  ship|accept all)/`, the old `:529` test) carry `· <m-n> of <m> changed
  files not viewed` — the same words 1.11 put in the dialog's description.
- `send(text)`:
  ```ts
  const send = async (text: string) => {
    if (pending) return                       // one click, one reply
    await update($, pendingA, () => ({ req: live.id, at: await $.clock.now() }))
    await touch($, live.id)
    try { await $.prompt.submit({ text, asUser: true }) }
    catch { await update($, pendingA, () => null); $.ui.toast?.('could not send — type it in the prompt') }
  }
  ```
  `pendingA` clears on the next main-loop `turn.complete`. While set, the
  bar reads `sent — Claude picks it up when it is idle` and its buttons are
  dim (see §5, background agents).

**Option hotkeys.** The decision said 1–4; review and the task wrap-up
gate have five options, so the bar uses `1`…`n` (n ≤ 6). That collides
with today's phase-tab hotkeys `1–5` (`:917`, the `keys()` hint at `:1829`,
the `/flight` reply at `:785`). Resolution: digits belong to the action bar
whenever one is on screen; the tab row moves to `[` previous / `]` next
and `g` (go to the gate), on every page. `f` / `l` (first / last), `h`,
`s`, `b`, `c` stay. Whether `Button.hotkey` accepts `[` and `]` is
**(unverified — check at apply time against the build's
`.claude-plugin/types/claude-code/index.d.ts`)**; fallback `,` / `.`.

**Compose** (`:1484-1489`): two buttons instead of one — `send “fix C1,M1 ·
accept m2”` (hotkey `c`, `send(reply + trailer)`) and `edit first`
(today's `$.prompt.fill`). `/review` stays the only writer of verdicts.

**The mod's own round.** `on('prompt.submit')` (`:484-487`) stays an
observer, gains: if the session's focus REQ (or the REQ the text names) has
an open gate in `gateA`, `replyOf(e.text, options)` → when `decision` names
an option, `trailAdd(id, phaseName, rounds += { at, decision, note,
viewed? })`. Typed replies count too. The vault's `phases` block still wins
where both exist (`ctxOf`, `:957-959`).

**Card redraw** (`:755`): the line becomes
`↓ your call — reply in the prompt, or pick in the cockpit (p)`; the
`isOpen` test is unchanged.

**Band resume** (`:662-665`): `resume` stays only for a REQ whose gate this
session has not seen a card for (`trail[id][phase].card` missing or older
than the marker) — a gate opened in another session needs `/proceed <id>`
to re-emit it. For a gate this session just emitted, the band shows the
options count instead (`◆ REQ-sf-033 · gate 4/5 review · 5 options · p`).

#### 3.0.5 Compact at the gate (D3)

Settings (`types/index.d.ts:86-95`, `DEFAULTS` at `register.tsx:56`):
`compact: 'button' | 'suggest' | 'never'` (default `'button'`),
`compactAt: number` (default `70`, percent). Settings page
(`:1757-1816`) gains two rows after *gate cards*: `compact at gates`
(button / suggest / never) and `suggest from` (60 / 70 / 80 / 90).

In the action bar, when `compact !== 'never'` and the gate is open:

- `[ compact ]` — `compactNow()`; on success a toast `compacted — the gate
  is still open`; nothing is submitted.
- `[ approve · compact first ]` — drawn for the recommended option when it
  is `approve` (and only then: a `fix` round wants the context it just
  built). `await compactNow()` → on `{ skip }` or a rejection, stop and
  toast `not compacted — nothing sent`; on success `send(approve reply)`.
- `suggest`: both buttons draw in `warning` and the bar adds `context
  <p>%` when `(await $.session.usage()).context.percent >= compactAt`;
  otherwise they draw dim. `button`: always drawn, never highlighted.
  `usage()` is read on render, throttled to once per 5 s through a
  module-local cache.

```ts
const compactNow = async (r: FlightReq) => {
  if (busy) throw new Error('turn running')  // $.session.compact rejects mid-turn
  const st = stateOf.get(r.id); const ask = gate[r.id]
  return $.session.compact({ instructions: compactBrief(r, st, ask, folderOf.get(r.id), vault) })
}
```

`busy` is a module-local flag set on `prompt.submit`, cleared on main-loop
`turn.complete`; the buttons are dim while it is set.

`compactBrief` (pure, `M/hooks/vault.ts`), ≤1,200 characters:

```
ADLC gate compaction. Resuming <ID> (<REQ_PATH>) at phase <n> <name>,
gate <currentPhaseGate>, waiting since <hh:mm>. The vault is the record;
the summary is not.
Keep verbatim: the gate's options and MY READ; open finding ids
(<C1, M1, m3>); the task list and status (<TASK-001 done, …>); the
user's own words from this phase's rounds.
Drop: tool output, file contents, reviewer narratives — all on disk.
After compaction, re-read in full before acting:
  $TOOLKIT_PATH/core/skills/<phase skill>.md
  $TOOLKIT_PATH/core/GATE-PROTOCOL.md
  .adlc/<REQ_PATH>/pipeline-state.json
  .adlc/<REQ_PATH>/.awaiting-approval
  .adlc/<REQ_PATH>/<the marker's Files: entries>
```

Open finding ids come from `phases["4"].findings` where `decision !==
'accept'`, else the digest; task status from `taskStatus`. The mod never
counts compactions — the trail hook does (1.12.1).

#### 3.0.6 Band ↔ pane (D4)

The band (`:628-671`) is the collapsed form. Content, left to right:

```
◆ REQ-sf-033 · review · gate 4/5 · 212k tok · 2 in flight · 1 at gate   p cockpit
```

- `n in flight` = `deck.reqs.length`; `k at gate` = reqs with `waiting`;
  both omitted when 1 / 0. The `flying` agent count (`:639`) moves after
  the phase as today.
- `p` toggles: pane open → `$.ui.close({ id: PANE })`; closed → open on the
  focus REQ's live phase. The `cockpit` button keeps hotkey `f` for one
  release as an alias. New `/flight` argument `toggle`; `close` stays.
- A module-local `paneOpen` flag, set in `openPane` (`:421-424`) and on
  `/flight close`; the band reads it to label the key `p cockpit` / `p hide`.
- Closing the pane never hides the band; `/flight band` still toggles it.
- `$.ui.open` has no dock-side option; the engine docks right from ~110
  columns and draws inline above the prompt when narrower. Whether passing
  `rows` (and no `columns`) forces the inline form on a wide terminal is
  **(unverified — live check 5)**. If it does, Settings `pane width` gains
  an `inline` choice that opens with `{ rows: 18 }`. If it does not, the
  band is the collapsed form and that is the whole of D4.

#### 3.0.7 Narrow mode (D5)

Breakpoint: **pane body below 84 columns** (`e.props.bodyColumns - 2 < 84`).
Why 84: it is the existing `narrow` constant (`:810`), and it is where the
tab row stops fitting — five tabs at their 12-column minimum plus the
`history` / `settings` pair (~24) is 84 (`:908`); below it labels clip to
`◆ implem…`. Consequence worth knowing: a pane docked at ≤45% width is
under 84 body columns on any terminal narrower than ~190, so the docked
pane on a laptop is usually in narrow mode; the wide tab view is for big
terminals and inline panes. That is the intent — the list home is the
better narrow layout, not a degraded one.

In narrow mode, `tabs()` (`:907-944`) is replaced by `listHome()` when
`view.sub.kind === 'page' && view.home`:

```
REQ-sf-033  retry with backoff
✓ spec        approve · 1 round
✓ architect   approve · predict answered
✓ implement   approve · viewed 6/7
◆ review      3 findings · 1 needs a call · viewed 4/7 · waiting 2:10
○ ship
history · settings
```

One `Button` per row (`key="home-<n>"`, hotkey the phase number when no
action bar is on screen); select → `view.home = false, tab = n`. Every
phase page in narrow mode starts with `‹ back` (`key="home"`, hotkey `b`
when no sub-view is open, otherwise `b` keeps closing the sub-view first).
The open gate's row draws first-in-tone and the list opens with that row
selected. Wide mode is unchanged.

Row text per phase (pure, `phaseLine(c, v)`): gate state; then the last
round's decision; then findings `k need a call` at review; `viewed n/m` at
3–4; `predict answered|skipped` at 2; `summary answered` at 5.

#### 3.0.8 REQ strip and resolution (D6)

At the top of the pane, above the header, when `deck.reqs.length > 1`:

```
◆ REQ-sf-033 review · ✈ REQ-sf-034 implement · ✈ BUG-sf-7 fix
```

- Members: every folder `isActive(st)` and (`waiting` or `gateState` in
  `awaiting | cleared | blocked`), plus the members of any running sprint —
  `sprints/**/SPRINT-*.json` with `status: "running"`, `reqs[].id`
  resolved by full id (a member with no folder on this machine draws dim,
  `not on this machine`).
- Order: at a gate first (oldest wait first), then by `touchedAt`.
- Default selection: the REQ at a gate; else the most recently stamped
  (`pipeline-state.json` mtime) — no longer `focus` alone.
- Selecting a chip sets `view.req` and the tab to that REQ's live phase;
  `focus` is not changed (focus is what this session flies; the strip is
  what the user looks at). In narrow mode the strip collapses to
  `‹ 1/3 REQ-sf-033 ›` with `,` / `.` to step.
- Every lookup that matched by number now matches the full id;
  `deck.reqs.find(r => r.id === …)` sites are unchanged because the ids
  themselves are now right (3.0.1).

**Plan vs actual on the REQ's branch** (`refreshGit`, `:286-334`):

- `cwd` = `st.workPath` when it exists, else the repo root (as today).
- `tip` = `st.branch` when `git rev-parse --verify <branch>` succeeds,
  else `HEAD`.
- `:303` `merge-base HEAD <cand>` → `merge-base <tip> <cand>`; skip `cand`
  equal to `tip` (as `:302`).
- `:307` `diff --name-status base HEAD` → `diff --name-status base <tip>`.
- `:306`, `:308` porcelain and the working-tree numstat are taken only when
  `rev-parse --abbrev-ref HEAD` in `cwd` equals `tip` (worktree mode, or
  branch mode with the branch checked out); otherwise the matrix is
  committed-only and the header says `committed only — <branch> is not
  checked out here`.
- `FlightGit` gains `tip: string` and `checkedOut: boolean`.

#### 3.0.9 State shape

`M/types/index.d.ts`:

```ts
/** One option of an open gate, from the marker (1.12) or the card's Decision line (1.11). */
export type FlightOption = { label: string; consequence: string; needsArg: boolean; recommended: boolean }
export type FlightGateAsk = { phase: string; req: string; ask: string; options: FlightOption[]; source: 'marker' | 'card' }

export type FlightStripEntry = { id: string; phase: number; phaseName: string; waiting: boolean; sprint: string | null; here: boolean }

export type FlightLayout = {
  /** band only, or band + pane — the band never goes away while `settings.band` is on */
  pane: boolean
  /** body columns below 84 */
  narrow: boolean
}

// FlightSettings (:86-95) gains
//   compact: 'button' | 'suggest' | 'never'
//   compactAt: number            // percent, default 70

// FlightView (:69) gains
//   home: boolean                // narrow mode: the list home is showing

// FlightRound (:98) gains
//   via?: 'pane' | 'typed'

// FlightGit (:122-136) gains
//   tip: string; checkedOut: boolean

declare module 'claude-code' {
  interface PluginState {
    'adlc-flightdeck': {
      // … the fourteen keys of 0.5.0 (:146-160), plus
      gate: Record<string, FlightGateAsk>
      strip: FlightStripEntry[]
      layout: FlightLayout
      pending: { req: string; at: number } | null
    }
  }
}
```

`layout.narrow` is written by the Pane render from `bodyColumns`; the band
reads `layout.pane`. Nothing new goes to `$.store` except the two settings.

#### 3.0.10 Tests (41 → 53)

Changed:

- `flightdeck.test.tsx:158` *at a gate: the wait, and resume when Claude is
  idle* → *at a gate: resume only for a gate this session has not seen;
  otherwise the options count* (two cases).
- `flightdeck.test.tsx:240` *gate answers → decision and note* → *a reply →
  decision, note and the trailer lifted out* (`replyOf`; typed `approve`,
  `fix C1,M1 · accept m2`, `revise: tighten AC2 [flightdeck] viewed 4/7
  files`, a question that names no option → `decision: ''`).

New (`flightdeck.test.tsx` unless noted):

1. *ids: REQ-sf-033 resolves whole — never REQ-033, and L-REQ-035-1 is not
   REQ-035* (`splitFolder`, `idOf`, `HEADER`, `parseHot`, `parseDispatch`).
2. *focus: a prompt that mentions a lesson id keeps the REQ being flown*.
3. *marker: Ask, Options and Recommended parse; a 1.11 marker gives no
   options and the card's Decision line fills in* (`parseMarker`,
   `optionsFromDecision`).
4. *reply text: trailer at implement and review only, `pane` elsewhere, an
   argument substituted for <ids>* (`replyFor`).
5. *pane at a gate: an option button submits as the user, once* — mount on
   `terminal`, press `opt-approve`, expect one `prompt.submit` with
   `{ text: 'approve\n\n[flightdeck] viewed 1/2 files', asUser: true }`;
   a second press sends nothing. How the test harness observes a `$` call
   **(unverified — the existing tests stub `clock.now` with `on(...)`;
   check that `prompt.submit` can be observed the same way)**.
6. *the dialog is left alone: an AskUserQuestion call passes through
   untouched* — the regression test for §1: `tool.call` with
   AskUserQuestion at a phase-3 gate, the result's `response` is
   `undefined` after the hook.
7. *compact: button draws, suggest highlights from the threshold, never
   hides it*.
8. *approve · compact first: compacts, then sends; a skipped or rejected
   compact sends nothing*.
9. *band: n in flight · k at gate; p opens and closes the pane, the band
   stays*.
10. *narrow: under 84 columns a list home replaces the tabs; a row opens its
    phase; ‹ back returns*.
11. *strip: every in-flight REQ, the one at a gate first; a sprint member
    with no folder here draws dim; choosing one switches the tabs*.
12. `evidence.test.tsx` *plan vs actual diffs the REQ's branch when another
    branch is checked out* (pure: the argument list `refreshGit` builds,
    factored as `gitPlan(st, head)`).

`flightdeck.test.tsx:362` (*a gate message draws as a card*) gains one
assertion: the open card's last line names the cockpit, not a dialog.

#### 3.0.11 Docs and manifest

- `M/.claude-plugin/plugin.json` → `"version": "0.6.0"`; description:
  `…, gate cards; answer a gate from the pane`.
- `M/README.md`: the sample at `:72` (`[ resume — the dialog in the
  transcript has the options ]`) becomes the action bar; `:151` *rounds* —
  "each gate reply, from the pane or typed"; new sections *Answering a
  gate*, *Compact at a gate*, *Narrow panes*, *More than one REQ*; the keys
  line (`[` `]` `g` `p`).

### 1.12.1 — the toolkit (manifest 1.12.0)

All prose changes are applied by `apply-1.12.1.py` (§8). New wording is
drafted in full below for GATE-PROTOCOL and `/review`; the other skills get
a delta paragraph each, applied with the same words where they repeat.

#### 3.1.1 `core/GATE-PROTOCOL.md`

`:7` replace with:

> The card is the chat-facing twin of the `.awaiting-approval` file marker.
> The marker persists the gate across sessions and carries its options; the
> card is what the user reads now. **Both are always written at a gate, and
> then the turn ends.**

`:15` invariant 5, replace with:

> 5. **The gate ends the turn.** Stamp the state, write the marker, emit the
>    card — and stop. No tool call after the card, no question tool, no
>    "shall I go on?". The user's next message is the answer, typed or sent
>    from the cockpit. The `Decision →` line lists the gate's real options,
>    each with its consequence (invariant 4), the one you recommend marked
>    `(recommended)`; the marker's `Options:` block holds the same set, so a
>    cockpit can draw it as buttons. A reply that names no option — a
>    question, a remark — gets an answer, and the gate stays open: end that
>    turn with the `Decision →` line again, nothing more. Silence, or a
>    reply that only asks, is never an approval. This is the same on every
>    assistant; none of them needs a dialog for it.

`:17` invariant 7, replace with:

> 7. **Keep it short.** The card orients; it is not a report. Target 20
>    lines or fewer. When there is more to show (a long findings list, a
>    full task plan), keep it in the artifact file and offer it on demand —
>    "say `show findings` for the full list" — instead of inlining it. The
>    card is the ask; the cockpit (`/flight`, the flightdeck mod) is the
>    long form and the place to answer from — it draws the artifact files,
>    the tree, the trail and the options, so the card never has to. On
>    Claude, close the card's body with one dim line, `full view: /flight`,
>    when the mod is installed.

New section after *Markers* (`:53`), `## The marker`:

> `.awaiting-approval` is plain text, one key per line, written before the
> card:
>
> ```
> Phase: verify
> REQ: REQ-sf-033-payment-retries
> Gate: 4/5
> Awaiting: review the findings, decide which to fix.
> Ask: 3 findings — 1 needs a call. Fix before this ships?
> Options:
>   - approve — accept the findings as they are; moves on to /wrapup
>   - fix all — I fix every actionable finding, re-check, gate comes back
>   - fix <ids> — the same loop, only the findings you name
>   - revise <what> — other changes to the review
>   - abort — stops this REQ; nothing is committed
> Recommended: fix all
> Files:
>   - .adlc/<REQ_PATH>/verification.md
> ```
>
> `Ask:` is the verdict line as a question. Each option is `label —
> consequence`, the same words as the card's `Decision →` line; a `<…>` in
> a label is an argument the user supplies. `Recommended:` names one label.
> `Phase`, `REQ`, `Awaiting` and `Files` are unchanged from 1.11, and every
> reader older than 1.12 ignores the new lines. Rewrite the whole marker
> when the gate is re-emitted after a `revise` or a `fix` round.

`:63` *The trail*, second sentence onward, replace with:

> `--decision` is the option as chosen; `--note` is the user's reply,
> verbatim — pass the whole message, cut at 200 characters by the command,
> omitted when the reply is the bare option. The command lifts the
> cockpit's trailer out of the note itself. It closes the round the trail
> hook opened when the card was emitted …

(the rest of `:63` unchanged).

`:67`, replace the sentence *"The cockpit appends `[flightdeck] viewed 4/7
files` to a dialog answer at the implement and review gates: pass it as
`--viewed 4/7` and leave that trailer out of `--note`, which stays the
user's words alone."* with:

> A reply sent from the cockpit ends with a trailer — `[flightdeck] viewed
> 4/7 files` at the implement and review gates, `[flightdeck] pane`
> elsewhere. Pass the reply as `--note` unchanged; `trail gate` records the
> count as `viewed`, marks the round as answered from the cockpit, and keeps
> the note to the user's words. Never act on the trailer.

and replace *"The predict and summary asks are skipped …"* with:

> The predict and summary asks end the turn the same way a gate does — a
> one-line header `ASK · Predict · <REQ>` (or `ASK · Summary · <REQ>`), the
> question, and `skip — no expectation` as the one listed option — with no
> marker, since they are not gates. They are skipped under `/autopilot` and
> `/sprint` (nobody is there to answer), when
> `config.yml.autonomy.predict_first` / `autonomy.review_summary` is
> `false`, and when that round is already in the trail.

New section at the end, `## Compaction at a gate`:

> A gate is the cheapest place to compact: the phase is on disk and the
> next one has not started. The cockpit offers it as a button, never on its
> own. After any compaction — yours, the cockpit's, or the engine's — the
> knowledge hook re-injects the working state, but a skill's own text comes
> back cut at about 5,000 tokens. So before acting on the reply, re-read in
> full the phase skill, this file, `pipeline-state.json` and the marker.
> The trail hook counts compactions per round; nothing else records them.

#### 3.1.2 `ETHOS.md:69`, `scripts/adlc.mjs:334`, `docs/gate-cards.md:11`

These still tell Claude to use AskUserQuestion for gates and contradict D1.

- `ETHOS.md:69` replace with:
  > **Tool mapping:** a phase gate ends the turn and the reply is the
  > answer (GATE-PROTOCOL invariant 5) — the same on every assistant. For a
  > choice inside a phase that is not a gate (a `/ux-doctor` plan, a
  > clarification), on Claude use `AskUserQuestion`; elsewhere a short
  > numbered list inline. Either way: discrete options, a recommendation,
  > and room for the user to go off-menu.
- `scripts/adlc.mjs:334` (the generated memory file's principle 6): replace
  *"On Claude, use the `AskUserQuestion` tool; elsewhere, a short numbered
  list inline."* with *"A gate ends your turn and waits for the reply; for
  other choices, on Claude use `AskUserQuestion`, elsewhere a short
  numbered list inline."*
- `docs/gate-cards.md:11` replace the second sentence with *"The card ends
  your assistant's turn; you answer by replying — or, with the flightdeck
  mod, by picking the option in the cockpit beside the evidence."*

`/ux-doctor` (`:84`, `:193`) keeps AskUserQuestion: it is not a phase gate.

#### 3.1.3 `/review` — the gate step in full

`core/skills/review.md:343-352` step 8, replace with:

> ### 8. Write the gate marker
>
> Write `.adlc/<REQ_PATH>/.awaiting-approval` per GATE-PROTOCOL → *The
> marker*, with this gate's options. Include `fix all` whenever at least
> one actionable finding exists; set `Recommended:` to the option `MY READ`
> will name.
>
> ```
> Phase: verify
> REQ: REQ-NNN-<slug>
> Gate: 4/5
> Awaiting: review the findings, decide which to fix.
> Ask: <the verdict line, as a question>
> Options:
>   - approve — accept the findings as they are; moves on to /wrapup
>   - fix all — I fix every actionable finding, re-check, gate comes back
>   - fix <ids|all-major> — the same loop, only the findings you name
>   - revise <what> — other changes to the review
>   - abort — stops this REQ; nothing is committed
> Recommended: <label>
> Files:
>   - .adlc/<REQ_PATH>/verification.md
>   - .adlc/<REQ_PATH>/review-log.md (full narratives — open on demand)
> ```

`:364` (the **Decision** bullet of step 9), replace with:

> - **Decision** — the last line, `Decision →`, with the same options as
>   the marker: **approve** (accept findings as-is → `/wrapup`), **fix
>   all** (every actionable finding gets fixed, affected reviewers re-run,
>   gate comes back — needs-decision findings return named), **fix**
>   (`<ids>` or `all-major` — same loop, scoped), **revise** (other changes
>   to the review), **abort** (escalate; halt). Mark the one `MY READ`
>   names `(recommended)`. Then end your turn: the user's reply is the
>   answer (GATE-PROTOCOL invariant 5).

The example card (`:369-389`) changes in its last two lines only:

```
Decision →  approve · fix all (recommended — I fix, then re-check) ·
            fix <ids|all-major> · revise <what> · abort
full view: /flight
```

`:391-393` *Gate clearance*, replace the opening with:

> ## Gate clearance
>
> The answer is the user's next message. Read its first words for the
> option — `approve`, `fix all`, `fix C1,M1`, `fix all-major`, `revise …`,
> `abort` — and treat the rest as their note. A reply that names no option
> is not an answer: respond to it, then end the turn with the `Decision →`
> line again; the marker stays.
>
> **Record the answer first, whatever it is** — `node
> $TOOLKIT_PATH/scripts/adlc.mjs trail gate --vault .adlc --req <REQ_PATH>
> --decision <option> --note "<the reply, verbatim>"` — then take the
> branch below. If the conversation was compacted since the card, re-read
> this file, GATE-PROTOCOL and the marker first (GATE-PROTOCOL →
> *Compaction at a gate*).

`:428` (`abort` step 1, *Confirm explicitly*), replace with: *"Ask once,
plainly, and end the turn — "This stops REQ-NNN; nothing is committed.
Abort?" — and act only on a yes in the next reply."*

Step 4 of the `fix` branch (`:423-425`, "re-emit the gate prompt") gains:
*"Rewrite the marker with the new counts and options before the card."*

#### 3.1.4 Deltas for the other gate skills

Each delta has three parts, applied with the words of 3.1.3 adapted:
(a) the marker step lists `Gate:`, `Ask:`, `Options:` (the card's options
with their consequence clauses verbatim) and `Recommended:`; (b) the
**Decision** bullet drops "on Claude, an `AskUserQuestion`" for "the
`Decision →` line … Then end your turn"; (c) *Gate clearance* opens with the
"answer is the user's next message" paragraph and passes `--note "<the
reply, verbatim>"`. Every in-clearance confirmation becomes a one-line
question that ends the turn.

- **`/spec`** (`spec.md:114-124` marker, `:135` decision, `:152` record,
  `:169` abort confirm). Options: `approve — ready for /architect` ·
  `revise <what> — I change requirement.md, re-check, ask again` · `abort —
  deletes this REQ's folder`. The abort confirmation names the folder.
- **`/architect`** (`:199-213` marker, `:226` decision, `:250` delete the
  parenthetical, `:254` record, `:260` ADR confirm, `:272` abort confirm).
  Preflight 5 (`:31`) becomes a turn-end ask: *"Before I show the design:
  which files do you expect this touches, and how would you approach it?
  One line each is enough. Reply `skip` to go straight on."* under the
  header `ASK · Predict · REQ-NNN-<slug>`, and the turn ends; on the reply,
  record `--decision predict --note "<reply>" --phase 2` and continue at
  step 6. Not asked when a `predict` round already exists for this REQ.
  The ADR acceptance at clearance step 3 folds into the options when an ADR
  was proposed: `approve — move on to implementation; ADR-NNN accepted` ·
  `approve, reject ADR-NNN — move on; the decision is recorded rejected` —
  one gate, no second question. Flagged in §5: a two-option approve is a
  wording change the owner should accept.
- **`/implement`** (`:124-135` marker, `:147` decision, `:168` record,
  `:185` abort confirm). Options: `approve — run the commits in
  commits-draft.md, then /review` · `revise <what>` · `abort — discards
  the uncommitted code; cleanup commands follow`.
- **`/wrapup`** (`:221-232` marker, `:234-236` step 7b, `:249` decision,
  `:274` record, `:294-298` working-set question). Step 7b becomes the
  turn-end ask `ASK · Summary · REQ-NNN-<slug>` — *"In your words: what
  does this change do, and what did you check? Two to four lines, or
  `skip`."* — before the marker and card are written; the card follows on
  the next turn. The `merged` branch's *delete or keep* question
  (`:294-298`) ends the turn the same way, `keep` the stated default.
- **`/bugfix`** (`:68`, `:136`, `:189`, `:223`, `:281` decisions; `:81`
  record). **Finding:** `/bugfix` never writes `.awaiting-approval` at any
  phase (no occurrence in the file), so the notifier, the statusline, the
  trail's Stop hook and the mod never see a bug at a gate. Each of the five
  gates gains a marker step (`Phase: report|plan|fix|verify|ship`) before
  its card, with its options (`reframe — turns this into a feature REQ via
  /spec` where offered), and each clearance deletes it on `approve`.
- **`/task`** (`:108`, `:185` decisions; `:123` record; `:125` "delete any
  marker"). Same finding: no marker is written. Both gates gain the marker
  step; `escalate — hands this REQ to /proceed at architect` and `merged`
  ride in the options.

#### 3.1.5 `/proceed` — routing and the compaction resume

`proceed.md:284-300` (the loop), replace the two `WAIT for user response`
lines with `END THE TURN — the user's reply is the next message`, and add
after the block:

> A gate is not a pause inside your turn; it is the end of it. When the
> reply arrives, it arrives as a new user message in the same
> conversation: route it (below), and carry on the loop.

`:322-332` *Gate response routing*, add one bullet:

> - **A reply that names no option** (a question about a finding, a
>   remark) → answer it, then end the turn with that gate's `Decision →`
>   line again. The gate stays open; nothing is recorded.

`:334-345` *Cross-session resumption*, insert as the new step 1:

> 1. **After a compaction, reload the protocol before anything else.** If
>    this conversation carries the knowledge hook's *ADLC working state
>    recovered after compaction* block — or you cannot quote the current
>    phase's gate options from the skill text — re-read in full, by path:
>    `$TOOLKIT_PATH/core/skills/<phase>.md` for `currentPhase` (spec,
>    architect, implement, review, wrapup), `$TOOLKIT_PATH/core/GATE-PROTOCOL.md`,
>    `.adlc/<REQ_PATH>/pipeline-state.json` and `.adlc/<REQ_PATH>/.awaiting-approval`.
>    The engine re-injects an invoked skill cut at about 5,000 tokens; every
>    phase skill is longer than that, and the cut half holds the gate.
>    Then, if the marker is present, re-emit that gate's card from the
>    marker and the artifact files, and end the turn.

(renumber the rest). Preflight 5 (`:40-45`) gains: *"`gateState:
"awaiting"` or a marker present — either one — means you are at a gate."*

#### 3.1.6 `/recover` (D7)

`recover.md:47-52` signals, add a bullet:

> - `.awaiting-approval` present, and its `Phase:` and `Gate:` lines

`:71-82` classification table, add a row above `divergent`:

> | `.awaiting-approval` present, branch alive, artifacts match its `Phase:` — whatever `gateState` says | **in-sync-at-gate** | suggest `/proceed`; it re-emits the gate. If `gateState` is not `awaiting`, set it (`currentPhaseGate` from the marker's `Phase:`) and note `recoveryNotes: "gateState restored from marker"` |

and add under the table: *"The marker is the gate signal. `gateState` can
lag it — a session that wrote the marker and died before the state write,
or a hand edit — and the marker wins. A marker whose `Phase:` disagrees
with `currentPhase` is `divergent`."*

`:95-123` queue format: the `Claimed:` line gains `· marker: <phase> |
none`.

#### 3.1.7 `adlc-trail.mjs`

`core/extras/claude/hooks/adlc-trail.mjs`:

- **IDs** (`:57`, `:75`, `:141`, `:288-289`, `:309`): one constant
  `const ID_SRC = '(?:REQ|BUG)-(?:[a-z][a-z0-9]{0,7}-)?\\d+'`;
  `folders()` matches `^${ID_SRC}` (so `REQ-sf-033-*` is seen);
  `resolveReq(vault, hint)` tries, in order: a vault-relative path
  (`join(vault, hint)` has `pipeline-state.json` — this is the
  `<REQ_PATH>` every skill passes), an `.adlc/`-prefixed or absolute path,
  a basename, then the full id (`basename(f) === id || startsWith(id +
  '-')`) — never the number alone. `transcriptHead` and `evidenceOf` use
  `(?<![\w-])(${ID_SRC})`.
- **SessionStart** (`:154-163`): `if (ev.source === 'compact')` no longer
  returns; it stamps
  ```js
  const ph = phaseOf(st, Number(st.currentPhase) || 1);
  const last = ph.gates?.[ph.gates.length - 1];
  if (last && !last.decision) last.compactions = (last.compactions ?? 0) + 1;
  else ph.compactions = (ph.compactions ?? 0) + 1;
  ```
  on the REQ resolved as below, and returns. No settings change: the trail
  is already wired on `SessionStart` with no matcher
  (`claude-settings.mjs:91`), which fires for `compact`.
- **Which REQ** (`resolveReq(vault)` with no hint, `:81-89`): prefer a
  non-terminal folder holding `.awaiting-approval` (newest marker), then
  the newest `pipeline-state.json`. **Stop** (`:202-217`) passes the id
  from the message's `GATE n/m · <phase> · <ID>` header as the hint when
  there is one, so two REQs open in one checkout land right.
- **Stop copies the ask**: when the marker has `Options:`, the round gets
  `ask: { text, options: [label…], recommended }` (labels only, ≤8, each
  ≤40 chars) beside `card`. A re-emitted card refreshes it.
- **`trail gate`** (`:236-256`):
  ```js
  const TRAILER = /\s*\[flightdeck\](?: viewed (\d{1,3})\/(\d{1,3}) files?| pane)\s*$/;
  const raw = flag('--note') || '';
  const t = TRAILER.exec(raw);
  const note = cut(raw.replace(TRAILER, ''), NOTE_MAX);       // strip before cutting
  const viewed = /^\d{1,3}\/\d{1,3}$/.test(flag('--viewed') || '') ? flag('--viewed')
    : t && t[1] ? `${t[1]}/${t[2]}` : null;
  const via = t ? 'pane' : 'typed';
  ```
  and `round.via = via`. Today the cut runs first (`:239`), so a reply
  longer than 200 characters loses its trailer to the ellipsis and the
  strip regex no longer matches; stripping first fixes that. A note equal
  to the decision (`approve`) is dropped. The printed line gains `· via
  pane` when so.
- Usage line (`:15`, `:273`): `[--note "<the reply>"]`, `--viewed` kept as
  an explicit override.

#### 3.1.8 `adlc-knowledge.mjs` — the compaction snapshot

`core/extras/claude/hooks/adlc-knowledge.mjs:232-269`:

- `:236-253` the active-REQ walk prefers a folder with `.awaiting-approval`
  (newest marker), then the newest state — the same rule as the trail.
- After `:258` add, when the active item is resolved:
  ```js
  const skill = { 1: 'spec', 2: 'architect', 3: 'implement', 4: 'review', 5: 'wrapup' }[active.phase];
  const kit = posix.join(dirname(fileURLToPath(import.meta.url)).replace(/\\/g, '/'), '../../../..');
  lines.push(`- **Re-read before acting** (a skill comes back from compaction cut at ~5,000 tokens): \`${kit}/core/skills/${active.kind === 'bugfix' ? 'bugfix' : active.kind === 'task' ? 'task' : skill}.md\`, \`${kit}/core/GATE-PROTOCOL.md\`${awaiting ? `, and the marker \`.adlc/${active.dir}/.awaiting-approval\` — it lists the gate's options` : ''}.`);
  ```
  (`kind` read from the state; `fileURLToPath` from `node:url` added to the
  imports at `:39-42`). The path is the toolkit the hook runs from — no
  `$TOOLKIT_PATH` lookup needed.
- `:267` *Preserve verbatim* gains *"the gate's options and the user's
  last reply"*.

#### 3.1.9 `core/manifest.json` and the rest

- `core/manifest.json` → `"version": "1.12.0"`.
- `core/extras/claude/README.md`: the trail paragraph mentions
  `compactions` and `via`.
- `templates/record-template.md:73-75` sample Trail lines gain the forms
  `· via pane` and `· 1 compaction`; `/wrapup` step 3b's Trail row
  (`wrapup.md:148`) adds *"a round's `via pane` and `compactions` ride
  after its decision"*.
- `adapters/` regenerated (`node scripts/adlc.mjs build --tool=all`). The
  working tree already carries 124 uncommitted one-line adapter changes
  (frontmatter `description:`); the rebuild rewrites those files anyway —
  commit or discard them before applying so the 1.12 diff reads clean.

### 1.12.2 — measurement

`adlc-trail.mjs` `evidenceOf` (`:308-369`) and `stats` (`:371-410`):

- per round: `via` (absent → `typed` for rounds after 1.12, `unknown` for
  older ones — counted apart, never as typed), `compactions`.
- record path (`:349-365`): the Trail line forms `· via pane` and
  `· N compactions?` parse back.
- `out.via = { answers, pane, typed, unknown }`;
  `out.compactions = { gates, total, perGate, atGateRounds }` where
  `atGateRounds` counts rounds with ≥1 compaction.
- two summary lines after `viewed`:
  ```
  via pane    12 of 19 gate answers (7 typed · 4 before 1.12)
  compaction  5 at gates across 31 rounds · 0.16 per gate · 3 rounds compacted
  ```
- `--all` table gains `via` (`p/t`) and `cmp` columns.

`core/skills/status.md` § 4b *Gate evidence*, append:

> Two more lines since 1.12: how many gate answers came from the cockpit
> rather than typed — the number that says whether answering beside the
> evidence is used — and compactions at gates per round, the cost of long
> phases made visible. Paste them verbatim like the rest.

---

## §4 Not changed

- `/autopilot` and `/sprint`, the `decision-maker`, `pipeline-runner`'s gate
  protocol (it already ends at the marker and waits), the sprint gate
  queue's prose replies.
- `/ux-doctor`'s two AskUserQuestion menus: not phase gates.
- Gate semantics: every option does what it did in 1.11.
- The card format, its section labels, the 20-line target, invariant 8.
- `claude-settings.mjs` WANT table (`:80-94`): no new hook — the trail's
  `SessionStart` entry already fires on compaction.
- The mod's read-only stance: it never writes `.adlc/`, never runs a git
  write, never answers a tool call.
- The engine's dock side.
- `ticket`-scheme folders with a native key (`PROJ-842-slug`): unseen by
  every reader today; their own release.
- No new agent, gate or skill.

---

## §5 Risks

**Hook budget (10 s).** The mod's `prompt.submit` observer gains a marker
lookup — an atom read, no disk. `scan()` reads the marker through
`cached()` (mtime-keyed) inside the existing debounced scan. The trail hook
reads the marker once on Stop and once on compaction; both under the same
lock as today. `$.session.usage()` is cached for 5 s. Nothing new runs a
process.

**`prompt.submit` while a background agent runs.** At a gate the main turn
has ended, but a background agent or Monitor may still be going, and
`submit` waits until the session is idle. The button must not look dead or
double-send: `pendingA` shows *sent — Claude picks it up when it is idle*,
and dims the bar until the next main-loop `turn.complete`. A user who
types in the prompt meanwhile sends a second reply; the skill reads the
first as the answer and answers the second as a remark (invariant 5).
**(unverified — check at apply time: whether a queued `submit` survives
the user typing and sending their own message first.)**

**`compact` rejecting mid-turn.** `$.session.compact` rejects while a turn
runs and resolves `{ skip }` when a hook vetoes. *Approve · compact first*
never submits unless the compact resolved without `skip`; the buttons are
dim while `busy`. The engine's own auto-compact can still land mid-phase —
the resume step in `/proceed` covers that case the same way.

**The 5,000-token skill cap.** After any compaction the phase skill comes
back truncated (review.md is 33KB). Three layers carry the gate across:
the marker holds the options; the knowledge hook names the files to re-read
by absolute path; `/proceed` resume step 1 makes re-reading the first act.
A direct `/review` (no `/proceed`) relies on the hook line and
GATE-PROTOCOL's new section alone — the protocol file itself is 8KB and
also cut, so the hook line is the load-bearing one.

**The turn ends inside a skill.** The predict and summary asks now end the
turn mid-skill; the next turn must resume at the step after the ask. Inline
skills keep their text in context, so this holds until a compaction falls
between ask and reply — then the snapshot does not mention the ask. The
`ASK ·` header lets the mod show it in the pane; if the reply arrives after
a compaction and Claude has lost the step, the worst case is the ask
repeated, which the "not asked when the round exists" rule ends.

**Teammates on older versions.**
- *Old mod, new toolkit:* the 0.5.0 mod only stats the marker
  (`register.tsx:219`); new lines are ignored. Its card redraw still says
  *the dialog below has the options* — wrong, harmless, since the user
  types. Its `tool.call` branch never fires (no dialog). The CHANGELOG's
  update notes say to update the mod.
- *New mod, old toolkit:* no `Options:` → options from the card's
  `Decision →` line (`source: 'card'`); the skill still opens an
  AskUserQuestion, which the mod now leaves alone, so 1.11's empty-answer
  bug is gone even before 1.12.1. A pane reply sent while that dialog is up
  queues behind it — **(unverified — check at apply time)**.
- *Other readers of the marker* — `adlc-notify.mjs:32`,
  `adlc-statusline.mjs:70`, `adlc-knowledge.mjs:256` — test existence
  only.
- *Other assistants* (Codex, Copilot, Cursor, Gemini) already rendered the
  decision as text; invariant 5 now says what they were doing.

**The ADR fold-in** (3.1.4, `/architect`) changes the clearance from two
questions to one gate with two approve options. It is a wording change
inside an existing gate, not a new gate, but it is the one place this plan
reshapes an option set; reject it and the ADR confirmation stays a
separate turn-end question.

**Hotkey move.** Phase tabs leave the digits. Muscle memory from 0.5.0 will
press `3` expecting the implement tab and, at a gate, pick option 3. The
action bar only takes digits on the open gate's own page, and no option
fires on a single key without the bar on screen; `abort` additionally asks
its confirmation in the next turn.

---

## §6 Live checks (the owner runs, in this order)

1. **Empty-answer regression on a real gate.** In a 1.12 checkout, run a
   REQ to the implement gate. (a) Type `approve` — Claude records
   `trail: … → approve`, and `pipeline-state.json` round has no `via`
   other than `typed`. (b) Revert to the gate (`/proceed --revert~1` or a
   fresh REQ), open the cockpit, view one file, press `approve` —
   the transcript shows your message `approve` plus `[flightdeck] viewed
   1/<m> files`; the trail line reads `→ approve · viewed 1/<m> · via
   pane`; no AskUserQuestion appears anywhere. Repeat (b) on a prefixed
   REQ (`REQ-<initials>-NNN`): the pane header shows the full id and
   `trail gate` finds the folder.
2. **Compaction at the review gate and resume.** At a review gate with
   context above the threshold, set `compact: suggest`, confirm the
   buttons highlight. Press *compact*; then reply `fix all` in the prompt.
   Check: the trail round has `compactions: 1`; Claude re-reads
   `review.md` and GATE-PROTOCOL before dispatching implementers (visible
   as Read calls); the fix round completes and the gate comes back with a
   rewritten marker. Then try *approve · compact first* at the ship gate.
   Then `/compact` by hand mid-implement and confirm `/proceed` resume
   step 1 fires.
3. **Narrow terminal.** Resize to 100 columns with the pane docked (or
   inline): the list home shows, the open gate's row first-in-tone, a row
   opens its phase, `‹ back` returns, the action bar works, and at a phone
   or VS Code surface an option with `<ids>` fills the prompt instead of
   showing an input.
4. **A two-REQ sprint.** `/sprint` two REQs; while one waits at a gate:
   the band reads `2 in flight · 1 at gate`; the strip lists both, the
   waiting one first and selected; switching chips switches tabs; plan vs
   actual for each reads its own worktree. Then, in a single checkout with
   two REQs in `branch` mode, check out the other branch and confirm the
   matrix says `committed only — <branch> is not checked out here`.
5. **Inline-forcing probe.** Open `.claude-plugin/types/claude-code/index.d.ts`
   in the installed mod and read `UiOpenInput` (or whatever names the
   `$.ui.open` argument): is there a documented effect of `rows` without
   `columns`? Then, at ≥140 columns, `/flight` with Settings `pane width:
   inline` (temporary build that passes `{ rows: 18 }`): docked right, or
   inline above the prompt? Record the answer in the mod README; if it
   docks, drop the `inline` choice and keep the band as the collapsed form.
6. **Hotkeys `[` and `]`.** Same types file: does `Button.hotkey` take any
   printable character? If not, switch to `,` / `.` before release.

---

## §7 CHANGELOG

Inserted above `## [1.11.0]` (`CHANGELOG.md:7`):

```markdown
## [1.12.0] — unreleased

### The gate is the turn — answer beside the evidence, and nothing in between **[protocol]** **[tooling]**

A gate answered in the dialog at the implement or review gate reached Claude as `User answered Claude's questions: · [flightdeck] viewed 0/74 files` — the trailer and nothing else. The mod's `tool.call` hook set the dialog's `response` to carry the viewed count, and a hook-set `response` replaces the engine's own formatting of the answer, so the option the user picked never arrived. The fix is not a better hook. A gate had four parts that had to agree — the card, the marker, the engine's dialog and the mod's interception of it — and the one the user clicked was the one the cockpit could not draw and could only break. 1.11 put the evidence in the pane and then sent the user to a 12-row dialog to decide without it.

- **The gate ends the turn** (GATE-PROTOCOL invariant 5, rewritten). Stamp the state, write the marker, emit the card, stop. Your next message is the answer — typed, or sent from the cockpit. A reply that names no option gets an answer and the gate stays open. Every assistant now does the same thing; none needs a dialog. `ETHOS.md` principle 6 keeps `AskUserQuestion` for choices that are not gates.
- **The marker carries the options** (`.awaiting-approval` gains `Gate:`, `Ask:`, `Options:` and `Recommended:`; GATE-PROTOCOL → *The marker*). Each option is the card's own `label — consequence`. Readers older than 1.12 ignore the new lines. `/bugfix` and `/task` now write a marker at every gate — they never did, so nothing outside the transcript ever saw a bug or a task at a gate.
- **Answer from the cockpit** (`adlc-flightdeck` v0.6.0). The phase page at an open gate ends in an action bar: the verdict, `MY READ`, the viewed count, one button per option with its consequence, the recommended one first in tone. A button sends the reply as your own message; an option with an argument (`fix <ids>`, `revise <what>`) takes it in an input, or fills the prompt where there is none. At implement and review the reply carries `[flightdeck] viewed 4/7 files` in plain sight; `trail gate` lifts it into the round and keeps the note to your words. The findings grid's *compose* gains *send*. The dialog branch is deleted; the mod answers no tool call. Option keys are `1`…`n`; phase tabs move to `[` / `]`, `g` for the gate.
- **Compact at the gate, on your say-so.** A *compact* button and *approve · compact first* on the action bar; Settings `compact at gates: button | suggest | never` (default button) and `suggest from` (70%). The instructions are built from the REQ's state: what to keep verbatim, what is on disk, what to re-read. The trail hook counts compactions per round; `/proceed` resume re-reads the phase skill, GATE-PROTOCOL, the state and the marker first, because a skill comes back from compaction cut at about 5,000 tokens; the knowledge hook's snapshot names those files by path.
- **Band ↔ pane.** The band is the collapsed cockpit — REQ, phase, gate, tokens, `2 in flight · 1 at gate` — and `p` opens or closes the pane; closing it keeps the band.
- **Narrow panes get a list home.** Under 84 body columns the tab row becomes one line per phase — gate state, last decision, findings, viewed count — and a phase page opens with `‹ back`.
- **More than one REQ.** A strip at the top of the pane lists every in-flight REQ and sprint member, the one at a gate first and selected.
- **IDs by their full name.** `REQ-sf-033` is no longer read as nothing (the mod showed `REQ-035 · not in this vault` while flying it) or skipped (the trail hook never saw a prefixed folder, so `trail gate` failed and no round opened in a `prefixed` vault since 1.10). One grammar — `REQ-` or `BUG-`, an optional prefix that starts with a letter, the number — in the mod and the hook, and `L-REQ-035-1` is not `REQ-035`.
- **Plan vs actual on the REQ's own branch.** Diffs run against the branch in `pipeline-state.json` and its merge-base, not `HEAD`; with another branch checked out the matrix is committed-only and says so.
- **`/recover` reads the marker.** `.awaiting-approval` is the gate signal; a stale `gateState` is restored from it (`in-sync-at-gate`), and a marker that disagrees with `currentPhase` is `divergent`.
- **Predict and summary end the turn too** (`/architect` preflight 5, `/wrapup` 7b): `ASK · Predict` / `ASK · Summary`, reply or `skip`, not asked again once recorded. The ADR acceptance folds into the architect gate's options.
- **`trail stats`** (1.12.2) and `/status` 4b: *via pane* (gate answers sent from the cockpit vs typed) and *compaction* (per gate, per round).
- `core/manifest.json` → 1.12.0. Patch script: `apply-1.12.1.py` (idempotent, line endings preserved per file); the mod: `apply-1.12.0.py`. Tests: 53.
- **Deliberately not changed:** `/autopilot`, `/sprint` and the runner's gate protocol; gate semantics; the card's format; no new hook wiring, agent, gate or skill.
- **On update:** update the mod with the toolkit (`/plugin` → adlc-mods → update); a teammate on the 0.5.0 mod keeps working but its gate card points at a dialog that no longer appears.
```

---

## §8 Apply order (a Claude Code session; the owner commits)

Rules for the session: git reads with `--no-optional-locks` only; no `git
add`, `commit`, `stash`, `checkout` or `restore`. The Windows checkout is
CRLF with LF blobs, and the Edit tool has corrupted a large CRLF `.mjs`
before — every change below goes through a script that reads bytes, detects
`\r\n` per file, edits on `\n`-normalised text, and writes back with the
file's own ending. Scripts live beside this plan, not in the repo, as with
1.11.

1. **Read first.** `git --no-optional-locks status --short`; stop if
   anything outside `adapters/` and `.claude/` is modified. Ask the owner
   to commit or discard the 124 adapter changes.
2. **Probe the engine.** Read the installed mod's
   `.claude-plugin/types/claude-code/index.d.ts` for `$.ui.open`'s
   argument, `Button.hotkey`, `$.session.compact`, `$.session.usage`,
   `$.prompt.submit`'s `asUser`. Record live checks 5 and 6's type-level
   answers in the session before writing code.
3. **1.12.0 — write `apply-1.12.0.py`** for the mod: every hunk in 3.0.1–
   3.0.11 as `(file, anchor, old, new)`; anchors are the exact current
   lines named above. Two passes: verify every anchor in every file
   (abort with the list of misses, write nothing), then write. A hunk
   whose `new` is already present is skipped, so a second run is a no-op.
   New code blocks (action bar, list home, strip, compact) are inserted at
   anchors, not appended.
4. Run it. Then in the mod folder: `tsc -p .`, `claude plugin validate .`,
   `claude plugin test .` → 53 pass. Fix in the script and re-run, never by
   hand-editing the result.
5. Bump `M/.claude-plugin/plugin.json` (in the script). Mirror the mod
   into `adapters/claude/extras/mods/` via `node scripts/adlc.mjs build
   --tool=claude`.
6. **Owner:** reload the mod; run live checks 1(b) with the old 1.11
   skills — the dialog still appears and its answer now reaches Claude
   intact. Commit 1.12.0.
7. **1.12.1 — write `apply-1.12.1.py`**: GATE-PROTOCOL (3.1.1), ETHOS /
   adlc.mjs / gate-cards (3.1.2), review (3.1.3), the six skill deltas
   (3.1.4), proceed (3.1.5), recover (3.1.6), adlc-trail.mjs (3.1.7),
   adlc-knowledge.mjs (3.1.8), manifest / README / record template /
   wrapup row (3.1.9), the CHANGELOG entry (§7). Same two-pass, idempotent,
   per-file line endings. Prose `new` strings are the drafted wording
   verbatim.
8. Smoke the hooks against a scratch vault outside the repo (a temp dir
   with `.adlc/specs/2026-10/sf/REQ-sf-033-x/` and `REQ-042-y/`, one with a
   1.12 marker):
   - `trail gate --req specs/2026-10/sf/REQ-sf-033-x --decision approve
     --note "approve\n\n[flightdeck] viewed 4/7 files"` → round `viewed
     4/7`, `via pane`, no note.
   - same with `--req REQ-sf-033`; with a 300-character note plus trailer.
   - pipe `{"hook_event_name":"Stop", …GATE 4/5 · Review · REQ-sf-033…}` →
     a round opens on REQ-sf-033 (not REQ-042) with `ask.options`.
   - pipe `{"hook_event_name":"SessionStart","source":"compact"}` to the
     trail → `compactions: 1`; to the knowledge hook → the *Re-read before
     acting* line with an absolute skill path.
   - `trail stats` → the two new lines (after step 10).
9. `node scripts/adlc.mjs build --tool=all`; `git --no-optional-locks diff
   --stat` and read the diff of every core file against this plan.
10. **1.12.2** — the `stats` and `/status` hunks, as a third script
    `apply-1.12.2.py` or folded into step 7's (owner's call; folding keeps
    one manifest bump).
11. **Owner:** live checks 1–4 in order; commit 1.12.1 and 1.12.2; tag
    when the four pass.

---

## Applied 1.12.0

2026-10-24, by `docs/plans/patches/apply-1.12.0.py` (two-pass, idempotent; a second run reports every hunk *already*). Mod only, `core/` only; `adapters/`, skills, hooks, GATE-PROTOCOL, manifest and CHANGELOG untouched.

**Landed** (all of §3 1.12.0):
- 3.0.1 `ID_SRC` / `ID` / `idOf` in `model.ts`; `splitFolder`, `parseDispatch`, `HEADER`, `parseHot`, `hotTail`, `parseRecord`, and the three `register.tsx` sites. `prompt.submit` moves focus only to an id the vault holds.
- 3.0.2 the AskUserQuestion branch of `tool.call` deleted (`AskQuestion`, `gateFor`, the description rewrite, the `response` trailer, the dialog round); `decisionOf` → `replyOf`; `VIEWED_TRAILER` doc comment reworded (no longer imported by `register.tsx`).
- 3.0.3 `parseMarker`, `optionsFromDecision` (handles `label (recommended — …)` and `label — consequence`); `scan()` reads the marker through `cached()` (≤4 KB) into the `gate` atom. `GateAsk` also keeps `files` (for `compactBrief`).
- 3.0.4 `replyFor`, `replyOf`, `trailerFor`; the action bar (`opt-<head>` buttons, `Input` + *send* for `<…>` options, `$.prompt.fill` on surfaces without `Input`, recommended `▸` in `ACCENT`, `n of m changed files not viewed` on approve-like options); `sendReply` with `pending` (cleared on main-loop `turn.complete`, or when the gate moves / after 10 min); compose *send* (`c`) + *edit first*; the mod's own round from typed replies (`prompt.submit`) and pane sends (`via`); card line `↓ your call — reply in the prompt, or pick in the cockpit (p)`; band `resume` only for a gate with no card captured here, else `n options`.
- 3.0.5 settings `compact` / `compactAt` (+ two Settings rows); `[ compact ]`, `[ approve · compact first ]`; `compactBrief` (≤1,200 chars); `busy` set on main-loop `turn.start`, cleared on its `turn.complete`; `usage()` cached 5 s.
- 3.0.6 band `n in flight · k at gate`; `p` toggles the pane (`f` kept as an alias); `/flight toggle`; `layout.pane` tracked through `openPane`, `/flight close`, and a `ui.close` observer.
- 3.0.7 narrow list home below 84 body columns (`phaseLine`), `‹ back` (`b`), digits open a phase while no action bar is on screen.
- 3.0.8 REQ strip (`stripOf`, `sprintMembers`, sprint registries flat or one month down), default selection gate-first; `gitPlan(st, head, resolves)` + `parseLsTree`: diffs run to the REQ's branch tip, committed-only with `committed only — <branch> is not checked out here`; the diff sub-view follows the tip too.
- 3.0.9 `types/index.d.ts`: `FlightOption`, `FlightGateAsk`, `FlightStripEntry`, `FlightLayout`, settings, `FlightView.home?`, `FlightRound.via?`, `FlightGit.tip/checkedOut`, four new state keys.
- 3.0.10 tests 41 → 53 (two changed, twelve new, as named); 3.0.11 `plugin.json` 0.6.0 + description; README sections *Answering a gate*, *Compact at a gate*, *Narrow panes*, *More than one REQ*, *Keys*.

**Decided at apply time (unverified items in the plan):**
- *Hotkeys `[` / `]`* — the engine's `ButtonProps.hotkey` takes "one digit or one lowercase letter … anything else is refused" (claude-code 2.1.310 types), so neither `[` `]` nor the `,` `.` fallback can bind. Tabs step with `j` / `k`, the narrow strip with `w` / `e`, `g` goes to the gate; all in one `KEYS` constant in `register.tsx`. Live check 6 is answered by the types; still worth pressing once.
- *`rows` forcing inline* — not attempted. The `rows` doc says "the dock ignores it"; the band is the collapsed form and no `inline` width choice was added. Live check 5 still decides.
- *`prompt.submit` queueing* — in the test host a plugin submit with `asUser` reaches `prompt.submit` hooks with `origin { kind: 'plugin', asUser: true }`, and a plugin's own hook does not see its own submit (so `sendReply` records the pane round itself). Whether a queued submit survives the user typing first is still a live question (§5).
- `/flight` tab hint now reads `j / k phases · g the gate · 1–6 the gate's options`.

**Deferred:** nothing from 1.12.0. 1.12.1 (toolkit prose, trail/knowledge hooks, manifest, CHANGELOG — including the mod paragraph) and 1.12.2 untouched; `adapters/claude/extras/mods/` not regenerated.

## Applied 0.7.0 layout

2026-10-24. Mod only, `core/` only (`core/extras/claude/mods/adlc-flightdeck`); skills, hooks, GATE-PROTOCOL, manifest, CHANGELOG and `adapters/` untouched. Spec: the *Flightdeck inline* mockup. Edited by content (files are LF); no patch script this time — the change is a layout rewrite, not anchored hunks. `register.tsx`'s diff is mostly the cockpit's re-indent: read it with `git diff -w` (~500 changed lines across the mod).

**Engine facts checked** against the 2.1.310 types before any code: all hold. Pane `placement` is read-only and docks in fullscreen from 110 columns; the AbovePrompt band grows to `maxRows` (fullscreen: what the bottom slot leaves, the slot capped at half the terminal, prompt included) and scrolls a taller tree with its own `n more` row; `bodyColumns` is the band's width less the engine's five; a Button hotkey is one digit or one lowercase letter, letters need the band focused, a bare digit in an empty prompt presses a band Button. Two details the brief did not state: a digit arms **only Buttons wholly inside the band's visible window**, and AbovePrompt is raised on the **terminal and desktop surfaces only**.

**Landed:**
- **No pane.** `$.ui.open`, the `Pane` render site, `openPane` / `togglePane`, the `ui.close` hook, `PANE` and the *pane width* setting are gone. The old pane tree is now `cockpit()`, a top-level function the AbovePrompt hook calls (the validator refuses `$` passed to a function that is not declared at file top level).
- **Three heights** in `layout.height`: `band` (one row), `open` (a Box `height=min(14, maxRows)`, `overflow="hidden"`), `max` (`minHeight=maxRows`, so a taller tree scrolls in the engine's window). `⤢`/`⤡` toggles max, `×` collapses to the row, never removes the band.
- **Band row:** `✈ REQ · phase · gate: <marker Ask> · n in flight · k at gate` left (one Button, so clicking the text opens), `⤢ ×` right; `resume` kept for a gate this session has no card for. No key hints in any header.
- **Level 1:** in-flight REQs as chips (`REQ-sf-034 ● review`, current highlighted), then `history · settings · ⤢ · ×`; history and settings toggle back to the phases. **Level 2:** tabs `1 spec ✓ … 4 review ●` with a `phaseLine` status under each from 110 band columns.
- **Narrow** below `settings.narrowAt` (default 84; cycles 72/84/96/110): chips `034 ●`, `h` / `s`, the list home (one row per phase + status), a row opens its page with `‹ back` top-left. No `‹ ›` arrows, no `w`/`e`, no footer key line.
- **In flight** (`inFlight` in `vault.ts`; *superseded below*): running-sprint member, `.awaiting-approval`, named in `now.md` (full-id grammar, so `L-REQ-035-1` is not `REQ-035`), `phases[n].sessions` holding `$.session.id()`, or the REQ this session is flying. `k at gate` counts only those. Settings → *show all unshipped* (`showAll`) restores the old list. Finished members of a running sprint ride the strip as `✓` (`stripOf` gains `ended`; `sprintMembers` keeps finished members while the sprint runs).
- `KEYS` = `j`/`k` phases, `g` gate, `h`/`s`, `z` max, `p` collapse/open, `b` back, `r` resume (*superseded below: no header keys*); digits stay on the option buttons and the narrow list.
- **The action bar moved under the GATE line** (it was at the page foot, after `MY READ`). Reason: a digit presses only an on-screen Button and `open` cuts at 14 rows, so at the foot the options were unreachable from the prompt. Verdict and `MY READ` stay last. This reverses 0.6.0's "recommendation last" for the options only — say if you want it back.
- Unchanged: gate submit (`$.prompt.submit` asUser, once), compact and *approve · compact first*, viewed marks, ID resolution, branch-tip git, gate cards (their hint now says "pick in the flightdeck above it").
- Types: `FlightHeight`, `FlightLayout.height` (was `pane`), `FlightSettings.narrowAt` / `showAll` (was `columns`), `FlightStripEntry.ended`. `plugin.json` 0.7.0. README: band, heights, in flight, narrow, keys, settings rewritten.
- Tests 53 → 58: the pane helpers mount the band at `max`; the 0.6.0 band / narrow / strip tests replaced by eight 0.7.0 tests (in-flight rule, finished sprint member, band row, heights incl. no `ui.open`, `/flight` opens in place and its close / max / toggle, wide chips + 110-column status, narrow list + back, strip selection). `claude plugin validate .` passes, `tsc -p .` clean (types laid from the 2.1.310 build).

**Could not / did not:**
- **`open` does not scroll.** The engine scrolls only a tree taller than `maxRows`, and Box has `overflow: hidden` but no scroll, so a page longer than 14 rows is cut in `open`; `⤢` shows the rest. Whether a Button clipped by `overflow` still arms its digit is not in the types — live check.
- **No VS Code / phone cockpit.** AbovePrompt is not raised there and the pane is gone, so those surfaces now show only gate cards. Cheap to restore (a pane on non-terminal surfaces only) if you use them.
- **REQ header row dropped** (title, total tokens, *browsing · flying X*): the mockup has none. Tokens remain as the fuel bars on each phase page.
- Sub-views (a diff, a doc, a lane, a card) keep their own `back` (`b`) — the alternative strands you in a diff. The brief's "‹ back only in narrow" holds for page navigation.
- *⟳ compact first* as a toggle (mockup) is not adopted: 0.6.0's `compact` and `approve · compact first` stay, since the brief keeps that logic.
- Caught on the way: `/flight`'s argument regexes had been written with a control character for `\b`, so `/flight close|toggle|max|history|settings|band` all fell through to *open*. Fixed, and the `/flight` test now drives close, max and toggle.
- The in-flight session stamp needs 1.12.1's trail-hook fix for `REQ-sf-*` folders; until then a prefixed vault relies on marker, sprint, now.md and focus.

### Revised after the first live look (same day)

The first run (a vault with ~30 unshipped REQs) drew level 1 as columns of single letters and put key hints in the header. Three causes, three fixes; mod stays 0.7.0.
- **Chips shrank.** 33 chips in one row each shrank to 1–4 columns and wrapped their labels down the rows. Chips now never shrink: as many as fit the band's width, the selected one always among them, then a `+n` chip that brings the next one in. Test: thirty REQs at 120 and 80 columns.
- **Header key hints.** The engine draws a `plain` Button that has a `hotkey` as `k: label`, and the hidden `j`/`k`/`g` buttons drew as `j: k: g:`. This engine fact contradicts "no key hints in headers" and should have been raised before building. Decision (owner): no letter key on any header control; headers are click or ctrl+x tab. `KEYS` keeps the body's `c` (send findings reply) and `m` (diagram source); digits stay on the gate options and the narrow list. `/flight` max / close / toggle cover the rest. Test: no header Button carries a letter hotkey.
- **In flight was too wide.** Any `.awaiting-approval` counted, and that vault has markers ~56 days old and a sprint registry still marked running. Decision (owner): in flight = started (past phase 0) and not at the last phase. The sprint / now.md / session-stamp rules are gone; a sprint member rides the strip only when it is itself in flight; the focus REQ joins the band only by the same rule. Settings → *show all unshipped* still restores the old list.
- Tests 58 → 60; validate passes; `tsc` clean.

## Applied 1.12.1 + 1.12.2

2026-11-05, by `docs/plans/patches/apply-1.12.1.py` (both tranches, folded at the owner's call per §8 step 10; two-pass, idempotent; a second run reports every hunk *already*), against HEAD `c96ee9f`. Toolkit only: GATE-PROTOCOL, ETHOS, `scripts/adlc.mjs`, `docs/gate-cards.md`, nine skills, `pipeline-runner`, the trail and knowledge hooks, the extras README, the record template, manifest, CHANGELOG and this section. The mod is untouched (87 tests still pass); `adapters/` not regenerated.

**Landed:** 3.1.1 (invariants 5 and 7, *The marker*, *The trail* note and trailer wording, the predict/summary asks, *Compaction at a gate*); 3.1.2; 3.1.3; 3.1.4 for `/spec`, `/architect` (predict as an `ASK ·` turn, the ADR fold-in), `/implement`, `/wrapup` (7b as an `ASK ·` turn, the working-set question ends the turn), `/bugfix` and `/task` (a marker at every gate); 3.1.5; 3.1.6 (plus an action section for `in-sync-at-gate`); 3.1.7 as adjusted below; 3.1.8; 3.1.9 except the adapters rebuild; the §7 CHANGELOG entry, reconciled.

**1.12.2 landed:** `evidenceOf` collects every gate round but predict/summary as `{ phase, decided, via, compactions }` — a decided round's `via` is `pane` or `typed` as `trail gate` wrote it, `unknown` when absent (pre-1.12) — plus `phases[n].compactions` (between gates); records parse `· via pane`, `· typed` and `· N compactions?` back. `out.via = { answers, pane, typed, unknown }`, `out.compactions = { gates, total, perGate, atGateRounds, midPhase }`; the two summary lines (`compaction` adds `· N between gates` when there are any); `--all` gains `via p/t` and `cmp`. `/status` 4b gains the paragraph and the two sample lines.

**Owner decisions folded in (same day):** keep the ADR fold-in; keep `[1.12.0] — unreleased`; fold 1.12.2 here; `pipeline-runner` writes the full marker (`Gate`, `Ask`, `Options`, `Recommended`) — overriding §4's "unchanged" for the runner's marker step only — and `/sprint` reads its `Options:` into each queue entry, rewrites it after `revise` / `fix`, and takes `approve <N>, reject ADR-NNN`.

**Dropped as already done** (commit `0c49060`, prefixed IDs in the trail hook): the `ID_SRC` constant, `folders()` matching `^ID_SRC`, `idOf` / `ID_AT_START` in `transcriptHead`, `--req` and `evidenceOf`, `--req REQ-sf-033` and `--req <vault-relative path>` resolution (by id prefix and basename), and "never the number alone". Kept from that item: an exact `join(vault, <REQ_PATH>)` check first, so a vault-relative path names its folder even where two buckets hold the same basename.

**Deviations from the plan text:**
- **Never `AskUserQuestion` at a gate, said outright** (invariant 5, ETHOS, the memory file, `/proceed`), with the reason checked live on 2.1.318: while the dialog is open the band is not drawn. The plan has no gate fallback that uses the dialog; the text card is the fallback. Non-gate choices keep it (`/ux-doctor`, `/config`, `/init`, `/toolkit-update`).
- **The cockpit is the band.** Every new line says *cockpit* or *band*, never pane, and names no keys; `via: pane` and the `[flightdeck] pane` trailer stay, as the mod's own wire values.
- **`full view: /flight` sits above `MY READ`**, not after `Decision →`: the mod appends every line after `Decision →` to the options, so the plan's example would have made `abort full view: /flight` an option.
- **`--note` is always passed, even a bare `approve`;** `trail gate` drops a note equal to the decision. The plan said "omitted when the reply is the bare option", which would lose a trailer on a bare pane reply.
- **Marker preference is scoped** (`resolveReq(…, { atGate })`) to `Stop` and compaction. `SubagentStart` and a fresh `SessionStart` keep the newest state, or an agent flying for one REQ would be stamped on another that waits at a gate.
- **Compaction with no open round** counts on the live phase (`livePhase`), not `currentPhase`, which is the previous phase while the next one runs. The knowledge hook picks the skill to re-read the same way.
- **`Stop` ignores an `ASK ·` turn**, and a turn with no GATE header that only answered a question leaves the open round as it was (the plan refreshed its card with the answer's first line).
- **`/wrapup` 7b runs before steps 6 and 7.** The marker (7) precedes 7b in the file; asking after it would make the trail hook open a ship round on the ask.
- Card examples carry `(recommended — …)` and keep each option's consequence (invariant 4); `/review`'s example `MY READ` reads `fix all`, so the mark matches.
- `/bugfix` gates also stamp `currentPhase` / `gateState` / `currentPhaseGate` (only phase 1 did); marker phases `report plan fix verify ship`, as the mod maps them.
- **Records say `· typed` too.** `/wrapup`'s Trail row writes `· via pane` or `· typed` for every round that has `via`, nothing for one without; the plan wrote only `via pane`, which leaves a 1.12 typed round indistinguishable from a pre-1.12 one in a record, and §3 1.12.2 needs that split.
- `compaction` counts open rounds as well as decided ones (a compaction at a gate still waiting is a cost already paid), and reports compactions between gates — a form 1.12.1's hook writes that the plan's line had no slot for.
- CHANGELOG: `[Unreleased]` becomes `[1.12.0] — unreleased` with the new entry first; its mod bullets describe 0.8.1 (band, letters), the IDs bullet points at the existing prefixed-IDs fix, and the `trail stats` bullet covers 1.12.2 as applied.

**Not done here:** `adapters/` (run `node scripts/adlc.mjs build --tool=all`); the §6 live checks.
