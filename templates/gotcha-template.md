# Gotcha entry template

This is the shape of a single entry to append to `.adlc/knowledge/gotchas.md`. Don't create a separate file per gotcha — they live consolidated, with block anchors for stable references.

---

## G{{NN}} — {{TITLE}} ^g{{NN}}

| Field | Value |
|---|---|
| Discovered | {{DATE}} |
| REQ | {{REQ_ID}} |
| Component | {{COMPONENT}} |
| Status | confirmed \| `STATUS: needs verification` |
| Severity | trivia \| careful \| trap \| landmine |

**What:** One sentence describing the surprising behavior.

**Where:** Specific file paths and line numbers (or a `git rev-parse HEAD` reference if the code may move).

**Why it's surprising:** What a normal reading of the code would predict vs. what actually happens.

**Why it exists:** The historical reason — if known. If not, mark `STATUS: needs verification` and leave a placeholder.

**Don't:** What a future REQ should avoid doing. Often "don't simplify this" or "don't remove this seemingly-redundant call."

**Related:** Links to lessons, concepts, components, or other gotchas that connect.

---

## How to use this template

When `/wrapup` (or a reviewer) identifies a gotcha to capture:

1. Open `.adlc/knowledge/gotchas.md`.
2. Find the highest existing `^g##` anchor and increment.
3. Append the entry block above with the new anchor.
4. Add backlinks from the relevant spec/concept/component pages: `[[knowledge/gotchas#^g05|G05]]`.

Gotchas describe **codebase quirks** ("this exists for a non-obvious reason"). Lessons describe **process or pattern rules** ("next time you do X, remember Y"). When in doubt, ask: is this about preserving existing weirdness, or guiding future decisions? The first is a gotcha; the second is a lesson.
