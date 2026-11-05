# Conventions

Project-specific rules. The reviewer agents (`quality-reviewer`, `architecture-reviewer`) check code against this file. If a convention isn't documented here, it isn't enforced — write it down or accept that the code will drift.

## Naming

- **Files:** _(e.g., kebab-case for .ts, PascalCase for .tsx components)_
- **Variables:** _(e.g., camelCase, no single-letter except for loop indices)_
- **Constants:** _(e.g., SCREAMING_SNAKE_CASE)_
- **Types/interfaces:** _(e.g., PascalCase, no `I` prefix)_

## Logging

- **Library:** _(e.g., pino, winston, ILogger)_
- **Levels:** _(when to use debug, info, warn, error)_
- **Structured fields:** _(required fields on every log line)_
- **No `console.log` in production code.**

## Error handling

- _(How errors propagate — exceptions, Result types, error codes?)_
- _(How are unexpected errors surfaced?)_
- _(What gets logged vs. returned vs. swallowed?)_

## Config

- **Source:** _(env vars, config file, secrets manager)_
- **Access pattern:** _(centralized config module, direct env reads?)_
- **No magic strings or numbers** — named constants or config values.

## API conventions

- **Response format:** _(e.g., `{ data, error }`, `{ success, payload }`)_
- **Pagination:** _(cursor vs offset, page size limits)_
- **Versioning:** _(URL path vs header vs none)_
- **Auth:** _(bearer token, session cookie, API key)_

## Testing

- **Frameworks:** _(jest, vitest, xunit, pytest)_
- **Coverage expectations:** _(per-module minimums, what's exempt)_
- **Mock policy:** _(when to mock, when to integration-test for real)_
- **Test file location:** _(co-located, parallel `tests/` tree)_

## Comments

- _(When are comments expected? When are they noise?)_
- _(TODO/FIXME format — must include a tracking link?)_

## Git

- **Commit message format:** _(e.g., conventional commits: `feat(scope): description`)_
- **Branch naming:** _(e.g., `feat/REQ-xxx-slug`, `bugfix/BUG-xx`)_
- **PR title format:** _(typically matches the commit format)_

## Anything else specific to this codebase

- _(stack-specific quirks, framework conventions, team preferences)_
