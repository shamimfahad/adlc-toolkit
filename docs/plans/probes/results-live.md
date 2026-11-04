# flightdeck engine probes: live results on Claude Code 2.1.318

Run on 2026-11-05. `claude --version` reported `2.1.318 (Claude Code)`, the same version as `results-2.1.318.md`. The live checks drove a nested Claude Code session through tmux (`tmux new-session -d -s probes -x 120 -y 40 "env -u CLAUDE_CODE_PLUGIN_DIRS claude --plugin-dir <repo>/docs/plans/probes/flightdeck-engine-probes"`), with only the probe mod loaded. Every capture is in `live-captures/`.

The probe mod was not modified.

## Step 1: automated suite

- `claude plugin validate docs/plans/probes/flightdeck-engine-probes` gave `✔ Validation passed with warnings` (no author, no icon, no install line).
- `claude plugin test …` gave **14 pass, 0 fail**. Output: `test-output-2.1.318-live.txt`. It was saved under that name so it doesn't overwrite the existing `test-output-2.1.318.txt`.
- **Verdicts that differ from 2.1.318: none.** All 28 `P<n> FACT` / `P<n> VERDICT` lines are byte-identical to `test-output-2.1.318.txt`.

## Step 3: the filled table

| Probe | What I saw | Claude Code version | Evidence |
|---|---|---|---|
| P1 empty prompt `1` | **Pressed the band button.** Toast `probe pressed: digit`; the prompt stayed empty. | 2.1.318 | `p1-1-empty-digit.txt`, `p1-6-readout.txt` |
| P1 empty prompt `a` | `a` went into the prompt; no toast, no press. | 2.1.318 | `p1-2-empty-letter.txt` |
| P1 focused `a` / `1` | After ctrl+x then Tab: `a` → toast `probe pressed: letter`; `1` → toast `probe pressed: digit`. Readout: `presses=["digit","letter","digit"]`. | 2.1.318 | `p1-4-focused-letter.txt`, `p1-5-focused-digit.txt`, `p1-6-readout.txt` |
| P3 `y` out of view | **Fired.** The band was focused and scrolled to the top (rows 0–13 visible, `↓ 16 more`, decision row hidden). `y` → toast `probe pressed: decide-y`; the band did not scroll. With the row in view, `y` also fired. See note 1. | 2.1.318 | `p3-3-scrolled-top-focused.txt`, `p3-4-y-out-of-view-clean.txt`, `p3-6-y-in-view.txt` |
| P3 `9` out of view | **Fired while the band was focused** (toast `probe pressed: decide-9`). Extra check, not in the runbook: with the band **unfocused** and the row out of view, `9` typed into the empty prompt went into the prompt and pressed nothing. | 2.1.318 | `p3-5-9-out-of-view.txt`, `p3-extra-9-unfocused-out-of-view.txt` |
| P2 scroll paints once? engine offset? | **The band does not move at all.** The header read `window 0..13 of 30 (engine offset 0, maxRows 15)`. The mod draws exactly 15 lines (= `maxRows`), and the engine shows no `↓ more` marker. PgDn and Down with the band "focused" did nothing. Injected SGR wheel-down events (`ESC[<65;10;28M`) over the band did nothing, and readout `bandOffset=0`, so the mod's `ui.scroll` hook never ran. A control run of the same injected wheel on P3 scrolled the engine-windowed band one row per tick (`row 0`→`row 3`), so injection does reach the band. The header later showed `engine offset 3`: the P3 scroll value carried over into P2 (see note 3), not P2's own wheel ticks. | 2.1.318 | `p2-0-mode.txt`, `p2-1-focused-pgdn.txt`, `p2-3-wheel-sgr.txt`, `p2-control-p3-wheel.txt`, `p2-4-wheel-again.txt`, `p2-5-readout.txt` |
| P5 main screen 120 cols | With `--settings '{"tui":"default"}'` (main screen): pane text `p5 placement=inline fullscreen=false cols=120`; the pane stayed open. | 2.1.318 | `p5-3-main-120-tui-default.txt` |
| P5 fullscreen 120+ cols | Observed by accident, because your `~/.claude/settings.json` has `"tui": "fullscreen"`. In a 120-col tmux window: toast `probe p5: placement=dock (fullscreen=true, cols=66) -> closed`, and the pane closed itself (guard works). Note `cols=66`, not 120 (see note 2). The <110-col case was not driven. | 2.1.318 | `p5-1-main-120.txt`, `p5-2-readout.txt` |
| P7 press during dialog | **not driven: the band is not drawn while the AskUserQuestion dialog is open.** The dialog replaces the prompt area and `Approve via submit` disappears, in both fullscreen and `tui: default`. ctrl+x then Tab changed nothing. After answering, Claude got only the answer (`Pick A or B? → A`), and the band came back. | 2.1.318 | `p7-1-dialog-open.txt`, `p7-2-dialog-ctrlx-tab.txt`, `p7-3-after-answer.txt`, `p7-7-dialog-open-tui-default.txt` |
| P7 press with a typed draft | Draft `my unsent draft` typed, band focused, Enter on the button: **the draft was kept** and not sent, both during and after the turn. `probe-approve` went in at once as its own turn, labelled `› Prompt from the flightdeck-engine-probes plugin`. Readout: `submit:start`, then `submit:resolved {"text":"probe-approve","origin":{"kind":"plugin","name":"flightdeck-engine-probes","asUser":true}}`. (Session was idle, no dialog.) | 2.1.318 | `p7-4-draft-band-focused.txt`, `p7-5-draft-after-press.txt`, `p7-6-after-turn.txt`, `p2-5-readout.txt` |
| P8 Shift+Enter / Enter | Field hint: `⏎ submit · \⏎ new line`. **Enter submits** (`probe submitted: "line one"`). **A real Shift+Enter adds a new line**, sent as raw CSI-u bytes `ESC[13;2u`. Then `line two` + Enter → toast `probe submitted: "line one\nline two"`. `\` + Enter also adds a new line (`"alpha\nbeta"`, backslash removed). tmux's own `send-keys S-Enter` cannot express Shift+Enter here (`extended-keys off`, so it arrives as plain Enter). That is why the first try submitted. | 2.1.318 | `p8-2-after-shift-enter.txt`, `p8-3-after-csiu-shift-enter.txt`, `p8-4-typed-line-two.txt`, `p8-5-after-enter.txt`, `p8-6-backslash-enter.txt`, `p9-3-readout-after-compact.txt` |
| P9 before / after `/compact` | Before any prompt: `ctx percent-null`, **not** `no-measure`. A `session.measure` with keys `["window"]` (window 1000000) arrives at session start. After `say hi`: `ctx 6%`. After `/compact` (`Compacted`): **unchanged `ctx 6%`**, readout `{"percent":6,"tokens":56200,…}`; no `percent-null` was seen. After the next prompt: `ctx 6%`, `tokens 57110`. See note 4. | 2.1.318 | `p9-0-before-prompt.txt`, `p9-1-after-say-hi.txt`, `p9-2-after-compact.txt`, `p9-3-readout-after-compact.txt`, `p9-4-after-next-prompt.txt` |
| P6 (optional) | not driven: optional, and it needs a repo with a vault plus the flightdeck mod loaded. | — | — |

### Notes

1. **P3 focus moves the scroll.** On the first try, ctrl+x then Tab scrolled the engine window to the bottom so the focused `Approve` was visible, and the press therefore didn't test "out of view" (`p3-1-y-out-of-view.txt`, `p3-2-after-focus-only.txt`). The clean result above scrolled back to the top with PgUp **while focused** and then pressed `y`. A person who just focuses the band will see the decision row scrolled into view.
2. **P5 `cols` is the main column, not the terminal.** In fullscreen the pane docks on the right. `cols=66` is what the viewport reported to the pane render in a 120-col terminal.
3. **The engine's band scroll offset survives `/probe` switches.** `/probe` resets the mod's `bandOffset` atom, but the engine's own band scroll stays where it was (P3 → P3, P3 → P2).
4. **P9 caveat.** The conversation was tiny, so most of the 56k tokens are the system prompt and `/compact` barely changed usage. The engine may still raise a percent-less measure after compacting a large conversation. A band snapshot taken ~30 s after `/compact` did not show one.
5. Mod state is per session: atoms were empty again after each restart. I restarted the nested session three times (after P1, after P9, after P2). A docked readout pane can't be closed from the keyboard and would have skewed the layout for the next probe.

## Verdicts that differed from 2.1.318

- **Automated suite:** none (identical FACT/VERDICT lines).
- **Live vs. the 2.1.318 doc-based expectations:**
  - P3: `results-2.1.318.md` left letters unspecified. Live, **letter and digit hotkeys fire on out-of-view buttons once the band has focus.** The window rule only stops an *unfocused* bare digit typed into the prompt.
  - P2: `results-2.1.318.md` flagged the open risk "if the mod's tree fits in `maxRows`, the engine may raise no `ui.scroll`". **Confirmed live:** no `ui.scroll` reached the mod, so the band can't be scrolled.
  - P9: the runbook expected `no-measure` before the first prompt; live shows `percent-null` from a startup measure. `percent-null` after `/compact` was **not** reproduced (see note 4).
  - P7: the runbook assumed the band is clickable during the dialog. It isn't drawn at all.

## Still needs a human

- **P7 press during dialog.** In this terminal the band disappears while AskUserQuestion is open, so there was nothing to press. Check by hand whether the band shows at all during the dialog in your usual setup (and in the desktop app, if you use the band there). If it never shows, this race can't happen from the terminal band.
- **P5 under 110 cols** (optional), fullscreen.
- **P2 with a real trackpad** (optional confirmation). Injected wheel events did reach the band (shown by the P3 control), so this is only a sanity check.
- **P8 in the desktop app** (optional).
- **P6** (optional).
