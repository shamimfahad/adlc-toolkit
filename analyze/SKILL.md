---
name: analyze
description: Standalone codebase health audit. Dispatches the health-auditor agent and produces a dated report in .adlc/audits/. No pipeline state, no gates — read-only audit that you run periodically or on demand.
---

You are running a codebase health audit. This is **standalone work** — not part of the `/proceed` pipeline. No gates, no pipeline state. Just dispatch the auditor and surface the report.

## When to use

- Periodic health check (weekly, monthly, before a planning cycle)
- Before kicking off a tech-debt sprint
- After onboarding a new team member who'll need to understand current debt
- When the codebase "feels heavy" and you want a concrete inventory

## When NOT to use

- Per-REQ review — that's `/review`'s job, scoped to a specific diff
- Performance / cost issues — use `/optimize` instead (different agent, different findings shape)

## Inputs

Optional arguments:

- **Scope** — path or glob. Default: whole repo, excluding generated code, vendored deps, build artifacts.
- **Depth** — `quick` (top 10 findings), `standard` (top 30, the default), `thorough` (everything material).
- **Focus** — comma-separated categories to emphasize: `dead-code`, `complexity`, `coverage`, `convention`, `duplication`, `deps`, `docs`, `vault`. Default: all.

If the user doesn't provide arguments, ask once whether they want the default (`standard`, whole repo, all categories) or to customize.

## Preflight

1. **Read the toolkit ETHOS.**
2. **Load vault context.** `.adlc/CLAUDE.md`, `config.yml`, `context/conventions.md`, `context/architecture.md`. The auditor needs to know the rules it's checking against.
3. **Verify auditable scope exists.** Check that the scope path has source files. If empty, surface and stop.
4. **Check for prior audits.** Read `.adlc/audits/health-*.md`. If a recent one exists (<30 days), surface it and ask whether the user wants a new run or to just look at the recent one.

## Steps

### 1. Dispatch health-auditor

```
Repo: <repo-root>
Scope: <scope-path or "whole repo">
Depth: quick | standard | thorough
Focus: <list>

Run the codebase health audit per your skill instructions.
Write the report to: .adlc/audits/health-YYYY-MM-DD.md
```

### 2. Wait for the report

The auditor agent writes the dated report. Verify it exists and has the expected sections (Summary, Findings by severity, Detailed findings, Trends, Recommendations).

If the agent reports an error or empty findings, surface that — don't fake content.

### 3. Compare against prior audits

If prior audit reports exist, do a quick diff:

- New findings since last audit
- Findings that have been resolved (or stale findings that should be re-checked)
- Trend direction (more, fewer, the same)

Append a **Trends** subsection to the report if not already present.

### 4. Update hot.md

Append:

```markdown
## [YYYY-MM-DD] audit-health | <count> findings (<critical>C/<major>M/<minor>m) | depth: <depth>
```

### 5. Update index.md

If audits aren't already indexed, add an "Audits" section to `index.md`:

```markdown
## Audits

| Date | Type | Critical | Major | Minor | Notes |
|---|---|---|---|---|---|
| YYYY-MM-DD | health | N | N | N | <one-line summary> |
```

### 6. Report to the user

Surface a concise summary in chat:

```
Codebase health audit — YYYY-MM-DD

Scope: <scope>
Depth: <depth>
Files scanned: <count>

Findings:
  Critical: <N>  ← <one-line summary if any>
  Major:    <N>
  Minor:    <N>

Top 3 priorities (by impact × effort):
  1. <finding> (effort: <small/medium/large>)
  2. <finding>
  3. <finding>

Trends since last audit (YYYY-MM-DD):
  Better:  <count> findings resolved
  Worse:   <count> new findings
  Stale:   <count> findings still open

Full report: .adlc/audits/health-YYYY-MM-DD.md
```

## Constraints

- **Read-only.** Audit only — Claude does not fix what's found.
- **Don't open REQs automatically.** If the user wants to act on findings, they invoke `/spec` to draft a REQ from the audit. Don't auto-create that.
- **Don't update conventions.** If the audit reveals that an undocumented convention is being followed by most of the code, that's a finding category (`convention-gap`) — don't unilaterally write the rule into `conventions.md`.
- **Never run git mutations.**

## Output artifacts

- `.adlc/audits/health-YYYY-MM-DD.md`
- Updates to `.adlc/hot.md` and `.adlc/index.md`
