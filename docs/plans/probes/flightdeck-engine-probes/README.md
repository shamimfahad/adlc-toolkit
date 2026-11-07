# flightdeck-engine-probes

A Claude Code mod that holds a test suite and nothing else. It answers nine questions about engine behaviour that design decisions for `adlc-flightdeck` (the review cockpit in the AbovePrompt band) depend on. Each fixture is small and tests one behaviour, and none of it uses flightdeck's code. Each probe prints one `P<n> VERDICT:` line, so you can read the answer from the test output without reading the code.

## Run

```sh
claude plugin validate /path/to/flightdeck-engine-probes
claude plugin test /path/to/flightdeck-engine-probes
claude plugin test /path/to/flightdeck-engine-probes 2>&1 | grep -E 'P[0-9] (FACT|VERDICT)'
```

## Reading the output

- `P<n> FACT: ...` shows what the test observed (drawn texts, atom values, the chain's answers).
- `P<n> VERDICT: ...` gives the answer in one line. When the test kit cannot exercise a behaviour, the line reads `VERDICT: not testable in plugin test — <reason> — check live`, followed by what the type docs say.
- The assertions only check that a probe ran. A pass therefore means "the probe ran and printed its verdict", not "the engine behaves the way flightdeck hoped".

## Fixtures and live checks

The `/probe <id>` slash command sets the `mode` atom. The fixtures are selected by that mode, so you can run any of them by hand in a live session: `claude --plugin-dir <this folder>`, then `/probe p1` (or `p2`, `p3`, `p4`, `p4-await`, `p4-timer`, `p5`, `p6`, `p6-pass`, `p7`, `p8`, `p9`, `p10`). `/probe off` returns the band to the engine. In tests, a `Pane` with the id `readout` draws every atom as `name=<json>`, because the test's `$` has no state noun.

| id | fixture |
|---|---|
| p1 | band Buttons `hotkey="1"` (key `digit`) and `hotkey="a"` (key `letter`) |
| p2 | 30-row band; the mod answers `ui.scroll` itself and draws its own `scroll.bodyRows` window from a `bandOffset` atom |
| p3 | the same 30-row band left to the engine's window, with the decision row (`y`, `9`) last |
| p4 / p4-await / p4-timer | the render calls `update()` on an atom: unawaited, awaited, or deferred to `$.clock.after` |
| p5 | `/probe p5` opens Pane `p5`; its render reports `placement` and calls `$.ui.close` when it is `dock` |
| p6 / p6-pass | two band hooks in one module, the first wrapping `await next(e)`; `p6-pass` lets the chain continue to other plugins |
| p7 | a band Button that calls `$.prompt.submit({ asUser: true })` |
| p8 | `Input rows={3}` that records `onInput` and `onSubmit` |
| p9 | a `session.measure` hook snapshots `context`; the band draws `ctx N%`, `percent-null`, or `no-measure` |
| p10 | a body `Box` 6 rows tall (`overflow="hidden"`) drawing its own slice of 30 lines from a `p10Offset` atom that the mod's `ui.scroll` answer moves, then three option rows (`y`, `r`, `h`); every scroll that reaches the band is logged in `p10Scrolls` |

## What each probe answers, and the decision it feeds

| Probe | Question | Feeds |
|---|---|---|
| P1 | Does a bare digit in an empty composer press a band Button `hotkey="1"`, and does a letter `hotkey="a"` stay unpressed? | drop digits from band buttons |
| P2 | Can a mod own `ui.scroll` for the band and draw its own window over a tree taller than `maxRows`? Which slice is drawn? | pinned decision footer vs inline gate pane |
| P3 | Do letter hotkeys fire on Buttons scrolled out of the band's window? | can the decision row sit last without pinning |
| P4 | Is an `update()` started in `ui.render` refused or lost? | confirms viewed marks are being dropped |
| P5 | What `placement` does a Pane report, and does a close-when-dock guard work? | inline-gate-pane guard |
| P6 | Do two band contributors compose when one embeds `await next(e)`? | coexisting with other band mods |
| P7 | What does `$.prompt.submit` from a press do while AskUserQuestion is open, or after the user typed? | two-gate-model race until toolkit 1.12.1 |
| P8 | `Input rows=3`: Enter vs Shift+Enter, and what text reaches `onSubmit`? | ship explain-back box |
| P9 | Is `context.percent` on `session.measure`, and what does the event look like after `/compact`? | context % on the band |
| P10 | Can the options stay on screen while a fixed-height body above them scrolls on its own? | REQ-002 debrief view: pinned ship question, or the narrow folded list |

The answers observed on 2.1.318 are in `../results-2.1.318.md`.

## Limits of the kit (2.1.318)

- There is no key routing. `ui.press` presses by element key, and `ui.key` reaches only a `Client` (it rejects with "the drawing holds no Client"). Hotkey arming, composer focus, and the band window are not modelled.
- Nothing is painted. The kit returns the tree the hooks built. It does not show whether the engine also windows that tree.
- Nothing runs beneath the test's hooks. `ui.open`, `ui.close`, `prompt.submit`, `session.measure` and `ui.render` (when a chain reaches its bottom) need answers from the test, and the test supplies `placement` and `viewport` itself.
- The test's engine `$` has no `state` noun. Atoms are read through the `readout` Pane.
