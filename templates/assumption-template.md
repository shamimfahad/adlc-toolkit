# ASSUMPTION-{{NN}} — {{TITLE}}

| Field | Value |
|---|---|
| ID | ASSUMPTION-{{NN}} |
| Status | provisional \| validated \| invalidated |
| Made | {{DATE}} |
| Made during | {{REQ_ID}} \| {{PHASE}} |
| Owner | who validates this |
| Validates by | {{DATE_OR_EVENT}} |

## Assumption

One sentence. Phrased as a definite statement, not a question.

> The legacy `Login.aspx` handler is the only consumer of `VANTAGE_DOMAIN` cookie.

## Why we're betting on this

What we'd have to do to verify it definitively, and why we're choosing to proceed without doing that yet. The trade-off should be visible.

## What breaks if it's wrong

Concrete consequences. The blast radius if this assumption turns out to be false.

## Validation plan

How and when we'll verify.

- [ ] Step 1
- [ ] Step 2

## Resolution

Filled when validated or invalidated. Date, what was found, link to the REQ or commit that confirmed it.

### {{DATE}} — {{STATUS}}

{{details}}

## Related

- REQ: [[specs/{{REQ_ID}}/requirement]]
- Concepts: {{CONCEPT_LINKS}}
- If invalidated, follow-up REQ: {{LINK}}
