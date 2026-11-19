# Vault Layout — where work records live, and how to find them

This is the **single source of truth** for on-disk paths under `.adlc/`. Load it at preflight (with `ETHOS.md`, `core/GATE-PROTOCOL.md`, and `core/VOICE.md`) from `$TOOLKIT_PATH/core/VAULT-LAYOUT.md`.

No skill, agent, template, or script may hard-code a path under `specs/`, `bugs/`, or `sprints/`. They call `resolve`, `mint`, or `enumerate` below and then treat the result as opaque. **This is the whole point of the file:** the layout changed once, it will change again, and when it does this should be the only file that knows.

Knowledge files — `knowledge/`, `architecture/`, `context/`, `audits/` — are **never** partitioned. They're found by search, not by browsing, and their paths are stable. This file doesn't govern them.

## `<REQ_PATH>` is vault-relative. Always.

```
<REQ_PATH>  =  specs/2026-08/sf/REQ-042-payment-retries
               ^^^^^ no .adlc/ prefix, no trailing slash
```

Skills write `.adlc/<REQ_PATH>/requirement.md`. Templates write `.adlc/{{REQ_PATH}}/pr-draft.md`. `resolve` strips the vault prefix before returning.

This is pinned because the two conventions are indistinguishable at a glance and roughly sixty rewritten paths depend on getting it right. If you find yourself writing `<REQ_PATH>` where the text already says `.adlc/`, you have it backwards.

The same value is called `<BUG_PATH>` under `bugs/`. Same rules.

**Two things live at `<REQ_PATH>` (1.9.0):** the **record** `<REQ_PATH>.md` — one committed file, written once at wrap-up, the item's permanent history — and the **working set** `<REQ_PATH>/` — every artifact the pipeline produced, local and gitignored, deleted on `merged` when the user says so. Skills write pipeline artifacts into the folder and the record beside it; nothing links *into* the folder from outside it, because on a teammate's clone the folder does not exist.

## The shapes

A vault holds all of these at once, forever. Which one a *new* folder gets is set by `config.yml` → `layout.partition`; which ones a vault *contains* is whatever its history left behind.

| Depth | Path | When |
|---|---|---|
| 1 | `specs/REQ-042-slug/` + `specs/REQ-042-slug.md` | `partition: none` (the default), or pre-migration |
| 3 | `specs/2026-08/sf/REQ-042-slug/` + `…/REQ-042-slug.md` | `partition: month-author` |
| 2 | `specs/_archive/REQ-042-slug/` | a **kept** working set, archived from a flat vault (the record stays at depth 1) |
| 4 | `specs/_archive/2026-08/sf/REQ-042-slug/` | a kept working set, archived from a partitioned vault (the record stays at depth 3) |

The record and the folder share a basename and sit side by side — Obsidian's folder-note convention. A record never moves; only a kept folder does. Vaults from before 1.9.0 have folders with no record beside them; `/config migrate` offers to write one per merged folder from its `requirement.md` / `verification.md`, or leaves it (both shapes stay readable).

`bugs/` takes the same four shapes. `bugs/_archive/` does not exist yet — `/bugfix` has no `merged` terminal state to hang it on.

`sprints/` is month-only, no author segment:

| Depth | Path |
|---|---|
| 1 | `sprints/SPRINT-2026-08-09-1430.json` |
| 2 | `sprints/2026-08/SPRINT-2026-08-09-1430.json` |

**Never assume a vault is uniform.** A migrated vault commonly has partitioned active work and a flat archive, or vice versa. Every read path below handles all four depths, which is exactly why migration can be optional.

## `<YYYY-MM>` — the creation month, and it never moves

Minted once, from the date the folder was created. Not the merge month. Not the current month. A REQ opened 2026-07-30 and merged 2026-08-05 lives in `2026-07/` forever.

Always `YYYY-MM`. Not configurable — a per-vault format would break the `maxdepth` arithmetic below and make two vaults unreadable by the same eye.

The **only** move a work folder ever makes is into `_archive/`, and that move **mirrors the source's tail**: whatever the folder had (`2026-08/sf/`, or nothing) is preserved under `_archive/`. A flat REQ archives flat. Never mint a month at archive time — that would be minting from the merge date, and it would silently re-bucket the work.

