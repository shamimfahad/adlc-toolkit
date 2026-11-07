# Glossary

Project-specific vocabulary. Populated incrementally as terms appear in specs, reviews, and code. Definitions here should match how *this codebase* uses the term — not industry usage, not how a different system uses it.

| Term | Meaning |
|---|---|
| Debrief | The story of a REQ in eight sections (IN ONE BREATH … QUESTIONS YOU MAY GET), every claim with a pointer, written by `/debrief` into `debrief.md` in the working set. |
| Reader condition | `cold`, `warm` or `handover` — how much of the work the reader already holds, judged from the trail by `readerOf` (`trail reader`); sets the debrief's depth. |
| Ask round | A trail round that records an answer to an ask (`predict`, `summary`, `debrief`), not a gate decision; never closes an open gate round. |

## Conventions

- Mark provisional definitions with `STATUS: needs verification`.
- If a term has two valid meanings in different contexts, give it two rows, distinguished by parenthetical scope: `Domain (auth)` vs `Domain (data model)`.
- Cross-link to relevant concept pages with wikilinks: `See [[concepts/auth-domains]]`.
