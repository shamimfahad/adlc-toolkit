# {{TASK_ID}} — {{TITLE}}

| Field | Value |
|---|---|
| REQ | {{REQ_ID}} |
| Tier | 0 \| 1 \| 2 \| ... |
| Status | pending \| in-progress \| complete \| blocked |
| Repo | {{REPO_ID}} |
| Depends on | {{TASK_IDS}} |
| Blocks | {{TASK_IDS}} |

## Goal

One sentence. What must be true when this task is done.

## Files to touch

| Path | Action |
|---|---|
| `src/foo.ts` | edit |
| `src/bar.ts` | create |
| `tests/foo.test.ts` | edit |

## Approach

Two or three bullets describing how to implement. Concrete enough that task-implementer can execute without re-deciding.

## Acceptance

- [ ] Tests pass
- [ ] Specific behavior {{X}} works
- [ ] No regressions in {{Y}}

## Notes

Anything task-implementer needs to know that isn't in the spec or architecture.

## Related

- Architecture: [[specs/{{REQ_ID}}/architecture]]
- Lessons checked: {{LESSON_LINKS}}
