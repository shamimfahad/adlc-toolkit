# Gotchas

Consolidated list of codebase quirks — things that exist for non-obvious reasons and **should not be simplified, removed, or "cleaned up" without understanding why they're there**.

Each entry has a stable `^g##` block anchor. Reference from other vault pages as `[[knowledge/gotchas#^g05|G05]]`.

## How to add an entry

1. Find the highest existing `^g##` anchor and increment.
2. Append a new entry using the shape in `templates/gotcha-template.md`.
3. Link from relevant spec/concept/component pages.
4. Append a line to `hot.md`: `## [DATE] gotcha | G## — title`.

## Distinction from lessons

- **Gotcha:** "this code does X for non-obvious reason Y — don't simplify it." Describes *existing* weirdness.
- **Lesson:** "next time you do X, remember Y." Describes *future* behavior.

Use both. They serve different purposes.

---

## Entries

<!-- Newest entries below this line. Add new ones at the bottom; existing anchors must not be renumbered. -->

_(empty — populated as gotchas are discovered)_

## G01 — `h` is the JSX factory in the flightdeck mod ^g01

| Field | Value |
|---|---|
| Discovered | 2026-11-07 |
| REQ | REQ-001 |
| Component | adlc-flightdeck |
| Status | confirmed |
| Severity | trap (will bite a normal change) |

**What:** In the mod's `.tsx` files every JSX tag compiles to a call to `h`, so a callback parameter named `h` (`.map(h => <Text/>)`) makes the JSX call the parameter and throw.

**Where:** `core/extras/claude/mods/adlc-flightdeck/hooks/register.tsx` — `laneView()` trail rows (renamed `hit` in REQ-001).

**Why it's surprising:** `tsc` passes, and the crash hides behind the engine's generic "no implementation for ui.render" in tests.

**Why it exists:** The engine's JSX transform uses `h` as the factory name.

**Don't:** Name any variable or parameter `h` in mod `.tsx` files.

