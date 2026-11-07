# REQ-002 — The debrief: /debrief and the DEBRIEF view in the gate

| Field | Value |
|---|---|
| Status | ready-to-merge |
| Path kind | /proceed |
| Opened → merged | 2026-11-07 → — |
| Branch · PR | `feat/REQ-002-debrief` (stacked on `feat/REQ-001-flightdeck-compact-ring`) · — |
| Commits | `f9f17f7..3adb52e` (3 commits, +2939/−158 lines incl. generated adapters) |
| Review rounds | 4 |
| Cost | — |
| Source | — |

## Goal

/debrief told a REQ's story in eight short sections, each claim pointed, so the developer could retell the work; the flightdeck drew it inside the gate.

## Acceptance criteria

- [x] AC1–AC2 — eight labels verbatim; a pointer on every claim
- [x] AC3–AC4 — reader from the trail (`readerOf`); one ask, once per REQ, never unattended or at an open gate
- [x] AC5–AC7 — mermaid ≤5 else a rail; verification read to the glance; `debrief` rounds are asks
- [x] AC8–AC11 — /wrapup 7c, YOUR SUMMARY gaps, record Goal, /autopilot
- [ ] AC12 — P10 recorded (not pinned); live tmux half open → Follow-ups
- [x] AC13–AC16 — parser never throws; sub-view; ≥110 board, list below 110 (amended from 84); theme keys only
- [x] AC17–AC18 — mod 150, hook 37; 1.14.0 / 0.10.0, CHANGELOG, adapters by the hook

## What changed

The reader rule lives once, as `readerOf` in the trail hook, and the skill and the mod only read its answer. `/debrief` is a new skill, not an agent or a gate; `/wrapup` gains step 7c and `/autopilot`'s final review runs it with the ask skipped. The mod draws the story from `debrief.md`; because the band does not pin options under a scrolling body (P10), below 110 columns it folds into a section list. The in-band reader ask (DebriefAsk board) was deliberately left for later — it is a dialog (ADR-003).

| Area | Files / modules | Kind |
|---|---|---|
| skills | `core/skills/debrief.md` | new |
| skills | `core/skills/wrapup.md`, `core/skills/autopilot.md`, `core/GATE-PROTOCOL.md` | changed |
| hooks | `core/extras/claude/hooks/adlc-trail.mjs`, `adlc-knowledge.mjs` | changed |
| mod | `adlc-flightdeck/hooks/{register.tsx,model.ts,vault.ts,evidence.ts}`, `types/index.d.ts` | changed |
| tests | `tests/hooks/adlc-trail.test.mjs`, `tests/hooks/ask-list-parity.test.mjs`, mod `flightdeck.test.tsx` | new / changed |
| probes | `docs/plans/probes/flightdeck-engine-probes/**`, `results-pin.md` | changed / new |
| release | `core/manifest.json`, `plugin.json`, `CHANGELOG.md`, `README.md`, `docs/quickstart.md`, `scripts/adlc.mjs`, `.adlc/config.yml`, `adapters/**` (generated) | changed |

## Decisions

- [[architecture/adr-003-debrief-ask-dialog|ADR-003]] accepted — the reader question is a dialog, only when no gate marker is open (narrowed in review)
- Spec gate: a new skill; default reader is the lead; handover only when you answered no round
- Architect gate: worktree stacked on REQ-001; rule tests under `node --test` (AC17 amended)
- Implement: go on "not pinned", live check before ship; a REQ with no gates reads warm; 10 deviations accepted
- Review: fix all, three rounds; n8, n9 (REQ spec text) and m13 (component page) done at wrapup

## Verification

- Verdict: **PASS** after round 4 — 0C/0M/3m open, all needs-decision vault text, done at wrapup
- Tests added: trail hook 37 (`adlc-trail.test.mjs`, `ask-list-parity.test.mjs`); mod 124 → 150
- `verify:` lint ✓ · test ✓ 37/37 · flightdeck-mod-tests ✓ 150/150 · adapters in sync
- UI: no browser (terminal mod); layouts covered by `claude plugin test` at three widths

## Knowledge

- Lessons: [[knowledge/lessons#^L-REQ-002-1|L-REQ-002-1]] · [[knowledge/lessons#^L-REQ-002-2|-2]] · [[knowledge/lessons#^L-REQ-002-3|-3]] · [[knowledge/lessons#^L-REQ-002-4|-4]] · [[knowledge/lessons#^L-REQ-002-5|-5]] · [[knowledge/lessons#^L-REQ-002-6|-6]] · [[knowledge/lessons#^L-REQ-002-7|-7]]
- Gotchas: [[knowledge/gotchas#^g05|G05]]–[[knowledge/gotchas#^g11|G11]]
- Components: [[knowledge/components/adlc-flightdeck]] (0.10.0, Debrief)
- Candidates: 39 considered — 7 lessons, 7 gotchas, 4 discarded

## Follow-ups

- Live tmux check of probe P10 at 100 and 80 columns (`docs/plans/probes/results-pin.md` → *To finish it*) — the user, before ship
- The in-band reader ask (DebriefAsk board) to replace the dialog — unassigned, needs a spec
- A debrief for `/bugfix` and `/task` records — unassigned
- The adapters-in-sync sensor misses untracked files ([[knowledge/gotchas#^g11|G11]]) — unassigned

## Trail

- 1 spec · 1 round (approve · via pane)
- 2 architect · 2 rounds (predict "skip" · approve · via pane)
- 3 implement · 1 round (approve · viewed 0/52 · via pane)
- 4 review · 4 rounds (fix all · typed → fix all · viewed 0/56 · via pane → fix all · viewed 0/56 · via pane → approve · typed)

35 findings: 32 fix · 3 defer. Majors: ARCH-001 (dialog over an open gate) and REFL-001 (fold below 84, not 110) — both fixed.

| ID | Severity | Decision | Reason |
|---|---|---|---|
| ARCH-001 | major | fix | — |
| REFL-001 | major | fix | — |
| REFL-004 | minor | defer | m13 component page — done at wrapup |
| REFL-006 | minor | defer | n8 architecture.md + AC15 text — done at wrapup |
| REFL-007 | minor | defer | n9 architecture.md cold rule and ask — done at wrapup |

## Later

_Append-only._
