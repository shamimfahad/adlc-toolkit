# Engine probes runbook (adlc-flightdeck 0.8.1 prep)

Nine probes answer the engine questions the flightdeck redesign rests on. Six were answered automatically on Claude Code 2.1.318 (`results-2.1.318.md`). This runbook covers what's left for you: re-running the automated suite on your own Claude Code version, the live checks the test kit can't do, and what each answer decides.

Everything here runs **on your Mac, in Terminal (or the VS Code integrated terminal), from the repo root**:

```sh
cd ~/code/adlc-toolkit
```

The probe mod lives at `docs/plans/probes/flightdeck-engine-probes/`. It is a throwaway test mod: it is not part of the toolkit and never needs installing.

---

## Step 0: check your version (1 min)

```sh
claude --version
```

The automated results were taken on **2.1.318**. If yours is different, do Step 1. If it is the same, you can skip straight to Step 2.

## Step 1: re-run the automated probes (2 min)

```sh
claude plugin validate docs/plans/probes/flightdeck-engine-probes
claude plugin test docs/plans/probes/flightdeck-engine-probes 2>&1 | tee docs/plans/probes/test-output-$(claude --version | cut -d' ' -f1).txt | grep -E 'VERDICT|pass|fail'
```

- **Expect:** `Validation passed with warnings` (missing author/icon/install line: harmless), then `14 pass`, `0 fail`.
- **Compare** the `P2`, `P4`, `P5`, `P6`, `P8`, `P9` verdict lines with `results-2.1.318.md`. A different verdict on your version is a finding in its own right: note it in the table at the bottom.
- A pass only means the probe ran. The verdict line is the answer.

## Step 2: live checks (about 20 min)

Start one session with **only** the probe mod loaded, so flightdeck's band doesn't mix with the probes:

```sh
env -u CLAUDE_CODE_PLUGIN_DIRS claude --plugin-dir docs/plans/probes/flightdeck-engine-probes
```

(If you never set `CLAUDE_CODE_PLUGIN_DIRS`, plain `claude --plugin-dir docs/plans/probes/flightdeck-engine-probes` is the same.)

In the session:
- `/probe <id>` switches the band to one fixture.
- `/probe off` gives the band back.
- `/probe readout` opens a pane listing everything the probes recorded.
- Every press and submit also shows a toast at the top right: `probe pressed: …`, `probe submitted: …`.

Use a terminal about **120 cols × 40 rows**, not fullscreen, unless a check says otherwise.

### P1: does a digit typed into an empty prompt press a band button? (decides change #3)

1. `/probe p1`. The band shows `1: Digit one` and `a: Letter a`.
2. With the prompt **empty**, type `1`.
   - Record: did a toast `probe pressed: digit` appear, or did `1` land in the prompt?
3. Clear the prompt, then type `a` into the empty prompt.
   - Expected: `a` lands in the prompt and there is no toast.
4. Clear the prompt. Focus the band (ctrl+x tab, or click it), then press `a`.
   - Expected: toast `probe pressed: letter`.
5. Still focused, press `1`.
   - Record: toast or not.

### P3: do letter keys fire on buttons scrolled out of view? (decides the decision-row placement)

1. `/probe p3`. The band holds 30 rows (`row 0` … `row 28`), with the `Approve` (key `y`) and `Nine` (key `9`) buttons on the last row, which should be below the visible window. Don't scroll the band.
2. Focus the band (ctrl+x tab) and press `y`.
   - Record: did `probe pressed: decide-y` appear?
3. Press `9`.
   - Record the same.
4. Scroll the band to the bottom so the row is visible, then press `y` again.
   - Expected: the toast appears.

### P2: does the mod's own scrolling paint once, not twice? (decides the pinned footer)

1. `/probe p2`. The top line reads `window 0..N of 30 (engine offset …, maxRows …)`.
2. Focus the band and scroll it with the wheel or trackpad.
   - Record: does `window a..b` advance cleanly, rows moving once per tick? Or does the content jump double, with the engine scrolling as well, or not move at all?
   - Note the `engine offset` value as you scroll. If it stays 0, the mod owns the scroll; if it moves too, the engine is scrolling as well.

### P5: where does a pane land? (decides the inline-gate-pane guard)

1. Not fullscreen, 120 cols: `/probe p5`.
   - Record the pane text: `p5 placement=… fullscreen=… cols=…`.
2. Switch to Claude Code's fullscreen layout at 120+ cols, however you normally do, and run `/probe p5` again.
   - Expected: toast `probe p5: placement=dock … -> closed`, and the pane closes itself.
   - Record what happened.
3. Optional: repeat step 2 at under 110 cols.

### P7: what does a band press do while a question dialog is open? (decides the urgency of toolkit 1.12.1)

