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
