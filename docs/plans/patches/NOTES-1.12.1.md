# 1.12.1 + 1.12.2 — the toolkit side of "the gate is the turn", and its measurement

Against HEAD `c96ee9f` (snapshot without `adapters/`). Spec: `docs/plans/plan-v1.12-gate.md` → *1.12.1*, §4, §5, §7, §8, reconciled with mod 0.7.0–0.8.1, commit `0c49060`, and the live probe results on Claude Code 2.1.318.

| | |
|---|---|
| Script | `apply-1.12.1.py` (also at `work/docs/plans/patches/`). It now covers **both tranches**, and its docstring says so. 136 hunks, 23 files. Two passes, idempotent, keeps each file's line endings. |
| Diff | `1.12.1.diff`: unified diff of `orig/` → `work/`, 24 files including the new script |
| Folders | `orig/` is the pristine snapshot. `work/` is the edited copy, built from scripted exact-string edits independent of the script. `trial/` is a fresh snapshot with the script applied. `fixture/` holds the hook smoke runs. `tools/gen.py` builds the script's hunks from `orig`→`work` |
| Mod | untouched (87/87) |
| `adapters/` | not regenerated. The owner runs `node scripts/adlc.mjs build --tool=all` |

The hunks are whole lines with just enough context to be unique. Each `old` occurs once before the patch and each `new` occurs once after it, which is what the house-style skip test needs.

---

## Changes since the first draft (owner's decisions)