## `<author>` — initials

First hit wins:

1. `config.yml` → `layout.author`
2. `config.yml` → `req.prefix`
3. initials from `git config user.name` — "Shamim Fahad" → `sf`
4. literal `_` — unattributed

Lowercase, `[a-z0-9-]`, 1–8 characters. If step 3 yields anything outside that, fall through to `_` rather than sanitizing creatively. Step 4 exists so a missing git identity never blocks work.

**`<author>` is a display bucket, never a scan boundary.** Because step 4 exists, one person can write into `sf/` on one machine and `_/` on another. Any algorithm that assumes "my work is in my folder" will miss live folders — see `mint`.

---

## `resolve(ID)` → `<REQ_PATH>`

```sh
find .adlc/specs -maxdepth 4 -type d -name 'REQ-042-*'
```

For bugs, `.adlc/bugs` and `BUG-042-*`. For sprints:

```sh
find .adlc/sprints -maxdepth 2 -name 'SPRINT-2026-08-09-1430.json'
```

Strip the leading `.adlc/` from the result before using it as `<REQ_PATH>`.

- **Zero results** → the ID doesn't exist. Say so plainly and stop. Do not offer to create it unless the running skill's protocol says to.
- **One result** → that's the path.
- **More than one** → a real collision. Show both paths and ask. Never guess, never take the first.

**Use `find`, not a list of globs.** Three reasons, each of which has already caused a bug:

- One expression covers all four depths. A glob list needs six patterns per tree and it is very easy to write five.
- Under zsh, an unmatched glob aborts the entire command *before* `ls` runs — and `2>/dev/null` doesn't help, because the shell errors, not `ls`. Since at most one pattern matches in a real vault, the glob form fails on zsh essentially always.
- Depth becomes data (`-maxdepth 4`) instead of four hand-written path shapes that drift apart.

Cost does not grow with the vault: `find` returns one path, where `ls .adlc/specs/` returns every folder. Resolution is *cheaper* under a partitioned layout than it was flat.

There is no index file, no pointer file, and no symlink. The filesystem is the index. Anything else is a second source of truth that will drift.

## `record(ID)` → `<REQ_PATH>.md`

The record path is `resolve(ID)` with `.md` appended. When the folder has been deleted after merge, only the record exists; find it the same way, as a file:

```sh
find .adlc/specs -maxdepth 4 -type f -name 'REQ-042-*.md'
```

Strip `.adlc/` and `.md` and you have `<REQ_PATH>` again — so a skill that needs the item's history after the working set is gone (`/bugfix` appending to `## Later`, `/spec` looking for prior art, `/status` listing merged work) resolves exactly as before, minus the folder. **Zero folders and one record** means *merged and cleaned* — a terminal state, never something to recover or re-create. **One folder and one record** means merged, working set kept. **One folder, no record** means in flight (or pre-1.9.0 history).

A record is written once by the wrap-up step that produced it and never edited afterwards, except its `## Later` section, which is append-only. Everything else about the item lives in `knowledge/` and is linked from the record by ID or anchor.

## `mint(scheme)` → new ID

| Scheme | Scan |
|---|---|
| `sequential` | `find .adlc/specs -maxdepth 4 \( -type d -o -type f \) -name 'REQ-*' \| sed 's#.*/##; s/\.md$//'` → highest number + 1, pad to 3 |
| `prefixed` | same, with `-name 'REQ-<prefix>-*'` → highest + 1 within that prefix |
| `ticket` | unchanged — the tracker owns the number |

`maxdepth 4` means the scan covers every month, every author folder, **and** `_archive/`; `-o -type f` makes it cover **records** too, since a merged-and-cleaned item exists only as `REQ-042-slug.md`. All of these matter:

- Skipping the archive re-mints retired numbers (the bug 1.4.3 had to fix). Skipping records does the same for every item whose working set was deleted — which, once a vault has run for a while, is most of them.
- Skipping other author folders re-mints live IDs whenever `<author>` resolved to `_` on some machine, or when the vault is flat — which is every vault that hasn't migrated.

