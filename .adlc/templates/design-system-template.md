# Design system — <project>

| Field | Value |
|---|---|
| Status | as-found (what the code does) \| agreed (what the team decided) |
| Last audited | YYYY-MM-DD (`/ux-doctor`) |
| Token source | <path to theme/tokens, or "none — values inline"> |
| Component library | <path / package, or "in-repo components"> |

> STATUS: needs verification — seeded from the observed de facto system by `/ux-doctor`. Sections describe what the code *does*, not yet what the team has *decided*. Confirm or correct each section, then set Status to `agreed`.

This file is the UI contract the toolkit audits against: `/ux-doctor` measures drift from it, the `ui-reviewer` design-matches against it in `/review`, and the `architecture-adversary`'s UX lens checks plans against it in `/architect`. Keep it honest — a stale rule here produces false findings everywhere.

## Tokens

The tiers in use and where they live. Semantic tokens (`color-action-primary`) over raw palette (`blue-500`) in components; raw values only inside the token source itself.

| Tier | Examples | Source |
|---|---|---|
| Palette | ... | |
| Semantic | ... | |

## Scales

The ratified sets. A value outside a scale is a finding, not a variation.

- **Type:** <sizes/weights/line-heights in use>
- **Spacing:** <the scale>
- **Radii / shadows / z-index:** <the sets>
- **Breakpoints:** <the set>

## Color

Palette, semantic roles, and the contrast floor (WCAG 2.2 AA — 4.5:1 body text, 3:1 large text/UI). Note dark-mode strategy if any.

## Components

Inventory of system components — before building a new one, this list is the "does it exist" check.

| Component | Path | Variants / states | Notes |
|---|---|---|---|
| ... | | | |

## Patterns

House rules for recurring UI situations: empty states, loading, error display, form validation, destructive-action confirmation, navigation structure.

## Exceptions

Places we deliberately break our own rules, each with a reason and scope. If it's written down here it's a decision; if it isn't, it's drift.

| Where | Diverges how | Why | Since |
|---|---|---|---|

---

## Optional — fill on recurrence

<!-- Grow these only when the need recurs; an empty section here is not a gap. -->

### Voice & UX copy
<!-- Tone, terminology (link glossary.md), error-message style. -->

### Accessibility beyond the floor
<!-- Focus-order conventions, reduced-motion, screen-reader patterns per component. -->

### Theming / brands
<!-- Multi-theme or white-label rules; which tiers may vary per theme. -->

### How the system grows
<!-- How a one-off becomes an official component; who signs off; how old ones get retired. -->
