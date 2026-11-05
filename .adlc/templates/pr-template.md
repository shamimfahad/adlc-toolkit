<!-- ADLC template — pr-draft.md. Read at /wrapup step 2, never at preflight.
     Placeholders in <angle brackets> are substituted when the draft is written.
     Safe to customize per project: title format, section order, extra sections. -->

# PR Draft — REQ-NNN-<slug>

| Field | Value |
|---|---|
| Branch | <branch> |
| Base | <base-branch> |
| REQ | REQ-NNN-<slug> |
| Commits | <count> |
| Files changed | <count> |
| Insertions / deletions | +<N> / -<N> |

## Title

`<type>(<scope>): <description> [REQ-NNN-<slug>]`

Match the project's commit/PR title format from `context/conventions.md`. If the project uses Conventional Commits, use that. If not, mirror the project's existing PR style (check recent merged PRs if available).

## Body

### Summary

One-paragraph what-and-why. Pull from the spec's Goal section, rewritten in past tense.

### Acceptance criteria

Reproduce the checklist from the spec, with each item marked ✓ as verified during /review.

- [✓] Criterion 1 — short note on how it was verified
- [✓] Criterion 2 — short note

### Changes

By module / file group. Not a file-by-file diff — a structural summary.

- **`src/auth/`** — added new password validation; updated session creation to enforce
- **`tests/auth/`** — coverage for valid/invalid password paths, session edge cases
- **`docs/auth.md`** — updated with new validation rules

### Risk / impact

What this could affect that's worth flagging for the reviewer.

### Lessons captured

Links to any new lesson, gotcha, ADR, or concept page created during this REQ.

- [[knowledge/lessons/LESSON-REQ-NNN-1]] — short title
- [[knowledge/gotchas#^gNN|GNN]] — short title
- [[architecture/adr-NNN-...]] — newly accepted

### Vault references consulted

Lessons / gotchas / ADRs that informed this REQ.

### Test plan

How the reviewer can verify locally. Specific commands.

### Follow-ups filed

Out-of-scope work spotted but not bundled. Each linked to a tracking task or REQ-stub.