So **`prefixed` scans all author folders too.** Scoping it to `specs/*/<author>/` looks like a free optimization and is a correctness bug.

Minting is not cheaper under a partitioned layout. It's a directory-name listing either way; the win here is browsing. If you need per-person ID safety, that comes from `req.id_scheme: prefixed`, which works identically in a flat vault.

The same scan mints BUG IDs: `.adlc/bugs` and `-name 'BUG-*'`, folders and records alike. A bug leaves a record too, so a folders-only scan there re-mints the number of every merged bug whose working set was deleted.

For an explicit ID supplied by the user, run the same scan and collision-check against it before accepting.

`~/.adlc/.global-next-req` (the cross-project counter `/sprint` uses) is outside this file's scope and unchanged.

## Work-item IDs — the one pattern code matches

Every scheme above yields an ID of this shape, and every tool that recognises a work item by name matches **this**, never a narrower form:

```
(?:REQ|BUG)-(?:[a-z][a-z0-9]{0,7}-)?\d+
```

| Scheme | ID | Folder / record |
|---|---|---|
| `sequential` | `REQ-042` | `REQ-042-payment-retries`, `REQ-042-payment-retries.md` |
| `prefixed` | `REQ-sf-042` | `REQ-sf-042-gate-turn` |
| `ticket` (bare number) | `REQ-842` | `REQ-842-…` |
| bugs | `BUG-017`, `BUG-sf-017` | `BUG-017-…` |

- The optional prefix is `req.prefix`: lowercase, starts with a letter, at most 8 characters. Starting with a letter is what keeps a slug that begins with a digit (`REQ-042-2fa-login`) from reading as a prefix.
- Matching an ID inside free text (a transcript, a hint, a `## Related` line), require that it is **not preceded by a word character or a hyphen**, so a lesson ID (`L-REQ-035-1`) never yields `REQ-035`.
- `REQ-\d+` alone is the regression this section exists to stop: it makes every `prefixed` vault invisible. Telling a work folder from a bucket by `^(REQ|BUG)-` (no digits) stays fine.
- A `ticket` native key (`PROJ-842`) is not covered by this pattern, nor by the `REQ-*` scans in `mint` and `resolve`. Supporting it is one change across all of them, not a per-tool patch.
- A plan ID (`pl-012`) is not a work-item ID and is kept outside this pattern on purpose — see *The plan folder* below.

The pattern lives as a constant in each tool that runs without the toolkit beside it: `adlc-trail.mjs` (`ID_SRC`), `scripts/vault-gen.mjs` (`WORK_ID_SRC`), the flightdeck mod's `hooks/model.ts` (`ID_SRC`), and `core/manifest.json` → `layout.idPattern`. Change them together. Proof that no narrower copy has crept back:

```sh
grep -rnE "(REQ|BUG)\)?-(\\\\d|\[0-9\])" core scripts --include='*.mjs' --include='*.ts' --include='*.tsx' --include='*.js'
```

Clean means every matcher takes the prefix.

## `mint(lesson)` → new lesson ID

Lessons are namespaced under the work item that produced them. There is no vault-wide lesson counter.

| Piece | Form | Example |
|---|---|---|
| ID | `LESSON-<WORK_ID>-<n>` — `<WORK_ID>` is the originating REQ or BUG ID exactly as `req.id_scheme` minted it; `<n>` is 1-based within that work item | `LESSON-REQ-042-1`, `LESSON-REQ-sf-042-2`, `LESSON-PROJ-1234-1`, `LESSON-BUG-017-1` |
| File | `knowledge/lessons/LESSON-<WORK_ID>-<n>-<slug>.md` | `LESSON-REQ-042-1-retry-idempotency.md` |
| Anchor | `^L-<WORK_ID>-<n>` | `^L-REQ-042-1` |
| Wikilink | `[[knowledge/lessons/LESSON-<WORK_ID>-<n>]]` | `[[knowledge/lessons/LESSON-REQ-042-1]]` |
| Short form (`hot.md`, gate cards) | `L-<WORK_ID>-<n>` | `L-REQ-042-1` |

