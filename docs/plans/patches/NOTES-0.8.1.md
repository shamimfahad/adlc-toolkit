# adlc-flightdeck 0.8.0 → 0.8.1 — "make the record true"

Files (in docs/plans/patches/ of the repo; the orig/work/trial folders and gen_patch.py stayed in the drafting workspace):

- `apply-0.8.1.py`: the patch script. It follows the `apply-1.12.0.py` structure: `HUNKS` keyed under `MOD`, plus `ROOT_HUNKS` for `CHANGELOG.md` at the repo root (apply-1.12.0 has no non-mod files, so a second root was added). It runs two passes, writes nothing on any miss, and preserves each file's line endings. There are 62 hunks.
- `0.8.1.diff`: the unified diff from orig to work, covering all files.
- `gen_patch.py`: builds `apply-0.8.1.py` from `orig/` and `work/`. For each change it picks the smallest context that is unique where the hunk applies. It then checks that applying the hunks in order reproduces `work/` exactly, and that every hunk reads as already applied on the result.
- `orig/` holds the pristine copy, `work/` the edited copy, and `trial/` the pristine copy with the script applied.

## Proof

- **Baseline (pristine 0.8.0):** `claude plugin validate` passed (warnings only: no icon, no install line). `claude plugin test` gave **72 pass, 0 fail**.
- **After (work):** validate passed. `claude plugin test` gave **87 pass, 0 fail**. `tsc` against the bundled `claude-code.d.ts` with the anthropics mods tsconfig reported no errors. That tsconfig run was not part of the brief: pristine 0.8.0 is also clean under it.
- **Trial run:**
  - First run: every hunk applied (`types 3, vault 1, register 38, flightdeck.test 8, evidence.test 1, plugin.json 1, README 9, CHANGELOG 1`).
  - `diff -r trial work`: identical.
  - Second run: `0 applied / N already` for every file, exit 0.
  - `claude plugin test` on the trial mod: **87 pass, 0 fail**. Validate passed.
- **Extra checks:**
  - A CRLF copy of the repo patched to the same content, CRLF kept, and the second run was a no-op.
  - With one file altered so a hunk misses, the script printed the miss, exited 1, and wrote nothing.
- **The new tests run against 0.8.0 code:** 12 of the 15 new tests fail, and so do the 4 adjusted ones. Three new tests pass on 0.8.0 too. They are regression guards, not proofs:
  - render-pure "no git facts yet". The module-level `vault` is null under the test host, so 0.8.0's render-time `refreshGit` returns before it runs git.
  - evidence keys on tabs 3 and 5. Only the review tab had duplicate keys.

## Per scope item

### 1. Render only reads (`hooks/register.tsx`)

- `cockpit()`:
  - The `update(layoutA, … narrow)` write is removed. `narrow` is derived from `bodyColumns`, and `FlightLayout.narrow` becomes optional and documented as no longer written.
  - The render-time `refreshGit` is removed.
- `touch()` (events) now asks git when the focus moves to a REQ in the deck.
- `pickReq` and history's `open` (press handlers) ask git for a REQ that has no facts yet.
- New `openDiff()` handler, called from `diffCell` and the ship bar's `onPress`. It turns the view, runs the `git diff` (or reads the new file), stores the result in a new `diff` atom, then calls `markViewed`.
- `diffView` is now synchronous and only reads `diff`. It shows "reading the diff…" until the atom holds that diff.
- `types/index.d.ts` gains `FlightDiff` and `PluginState.diff`.
- Writes that remain under render are all inside handler closures. Render still makes reads only: `fs`, `$.session.usage` and module caches.

### 2. In flight (`hooks/vault.ts` → `inFlight`)

The rule is now `phase >= 1 && (phase < last || waiting)`. Merged and aborted REQs never reach it, because the deck only holds `isActive` ones. Both callers pick this up, the strip and the band's focus fallback, so a REQ at the ship gate stays on the strip and keeps the band up.

### 3. No digit hotkeys (`register.tsx`)

- `OPTION_KEYS` changes from `1–6` to `a b d e f g i j`. Each option gets its letter by position, and only while the open gate's page is on screen.
- The narrow list's `home-n` rows carry no hotkey. Their phase number is now always plain text.
- The consequence line shows the recommended option's letter.
- The Settings → KEYS text is updated.
- Header controls are unchanged (click-only).

### 4. Heartbeat (`session.start`)

- `now` ticks at 4 Hz only while a lane has `endedAt === null`.
- Otherwise a check runs once a second. It reads `lanes`, `deck` and `now`, and writes nothing unless a gate waits and `now` is at least `GATE_TICK_MS` (60 s) old, or a landed lane needs letting go.
- There is no staleness cutoff.

### 5. The dead `×` Text in the band row is removed.

### 6. Keys