**Related:** [[knowledge/gotchas#^g03|G03]] (seeing a hidden render error).

## G02 — `model.ts` must not import values from `vault.ts` ^g02

| Field | Value |
|---|---|
| Discovered | 2026-11-07 |
| REQ | REQ-001 |
| Component | adlc-flightdeck |
| Status | confirmed |
| Severity | careful (check before touching) |

**What:** `vault.ts` builds regexes from `model.ts`'s `ID_SRC` at load time; a value import back from `vault.ts` into `model.ts` creates a cycle that breaks the mod at startup.

**Where:** `core/extras/claude/mods/adlc-flightdeck/hooks/vault.ts:68`.

**Why it's surprising:** Helpers like `optionHead` look reusable from `model.ts`.

**Why it exists:** `model.ts` is the pure base layer; `vault.ts` sits on it.

**Don't:** Import values from `vault.ts`/`evidence.ts` into `model.ts`; copy the small helper or move it down.

**Related:** REQ-001 `isApproveLike`.

## G03 — The mod test kit has no defaults you'd expect ^g03

| Field | Value |
|---|---|
| Discovered | 2026-11-07 |
| REQ | REQ-001 |
| Component | adlc-flightdeck tests |
| Status | confirmed |
| Severity | trap (will bite a normal change) |

**What:** In `claude plugin test`: `$.clock.after` callbacks never run unless the test answers `clock.after`; `clock.now` is pinned, so time-based caches (the 5 s usage cache) never expire; a `session.compact` hook must return at least one message; one event gets one hook per test file (a second `on(…)` fails the load); a second `state(on, key)` does not replace the first; errors thrown from a test hook reach the plugin re-worded; a stubbed atom with `state.get` makes `update()` retry forever; `find({ text })` matches by inclusion; a cockpit render error shows only as "no implementation for ui.render" (wrap `cockpit()` in a temporary try/catch that draws the error to see it).

**Where:** `core/extras/claude/mods/adlc-flightdeck/tests/flightdeck.test.tsx` (fixtures, `autoGate`, `state` helper).

**Why it's surprising:** Each silently stalls or passes a test instead of failing loudly.

**Why it exists:** The test host simulates the engine minimally.

**Don't:** Assume timers, time, or hook overrides behave as in a live session; assert settings by Button key, not text.

**Related:** [[knowledge/gotchas#^g01|G01]].

## G04 — Type-check the mods with the bun cache's native tsc ^g04

| Field | Value |
|---|---|
| Discovered | 2026-11-07 |
| REQ | REQ-001 |
| Component | adlc-flightdeck |
| Status | `STATUS: needs verification` — true on this machine |
| Severity | trivia (good to know) |

**What:** There is no global `tsc` and `npx` fails offline; `~/.bun/install/cache/@typescript/typescript-darwin-arm64@*/lib/tsc -p .` in the mod folder works.

**Where:** `core/extras/claude/mods/adlc-flightdeck/tsconfig.json`.

**Why it's surprising:** `typescript@7`'s JS shim can't find its platform package outside an install.

**Why it exists:** The repo has no package.json and no typecheck in `config.yml` `verify:`.

**Don't:** Claim "types pass" without saying which binary ran.

**Related:** `config.yml` → `verify:` (no typecheck configured).

## G05 — ADR header rows feed the generated ledgers ^g05

| Field | Value |
|---|---|
| Discovered | 2026-11-07 |
| REQ | REQ-002 |
| Component | .adlc/architecture |
| Status | confirmed |
| Severity | careful (check before touching) |

**What:** `adlc.mjs index` reads an ADR's `Decided`, `Author` and `Superseded by` rows and the `^ADR-NNN` anchor on its title. An ADR with a `Date` row prints `Decided: —` in `decisions.md` and `index.md`.

**Where:** `.adlc/architecture/adr-*.md`; generator in `scripts/adlc.mjs`.

**Why it's surprising:** The ADR still reads fine; only the generated tables go blank.

**Why it exists:** The generators read header rows by name, so they stay cheap.

**Don't:** Start a new ADR from memory — copy the header of the last accepted one (ADR-002).

**Related:** [[architecture/adr-003-debrief-ask-dialog]].

## G06 — The agent sandbox blocks tmux sockets and `<(…)` ^g06

| Field | Value |
|---|---|
| Discovered | 2026-11-07 |
| REQ | REQ-002 |
| Component | docs/plans/probes |
| Status | `STATUS: needs verification` — true in this machine's sandbox |
| Severity | careful (check before touching) |

**What:** Inside the agent sandbox, tmux cannot create its socket ("Operation not permitted" under /private/tmp/claude, "File name too long" under the scratchpad), so a live probe has to be run by a person. Process substitution `<(…)` fails too (`/dev/fd/NN: Operation not permitted`).

**Where:** `docs/plans/probes/RUNBOOK.md` Step 2, `docs/plans/probes/results-pin.md` (Live run).

**Why it's surprising:** `claude plugin test` runs fine there, so the structural half of a probe passes and the live half silently cannot.

**Why it exists:** The sandbox refuses unix sockets and /dev/fd.

**Don't:** Plan a live probe as an agent task; write both sides of a diff to `$TMPDIR` files instead of `<(…)`.

**Related:** [[knowledge/lessons/LESSON-REQ-001-3-record-engine-probes]].

## G07 — A hook's main guard must compare real paths ^g07

| Field | Value |
|---|---|
| Discovered | 2026-11-07 |
| REQ | REQ-002 |
| Component | core/extras/claude/hooks |
| Status | confirmed |
| Severity | trap (will bite a normal change) |

**What:** A hook script that is also imported (for tests) guards its entry with `realpathSync(argv[1])` against the module's file path. Compared with `import.meta.url` directly, an installed hook reached through a symlink never runs.

**Where:** `core/extras/claude/hooks/adlc-trail.mjs` (end of file, `isMain`).

**Why it's surprising:** Tests pass (they import), and the live hook becomes a silent no-op.

**Why it exists:** Installs link hooks into `~/.claude`; `import.meta.url` is always the resolved path.

**Don't:** Test the CLI without `--vault <tmp>/.adlc` either — without it the script walks up from cwd and writes into the live `pipeline-state.json`.

**Related:** [[knowledge/lessons/LESSON-REQ-002-6-test-hook-through-event]].

## G08 — `trail gate` closes the open round unless the word is an ask ^g08

| Field | Value |
|---|---|
| Discovered | 2026-11-07 |
| REQ | REQ-002 |
| Component | adlc-trail |
| Status | confirmed |
| Severity | trap (will bite a normal change) |

**What:** `trail gate --decision <d>` closes the last undecided round. Only the ask words (`predict`, `summary`, `debrief` — `ASK_DECISIONS`) are inserted before it instead. A new ask word has to join that set and the mod's copy (the parity test checks). Likewise the Stop hook takes any turn with a line starting `ASK · Predict · `, `ASK · Summary · ` or `DEBRIEF · ` as an ask, not a gate — so a gate card must never carry such a line.

**Where:** `core/extras/claude/hooks/adlc-trail.mjs:61-63` (`ASK_LINE`, `ASK_DECISIONS`), `core/extras/claude/mods/adlc-flightdeck/hooks/model.ts` (`ASK_DECISIONS`).

**Why it's surprising:** `trail gate` accepts any word; the wrong one silently closes a live gate round.

**Why it exists:** Asks and gates share one round list in `pipeline-state.json`.

**Don't:** Run `trail findings` without `--json`/`--file` to see its usage — it records an empty list over the real one.

**Related:** [[knowledge/lessons/LESSON-REQ-002-5-cross-runtime-list-parity]].

## G09 — More mod test-kit traps ^g09

| Field | Value |
|---|---|
| Discovered | 2026-11-07 |
| REQ | REQ-002 |
| Component | adlc-flightdeck tests |
| Status | confirmed |
| Severity | trap (will bite a normal change) |

**What:** On POSIX the host resolves a `D:/…` fixture path against the test's folder, so stub `fs.stat`/`fs.read` by path suffix; `find({ type: 'Text', text })` returns the uncoloured parent first, so anchor the regex `^…$` when asserting a colour; a press that writes a stubbed atom fails the file late ("a rejection nothing handled: update: …"), so leave that key out of the fixture; a new atom key must be typed in `PluginState` — sub-view state belongs on its `FlightSub` variant; escape `+` and `.` when copy goes into a regex.

**Where:** `core/extras/claude/mods/adlc-flightdeck/tests/flightdeck.test.tsx` (debrief tests, ~1683–1790).

**Why it's surprising:** Each one misses silently or fails at the end of the file, not in the test.

**Why it exists:** The test host simulates the engine minimally.

**Don't:** Trust a passing colour or missing-file test until it has failed once.

**Related:** [[knowledge/gotchas#^g03|G03]].

## G10 — In a worktree, `tsc -p .` in a mod folder writes .js files ^g10

| Field | Value |
|---|---|
| Discovered | 2026-11-07 |
| REQ | REQ-002 |
| Component | adlc-flightdeck |
| Status | confirmed |
| Severity | careful (check before touching) |

**What:** A mod's `tsconfig.json` extends `.claude-plugin/types/tsconfig.json`, which a live session generates in the main checkout only. In a worktree it is missing, `noEmit` is lost, and `tsc -p .` writes a `.js` beside every source. Type-check with a scratch tsconfig that extends the main checkout's types and includes the worktree's folders. The probe mod has no types folder at all; borrow the flightdeck one.

**Where:** `core/extras/claude/mods/adlc-flightdeck/tsconfig.json:2`, `docs/plans/probes/flightdeck-engine-probes/tsconfig.json:2`.

**Why it's surprising:** The same command is clean in the main checkout.

**Why it exists:** Generated types are gitignored.

**Don't:** Run tsc in a worktree mod folder without a scratch config.

**Related:** [[knowledge/gotchas#^g04|G04]].

## G11 — Toolkit text in core/ ships into other vaults ^g11

| Field | Value |
|---|---|
| Discovered | 2026-11-07 |
| REQ | REQ-002 |
| Component | core/ |
| Status | confirmed |
| Severity | careful (check before touching) |

**What:** In `core/` text, point at a toolkit ADR as `$TOOLKIT_PATH/.adlc/architecture/…`, never `[[architecture/adr-…]]`: the wikilink resolves inside the user's vault, where ADR-003 is a different decision. Two more release traps: the `adapters-in-sync` sensor (`git diff --exit-code -- adapters`) does not see a new untracked adapter file; and `node --test <dir>` exits 1 on Node 24 — pass file globs (`tests/hooks/*.test.mjs`).

**Where:** `core/GATE-PROTOCOL.md` (*The trail*), `.adlc/config.yml` (`verify`).

**Why it's surprising:** Each looks right in this repo and breaks or passes falsely elsewhere.

**Why it exists:** core/ is the product; this repo's vault is only one user of it.

**Don't:** Trust the adapters sensor for a release that adds a skill — check `git status --porcelain -- adapters` too.

**Related:** [[knowledge/lessons/LESSON-REQ-002-1-rule-and-prose-same-diff]].
