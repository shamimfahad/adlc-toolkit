---
name: optimize
description: Standalone performance and cost audit. Dispatches the performance-scanner agent and produces a dated report in .adlc/audits/. Identifies LLM/API cost hotspots, DB performance issues, latency drivers, caching opportunities. No gates — read-only.
---

You are running a performance and cost audit. Like `/analyze`, this is **standalone work** — no gates, no pipeline state, just dispatch the scanner and surface the report.

## When to use

- Cost per request feels high and you want to find where
- API or DB latency has crept up; need to localize the cause
- Before a scale milestone (10x traffic, new market launch)
- Recurring perf budget review

## When NOT to use

- Code health and tech debt — that's `/analyze`
- A specific bug with bad performance — that's `/bugfix` with a perf-focused investigation

## Inputs

Optional arguments:

- **Scope** — path or glob. Default: whole repo, excluding non-runtime code (tests, scripts, docs).
- **Focus** — one of `cost`, `db`, `latency`, `all` (default: `all`).

If the user doesn't provide, ask whether to run the default or to customize.

## Preflight

1. **Read the toolkit ETHOS.**
2. **Load vault context.** `.adlc/CLAUDE.md`, `config.yml`, `context/architecture.md` (to know hot paths), `context/conventions.md` (to know any perf-related rules), `knowledge/gotchas.md` (for accumulated perf gotchas), accepted ADRs.
3. **Check for prior audits.** Read `.adlc/audits/perf-*.md`. Recent ones (<30 days) get surfaced before a new run.

## Steps

### 1. Dispatch performance-scanner

```
Repo: <repo-root>
Scope: <scope or "whole repo">
Focus: cost | db | latency | all

Run the perf scan per your skill instructions.
Write the report to: .adlc/audits/perf-YYYY-MM-DD.md
```

### 2. Wait for the report

Verify the report exists with all sections (Summary, Findings by severity, Quick wins, Long-term).

### 3. Compare against prior perf audits

If prior reports exist:

- New findings
- Resolved findings (look for items present in prior, absent in current — confirm they were genuinely fixed, not just missed by the scan)
- Trend (LLM cost trajectory, DB hot-spot count, latency hotspot count)

### 4. Update hot.md

```markdown
## [YYYY-MM-DD] audit-perf | <count> findings | focus: <focus>
```

### 5. Update index.md

Under the "Audits" section:

```markdown
| YYYY-MM-DD | perf | N | N | N | <one-line summary> |
```

### 6. Report to the user

```
Performance & cost scan — YYYY-MM-DD

Focus: <focus>
Files scanned: <count>

Top opportunities (impact × ease):

  Quick wins (small effort, high impact):
    1. <file>:<line> — <title> (<estimated impact>)
    2. ...

  Long-term (larger effort, architectural):
    1. <title> — <one-line description>

Cost-flavored findings:
  - <count> LLM call hotspots
  - <count> paid API loops

DB-flavored findings:
  - <count> N+1 queries
  - <count> missing-index candidates

Latency-flavored findings:
  - <count> sync I/O on request path
  - <count> Promise.all opportunities

Trends since last audit (YYYY-MM-DD):
  - <delta>

Full report: .adlc/audits/perf-YYYY-MM-DD.md

Reminder: every "fix" benefits from a before/after measurement. The report's
"Measurement plan" field for each finding tells you how to verify.
```

## Constraints

- **Read-only.** No code changes; no auto-optimization.
- **Don't propose architectural rewrites silently.** If a finding is large enough to warrant an ADR, the scanner says so — `/optimize` surfaces it, and the user decides whether to start one.
- **Honest about uncertainty.** Static analysis can't measure runtime. Always recommend measurement before any non-trivial fix.
- **Don't open REQs automatically.** The user converts findings into REQs via `/spec`.
- **Never run git mutations.**

## Output artifacts

- `.adlc/audits/perf-YYYY-MM-DD.md`
- Updates to `.adlc/hot.md` and `.adlc/index.md`
