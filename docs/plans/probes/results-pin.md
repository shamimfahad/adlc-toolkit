# P10: can the band keep the options on screen under a body that scrolls on its own?

STATUS: needs verification. The plugin-test half ran. The live half could not be driven from the agent sandbox (see *Live run*).

Asked for REQ-002 (AC12). If **pinned**, the debrief body scrolls inside the band and the GATE options stay under it at every width. If **not pinned**, below 110 columns the debrief view is the narrow folded list, with an unfolded section capped at 8 rows.

| Field | Value |
|---|---|
| Claude Code | `2.1.319 (Claude Code)` (`claude --version`, 2026-11-07) |
| Fixture | `/probe p10` in `flightdeck-engine-probes/` (off by default: `mode` starts `null`) |
| Verdict | **not pinned, STATUS: needs verification.** The structure holds in the kit. Live behaviour is not observed on 2.1.319, and the 2.1.318 live run points to not pinned |

## The fixture

A header line (`p10 body a..b of 30 · scrolls seen N · engine offset … · maxRows …`), then a body `Box` with `height={6}` and `overflow="hidden"`. The body draws its own 6-line slice of 30 lines (`line 01` … `line 30`) from the `p10Offset` atom. Three option rows follow: `Approve` (`y`), `Revise` (`r`) and `Halt` (`h`). While the mode is `p10`, the mod answers every `ui.scroll` on the band itself: it moves `p10Offset`, returns `{}` without calling `next`, and logs the event (`by`, `bodyRows`, `contentRows`, origin, pointer) in `p10Scrolls`. The whole tree is 10 rows, so it fits any band of `maxRows` 10 or more.

## Plugin-test half: passed

`claude plugin validate`: `✔ Validation passed with warnings` (no author, icon or install line, as before). `claude plugin test docs/plans/probes/flightdeck-engine-probes`: **16 pass, 0 fail**. That is the 14 old tests plus 2 for P10. Full output: `test-output-2.1.319.txt`. The P1–P9 verdict lines read the same as on 2.1.318.

```
P10 FACT (maxRows 12): body props height=6 overflow=hidden; before=["line 01","line 02","line 03","line 04","line 05","line 06","[opt-approve]","[opt-revise]","[opt-halt]"]; $.ui.scroll(person, by 5) -> {}; p10Offset=5; after=["line 06","line 07","line 08","line 09","line 10","line 11","[opt-approve]","[opt-revise]","[opt-halt]"]
P10 VERDICT (maxRows 12): structure holds — 6 body lines, then the three options, before and after a scroll the mod answers itself (body moves to "line 06", options still after it); the kit does not paint and raises ui.scroll on request, so whether the engine ever sends ui.scroll to a band whose tree fits maxRows (results-live.md P2: it did not) is check-live with /probe p10
P10 FACT (maxRows 24): body props height=6 overflow=hidden; before=["line 01","line 02","line 03","line 04","line 05","line 06","[opt-approve]","[opt-revise]","[opt-halt]"]; $.ui.scroll(person, by 5) -> {}; p10Offset=5; after=["line 06","line 07","line 08","line 09","line 10","line 11","[opt-approve]","[opt-revise]","[opt-halt]"]
P10 VERDICT (maxRows 24): structure holds — 6 body lines, then the three options, before and after a scroll the mod answers itself (body moves to "line 06", options still after it); the kit does not paint and raises ui.scroll on request, so whether the engine ever sends ui.scroll to a band whose tree fits maxRows (results-live.md P2: it did not) is check-live with /probe p10
(pass) P10 options pinned under a body that scrolls on its own > body of 6 rows, three options after it, at maxRows 12 [19.43ms]
(pass) P10 options pinned under a body that scrolls on its own > body of 6 rows, three options after it, at maxRows 24 [18.44ms]
 16 pass
 0 fail
Ran 16 tests across 1 file. [0.52s]
```

What the kit shows: at band heights 12 and 24 the body draws 6 lines, then the three options. After a person-origin `$.ui.scroll` (by 5) that the mod answers, the body starts at `line 06` and the options still come after it. What it can't show: the kit doesn't paint, and it raises `ui.scroll` because the test asks it to. It can't tell whether the engine **sends** `ui.scroll` to a band whose tree fits `maxRows`.

## Live run: not driven

Blocked on 2026-11-07. The agent's sandbox refused to create tmux's unix socket (`error creating /private/tmp/claude/p10/s (Operation not permitted)`). Running tmux outside the sandbox was refused by the permission check. So **there are no `live-captures/p10-*.txt` files yet**. None were made up.

The evidence that points to *not pinned* comes from 2.1.318, not 2.1.319. `results-live.md` (P2 row, line 22) recorded that with a band tree that fits `maxRows`, PgDn, Down and injected wheel events never reached the mod's `ui.scroll` hook (`bandOffset=0`). P10's tree fits too, so the same thing is expected. In that case the body never moves at all, which is not a pinned scroll.

### To finish it (about 5 min, on your Mac, from the repo root)

```sh
claude --version
tmux new-session -d -s p10 -x 100 -y 40 "env -u CLAUDE_CODE_PLUGIN_DIRS claude --plugin-dir $PWD/docs/plans/probes/flightdeck-engine-probes"
# in the session: /probe p10, then focus the band (ctrl+x tab)
tmux capture-pane -p -t p10 > docs/plans/probes/live-captures/p10-100-0-before.txt
tmux send-keys -t p10 PageDown;  tmux capture-pane -p -t p10 > docs/plans/probes/live-captures/p10-100-1-pgdn.txt
tmux send-keys -t p10 Down;      tmux capture-pane -p -t p10 > docs/plans/probes/live-captures/p10-100-2-down.txt
tmux send-keys -t p10 -l $'\e[<65;10;30M'; tmux capture-pane -p -t p10 > docs/plans/probes/live-captures/p10-100-3-wheel.txt
# /probe readout -> capture p10-100-4-readout.txt (p10Scrolls lists every scroll that arrived)
tmux resize-window -t p10 -x 80; # repeat the four captures as p10-80-*.txt
```

Read it like this. **Pinned** means the header's `p10 body a..b` and the `line NN` rows move while the `Approve / Revise / Halt` rows stay on screen. **Not pinned** means either the body never moves (`scrolls seen 0`) or the options leave the screen. After that, set the verdict above, drop the `STATUS:` line if it is conclusive, and update architecture.md → *Probe result*.