**Scan** — scoped to the one work item, filenames only:

```sh
ls .adlc/knowledge/lessons/ | sed -n 's/^LESSON-<WORK_ID>-\([0-9][0-9]*\)-.*/\1/p' | sort -n | tail -1
```

→ that + 1, or `1` when nothing matches. `[0-9][0-9]*` is POSIX BRE on purpose — `\+` is a GNU extension and fails on BSD and busybox `sed`. The trailing `-` before `.*` is what keeps `REQ-0420` from matching a scan for `REQ-042`.

**Why this is collision-proof, and what it leans on.** Two developers on parallel branches used to mint the same `LESSON-042` from the same `ls` count; different slugs meant git merged both cleanly and nothing noticed the duplicate ID. Scoping the count to the work item removes the shared counter: uniqueness of lesson IDs is now exactly the uniqueness of REQ IDs, which `req.id_scheme: ticket` or `prefixed` already guarantees across a team (and `sequential` guarantees for one developer — the documented solo trade-off; lessons add nothing new to it). The one assumption this makes load-bearing: **one wrap-up owner per work item.** Two people wrapping up the same REQ on two branches would both mint `-1`. That was already the pipeline's invariant; this is the place it now matters.

**Legacy IDs.** Vaults created before this grammar hold `LESSON-NNN-<slug>.md` files with `^LNN` anchors. They are frozen as-is — never renumbered, never renamed, and the sequence is never continued. The first lesson promoted after the toolkit update uses the new grammar. The two forms cannot collide (`LESSON-042` vs `LESSON-REQ-042-1`), and both resolve the same way: by filename stem. Same rule as `layout.partition` — both shapes stay readable forever, so there is no migration and no sweep.

**The read side.** `knowledge/lessons.md` (1.9.0; it replaced `lesson-ledger.md`) is generated — one line per lesson carrying the whole minimal lesson: `- **L-REQ-042-1** · <severity> · \`<tags>\` · <the sentence> — \`<path:line>\` · REQ-042 [· enforced: <what>] [· ↗] ^L-REQ-042-1`. It is rebuilt whole from the lesson files' header tables by `node $TOOLKIT_PATH/scripts/adlc.mjs lessons --vault .adlc`, called by every skill that writes a lesson (`/wrapup`, `/task`, `/bugfix`, `/recover`) and by `/config migrate|lessons`. Never hand-edited (the Claude adapter refuses the write); carries `merge=union` — a union merge may leave a duplicated line, and the next rebuild removes it. **Every reader reads this file and never the folder**: the implementer and the architect grep it by path and tag, the reflector reads it whole, the Claude knowledge hook injects matching lines at edit time. The lesson files are the write side only, and a file grows sections beyond its table only when the lesson recurs (the generator marks such a line `↗`). `index.md` and `decisions.md` are generated the same way (`adlc.mjs index`), from the records, the ADR headers and the knowledge pages' first lines. Lesson grammar is **not** in `core/manifest.json → layout` — that block describes the work-record trees, and nothing in `scripts/adlc.mjs` parses lesson IDs. Keep it that way.

## `enumerate(active | archived)` → `<REQ_PATH>` list

`find` to depth 4, **matching on the entry's own basename** — `REQ-*` or `BUG-*`. Folders are work in flight (or kept history); records are finished work. Skip anything under `_archive/` unless `archived` was asked for.

```sh
find .adlc/specs -maxdepth 4 -type d -name 'REQ-*' -not -path '*/_archive/*'      # active: in-flight folders (and kept, un-archived ones)
find .adlc/specs -maxdepth 4 -type f -name 'REQ-*.md'                              # done: records — the dashboard's merged column on any clone
```

A folder whose record also exists is merged with its working set kept — list it under done, not active. `/status` and `/recover` take the active list from the first command and the done list from the second; `index` (the generator) does the same.

Planned drafts (`.adlc/plan/drafts/`) are never enumerated: they are not work in flight and not finished work. Both commands scan `specs/` only, so they cannot return one.