- `ref(key, path, …)` now takes a required, location-scoped key: `ref-find-<id>`, `ref-plan-<path>`, `ref-files-<path>`, `ref-stat-<path>`, `ref-open-editor`. This removes the duplicate `ref-<abs>-0` that a finding's `where` and its plan row both produced off-terminal.
- `pathCell`, `viewedMark` and `diffCell` take a scope prefix (`plan-` in PLAN VS ACTUAL). The FILES keys keep their 0.8.0 names (`seen-…`, `diff-…`).
- Gate options are keyed `opt-<head>`, with `-<i>` added when two options share a head.
- The doc listing becomes `doc-file-<name>`.

### 7. The band composes

`const below = await next(e).catch(() => null)` runs once, near the top of the AbovePrompt hook. Its result is drawn last in both the one-row band and the cockpit `frame()`. When nothing is beneath, the tree is byte-identical to 0.8.0's.

### 8. README

- New lines: the band is terminal and desktop only, and other mods' band content stays under the flightdeck.
- In flight now includes a REQ waiting at a gate.
- All digit-key text is replaced with the letter scheme.
- `[-]` is the engine's own mark.
- The VS Code panel claim is removed: on desktop, `code -g` needs `$.process` (CLI) and does nothing where it is unavailable.

### 9. Version and changelog

`plugin.json` is now 0.8.1. A CHANGELOG `[Unreleased]` entry, `### Fix: make the record true (adlc-flightdeck v0.8.1) [tooling]`, follows the v0.5.0 style: the mod's version in the heading, terse bullets, no paths and no vault names.

### 10. Tests

**15 new tests:**

- `tests/flightdeck.test.tsx`, `describe('0.8.1')`:
  - three render-pure views (narrow vs stored layout, no git facts, a diff open)
  - opening a diff
  - the ship-gate REQ
  - four key views (implement wide, narrow list home, narrow gate page, review with five options plus compose)
  - the heartbeat, on `mock.clock`
  - two "band composes and its keys are unique" tests (band and max)
- `tests/evidence.test.tsx`, `describe('0.8.1: keys')`: three tests on desktop with the `VER` fixture served through `fs` hooks (tabs 3, 4 and 5).

How the purity tests detect a write: the test host refuses a state write made while drawing before any hook sees it, so a test cannot observe the write directly. It does see the read that the `update` helper makes before it writes. The tests therefore assert that each value is read once while drawing (settings, deck and layout twice: once by the band hook, once by the cockpit) and that no child process runs. On 0.8.0 the narrow case reads `layout` 3 times, and the diff case reads `viewed` 65 times and runs `git diff`.

**Adjusted existing assertions:**

1. `0.6.0 > pane at a gate…`: `opt-approve` hotkey `'1'` → `'a'`.
2. `0.7.0 > in flight…`: renamed ("…or waiting at its gate — phase 0 and an unmarked ship are history"). Adds `REQ-sf-008-ship-gate` (phase 5, waiting), so the expected list gains `REQ-sf-008`.
3. `0.7.0 > no letter key on any header control`: the allowlist of lettered buttons gains `opt-.*`.
4. `0.7.0 > band: one row…`: renamed ("⤢ (the engine draws [-])"), and the `×` Text check is flipped from `toBeDefined` to `toBeUndefined`.

## The load-bearing hunks (for approval)

**A. In flight (`hooks/vault.ts`)**

```diff
-  return reqs.filter(r => r.phase >= 1 && r.phase < r.phases.length)
+  return reqs.filter(r => r.phase >= 1 && (r.phase < r.phases.length || r.waiting))
```

**B. Git and the viewed mark from handlers, not render (`register.tsx`, `touch` and the new `openDiff`)**

```diff
-  if (was !== req) await update($, focusA, () => req)
+  if (was === req) return
+  await update($, focusA, () => req)
+  // First look at a REQ: ask git now, from the event, so the cockpit's render only reads (0.8.1).
+  if ((await read($, deckA)).reqs.some(r => r.id === req)) void refreshGit($, req).catch(() => {})
+}
+
+async function openDiff($: Dollar, req: string, path: string) {
+  await setView($, v => ({ ...v, sub: { kind: 'diff', path } }))
+  const g = (await read($, gitA))[req]
+  …  (the git diff / new-file read moved verbatim out of diffView)
+  await update($, diffA, () => ({ req, path, source, isNew }))
+  if (g) await markViewed($, req, path, g.hashes[pathKey(path)])
 }
```

**C. The render writes removed (`cockpit()`, and `diffView` reduced to a read)**

```diff
-  if (layout.narrow !== narrow) void update($, layoutA, l => ({ ...l, narrow })).catch(() => {})
+  // `narrow` is derived here and never written back: a render only reads (0.8.1; `layout.narrow` is no longer kept).
 …
-  if (reqId && live && !g) void refreshGit($, reqId).catch(() => {})
 …
-  const diffView = async (path: string) => {
-    … source = await git($, cwd, gitPlan(…).diff(g?.base ?? null, path)) …
-    if (reqId && g && marks?.[k] !== (g.hashes[k] ?? 'seen')) void markViewed($, reqId, path, g.hashes[k])
+  const diffView = (path: string) => {
+    const d = diffAt && diffAt.req === reqId && pathKey(diffAt.path) === k ? diffAt : null
+    const source = d?.source ?? null
+    const isNew = !!d?.isNew
```

