# REQ-001 — Flightdeck: auto-compact at phase boundaries, a context ring, numbered agents

| Field | Value |
|---|---|
| Status | ready-to-merge |
| Path kind | /proceed |
| Opened → merged | 2026-11-07 → — |
| Branch · PR | `feat/REQ-001-flightdeck-compact-ring` · — |
| Commits | `dccdab9`.. (2 commits, +953/−54 lines excl. adapters/) |
| Review rounds | 4 |
| Cost | — |

## Goal

The flightdeck mod can compact on its own after an approved gate and carry straight on into the next phase (opt-in setting). A context ring shows the fill before `history` and compacts when pressed. Agent rows carry `#n` from the engine's agent list.

## Acceptance criteria

- [x] Setting exists (off / on approve / past compact at)
- [x] Compacts after the answer, before the next phase — pressed and typed
- [x] Revise and fix never compact (exact approve only)
- [x] A failed compaction never drops the answer
- [x] Ring visible before history, every height, narrow
- [x] Ring amber at/above compact at
- [x] Ring press compacts; mid-turn toast
- [ ] Agents numbered to match the list under the prompt — built; live order unchecked → Follow-ups
- [x] Protocol text updated (GATE-PROTOCOL, README)
- [x] Tests — 124 pass (87 before)

## What changed

All behaviour lives in the flightdeck mod: pure rules in `model.ts`, side effects in `register.tsx` through one `compactThenSend` path (pressed answer, held typed approve, ring) with a single-flight guard and a 60 s give-up. A typed approve is dropped by the `prompt.submit` hook and re-sent by the mod after compacting. GATE-PROTOCOL's "never on its own" became an opt-in rule.

| Area | Files / modules | Kind |
|---|---|---|
| `core/extras/claude/mods/adlc-flightdeck/hooks/` | `register.tsx`, `model.ts` | changed |
| `core/extras/claude/mods/adlc-flightdeck/` | `types/index.d.ts`, `tests/flightdeck.test.tsx`, `README.md`, `.claude-plugin/plugin.json` | changed |
| protocol / docs | `core/GATE-PROTOCOL.md`, `CHANGELOG.md` | updated |
| `adapters/claude/extras/mods/adlc-flightdeck/` | mirror | regenerated |

## Decisions

- ADR-002 accepted — opt-in auto compaction after an approve answer; never before the card, never on revise/fix
- Spec gate: compact after the answer, not before the card (a revise needs the phase context)
- Implement: kept a first-word approve check over `optionHead` (import cycle, G02); later made exact at review
- Implement: agent order "build, then check" — shipped without the live check (accepted at review)

## Verification

- Verdict: approved after round 4 — round 1 0C/1M/10m/1t; 16 code findings fixed over rounds 2–4; M1 (agent order) accepted unverified
- Tests added: 37 in `tests/flightdeck.test.tsx` (87 → 124)
- `verify:` lint ✓ · adapters-in-sync ✓ · mod tests 124/124 ✓
- UI: no frontend declared; the mod's own tests cover the band and cockpit renders

## Knowledge

- Lessons: [[knowledge/lessons#^L-REQ-001-1|L-REQ-001-1]], [[knowledge/lessons#^L-REQ-001-2|L-REQ-001-2]], [[knowledge/lessons#^L-REQ-001-3|L-REQ-001-3]], [[knowledge/lessons#^L-REQ-001-4|L-REQ-001-4]]
- Gotchas: [[knowledge/gotchas#^g01|G01]], [[knowledge/gotchas#^g02|G02]], [[knowledge/gotchas#^g03|G03]], [[knowledge/gotchas#^g04|G04]]
- Components: [[knowledge/components/adlc-flightdeck]] · ADR: [[architecture/adr-002-opt-in-auto-compact|ADR-002]]
- Candidates discarded: 7

## Follow-ups

- Live check of `$.agent.list()` order vs the list under the prompt — unassigned
- Lane view unreachable — unassigned
- Subagent compaction via `autoCompactWindow` — idea, unassigned
- CHANGELOG `[Unreleased]` heading — rename at next toolkit version

## Trail

- 1 spec · 1 round (approve · via pane) · 0 agents
- 2 architect · predict "explore" · 1 round (approve · via pane) · 2 agents
- 3 implement · 1 round (approve · typed) · 5 agents
- 4 review · 4 rounds (fix all · viewed 0/18 · via pane → fix all · viewed 0/18 · via pane → fix all · typed → approve · viewed 0/18 · via pane) · 16 agents

| ID | Severity | Decision | Reason |
|---|---|---|---|
| M1 | major | accept | approved without a recorded live check; ships marked unverified |
| m1–m8, t1, n1–n5, p1, p2 | minor/trivial | fix | — |
| p3 | trivial | accept | reviewer advises leaving it |
| m9, m10 | minor | defer → wrapup | vault edits |

## Later

_Append-only._