**The sentinel is the name, not a file inside the folder.** Both obvious alternatives are broken:

- `pipeline-state.json` is gitignored, so on a teammate's fresh clone every folder looks empty and the enumerate returns nothing.
- `requirement.md` doesn't exist in bug folders — `/bugfix` writes `bug.md`. A `requirement.md` sentinel finds zero bugs, permanently.

Take the display ID from the REQ folder's basename. Under a partitioned vault, the child of `specs/` is a month (`2026-08`), not an ID.

## The plan folder — `.adlc/plan/`

Work that is planned but not started. `/roadmap` writes it; it is never partitioned and **all of it is committed** — except the plan-gate marker, which is one developer's open question and is in the gitignore set below.

```
.adlc/plan/
  roadmap.md                       # written at planning time, by /roadmap only
  brief.md                         # only when no source stated the problem and scope
  playbook.md
  risk-register.md                 # merge=union
  gap-register.md                  # merge=union
  challenge-log.md                 # merge=union
  drafts/pl-012-payment-retries.md # one planned item, spec-template format
  issues/pl-012.md                 # issue text for a human to post — only with a tracker
  .awaiting-approval               # an open plan gate — gitignored
```

A draft is the spec template filled in, plus the planning rows (`Plan`, `Source`, `Issue`, `Depends on`, `External gates`, `Touches`, `Run with`). Its `Status` is `planned` and its `REQ` row is `—` until it is promoted; then `promoted` and the real ID. A draft `resync` retired is `dropped`. The planning rows are added by `/roadmap` — the spec template does not carry them, so an ordinary REQ never has them.

**Drafts live outside `specs/` on purpose.** Three facts about `specs/` would each break them there:

- Every `specs/**/REQ-*/` folder is gitignored — a draft inside one would never reach a teammate.
- A `REQ-*` folder with no record beside it means *in flight* — every planned item would read as started work.
- A `REQ-*.md` file beside a folder is the record and means *merged* — a draft named like one would read as finished.

**Plan IDs** are `pl-NNN`: lowercase, three digits, minted by `/roadmap` only (max+1 over `plan/drafts/`), kept for the life of the item. Lowercase so a plan ID can never read as a tracker key (`PROJ-8`) and never matches the work-item pattern above — no `REQ-*` scan, matcher or generator picks a draft up. Promotion gives the item a second, separate ID; the plan ID stays in the `Plan` row.

**Resolving a draft.** Three input forms mean "a planned draft": a path under `.adlc/plan/drafts/`, a draft's file name, or a bare plan ID:

```sh
find .adlc/plan/drafts -maxdepth 1 -type f -name 'pl-012-*.md'
```

A file name resolves the same way with `-name '<file name>'`. Zero hits: say so and stop. Two hits: show both and ask.

## `promote(draft)` → `<REQ_PATH>`

The one rule for turning a planned draft into a REQ. `/spec`, `/task`, `/proceed` and `/autopilot` point here; none restates it.

1. **Read the draft.** If its `Status` is `dropped`, show the reason it carries and stop. If the vault is in a git repository and the draft is not tracked (`git ls-files --error-unmatch <draft>` fails), stop: the plan has to be committed before an item is started — an untracked `plan/` fails the clean-tree check in branch mode and is missing from a worktree. If its `REQ` row already holds an ID, it was promoted before: resolve that REQ per `resolve(ID)` and continue with it. Never create a second REQ for one draft. If the folder is not on this machine, say which case it is and stop — a record per `record(ID)` means merged; neither folder nor record means someone else started it on their branch.
2. **Mint** the REQ ID per `mint(scheme)`. Under `ticket`, the draft's `Issue` row is the issue reference; if it is `—`, fall back exactly as `/spec` does and say so in one line.
3. **Slug** = the draft's file name minus `pl-NNN-` and `.md`.
4. **Create the REQ folder** per `layout.partition`, as `/spec` does. Copy the draft to `.adlc/<REQ_PATH>/requirement.md`, setting `REQ` to the minted ID and `Status` to `drafting`. Keep every other row, `Plan` included.
5. `pipeline-state.json` gets one extra field: `"plan": "pl-NNN"`.
6. **No re-draft.** The calling skill runs its own consultation and validation steps on the copied text and opens its first gate on it.
7. **Write-back, once that first gate is approved *and* the REQ has a work path** (`/spec`: the spec gate; `/task`: its plan gate): copy the approved `requirement.md` over the draft file **under `<workPath>`**, with `Status: promoted` and the `REQ` row stamped. Whichever step makes the second condition true does it: the gate's `approve` when the work path already exists (`/autopilot`, a `/sprint` runner), otherwise the step that establishes the work path (`/architect` preflight 4, `/task` Phase 2 step 1). Never before the work path exists: the draft is a tracked file, so editing it in the base checkout would trip the clean-tree check in branch mode and would never reach the REQ's branch in worktree mode. This is the one edit a promotion makes under `.adlc/plan/`; it rides on the REQ's branch like any vault edit and follows `git.mode`.
8. **On abort at that gate**, the draft is left untouched (`Status: planned`, `REQ: —`). It can be promoted again later.
9. **At wrap-up** the record's `Source` row carries the plan ID after the issue link (`… · plan pl-012`).

