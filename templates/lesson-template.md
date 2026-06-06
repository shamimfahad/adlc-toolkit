# {{TITLE}} ^L{{NN}}

> **Minimum required fields**: metadata table, "The lesson", and "Saw it in".
> Optional sections below are filled the first time the lesson recurs in a future REQ, or when reflector surfaces it as relevant — born minimal, grown on demand.

| Field | Value |
|---|---|
| ID | LESSON-{{NN}} |
| Captured | {{DATE}} |
| REQ | {{REQ_ID}} |
| Component | {{COMPONENT}} |
| Tags | {{TAGS}} |
| Severity | nice-to-know \| guideline \| trap \| critical |

## The lesson

The single sentence to remember. Phrased as an imperative or a checkable rule.

> Always declare Firestore composite indexes before deploying queries that need them.

## Saw it in

- `src/path/to/file.ts:42` — short note on the manifestation
- (additional file references if applicable)

---

## Optional — fill on recurrence

### What happened

One paragraph. The situation that produced the lesson. What was expected, what actually happened.

### Why it matters

What breaks if this lesson isn't applied. Concrete consequences — bugs, perf regressions, security issues, wasted time.

### How to apply

Concrete steps. When should the architect agent surface this lesson? What should task-implementer do differently?

- During `/architect`: check for new compound `where` clauses in queries.
- During `/implement`: if adding a query with multiple `where` clauses on the same collection, add the index to `firestore.indexes.json` in the same task.

### When this doesn't apply

Edge cases or contexts where the rule is wrong. Important — over-applied lessons cause as much damage as missing ones.

### Related

- Originating REQ: [[specs/{{REQ_ID}}/requirement]]
- Concepts: {{CONCEPT_LINKS}}
- Components: {{COMPONENT_LINKS}}
- See also: {{LESSON_LINKS}}