**D. Letter keys for the gate options**

```diff
-const OPTION_KEYS = ['1', '2', '3', '4', '5', '6'] // the action bar's options, on the open gate's page only
+/** … by position: a b d e f g i j … skips `c` (compose), `m` (KEYS.mermaid), `h` / `s` (narrow header labels) … */
+const OPTION_KEYS = ['a', 'b', 'd', 'e', 'f', 'g', 'i', 'j']
 …
-              <Button key={`home-${p.n}`} plain {...(!gateOnScreen ? { hotkey: String(p.n) } : {})} dimColor={p.n !== tabN} …
+              <Button key={`home-${p.n}`} plain dimColor={p.n !== tabN} …
```

**E. Heartbeat**

```diff
-        const deck = await read($, deckA)
-        if (lanes.length > 0 || deck.reqs.some(r => r.waiting)) {
+        const running = lanes.some(l => l.endedAt === null)
+        if (running || beats % 4 === 0) {
           const now = await $.clock.now()
-          await update($, nowA, () => now)
+          const waiting = (await read($, deckA)).reqs.some(r => r.waiting)
+          if (running || (waiting && now - (await read($, nowA)) >= GATE_TICK_MS)) await update($, nowA, () => now)
```

**F. The band composes (AbovePrompt hook)**

```diff
+    const below = await next(e).catch(() => null) // nothing beneath (a test with no engine stand-in) draws nothing
     const layout = await read($, layoutA)
-    if (layout.height !== 'band') return cockpit($, e, layout.height)
+    if (layout.height !== 'band') return cockpit($, e, layout.height, below)
 …
-    if (!r) return next(e)
+    if (!r) { if (below) return below; const { Box: Empty } = $.ui.resolve(e); return <Empty /> }
 …
-          <Text dimColor> ×</Text>
 …
+    return below ? <Box flexDirection="column">{row}{below}</Box> : row
```

## Judgment calls

1. **The letter scheme is positional (`a b d e f g i j`), not mnemonic.** With first letters, `fix` and `fix all`, or `revise` and `reframe`, would collide, and the key would change with the marker's wording. A positional key cannot collide and stays the same while a gate is open. It skips `c` and `m` (bound elsewhere) and `h` and `s` (drawn as the narrow header's labels, so a hotkey with those letters would look like a header key). There are 8 letters because `parseMarker` keeps up to 8 options; 0.8.0 left options 7 and 8 without a key. The narrow list rows get no hotkey, which the brief allowed ("letters or no hotkey"). Letters there would compete with the options' letters.
2. **`next(e)` goes last**, under the flightdeck in both the one-row band and the cockpit. The engine windows the band from the top, so drawing first keeps the flightdeck's row and its gate options at the top of the window. Another mod's band content then scrolls under it rather than pushing the options out of view. It is wrapped in `.catch(() => null)`: in a real session `next` always resolves, but the test host has nothing beneath unless a test stands in for the engine. The catch keeps the existing mount tests unchanged and means a failure beneath never takes the flightdeck down. Where `next` returns nothing, the tree is exactly 0.8.0's.
3. **The diff lives in a new `diff` atom**, not in `view.sub`, so the view stays small and the same shape. A `diff` view restored without its atom shows "reading the diff…". That can only happen within a session, since atoms reset per session.
4. **When git is first asked.** 0.8.0's render did a "first look" at the REQ shown. 0.8.1 does it from `touch()`, which moves the focus, from `pickReq` and history `open` (presses), and from `/flight` (which already forced it), on top of the existing scan. `openOn` (⤢) does not add a call, because the focus REQ was already asked by `touch` or the scan. That also keeps the "heights" test's `asking git…` assertion as written.
5. **The heartbeat checks once a second while idle.** It does so to let landed lanes go after `LINGER_MS`. That check only reads, and it writes `now` only when a gate waits and `now` is at least 60 s old. So the first tick after a gate opens is immediate, and later ticks come once a minute. The 15 s rescan still rewrites the deck, as in 0.8.0; changing that was out of scope.
6. **`opt-<head>` keys stay**, rather than becoming `opt-<i>`. The head is the option's identity at a gate, not changing text, and existing tests use `opt-approve` and `opt-fix all`. Duplicate heads get `-<i>`.
7. **FILES keeps its 0.8.0 keys** (`seen-<path>`, `diff-<path>`). Only PLAN VS ACTUAL is prefixed `plan-`, so the existing tests are unchanged.

## Not done, or worth a look

- The README "Answering a gate" bullet still says an option with an argument is an input on desktop and fills the prompt on "the phone". The band is never drawn on mobile, and the code fills the prompt on every surface. This is out of scope and was left alone.
- `$.session.usage()` and `fs` reads still happen during render. They are reads, so they are allowed.
- In the desktop `code -g` button, `$.process.run` failing is still swallowed silently. The README now says so; no behaviour changed.
- The scan's 15 s `update(deckA)` still redraws the band every 15 s while gates wait. That is the scan, not the heartbeat, and it is unchanged.