Nothing else under `.adlc/plan/` is edited by a pipeline skill; `roadmap.md` is written at planning time and by `/roadmap` only. Drafts are not union-merged: two people promoting the same draft on two branches usually conflict on that file at merge. Not always — under `ticket` both stamp the same ID, and identical write-backs merge silently — so the merge is a backstop, not the lock: on a team the claim is the issue's assignment (`/roadmap` → *Next*). Plan status is derived from the drafts, the records and the tracker — there is no second mapping table.

---

## The gitignore pattern set

Per-developer scratch state is ignored; durable knowledge and shared logs are committed. The globs use `**`, which git defines as matching **zero** or more directories — so one pattern set covers all four depths with no conditional, in flat and partitioned vaults alike.

```
.adlc/now.md
.adlc/local.yml
.claude/settings.local.json
.adlc/specs/**/REQ-*/
.adlc/bugs/**/BUG-*/
.adlc/specs/**/pipeline-state.json
.adlc/specs/**/.awaiting-approval
.adlc/specs/**/commits-draft.md
.adlc/specs/**/pr-draft.md
.adlc/specs/**/merge-checklist.md
.adlc/specs/**/source-writeback.md
.adlc/specs/**/last-seen.json
.adlc/bugs/**/pipeline-state.json
.adlc/bugs/**/.awaiting-approval
.adlc/bugs/**/commits-draft.md
.adlc/bugs/**/pr-draft.md
.adlc/bugs/**/bug-fix-pr-draft.md
.adlc/bugs/**/merge-checklist.md
.adlc/bugs/**/source-writeback.md
.adlc/bugs/**/last-seen.json
.adlc/sprints/**/*.json
.adlc/plan/.awaiting-approval
.adlc/ui-auth.env
```

The first two patterns are 1.9.0: the **whole working set** is local, and the record beside it (`REQ-042-slug.md`, a file — the trailing `/` keeps the pattern off it; verified on a scratch repo for both depths) is what gets committed. The per-file lines after them are now redundant under the folder pattern but harmless; `/config migrate` appends the missing lines to an existing `.gitignore` and removes none, so a pre-1.9.0 vault keeps working with its old set until the user accepts the new block.

One pattern touches `.adlc/plan/`: the plan-gate marker, which is per-developer like every other marker. Nothing else there is matched, so the roadmap, the registers and the drafts are committed — on purpose (*The plan folder*, above). Don't add another.

Single-`*` versions of these silently stop matching the moment a vault partitions, and the symptom is per-developer heartbeat files appearing in everyone's diffs with no error anywhere. If you are editing this list, keep the `**`.