| Decision | What changed |
|---|---|
| Keep the ADR fold-in | no change |
| Keep `[1.12.0] — unreleased` | no change |
| Add `Options:` to `pipeline-runner`'s markers | the runner's *Gate protocol* step 1 now writes the full marker (`Phase/REQ/Gate/Awaiting/Ask/Options/Recommended/Files`, the phase skill's own options); `/sprint` reads each marker's `Ask`/`Options`/`Recommended` into its queue entry, has the runner rewrite the marker after `revise`/`fix`, and accepts `approve <N>, reject ADR-NNN` |
| Fold 1.12.2 in | `trail stats` gets `via pane` and `compaction` lines, `--json` `via` / `compactions`, and `--all` columns `via p/t` and `cmp`; `/status` 4b gets a paragraph and two sample lines; records write and parse `· typed` |
| Marker preference and `full view` placement | kept as drafted |

The CHANGELOG and the plan section were updated to match. The plan section is now **"## Applied 1.12.1 + 1.12.2"**. Three files were added since the first draft: `core/agents/pipeline-runner.md`, `core/skills/sprint.md`, `core/skills/status.md`.

---

## Per plan section

### 3.1.1 `core/GATE-PROTOCOL.md`
- **Changed:** the marker/card line now says the turn ends. Invariant 5 is rewritten ("The gate ends the turn") and says outright: never `AskUserQuestion` at a gate. Invariant 7 adds "the place to answer from". A new `## The marker` section is added. *The trail* gets the new `--note` rule, the trailer wording, and the predict/summary asks as `ASK ·` turns. A new `## Compaction at a gate` section is added.
- **Deviations:**
  - Invariant 5 gives the live reason: the band isn't drawn while a dialog is open.
  - `full view: /flight` goes **above `MY READ`**. The plan put it after `Decision →`. I checked this with the mod's own parser: every line after `Decision →` is read as options, so the plan's layout gives an option `abort full view: /flight`.
  - `--note` is passed **always**, even a bare `approve`. The command then drops a note that equals the decision. The plan said "omitted when the reply is the bare option", which would lose the trailer on a bare reply sent from the cockpit.
  - The marker doc says `Phase:` = `currentPhaseGate`, and that asks write no marker.

### 3.1.2 `ETHOS.md`, `scripts/adlc.mjs`, `docs/gate-cards.md`
- **Changed:** the plan text, plus "never a question dialog, which hides the cockpit while it is open".
- **Extra:** the architect example in `gate-cards.md` gets the ADR fold-in `Decision →` lines, so it matches `/architect`.

### 3.1.3 `/review`
- **Changed:**
  - The marker step now has `Gate`, `Ask`, `Options`, `Recommended`.
  - The Decision bullet ends the turn.
  - The example has `full view: /flight` above `MY READ`.
  - *Gate clearance* opens with "the answer is the user's next message", records `--note "<the reply, verbatim>"`, and re-reads after a compaction.
  - The abort confirmation is a one-line question that ends the turn.
  - Fix round step 5 rewrites the marker before the card.
- **Deviation:** the example's `MY READ` is `fix all`, not `fix`, so it matches the option marked `(recommended)`. `approve (accept as-is)` keeps its consequence (invariant 4); the plan's example had dropped it.

### 3.1.4 Other gate skills
| Skill | Changed |
|---|---|
| `/spec` | marker options; Decision ends the turn; abort confirmation names the folder and ends the turn; revise rewrites the marker |
| `/architect` | predict ask is an `ASK · Predict` turn (no dialog, no marker, not repeated); marker options; **ADR fold-in** (`approve` / `approve, reject ADR-NNN`, clearance step 3 has no second question); the "(delivered as AskUserQuestion)" line is deleted |
| `/implement` | marker options; Decision; clearance; abort |
| `/wrapup` | marker options; 7b is an `ASK · Summary` turn; the working-set question ends the turn, with `keep` as the stated default; abort; Trail row adds `via pane` / `· N compaction` |
| `/bugfix` | **a marker at every one of the five gates** (`report plan fix verify ship`); one shared gate rule; every Decision ends the turn |
| `/task` | **a marker at both gates** (`plan`, `ship`); clearance for revise / abort / fix |

- **Deviations:**
  - `/wrapup` 7b now **runs before steps 6 and 7**. The plan said "before the marker and card", but in the file the marker step (7) comes before 7b. Asking after it would leave a marker on disk, and the Stop hook would open a ship round on the ask.
  - `/bugfix` gates also stamp `currentPhase` / `gateState` / `currentPhaseGate`. Before this, only phase 1 did, and `/recover` and `/proceed` read those fields.

### §4 overridden: `pipeline-runner` and `/sprint` (new since the first draft)
- **`pipeline-runner.md` → Gate protocol 1:** writes the marker per GATE-PROTOCOL → *The marker*. The options are copied word for word from the phase skill's own marker step:
  - `fix all` and `fix <ids|all-major>` at verify, whenever an actionable finding exists
  - the two ADR approves at architect, when the runner proposed an ADR
  - `merged` at ship

  `Recommended:` is the runner's own read. The marker is rewritten whole after a `revise` or `fix`, and step 2 sets `currentPhaseGate` to the marker's `Phase:`.
- **`sprint.md`:**
  - *Monitoring* reads each awaiting REQ's marker into its queue entry. An older marker without `Options:` falls back to the phase's standard options.
  - The queue sample shows an `Options:` line per entry.
  - The reply menu gains `approve <N>, reject ADR-NNN`.
  - Revisions rewrite the marker.
- **Unchanged:** `/autopilot`, the decision-maker, the runner's pause-at-the-marker protocol, and the queue's prose replies.

### 3.1.5 `/proceed`
- **Changed:**
  - `WAIT` is now `END THE TURN` in the loop, plus a paragraph saying a gate is the end of the turn.
  - Routing gains a bullet for a reply that names no option. The old "ask for clarification" line is now "ask which, and end the turn".
  - A new cross-session step 1 says to reload the protocol after a compaction. The other steps are renumbered.
  - Preflight 5 says "awaiting or a marker present — either one".

### 3.1.6 `/recover`
- **Changed:** a marker signal; a new `in-sync-at-gate` row; the rule "the marker wins / a marker that disagrees with `currentPhaseGate` is divergent"; `· marker: <phase> | none` on the `Claimed:` lines.
- **Extra:** a `recover` action section for `in-sync-at-gate`. It restores `gateState` and logs to `hot.md`. The plan gave the row but no action.

### 3.1.7 `adlc-trail.mjs`
- **Dropped as already done by `0c49060`:**
  - the `ID_SRC` constant
  - `folders()` matching `^ID_SRC` (prefixed folders are seen)
  - `idOf` / `ID_AT_START` in `transcriptHead`, `--req` and `evidenceOf`
  - `--req REQ-sf-033` and `--req <vault-relative path>` resolving, by id prefix and by basename
  - "never the number alone"
- **Kept from that item:** an exact `join(vault, <REQ_PATH>)` check first, so two buckets holding the same basename can't be confused.
- **Changed:**
  - **SessionStart `source=compact`** counts `compactions` on the open gate round, else on the live phase.
  - **Stop** takes the REQ from the card's `GATE n/m · … · <ID>` header. It copies `ask: { text, options, recommended }` from the marker, ignores an `ASK ·` turn, and leaves an open round alone when the turn had no GATE header.
  - **`trail gate`** lifts the trailer out *before* the 200-char cut, drops a note equal to the decision, takes `viewed` from the trailer unless `--viewed` is given, writes `round.via`, and prints `· via pane`.
  - The usage lines are updated.
- **Deviations:**
  - The marker preference is scoped to Stop and compaction (`resolveReq(…, { atGate })`). SubagentStart and a fresh SessionStart keep "newest state"; otherwise an agent flying for REQ-B would be stamped on REQ-A while A waits at a gate.
  - A compaction with no open round counts on `livePhase`, not `currentPhase`. While a phase runs, `currentPhase` is still the previous one.
  - The record parser in `trail stats` strips `· via …` / `· typed` / `· N compactions` after a decision. That is now part of the full 1.12.2 work below.

### 1.12.2 measurement (new since the first draft)
- **`evidenceOf` (folders):** every gate round except predict/summary becomes `{ phase, decided, via, compactions }`.
  - A decided round's `via` is `pane` or `typed`, as 1.12's `trail gate` always writes it; it is `unknown` when absent, meaning the round predates 1.12.
  - `phases[n].compactions` counts compactions *between* gates. 1.12.1's hook writes these when no round is open.
- **Records:** `· via pane`, `· typed` and `· N compactions?` are parsed back. A round with no `via` token is `unknown`.
- **`stats`:**
  - JSON: `via = { answers, pane, typed, unknown }` and `compactions = { gates, total, perGate, atGateRounds, midPhase }`.
  - Two summary lines, worded as the plan has them; `compaction` adds `· N between gates` when there are any.
  - `--all` gains `via p/t` and `cmp`; `perItem` gains `via` and `compactions`.
- **`/status` 4b:** the plan's paragraph, reworded to "from the cockpit", plus the two sample lines.
- **Already applied in the first draft, now subsumed:** the strip in the record parser (it also strips `typed` now).
- **Deviations:**
  - **Records write `· typed`.** `/wrapup`'s Trail row and the record template now give every round that has `via` either `· via pane` or `· typed`, and a pre-1.12 round nothing. With `via pane` alone, which is what the plan wrote, a typed 1.12 round in a record looks the same as a pre-1.12 one, and 1.12.2 needs that split. The cost is one word per typed round.
  - `compaction` counts open rounds too: a compaction at a gate that is still waiting is a cost already paid.
  - The `between gates` count is a form 1.12.1 introduced that the plan's line had no slot for.

### 3.1.8 `adlc-knowledge.mjs`
- **Changed:**
  - The active item is the one holding the newest marker, else the newest state.
  - A new **Re-read before acting** line gives absolute paths to the phase skill (or `bugfix` / `task` by `kind`), `GATE-PROTOCOL.md`, and the marker.
  - *Preserve verbatim* gains "the gate's options and the user's last reply".
  - The `fileURLToPath` import is added, and the header comment is updated.
- **Deviation:** the skill is picked by the live phase. A cleared gate means the next phase's skill.

### 3.1.9 Manifest and the rest
- `core/manifest.json` 1.11.0 → **1.12.0**.
- The extras README trail paragraph mentions `ask` / `via` / `compactions`.
- The record template's sample Trail lines get `· via pane` and `· 1 compaction`.
- **Not done:** the `adapters/` rebuild (the owner's step).

### §7 CHANGELOG
- `## [Unreleased]` (it held only the 0.8.1 fix and the prefixed-IDs fix) becomes **`## [1.12.0] — unreleased`**, with the new entry first and the two fixes kept under it.
- The mod bullets are rewritten for 0.8.1:
  - the band above the prompt, with no pane
  - letters `a b d e f g i j`, with no digits and no `[` `]`
  - the `compact first` toggle
- 0.6.0–0.8.0 had no CHANGELOG entry, so one bullet covers them.
- The IDs bullet points at the existing prefixed-IDs fix.
- **Since the first draft:**
  - The `trail stats` (1.12.2) bullet is restored, rewritten for the band and for the `typed` record form, inside the same entry.
  - The marker bullet mentions `pipeline-runner`.
  - *Deliberately not changed* now reads: `/autopilot` and the decision-maker; the runner's pause protocol and the sprint replies, which now carry the options.
  - The patch-script line says the script covers 1.12.1 and 1.12.2.
- No local paths, machine names or vault names.

### Plan file
- **`## Applied 1.12.1 + 1.12.2`** is added, in the style of *Applied 1.12.0*. It covers what landed, a 1.12.2 paragraph, the owner's decisions, what was dropped, deviations, and what was not done (only `adapters/` and the live checks).

---

## The AskUserQuestion / "question tool" sweep
Scope: `core/skills`, `core/agents`, `GATE-PROTOCOL`, `ETHOS`, `docs/`, `templates/`, `scripts/`, the extras README and hooks, `README.md`.

| Hit (before) | Action |
|---|---|
| `GATE-PROTOCOL.md:15` inv. 5, `:67` dialog trailer | rewritten; now says never at a gate |
| `ETHOS.md:69`, `scripts/adlc.mjs:334`, `docs/gate-cards.md:11` | rewritten (gate = turn end; dialog only for non-gate choices) |
| Decision bullets in `spec` `architect` `implement` `review` `wrapup` `task` (×2) `bugfix` (×5); `architect.md:250` | replaced / deleted |
| `architect.md:31` predict, `wrapup.md:236` summary | now `ASK ·` text turns |
| `ux-doctor.md:84, :193` | **kept**: not a phase gate (plan 3.1.2, §4) |
| `init.md:34`, `config.md:22, :151`, `toolkit-update.md:47` ("structured-question UI") | **kept**: setup choices, not gates; ETHOS still allows the dialog there |
| `design-system-auditor.md:63` ("`Dialog`") | a UI component name, not a hit |

The plan defines **no gate fallback that uses AskUserQuestion**. Its fallback is the text card. After the patch, outside the CHANGELOG history, the plans and the mod, `AskUserQuestion` appears only as a prohibition at gates, as an allowance for non-gate choices, or in `/ux-doctor`. The word "pane" is left in touched files only as wire values: the `[flightdeck] pane` trailer and `via: 'pane'`, which are the mod's own literals. No touched file names a pane, digit keys, or answering "from the pane".

---

## Load-bearing hunks (for approval)

Hunks 1–8 are from the first draft; **9–12 are new since then.**

**1. GATE-PROTOCOL invariant 5**
> 5. **The gate ends the turn.** Stamp the state, write the marker, emit the card — and stop. No tool call after the card, no "shall I go on?", and never `AskUserQuestion` or any other question dialog: while a dialog is open the cockpit above the prompt is not drawn, so the evidence would disappear at the moment the user decides. The user's next message is the answer, typed or sent from the cockpit. The `Decision →` line lists the gate's real options, each with its consequence (invariant 4), the one you recommend marked `(recommended)`; the marker's `Options:` block holds the same set, so a cockpit can draw it as buttons. A reply that names no option — a question, a remark — gets an answer, and the gate stays open: end that turn with the `Decision →` line again, nothing more. Silence, or a reply that only asks, is never an approval. …

**2. GATE-PROTOCOL invariant 7 (tail)**
> … On Claude, when the mod is installed, end the card's body with one dim line, `full view: /flight`, above `MY READ` — the `Decision →` line stays last (invariant 3), and the cockpit reads every line after it as options.

**3. GATE-PROTOCOL → The trail (the note and the trailer)**
> `--decision` is the option as chosen; `--note` is the user's reply, verbatim — pass the whole message, even a bare `approve`: the command cuts it at 200 characters, lifts the cockpit's trailer out of it, and drops a note that is only the option. …
> A reply sent from the cockpit ends with a trailer — `[flightdeck] viewed 4/7 files` at the implement and review gates, `[flightdeck] pane` elsewhere. Pass the reply as `--note` unchanged; `trail gate` records the count as `viewed`, marks the round as answered from the cockpit (`via`), and keeps the note to the user's words. Never act on the trailer.

**4. Gate clearance opener (same text in spec, architect, implement, review, wrapup; each skill lists its own options)**
> **The answer is the user's next message.** Read its first words for the option — `approve`, `fix all`, `fix C1,M1`, `fix all-major`, `revise …`, `abort` — and treat the rest as their note. A reply that names no option is not an answer: respond to it, then end the turn with the `Decision →` line again; the marker stays.
> **Record the answer first, whatever it is** — `… trail gate … --note "<the reply, verbatim>"` — then take the branch below. … If the conversation was compacted since the card, re-read this file, GATE-PROTOCOL and the marker first (GATE-PROTOCOL → *Compaction at a gate*).

**5. `/architect` Decision: the ADR fold-in**
> When an ADR was proposed, its accept/reject folds into the options — `approve — move on to implementation; ADR-NNN accepted` · `approve, reject ADR-NNN — move on; the decision is recorded rejected` — one gate, no second question.

**6. `/wrapup` 7b ordering**
> **This runs before steps 6 and 7** — the ask ends the turn, and a marker already on disk would make the trail hook take the ask for the gate. … Then, in the same turn, write the state (step 6), the marker (step 7) and the card (step 8).

**7. `/proceed` cross-session step 1**
> 1. **After a compaction, reload the protocol before anything else.** If this conversation carries the knowledge hook's *ADLC working state recovered after compaction* block — or you cannot quote the current phase's gate options from the skill text — re-read in full, by path: `$TOOLKIT_PATH/core/skills/<phase>.md` …, `$TOOLKIT_PATH/core/GATE-PROTOCOL.md`, `.adlc/<REQ_PATH>/pipeline-state.json` and `.adlc/<REQ_PATH>/.awaiting-approval`. … Then, if the marker is present, re-emit that gate's card from the marker and the artifact files, and end the turn.

**8. `adlc-trail.mjs`: `trail gate` and `Stop`**
```js
const raw = flag('--note') || '';
const t = TRAILER.exec(raw);
let note = cut(raw.replace(TRAILER, ''), NOTE_MAX);
if (note.toLowerCase() === decision) note = '';
const viewed = /^\d{1,3}\/\d{1,3}$/.test(flag('--viewed') || '') ? flag('--viewed') // an explicit count wins
  : t && t[1] ? `${t[1]}/${t[2]}` : null;
const via = t ? 'pane' : 'typed';
```
```js
if (ASK_LINE.test(text)) return; // a predict or summary ask ends the turn; it is not a gate
const m = GATE_LINE.exec(text);
const named = m ? idOf(m[0]) : null; // the card names its REQ: two open in one checkout land right
const folder = (named && resolveReq(vault, named)) || resolveReq(vault, null, { atGate: true });
…
if (last && !last.decision) { if (m) { last.at = now(); last.card = card; if (ask) last.ask = ask; } }
else ph.gates.push({ at: now(), card, ...(ask ? { ask } : {}) });
```

**9. `pipeline-runner.md` → Gate protocol 1 (new)**
> 1. Write `.adlc/<REQ_PATH>/.awaiting-approval` per `$TOOLKIT_PATH/core/GATE-PROTOCOL.md` → *The marker*, so the sprint queue and the cockpit carry the gate's real options: [the marker block] … The options are that phase skill's own (`core/skills/<…>.md` → its marker step), `label — consequence`, in the same words: `fix all` and `fix <ids|all-major>` at verify whenever an actionable finding exists; `approve` and `approve, reject ADR-NNN` at architect when you proposed an ADR; `merged` at ship. `Recommended:` is your own read. Rewrite the whole marker when a `revise` or `fix` brings the gate back.

**10. `/sprint` → Monitoring (new)**
> … For each one, read its `.awaiting-approval`: the runner writes it per GATE-PROTOCOL → *The marker*, so its `Ask:`, `Options:` and `Recommended:` are the gate's real options for the queue entry (a marker without `Options:`, from an older runner, gets the phase's standard options).

**11. `adlc-trail.mjs` → `evidenceOf` / `stats` (new)**
```js
// `via` is written by every 1.12 `trail gate`; a decided round without it predates 1.12.
if (g.decision !== 'predict' && g.decision !== 'summary') f.rounds.push({ phase: k, decided: !!g.decision, via: g.decision ? (g.via === 'pane' || g.via === 'typed' ? g.via : 'unknown') : null, compactions: Number(g.compactions) || 0 });
…
`via pane    ${out.via.pane} of ${out.via.pane + out.via.typed} gate answers (${out.via.typed} typed · ${out.via.unknown} before 1.12)`,
`compaction  ${out.compactions.total} at gates across ${out.compactions.gates} rounds · ${perGate} per gate · ${out.compactions.atGateRounds} rounds compacted` + (midPhase ? ` · ${midPhase} between gates` : ''),
```

**12. `/wrapup` Trail row: records say `· typed` (new)**
> … a round's `viewed`, then its `via` (1.12: `· via pane` when it was answered from the cockpit, `· typed` otherwise; nothing for a round without `via`, which predates 1.12) and its `compactions` (`· 1 compaction`) ride after its decision, in that order — `trail stats` reads them back;

---

## Verification

| Check | Result |
|---|---|
| Script on a fresh snapshot (`trial/`) | exit 0, 136 applied / 0 already, 23 files |
| `diff -r trial work` | **identical** (after run 1 and after run 2) |
| Second run | exit 0, **0 applied / 136 already**, nothing written |
| Broken copy (first draft: `NOTE_MAX = 240` in the trail hook; this run: one word changed in `sprint.md`'s *Monitoring* line) | **exit 1** both times (`adlc-trail.mjs hunk 4` / `sprint.md hunk 1: old x0, new x0`); sha1 of every file the same before and after, so **nothing written** |
| CRLF copy (all 23 targets converted to CRLF) | exit 0; every output line still CRLF; LF-normalised content == `work/`; second run 0 applied |
| `node --check` | `adlc-trail.mjs`, `adlc-knowledge.mjs`, `scripts/adlc.mjs`: ok (work and trial) |
| `node scripts/adlc.mjs build --tool=all --out=/tmp/…` | ok on `orig`, `work` and `trial` (5 tools); the generated `CLAUDE.md` / `AGENTS.md` / … carry the new principle 6 |
| `lessons --check`, `index --check` on `templates/vault` (copied as `.adlc`) | exit 0, up to date (same as orig) |
| `index` on the fixture vault | 3 REQ (prefixed folder and prefixed record included) |
| `claude plugin test core/extras/claude/mods/adlc-flightdeck` on `trial/` | **87 pass, 0 fail**; the mod tree is byte-identical to orig |
| The mod's `parseMarker` on a **runner-style architect marker** (new) | `phase: architect`, the `Ask`, 4 options with consequences: `approve` (recommended), `approve, reject ADR-014`, `revise <what>` (takes an argument), `abort`; `Files` read |
| The mod's own parsers on the new texts (`parseMarker`, `parseGateCard` + `optionsFromDecision`, via `node --experimental-strip-types`) | marker → 5 options, `fix all` recommended, `<…>` options need an argument; the review example → 5 clean options, `fix all` recommended; the architect fold-in → `approve` / `approve, reject ADR-007` with consequences; the **plan's** placement of `full view` → last option `abort full view: /flight` (why the line moved) |

### Hook fixture (`fixture/run.sh`, `before.txt` = orig, `after.txt` = work, `trial.txt` = trial == work)
Vault: `specs/2026-10/sf/REQ-sf-033-gate-turn/` (phase 4, a 1.12 marker, older state), `specs/REQ-042-y/` (phase 2 cleared, newest state), a pre-1.12 folder `REQ-sf-019-old` (a round without `via`, `compactions: 2` between gates), a record `REQ-sf-020-done.md` with the new Trail forms (`· typed`, `· via pane`, `· N compactions`), and a pre-1.12 record `REQ-sf-010-older.md`.

| # | Case | Before (orig) | After (1.12.1) |
|---|---|---|---|
| 1 | Stop, card `GATE 4/5 · Review · REQ-sf-033…` | no round anywhere (picked REQ-042, which has no marker) | round on **REQ-sf-033**, `card.verdict`, `ask.options` ×5, `recommended: fix all` |
| 2 | Stop, `ASK · Predict · REQ-042-y` | — | ignored |
| 3 | Stop, an answer with no GATE header | — | open round untouched |
| 4 | SessionStart `compact` | nothing | `compactions: 1` on the open round |
| 5 | knowledge hook, compact | active = REQ-042 (newest state), no re-read line | active = **REQ-sf-033 (marker)**; `Re-read before acting: <kit>/core/skills/review.md, <kit>/core/GATE-PROTOCOL.md, and the marker …`; preserve-verbatim names options and last reply |
| 6 | `trail gate --req specs/2026-10/sf/REQ-sf-033-gate-turn --note "approve\n\n[flightdeck] viewed 4/7 files"` | `→ approve — "approve"`, no `viewed` | `→ approve · viewed 4/7 · via pane`, no note |
| 7 | `--req REQ-sf-033`, 300-char note + trailer | trailer lost to the cut, no `viewed` | `viewed 5/7`, `via pane`, note 200 chars |
| 8 | `--note "approve, reject ADR-007\n\n[flightdeck] pane"` | note `… [flightdeck] pane` | note `approve, reject ADR-007`, `via pane`; a typed `revise` → `via typed` |
| 9 | compact, no open round (REQ-042 cleared at 2) | nothing | `phases["3"].compactions: 1` (live phase) |
| 10 | knowledge hook, no marker | no re-read line | re-read `implement.md` (cleared 2 → live 3) + GATE-PROTOCOL |
| 11 | `trail stats` (5 items: 3 folders incl. a pre-1.12 one with 2 compactions between gates, 2 records incl. a pre-1.12 one) | no via / compaction lines; REQ-sf-033 viewed `[]`, 3 counts, mean 58% | 5 counts, mean 61%, plus **`via pane    5 of 8 gate answers (3 typed · 2 before 1.12)`** and **`compaction  4 at gates across 10 rounds · 0.40 per gate · 3 rounds compacted · 3 between gates`**, hand-checked against the fixture |
| 12 | `stats --json` | no `via` / `compactions` | `via {answers 10, pane 5, typed 3, unknown 2}`, `compactions {gates 10, total 4, perGate 0.4, atGateRounds 3, midPhase 3}`; per item `via` / `compactions` |
| 13 | `stats --all` | 8 columns | + `via p/t` and `cmp` (e.g. `REQ-sf-020 … 2/2  3`) |

---

## Still needing the owner

1. **Records write `· typed`** (new). Accept the extra word per typed round, or drop it and accept that a record's non-pane rounds count as `before 1.12`.
2. **Live checks**, plan §6 1(a)–4. These are still to run: a typed `approve`, a band reply (`→ … · via pane`), a compaction at review then `fix all`, `/compact` mid-implement, and a two-REQ `/sprint` whose queue entries list the markers' options.
3. **`adapters/`.** Run `node scripts/adlc.mjs build --tool=all` after applying.
4. Settled, so no longer open: the ADR fold-in (kept), the CHANGELOG heading (kept), 1.12.2 (folded in), runner `Options:` (added), marker-preference scope (kept), `full view` placement (kept).