1. `/probe p7`. The band shows `Approve via submit`.
2. Ask Claude: `Use AskUserQuestion to ask me to pick A or B. Don't do anything else.` Wait for the dialog.
3. While the dialog is open, click `Approve via submit` in the band.
   - Record: does the dialog stay open? Does `probe-approve` appear as a user message now, after you answer the dialog, or never? Note the toast text.
4. Answer the dialog. Record what Claude receives: your answer, `probe-approve`, or both, and in which order.
5. Variant: type some text in the prompt without sending it, then click the button.
   - Record: is your draft kept, replaced, or sent?

### P8: Enter vs Shift+Enter in the explain-back box (decides the ship input)

1. `/probe p8`. Click the `Explain back` field.
2. Type `line one`, then press **Shift+Enter**.
   - Record: new line, or submitted?
3. Type `line two`, then press **Enter**.
   - Record: submitted?
   - Expected: toast `probe submitted: "line one\nline two"`.
4. Optional: repeat in the Claude desktop app if you use the band there.

### P9: context % before and after `/compact` (decides the band's context slot)

1. `/probe p9`. The band reads `ctx no-measure`.
2. Send any prompt, for example `say hi`. Record: does the band now read `ctx N%`?
3. Run `/compact`. Record: does the band read `ctx N%` (with what value), `ctx percent-null`, or stay unchanged?
4. Send one more prompt and record the band again.

### Optional: P6 with the real flightdeck

Run `claude --plugin-dir docs/plans/probes/flightdeck-engine-probes --plugin-dir core/extras/claude/mods/adlc-flightdeck` in a repo that has a vault, then `/probe p6-pass`.
- Record: does `probes-outer` sit above flightdeck's band, with both visible?
- Flightdeck 0.8.0 doesn't yet wrap `next(e)`, so this mainly shows the load order.

When done: `/probe off`, then exit.

---

## Step 3: record the results

Fill in this table, either in this file or in a copy named `docs/plans/probes/results-live.md`:

| Probe | What you saw | Claude Code version |
|---|---|---|
| P1 empty prompt `1` | | |
| P1 empty prompt `a` | | |
| P1 focused `a` / `1` | | |
| P3 `y` out of view | | |
| P3 `9` out of view | | |
| P2 scroll paints once? engine offset? | | |
| P5 main screen 120 cols | | |
| P5 fullscreen 120+ cols | | |
| P7 press during dialog | | |
| P7 press with a typed draft | | |
| P8 Shift+Enter / Enter | | |
| P9 before / after `/compact` | | |
| P6 (optional) | | |

## Step 4: bring it back

Start a chat in the **adlc** project with your Mac linked and say: **"probes done — results in docs/plans/probes/"**. I'll read the files from your clone and write the 0.8.1 patch script.

---

## What each answer decides

| If… | Then in 0.8.1 / 0.9.0 |
|---|---|
| **P1:** an empty-prompt `1` presses the button | Remove every digit hotkey from band buttons (change #3), as decided. Narrow-list rows lose their digits too |
| **P1:** an empty-prompt `1` does **not** press it | Digits are safe, but keep letters-after-focus anyway (your decision #2). Change #3 shrinks to a consistency fix |
| **P3:** `y` fires while out of view | The decision row can simply sit last. No pinned footer needed |
| **P3:** `y` does not fire out of view | The decision row must be pinned (P2) or the gate opens as an inline pane |
| **P2:** the scroll paints once and the engine offset stays 0 | Build the pinned footer in the band (layout principle P2) |
| **P2:** the band jumps double or doesn't move | Drop the pinned footer. Regime A uses the inline gate pane; regime B keeps the options at the top |
| **P5:** placement=dock at fullscreen 120+ and the guard closes it | The inline-gate-pane guard works as designed |
| **P7:** the press queues `probe-approve` as a separate turn after the dialog | Two gate models run at once until toolkit 1.12.1, so do 1.12.1 together with 0.8.1, not after |
| **P7:** the press replaces or sends your typed draft | Add a draft check before `$.prompt.submit` in flightdeck |
| **P8:** Enter submits and Shift+Enter adds a newline | The ship explain-back box ships as planned (trim the text: it arrives untrimmed) |
| **P9:** `percent-null` after `/compact` | The band shows `ctx —` until the next turn, not `0%` |

Already settled by the automated run, with no live check needed:
- **P4:** a state write started during drawing is refused and lost silently. Viewed marks drawn from the diff view are being dropped today, so change #1 is confirmed S1.
- **P6:** wrapping `await next(e)` lets band mods coexist.

## What I can start without waiting for you

These 0.8.1 changes don't depend on any live answer, so the patch script can be drafted any time:
- #1: move state writes and `git diff` out of render.
- #2: count a REQ waiting at ship as "in flight".
- #20: run the heartbeat only when needed.
- #21–23: remove the dead `×`, give every button a unique key, wrap `next(e)`.
- #30: fix the README.
