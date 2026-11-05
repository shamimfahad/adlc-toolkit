# {{TITLE}} ^L-{{WORK_ID}}-{{N}}

> **File:** `knowledge/lessons/LESSON-{{WORK_ID}}-{{N}}-<slug>.md` — mint per `core/VAULT-LAYOUT.md` → `mint(lesson)`. **This file is the write side only.** Nothing reads the folder: agents and hooks read `knowledge/lessons.md`, which is generated from the table below by `node $TOOLKIT_PATH/scripts/adlc.mjs lessons`. Keep the table to one line per row — a row is what becomes the lesson's single line in `lessons.md`. Grow the file (sections under the rule) only when the lesson recurs; the generator marks it `↗`.

| Field | Value |
|---|---|
| ID | LESSON-{{WORK_ID}}-{{N}} |
| Captured | {{DATE}} |
| REQ | {{WORK_ID}} |
| Component | {{COMPONENT}} |
| Tags | {{TAGS}} — 2–5 lowercase tokens: component or domain names as the blast radius names them (`payments`, `queue-handlers`, `auth`) |
| Severity | nice-to-know \| guideline \| trap \| critical — `critical` is also `always-read`: every implementer sees it at dispatch |
| Lesson | The single sentence to remember, as a do/don't you can check. _Always declare composite indexes before deploying the query that needs them._ |
| Saw in | `src/path/file.ts:42`[, `src/other/file.ts:7`] — repo-relative; this is what the knowledge hook matches on, so name the real directory |
| Detectable | no \| grep \| lint \| test — could a machine catch a violation? Anything but `no` is a promotion candidate at the gate |
| Enforced by | — \| `.claude/rules/adlc-<x>.md` \| `verify.sensors: <name>` \| `<lint rule id>` — once filled, the lesson leaves the reflector's and the hook's read sets |
| Supersedes | _(optional)_ LESSON-… — and put the banner `> **STATUS: superseded by [[knowledge/lessons#^L-…]]** — <date>` at the top of the old file |

---

## Grown on demand — fill only when the lesson recurs

### What happened
One paragraph: what was expected, what actually happened, in which REQ.

### Why it matters
Concrete consequence — bug class, perf regression, security issue, hours lost.

### How to apply
- During `/architect`: …
- During `/implement`: …

### When this doesn't apply
Edge cases where the rule is wrong. Over-applied lessons cost as much as missing ones.

### Related
- Originating REQ: {{WORK_ID}} — by ID, never by path
- Concepts / components / other lessons: {{LINKS}}
