# {{TITLE}} — Architecture

| Field | Value |
|---|---|
| REQ | {{REQ_ID}} |
| Status | drafting \| validated \| superseded |
| Created | {{DATE}} |
| Related ADRs | {{ADR_LINKS}} |

## Summary

One paragraph. What changes, where, and why.

## Blast radius

Files and modules this REQ will touch. Generated from codebase-explorer's recon pass.

| Path | Why touched | Risk |
|---|---|---|
| `src/foo/bar.ts` | Add new method `X` | low |
| `src/foo/baz.ts` | Refactor `Y` to call new method | medium |
| `tests/foo/bar.test.ts` | Add tests for `X` | low |

## Approach

How the change is structured. Two or three paragraphs. Should answer:

- Where does the new code live?
- What existing patterns does it follow?
- What new patterns (if any) does it introduce?
- How does it integrate with existing code?

## Task DAG

Tasks broken into dependency tiers. Tier 0 has no dependencies; Tier N depends only on Tier N-1 or earlier.

### Tier 0
- `TASK-001` — {{description}}
- `TASK-002` — {{description}}

### Tier 1
- `TASK-003` — depends on TASK-001
- `TASK-004` — depends on TASK-002

### Tier 2
- `TASK-005` — depends on TASK-003, TASK-004

## Test strategy

What gets tested at what level. Unit, integration, end-to-end. Specific test files to add.

## Convention alignment

How this design follows `.adlc/context/conventions.md`. Call out any deviations and why.

## Risks

What could go wrong. What we're betting on. What we'd do if the bet fails.

| Risk | Likelihood | Mitigation |
|---|---|---|
| {{risk}} | low \| med \| high | {{mitigation}} |

## Open questions

- [ ] Anything that couldn't be resolved at architecture time

## Related

- Spec: [[specs/{{REQ_ID}}/requirement]]
- Concepts: {{CONCEPT_LINKS}}
- Components: {{COMPONENT_LINKS}}
- Lessons checked: {{LESSON_LINKS}}
- ADRs: {{ADR_LINKS}}