`.adlc/now.md`, `.adlc/local.yml` (where this developer's toolkit clone lives — see *The per-developer file* below), `.adlc/ui-auth.env` and `.claude/settings.local.json` (the developer's per-repo Claude Code settings, where the extras' hooks are wired — never shared, never global) are not globs and are easy to lose when the block is swapped wholesale. Keep them.

## The per-developer file — `.adlc/local.yml`

Every teammate keeps the toolkit somewhere different, so *where* it lives can't go in the committed `config.yml`. It goes here — one small file per developer, gitignored by the set above:

```yaml
# .adlc/local.yml — this developer only. Gitignored; never commit.
toolkit:
  path: /Users/you/code/adlc-toolkit   # absolute path to your toolkit clone
```

- **Written by** `/init` (from the toolkit root it ran with) and `/config migrate` (when missing, or when its path no longer holds `core/`). Show the file before writing it.
- **Read by** every generated stub and skill when the baked-in `Toolkit root:` doesn't exist on this machine — the case for project-local (vendored) stubs committed to a repo, and for a teammate whose clone sits elsewhere. Order: a toolkit root named by the dispatching prompt (`/sprint` passes runners an absolute one) → the stub's `Toolkit root:` → `local.yml`'s `toolkit.path` → `ADLC_TOOLKIT_PATH` → ask, then offer to record the answer here.
- **Worktrees don't have it.** The file is gitignored, so a fresh `git worktree` (`/proceed` worktree mode, `/sprint` runners) has no copy. Read the main checkout's: `$(git rev-parse --path-format=absolute --git-common-dir)/../.adlc/local.yml`. Never copy the file into a worktree.
- **Where to get the toolkit** is the committed half: `config.yml` → `toolkit.repo` (the URL a new teammate clones from). Path is per-person; the repo URL is shared.

## Links in artifacts — split by lifetime

| Artifact | Link form | Why |
|---|---|---|
| `knowledge/lessons/*`, `architecture/adr-*` | `[[REQ-042]]` — the ID, resolved at read time | These outlive the REQ. A path baked into them rots the moment the REQ is archived or the vault migrates, and nothing sweeps them. |
| Anything citing a lesson | `[[knowledge/lessons/LESSON-REQ-042-1]]` or the anchor `^L-REQ-042-1` (legacy: `LESSON-007`, `^L07`) | The filename stem is the ID; the REQ inside it is what makes it unique. |
| `<REQ_PATH>/tasks/*`, assumption pages | `{{REQ_PATH}}` | Live and die inside the REQ folder. |
| `merge-checklist.md`, agent dispatch prompts | `.adlc/{{REQ_PATH}}/…` | Consumed once, immediately. |

**Durable artifacts never hold a path.** That's what makes archiving and migration cheap: there is nothing to sweep, so there is no sweep to eventually get wrong.

## When you add a new artifact

Ask one question: *does this outlive the REQ folder?*

- **No** → it goes inside `<REQ_PATH>/` (the working set, local by default since 1.9.0 — nothing to add to the gitignore).
- **Yes, and it is about this one item** → it is a section of the record `<REQ_PATH>.md`, ≤6KB in total, IDs and links only.
- **Yes, and it is about the codebase** → it goes in `knowledge/`, `architecture/`, or `context/`, it is never partitioned, and it refers back by **ID**.
- **It exists before the REQ does** (planning) → it goes under `plan/`, written by `/roadmap`. It is not a work item, and a pipeline skill's only edit there is `promote(draft)`'s write-back.

## When you change this file

Update `core/manifest.json` → `layout` in the same pass; `scripts/adlc.mjs` reads it and the two must agree.

Then run the proof:

```sh
grep -rn "\.adlc/specs/REQ-\|\.adlc/bugs/BUG-\|\.adlc/specs/_archive/REQ-" \
  core templates README.md docs --exclude-dir=proposals | grep -v VAULT-LAYOUT.md
```

Clean means the centralization still holds.

It matches on the **consumption** form — the `.adlc/` prefix — deliberately. A path being *used* always carries that prefix, so this catches exactly the regression that matters. A bare `specs/REQ-042-slug` with no prefix is a *description* of a shape, which is legitimate in three places and nowhere else: the mint steps in `/spec` and `/task` (they define the shape, so they must state it), this file, and user-facing comments in `config-template.yml`. `dist/` and `adapters/` are generated — rebuild rather than editing them.

A non-empty result means some file has learned a path again, and the next layout change will cost thirty edits instead of one.
