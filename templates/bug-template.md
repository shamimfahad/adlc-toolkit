# BUG-{{NN}} — {{TITLE}}

| Field | Value |
|---|---|
| Status | reported \| reproducing \| diagnosed \| fixing \| verifying \| fixed \| wontfix |
| Severity | trivial \| minor \| major \| critical |
| Repo | {{REPO_ID}} |
| Touched repos | {{REPO_LIST}} |
| Reported | {{DATE}} |
| Reporter | {{REPORTER}} |
| Related REQ | {{REQ_ID}} |

## Symptom

What the user sees. One or two sentences. No causes yet.

## Reproduction

Step-by-step. Should be runnable by someone who has never seen this bug.

1. Step 1
2. Step 2
3. Step 3

**Expected:** What should happen.

**Actual:** What does happen.

## Environment

| Field | Value |
|---|---|
| Branch / commit | {{REF}} |
| OS / browser / runtime | {{ENV}} |
| Reproduction rate | always \| sometimes \| once |

## Investigation log

Append-only. Each entry dated.

### {{DATE}} — initial triage

What was checked, what was ruled out.

### {{DATE}} — root cause

The actual cause, with file/line references. Why it produces the symptom.

## Fix approach

Two or three bullets. Specific enough that task-implementer can execute.

## Acceptance

- [ ] Reproduction steps no longer produce the bug
- [ ] Test added covering the failure case
- [ ] Related regressions checked (list specific other paths)

## Lessons / gotchas captured

What goes into the vault from this bug. Usually one of:
- A new lesson if the bug reveals a process gap
- A new gotcha if the bug reveals non-obvious existing behavior

## Related

- Gotchas: {{GOTCHA_LINKS}}
- Lessons: {{LESSON_LINKS}}
- Concepts: {{CONCEPT_LINKS}}
- Components: {{COMPONENT_LINKS}}
