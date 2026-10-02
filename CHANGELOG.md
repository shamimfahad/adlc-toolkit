# Changelog

All notable changes to the ADLC toolkit. The toolkit version lives in `core/manifest.json` → `version`.

Labels used below: **[breaking]** needs action on update, **[protocol]** changes how a skill behaves, **[vault-format]** changes on-disk vault layout, **[tooling]** install/build only.

## [1.9.1] — unreleased

### The harness — conventions that load by path, knowledge that arrives unasked, checks before reviewers **[protocol]**

The second tranche of the 1.9 plan. 1.9.0 changed the shape of the vault; this cut changes how its contents reach an agent. Three facts drove it (audit of 2026-09-30): `conventions.md` (64KB) was read 91 times in a month by implementers whatever they touched; four read-only reviewers passed code a lint run would have caught, each re-reading a 300–500KB packet per round; and 511 failed tool calls in a month, four of them the same command retried unchanged. Verified against the Claude Code docs before building: a non-fork sub-agent receives "every level of the CLAUDE.md hierarchy… including project rules", path-scoped rules trigger on **Read** of a matching file (so a brand-new file never triggers one), hooks in `settings.json` fire inside sub-agents with `agent_type`, and `SubagentStart` accepts `additionalContext`.

- **Path-scoped conventions.** New `context/conventions-paths.md` — one `##` section per path family, each with a `<!-- paths: glob, glob -->` line — is the hand-written source; `node scripts/adlc.mjs rules --vault .adlc` generates one `.claude/rules/adlc-<slug>.md` per section (write-blocked, removed when its section goes, `--check` for drift, 2KB soft budget per rule). `conventions.md` stays the always-on cross-cutting rulebook under its 8KB budget. New `/config rules` (mode H) offers to move per-area sections out of `conventions.md` verbatim with a glob list per section, then generates; `/config budgets` offers that bucket first for `conventions.md`; `/init` step 12b generates after seeding; `/wrapup` step 1 regenerates when the diff touched the source. Reviewers read a packet, not files, so a rule never auto-loads for them: `/review` step 1.5 computes **Rules in scope** once (sections whose globs match the diff) and quality-/architecture-reviewer read exactly those. Other assistants: the skills grep `conventions-paths.md` by directory (fidelity matrix rows added).
- **`adlc-knowledge.mjs` — the fourth Claude extra.** One script, five events, same silent-on-error contract as the budget hook, tested case by case against a fake vault. `PreToolUse` on a source file injects the `lessons.md` / `gotchas.md` lines whose path shares the file's directory (ancestor within two levels) or whose tag is a path segment — once per session per directory, ≤8 lines / 3KB, worst severity first, `enforced:` and superseded skipped — and, on the first **Write of a new file** in a family, the matching generated rule's body. `SubagentStart` (`task-implementer`, `pipeline-runner`) opens every dispatch with the `critical` lessons — the always-read flag the tiered ADR asked for. `SessionStart` with `source: compact` injects a recomputed working-state snapshot (newest non-terminal `pipeline-state.json`, `.awaiting-approval`, `git status`, last commits, the `verify:` run lines) instead of trusting the summary — 18 manual compactions in the measured month resumed at 300–750k context. A Write/Edit to a `<!-- GENERATED` file is denied with the regenerate command. Two advisories close the failed-call analysis: a search piped through `head`/`tail`/`-m` is not evidence of absence (once per session), and the same shell command failing twice unchanged gets the four Windows/bash rules instead of a third attempt. State in `os.tmpdir()/adlc-knowledge/<session>`; emitted as `additionalContext` JSON **and** stderr. Wiring in `adapters/claude/extras/README.md`.
- **`/review` step 0 — the deterministic gate.** Before any reviewer is dispatched, run `config.yml → verify:` (`format`, `lint`, `typecheck`, `test`, `sensors[]`) from the work path; raw output to `<REQ_PATH>/verify-output.md` (working set). A `halt_on` failure (default `typecheck`, `test`) blocks the phase and hands back to `/implement` — no reviewer round on code that does not build, and no retry (first failure escalates). Everything else enters the packet as **Deterministic findings**, ≤20 verbatim lines per command; a sensor's `enforces: [L-…]` IDs ride in its heading so the reflector skips those lessons. Reviewer prompts gain one paragraph: deterministic findings are facts — cite, never re-derive, never restate as your own. The gate card's CHECKS line leads with `verify: typecheck ✓ · test ✓ (412) · lint ✗ 3 · sensors 2/2 ✓`. Same step in `/task`, `/bugfix` Phase 4 and `pipeline-runner`.
- **The explorer flags legacy before recommending it.** `codebase-explorer` §1 reports a neighbour that contradicts `architecture.md` / `conventions.md` / a matching `conventions-paths.md` section as `legacy — <what the doc says instead>`, never as the pattern to copy; pairs with the implementer's docs-win paragraph from 1.9.0.
- **Deliberately not changed:** no new agent, no new gate, no new skill; the generated rules are an adapter concern — the source file is plain markdown any assistant can grep; no `.claude/rules` are hand-written by the toolkit (a repo's own rules are never touched: the generator writes and removes only `adlc-*.md`). The `InstructionsLoaded` probe that confirms rules reach `task-implementer` on your Claude Code version is a five-minute check to run once (`v1.9-drafts/rules-generation.md` §6); the hook's write-time injection covers new files either way.
- **The extras are wired per repo, per developer — never globally.** New `scripts/claude-settings.mjs` (`node scripts/adlc.mjs settings --repo <path>`) merges the four extras into `<repo>/.claude/settings.local.json`: the developer's own project-scoped file, gitignored (added to the VAULT-LAYOUT pattern set), active only in that repo — so the other Claude Code sessions on the machine and whatever hooks or statusline the developer keeps in `~/.claude/settings.json` are untouched. `/init` step 12c and `/config migrate` step 9b offer it — and only they do: `sync` installs the toolkit and never touches a settings file in either scope, because installing is machine-level and turning hooks on is a per-repo decision that belongs with the vault. `--global` exists as an explicit opt-in for someone who wants the extras everywhere. The merge is keyed on the script names: adds what is missing, repoints entries when the toolkit moved, removes an entry for a script no longer shipped, reuses an existing entry with the same matcher rather than adding a sibling, never touches a hook or statusline that is yours; one-time `.adlc-backup` first; invalid JSON is left alone with the snippet printed. Tested against a hand-authored file with a custom hook, an old-path budget hook and a user statusline, from a subdirectory, with no repo, and with `--global`.
- **On update:** `node scripts/adlc.mjs settings --repo <repo>` in each ADLC repo (or say yes when `/config migrate` offers it); `/config migrate` copies `conventions-paths.md` into the vault and regenerates rules; run `/config rules` once to move per-area sections out of `conventions.md`.

## [1.9.0] — unreleased

### The shape — one record per finished item, one line per lesson, generated indexes **[protocol]** **[vault-format]**

Third audit of `vantagewebapps/.adlc` (94 REQs, 12 bugs; `D:\v-proj\adlc\plan-v1.9-harness.md`, audit artifact of 2026-09-30) found the vault keeping everything at full fidelity forever: 312 lesson files read whole by the reflector on every REQ (908KB), `index.md` at 216KB hand-copying three other files, `specs/` at 95MB of which 72MB was screenshots and review packets of merged work, and nothing distinguishing *the record of what happened* from *the working set that produced it*. Session start read ≈150KB before any REQ file opened. The second input was a colleague's agent harness (`colleagues_system`): what carried over is four mechanisms, not its React-specific machinery — always-on stays tiny and everything else loads by relevance; deterministic checks run before inferential review; a guide seen twice becomes a sensor; generated files are write-blocked.

- **One committed file per finished item.** `/wrapup` step 3b (and `/task`'s wrapup-lite, `/bugfix` Phase 5, `/recover`) writes the **record** `<REQ_PATH>.md` beside the folder — `specs/REQ-042-slug.md` next to `specs/REQ-042-slug/`, Obsidian's folder-note shape; the same under `month-author` buckets. ≤6KB, enforced by `adlc-budget.mjs`: goal, criteria, what changed (paths), decisions, verdict, knowledge **IDs**, follow-ups, and an append-only `## Later` that `/bugfix` adds a line to when a bug traces back. Written once; never edited otherwise. `templates/record-template.md`; grammar `core/VAULT-LAYOUT.md` → `record(ID)`.
- **The folder is the working set, and it is local.** Two new gitignore patterns (`.adlc/specs/**/REQ-*/`, `.adlc/bugs/**/BUG-*/` — verified on a scratch repo to leave the sibling `REQ-*.md` tracked at both depths) make everything the pipeline produces per-developer scratch; the record is what the team and the PR receive. At `merged`, `/wrapup` asks one question with the numbers in it — *delete the working set (N files, M MB) or keep it?* — default keep; `_archive/` is now only for kept folders; `/analyze` lists kept working sets older than 30 days with their size. `/sprint` and `pipeline-runner` are unaffected (the vault stays in the main checkout). `mint`, `enumerate`, `/status`, `/spec`'s prior-art search and `/recover` read records too, so a merged-and-cleaned item is still an item on any clone.
- **`knowledge/lessons.md` replaces `lesson-ledger.md`, and carries the whole minimal lesson.** One list item per lesson — `- **L-REQ-042-1** · critical · \`payments\` · <the sentence> — \`src/…:31\` · REQ-042 [· enforced: …] [· ↗] ^L-REQ-042-1` — a list, not a table, because Obsidian block anchors attach to list items. Generated by a real generator, `node scripts/adlc.mjs lessons --vault .adlc` (`scripts/vault-gen.mjs`: header lines only, no dependencies, reads the new stub and the legacy 40-line template alike, `--check` exits 1 on drift). **Every reader now reads this file and never the folder**: `task-implementer`, `codebase-explorer`, `correctness-`/`quality-reviewer`, `/spec`, `/task`, `/bugfix`, `pipeline-runner` grep it by path and tag; the reflector reads it whole (≈40KB on the measured vault instead of 908KB) and opens a lesson file only for a `↗` line it needs or cites; `/architect` step 2 gains the deterministic grep (blast-radius directories + component names + every `critical`) and lists hits under **Related**, writing `none matched (N searched)` when nothing does. This is the tiered-vault-loading ADR, accepted and implemented by a different route than it proposed (its status row says how).
- **The lesson file is a 9-row stub.** `Lesson`, `Saw in`, `Detectable`, `Enforced by` join the table (`templates/lesson-template.md`); the grown sections sit below a rule and stay empty until the lesson recurs (the generator marks such a line `↗`). `critical` severity means always-read. Legacy files need nothing — the generator reads both shapes; `/config migrate` **offers** the cosmetic header rewrite.
- **Promotion starts at the verdict.** `/wrapup` step 3's verdict table gains a `Detectable` column (`no | grep | lint | test`); anything but `no` goes on the gate card under **Promotion candidates** with the one-line check written out, and into the stub. When the user gives it a home — a `verify.sensors` entry, a rule line in `conventions.md`, a lint rule — the stub's `Enforced by` is filled and the lesson leaves the reflector's repeated-mistake pass (now `sensor-gap` if it still slips) and the knowledge hook. `health-auditor` reports lessons cited twice without `Enforced by` as the promotion queue. ETHOS §4 gains the sentence: knowledge a machine can check becomes a check; prose keeps only what needs judgment.
- **`index.md` and `decisions.md` are generated.** `node scripts/adlc.mjs index --vault .adlc` builds `index.md` from the records (plus in-flight folders), the ADR headers and the knowledge pages' first lines, keeping everything under `## Reference` verbatim (the one hand-maintained section), and `decisions.md` as the ADR ledger with supersession columns. All three generated files carry `<!-- GENERATED` in their first lines; the 1.9.1 knowledge hook refuses a hand edit. Skills that used to "add rows to index.md" call the generator instead. Measured target: 216KB → ~12KB.
- **`config.yml` gains `verify:`** — `format` / `lint` / `typecheck` / `test` (each `run` + `scope: changed|project`) and project-owned `sensors[]` with `enforces: [L-…]`. `/init` seeds it from the tree and marks guesses. `task-implementer`'s report and `/implement`'s final check **quote each command's last line**; a `scope: changed` command never earns "types pass". `/review` step 0 (runs them before dispatch; `halt_on` stops the phase) is 1.9.1.
- **One paragraph for legacy repos** in `task-implementer`: when code conflicts with `context/architecture.md` or `conventions.md`, the docs win — production code is history, not guidance; report `legacy-pattern:` rather than copying the neighbour.
- **Deliberately not changed:** no new agent, no new gate, no new skill (`/config` gains `lessons`/`index`, `ledger` stays as the alias; `scripts/adlc.mjs` gains two subcommands). Lesson files stay as the write side — a single hand-written lessons file was rejected in 1.8.0 on team-merge grounds and nothing here reopens that; the read side is what changed. The review packet cap, fork-dispatch and `qmd` stay sequenced behind the 1.9.1 numbers.
- **On update:** run `/config migrate` once per vault — it regenerates `lessons.md` / `index.md` / `decisions.md`, archives `lesson-ledger.md`, appends the two gitignore patterns (shown first; files already tracked under the folders stay tracked until you `git rm -r --cached` them — the command is printed, never run), and offers records for merged folders that have none. Then wire the updated `adlc-budget.mjs` (unchanged events, one new budget row).

## [1.8.0] — 2026-09-23

### Team-safe lessons — IDs that can't collide, a ledger that can't conflict, a dedup that looks past your branch **[protocol]** **[vault-format]**

The lesson layer was designed solo-first: `/wrapup` minted the next `LESSON-NNN` from an `ls` count, added a row to `index.md`, and checked candidates for duplicates against the lessons on the current branch. With two developers landing REQs in the same week, all three break — and the first one breaks *silently*: both branches see 41 files, both write `LESSON-042-<their-slug>.md`, git merges the two different filenames cleanly, and the vault ends up with two `LESSON-042`s and an ambiguous `[[LESSON-042]]` everywhere. Plan and review record: `docs/plans/2026-09-23-team-safe-lessons.md`.

- **Lesson IDs are namespaced under the work item that produced them.** `LESSON-<REQ_ID>-<n>` — `LESSON-REQ-042-1`, `LESSON-BUG-017-1`, `LESSON-PROJ-1234-2` under a `ticket` scheme; anchor `^L-REQ-042-1`, short form `L-REQ-042-1`. The scan is scoped to the one REQ, so uniqueness is inherited from `req.id_scheme` and nothing is shared across branches. Grammar and the (POSIX-safe) scan command in `core/VAULT-LAYOUT.md` → `mint(lesson)`. **Nothing to migrate**: existing `LESSON-NNN` files are frozen as-is, never renumbered, and the two grammars can't collide — same both-shapes-readable-forever rule as `layout.partition`.
- **`knowledge/lesson-ledger.md` replaces the Lessons table in `index.md`.** Generated one row per lesson from the files' header lines (one `grep`, never a read), rebuilt whole by `/wrapup`, `/task`, `/bugfix`, `/recover`, `/config migrate`, and the new `/config ledger`; `index.md` just links to it. It carries `merge=union`; `index.md` deliberately does not — verified on a scratch repo that union merges two branches' *rewrites* of the same row with exit 0, no markers, and both versions kept, which is fine in a file that gets regenerated and a silent duplicate in one that doesn't. This is also the ledger the tiered-vault-loading ADR asked for, built ahead of its trigger.
- **Candidates are checked against `origin/<base-branch>`, not just the working tree.** `/wrapup` step 2 (and `/task`, `/bugfix`, `pipeline-runner`) lists the base branch's lesson filenames with `git -C <workPath> ls-tree` — a read, not a mutation — and discards a candidate a teammate already promoted. Two traps found by running it, now stated inline: from a subdirectory `ls-tree` exits 0 with empty output (so always `-C <workPath>`), and the base branch is `pipeline-state.json`'s, never a hardcoded `main`. The gate card prints `dedup vs origin/<base> as of <age>` so a stale fetch is visible; the merge checklist starts with `git fetch`. Post-merge, `health-auditor` gains **near-duplicate lessons**, **untagged lessons**, and **stale ledger** findings.
- **Supersession is a two-line edit.** Lesson template gains an optional `Supersedes` row; the old file gets a `STATUS: superseded by …` banner; the reflector skips banner-marked lessons (and counts them), the ledger strikes them through. Nothing is deleted.
- **`Tags` is now a required lesson field** — the tiered-loading ADR filters on it, and a team hits that ADR's 30-lesson trigger in months. `/analyze`'s readout adds `<N> untagged · <N> near-duplicate pairs`.
- **Deliberately not changed:** no digest file (the ADR rejected it, and a single shared lessons file is the highest-conflict shape there is); no per-developer lessons in the shared vault; the reflector still reads every lesson; who decides (`/wrapup`'s operator, then the PR reviewer who sees the new file in the diff).
- **On update:** run `/config migrate` once — it generates `knowledge/lesson-ledger.md`, appends the missing `.gitattributes` line (the live `.adlc/.gitattributes` was never covered by the template refresh — fixed as an additive migrate step), and offers the `index.md` template diff via mode E. Existing lessons need nothing.

## [1.7.0] — 2026-09-08

### The diet — the pipeline writes half as much and reads what it writes less often **[protocol]** **[vault-format]**

Second token audit, on the same vault two months on (83 REQs, 61MB of spec artifacts, `D:\vantagewebapps\.adlc`). The packet is still the largest single artifact, but five things had grown past it, and three of them were the toolkit's own budgets being ignored: `now.md` at 68KB against 1KB, `hot.md` at 3,860 lines against 500, `context/conventions.md` at 63KB against 8KB — all loaded at every phase preflight, ~190k tokens per REQ spent re-reading a merged sprint's retrospective. Agents were writing 4–8KB commit bodies against a template that said "one paragraph", ~1KB lesson candidates against "three lines", and 500-character `pipeline-state.notes` entries by the hundred. And 20–30% of every review packet was one generated file (`frontend/src/types/api/index.ts`, 72–127KB) read in full by five reviewers. Findings: `token-diet-2-findings.md`; platform survey: `toolkit-landscape-2026-09.md`.

- **The review packet excludes generated code and line-ending noise.** New `config.yml → review.packet.exclude` (globs; `/init` seeds lockfiles, snapshots, and any generated client it finds). Excluded files never enter the packet — the manifest carries `<path> (+N/−M)` and a reviewer who needs one reads it directly. The diff runs with `--ignore-cr-at-eol` (a CRLF flip put a 127KB README into a packet for five changed lines). The protocol now states the uncommitted-working-tree form (`git diff <baseCommit>` plus untracked files under `## New files`) that the runtime had been improvising on every `git.mode: manual` REQ. Re-review rounds rebuild only the diff for the files the fix touched, under a `## Round N` header — measured 140KB against a 566KB round 1.
- **Budgets are enforced, not reported.** `/wrapup` step 4 rotates `hot.md` past 500 lines into `hot-archive-<YYYY>.md` and keeps `now.md` to its active table (narrative moves to `sprints/` or the REQ folder). `/status` prints a budget strip. New `/config budgets` repairs a drifted vault gated per file — every byte moves, nothing is summarized; `context/*.md` splits into the rulebook and `*-rationale.md`. And a new Claude-adapter hook, `adlc-budget.mjs` (SessionStart · PreToolUse Read · PostToolUse Write/Edit · SubagentStop), refuses an over-budget write to `now.md` / `CLAUDE.md` / `context/*.md`, denies a `Read` of an excluded generated file or of `hot.md` without a limit, blocks a reviewer whose section passes 12KB, and prints the strip at session start. Other adapters keep the same rules as prose; the fidelity matrix says so.
- **Hard write caps, with the reason inline so they don't drift back.** Commit body ≤10 lines + file list. Lesson candidate = Claim · one `file:line` · ≤2 lines context, ≤12 per agent per REQ. `pipeline-state.notes` ≤160 characters, one per task; narrative goes in the task file's `## Notes`. Implementer status report ≤15 lines. Reviewer section: summary ≤5 lines, finding ≤8 lines after its field table, ≤12KB, dispatch questions answered in one line each, no quoting code the packet carries. Applied to every reviewer, the reflector, the adversary, the ui-reviewer, the implementer, and `pipeline-runner`'s inline lenses.
- **The reflector stops auditing the README.** Repo-documentation drift moves from the review-phase reflector to `/wrapup` step 1 (and `/task`'s wrapup-lite, `/bugfix`'s Phase 5), where the doc gets edited once the user approves the list — the one non-vault write `/wrapup` makes. On a measured `/task`, six of nine reflection findings were doc/vault staleness, each costing a fix round to move prose. Reflector vault findings (`vault-stale`, `concept-drift`, `missing-vault-page`, `diagram-stale`) are needs-decision and route to `/wrapup` step 3; they never trigger an implementer. `repo-doc-stale` is no longer a category.
- **Slim pipelines split verdict from narrative from round 1.** `/task` and `/bugfix` reviewers write to `review-log.md` like everyone else; `verification.md` is the digest. Single-pass `/task` verdict files measured 43–51KB against the 8KB budget under the old "create the log at the first re-review" rule.
- **Deliberately not changed:** no new agent, no new gate, no reviewer cut; `--unified=99999` stays in the protocol (the runtime has been choosing `-U3..10` on its own — measured, context isn't the lever, generated files were); fork-dispatched reviewers and `qmd` retrieval are 1.8.0 and gated on a spike each.
- **On update:** `/config migrate` adds `review.packet.exclude`; `/config budgets` repairs an existing vault; wire `adlc-budget.mjs` per `adapters/claude/extras/README.md`.

## [1.6.1] — 2026-09-08

### The review packet learns its own size **[protocol]**

Audit of 38 real `review-packet.md` files across a 68-REQ vault: median **274KB**, largest **942KB**, 12MB across the corpus. Every dispatched reviewer reads the packet **in full**, so its cost is multiplied by four or five — a median review phase spends ~342k tokens of reviewer context, the largest ~1.2M. It is the biggest artifact the toolkit produces and the only one with no budget, no ceiling, and no measurement. Written 2026-07-31 as 1.4.6 and never committed; rebased onto 1.6.0 unchanged. The diff-context change was later measured to be the wrong lever — see 1.7.0.

- **The packet is assembled with shell redirection, not `Read` + `Write`.** Composing it by reading each source into context and writing it back out put a full extra copy of the largest artifact in the system into the main session — the one context the packet exists to protect. Heredoc the manifest, then `git diff >>` and `cat >>`. Identical bytes out, nothing through the context window.
- **The packet measures itself.** Size goes in its header line and in `verification.md`'s Summary. Target ≤120KB, ceiling 250KB, both added to `health-auditor`'s over-budget sweep in `/analyze` alongside the existing vault budgets. A 942KB packet should not be able to happen quietly.
- **Only reflector gets the exploration narrative.** The packet keeps `exploration.md`'s blast radius and vault references — small, broadly useful. The long recon write-up (~27KB on a measured REQ) goes to `reflector` alone via its dispatch prompt, since it is the only agent whose mandate covers it. Four fewer copies to serve one reader.
- **`Packet-gap` is narrowed until it means something.** `context/conventions.md` was the runaway top gap at **13 occurrences** — structurally, because it is quality-reviewer's declared source of truth and the packet never carried it. Adding it to the packet would have raised its cost from 2× to 5×; instead, required reading is now explicitly *expected* — in the packet manifest and in all three reviewer agents. A gap note now means the packet's own contents fell short, which is narrow enough to act on.
- **Re-review rounds stop accumulating in the verdict file.** `verification.md` was over its 8KB budget on **52 of 60** REQs — not because v1.4.0's split failed (it works where it runs) but because each `fix` round appended a full narrative, and slim pipelines had no log to divert into. One REQ reached round 5 at 149KB. Now the log keeps every round uncollapsed, the verdict file collapses resolved findings to one digest line, `/task` and `/bugfix` create a log at the first re-review, and from round 3 the gate card leads with the round number and the verdict file's size. The loop is still yours to run — it just stops being silent.
- **Deliberately not changed:** no new agent (`/review` already delegates correctly — every `Written by:` line in the corpus confirms real dispatch at `balanced` tier); no per-reviewer packets (that re-introduces the N× authoring cost the shared packet was built to remove); no cut to reviewer count or tier.

## [1.6.0] — 2026-08-13

### `specs/` stops being one long list **[protocol]** **[vault-format]** **[tooling]**

- **The problem, from real usage:** a year into a project with two or three people, `.adlc/specs/` is a flat list of a hundred-plus folders and nothing ever leaves it. `specs/_archive/` (1.4.3) helped by moving merged REQs out of the way, but it relocated the same pile one level down — the archive became the long list. Obsidian's file tree, `ls`, and your own eye pay for it on every lookup. `bugs/` has the same shape; `sprints/` is a flat heap of dated JSON.
- **Work records bucket by month and author.** `.adlc/config.yml` → `layout.partition: month-author` puts a new REQ at `specs/2026-08/sf/REQ-042-payment-retries/` — the month it was created, then who created it. `bugs/` takes the same shape; `sprints/` takes the month only, no author folder. The month is set once and never moves: a REQ opened 2026-07-30 and merged 2026-08-05 stays in `2026-07/` forever, and archiving preserves whatever bucket the folder had instead of re-bucketing it by merge date. The shipped default stays `none`, so **existing vaults are untouched and keep working** — that's why this isn't a breaking change. All four shapes (flat, bucketed, archived-flat, archived-bucketed) resolve in the same vault, permanently. That's the guarantee that makes migrating optional rather than mandatory.
- **The durable half: path knowledge moves into one file.** `specs/REQ-` appeared literally in 23 files plus two scripts — every phase skill, eleven agents, two templates, the vault README and rulebook, and a `.gitignore` block. That's why a folder change felt expensive. New `core/VAULT-LAYOUT.md`, a peer of `ETHOS.md` and `GATE-PROTOCOL.md` loaded at preflight, owns the path grammar and three named operations: `resolve(ID)`, `mint(scheme)`, `enumerate(active | archived)`. Skills and agents resolve a REQ's folder once and then treat it as opaque. Shipping only the buckets would put us back here in six months; this is the part that makes the *next* layout question a one-file edit.
- **The `.gitignore` globs go from `*` to `**`.** A single `*` matches exactly one path segment, so the moment a REQ folder gains a level all 15 per-developer globs stop matching — and the symptom is everyone's `pipeline-state.json` and `.awaiting-approval` markers turning up in everyone's diffs, with no error anywhere. `**` matches *zero* or more directories, so one 18-line block covers every shape, flat included. The block also gains `bug-fix-pr-draft.md`, which `/bugfix` has always written and git has therefore always committed.
- **The statusline and the gate notifier stop going blank.** Both walked one level under `specs/` and skipped any directory with no `pipeline-state.json` in it. Under a bucketed vault every entry is a month folder, so both skipped everything and exited having printed nothing — an empty statusline, and no gate notification ever firing, with nothing to say why. That's worse than a crash. Both now walk to the full bucket depth, take the display ID from the REQ folder's own name (not the child of `specs/`, which would read `2026-08`), skip `_archive/`, and print a dim `ADLC: layout?` when they hit a folder they can't account for. A vault whose work is all merged stays quiet — zero active REQs is a normal state, not a fault.
- **`[[specs/{{REQ_ID}}/requirement]]` has never worked, and is fixed here.** Four templates built wikilinks that way: lesson, architecture, task, assumption. `{{REQ_ID}}` is `REQ-042`; the folder is `REQ-042-payment-retries`. Every one of those links has pointed at a directory that doesn't exist, in every vault, since they shipped — this is a pre-existing bug fix and it lands whether or not you ever bucket anything. `merge-checklist-template.md` carried the same broken path inside the `gh pr create --body-file …` line `/wrapup` hands you to run, so that one failed at the terminal.
- **Durable artifacts name a REQ by ID, never by path.** Lessons and ADRs outlive the REQ they came from, so they now record `REQ-042` and the folder is resolved when the page is read. Artifacts that live and die inside the REQ folder — tasks, assumption pages, the merge checklist — keep the path. This is the whole answer to link rot: a durable page holds nothing to sweep on archive or migration, so there's no sweep to eventually get wrong. `index.md`'s Specs table gains a `Path` column as the one place a REQ's folder is written down, repointed by `/wrapup` on archive and by `/config migrate`.
- **`knowledge/` is deliberately not bucketed** — nor `architecture/`, `context/`, or `audits/`. Nobody asks which month they learned the auth-token thing; they ask whether there's a lesson about auth tokens. A flat folder and a search answer that well; a dated tree answers it badly. It would also save nothing, because the reflector reads every lesson on every REQ — a hundred lessons cost the same in twelve folders as in one. Lesson volume is a loading problem, not a folder problem, and `docs/adr-tiered-vault-loading.md` is the armed answer to it.
- `bugs/_archive/` is still deliberately absent: `/bugfix` has no `merged` terminal state to hang an archive step on. Deferred to its own release rather than half-built here.

### The README says what the toolkit is for **[tooling]**

- The README now leads with the problem the pipeline solves — building with AI without losing credibility: gated decisions, independent read-only reviews, a paper trail by construction, compounding knowledge — instead of leading with which tools it runs on. A chip-link row at the top navigates to every section.
- Install, updating, the AI-assistant install prompt, and adapter regeneration move to their own page, **`docs/install/README.md`** — the README keeps the three-line install and links out. Mermaid maps replace prose-only descriptions of the pipeline (phases + gates), the `core/`→`local/`→adapters→vault seam, and skill→agent dispatch.
- The inspiration credits line is gone; the toolkit has diverged far enough that it no longer described the relationship.

### Update notes

- Re-run `node scripts/adlc.mjs build --tool=all` (or `sync`).
- **Existing vaults need nothing.** They stay flat, every path still resolves, and the pipeline behaves as before.
- To bucket an existing vault: run `/config migrate` once to pick up the new `layout` block (added as `none`, changing nothing), set `layout.partition: month-author`, then run `/config migrate` again for the layout step. It shows the whole move plan first — old path, new path, and where each month came from, with guessed rows grouped at the top — moves active work and `_archive/` in the same pass, and is safe to re-run: a second run simply finds no work left to do.
- `/config migrate` offers the `**` `.gitignore` replacement as its own separately gated diff. Take it even if you stay flat.
- New vaults from `/init` get `month-author`, plus `req.id_scheme: prefixed` if you give it your initials.

## [1.5.0] — 2026-07-31

### Wrap-up stops paying for what it doesn't read **[protocol]** **[vault-format]**

- **The problem, from real usage:** `/wrapup` was burning ~11% of a session's tokens — against `/implement`'s 1% and `/review`'s 2%. Those two are thin dispatchers; their cost sits in subagent context that never lands in the main thread. `/wrapup` was the one heavy phase delegating nothing, doing agent-sized work at main-thread prices and holding it through every gate revise-loop.
- **Preflight loads four things, not eleven.** `requirement.md`, `verification.md`, `architecture.md`'s blast-radius section, and the git log. `tasks/*.md` and `exploration.md` are no longer loaded at all — no step below reads them, and `exploration.md` is typically the largest file in the REQ folder. `commits-draft.md` is opened only if the commit subjects plus `--stat` don't already tell the change story.
- **The vault write targets are opened at the step that writes them.** `hot.md`, `index.md`, `now.md`, `decisions.md`, `glossary.md` are step 4's *outputs*; a typical REQ touches two. Each sub-step now says to read only the section being edited — and `decisions.md` says to skip the file entirely when no ADR status changed.
- **The two unbounded scans are bounded.** "Scan existing lesson files" for the next ID is now `ls .adlc/knowledge/lessons/`; "scan the file" for the next `^g##` is now a `grep -o … | tail -1`. Both targets grow forever, so the old wording made wrap-up cost *more* with every REQ — penalizing the vault for working. The reason is stated inline so it doesn't drift back.
- **`pr-draft.md` and `merge-checklist.md` templates move out of the skill** into `templates/pr-template.md` and `templates/merge-checklist-template.md` — 113 lines that were paid on every invocation and are now read at their own step. They were the only two output shapes still inlined; every other template already lived in `templates/`. As a side effect both become per-project customizable (PR body shape, merge strategy).
- **No new agent, no behavior change, no gate change.** If a cut file turns out to be needed, the skill opens it at that step and adds a `**Packet-gap:**` line to the gate card — the same signal `/review`'s packet already uses — so a wrong cut surfaces instead of silently degrading.
- **On update:** existing vaults get the two new templates via `/config templates` (gated, per file). Until then `/wrapup` falls back to `$TOOLKIT_PATH/templates/`, so nothing breaks if you skip it. `/init` copies both for new vaults.

## [1.4.4] — 2026-07-22

### Review sweep — closing the gaps the v1.4.x series left **[tooling]**

- **Slim pipelines declare their single file.** `/task` and `/bugfix` reviews stay in one `verification.md` (two or three reviewers don't need a verdict/narrative split), but the reviewer agents' own instructions now default to `review-log.md` — so both skills' dispatch prompts state "single-file review, write to the output file" explicitly. Without this, a dispatched reviewer could follow its skill default into a file the slim pipeline never reads.
- **ETHOS principle 3 caught up with 1.4.0**: reviewers' findings artifact is "a section of `review-log.md`" now, not `verification.md`. Same fix in the Claude install guide and the fidelity matrix.
- **`/init`'s committed-files list gains `review-log.md`** — it's the narrative why-trail; it belongs in history alongside the verdict.
- **Archived REQs are recognized, not "missing."** `/sprint` drops an archived REQ from the launch list with a one-line explanation instead of offering to re-create it; `/proceed` reports an archived REQ's final state and stops instead of failing the existence check. Both close loose ends of 1.4.3's archive step.
- Verified clean in the same sweep: budget numbers agree everywhere (5KB rulebook · 8KB context/verdict · 60KB/30-lesson trigger); `/config`'s `### Git policy` sync target survived the rulebook diet; the generated per-tool memory files never referenced the split files; README, quickstart, gate-cards, and GATE-PROTOCOL carry no stale references; `pipeline-runner`'s static-tier UI checklist stays in the verdict file on purpose (the user must run it).

## [1.4.3] — 2026-07-22

### Merged REQs move out of the way **[protocol]** **[vault-format]**

- `/wrapup`'s `merged` step now offers to move the finished REQ folder to **`specs/_archive/`** — whole, nothing deleted, `index.md` repointed, one `req-archived` line in `hot.md`. Declining is fine; `/analyze`'s vault-health re-surfaces it as an archive candidate after 30 days.
- Why: old REQ folders are write-once, read-never — they cost no tokens, but they crowd `specs/`, Obsidian search, and `/status`. The active surface of `specs/` now stays roughly one folder per REQ in flight, however old the project gets.
- **The co-ship that makes it safe:** `/spec` and `/task` mint IDs by scanning `specs/` **and** `specs/_archive/` (sequential and prefixed schemes; explicit IDs collision-check both) — without this, archiving REQ-007 would eventually re-mint REQ-007. `/status` and `/recover` skip the archive; a named archived REQ is read-only history.
- Archived folders are never auto-deleted — git history is the deep archive, `_archive/` is the browsable one. The vault README gains the `_archive/` layout row and an Obsidian *Excluded files* tip.

## [1.4.2] — 2026-07-22

### The vault learns to watch its own weight **[protocol]**

- `/analyze` gains a **Vault health** section, run by the health-auditor alongside its usual audit: files over their size budget, lessons no exploration or verification has cited in the last 5 REQs ("still earning its place?" — the user decides), gotchas whose file no longer exists, `STATUS: needs verification` older than 30 days, superseded ADRs still wikilinked as if in effect, and merged REQ folders sitting under `specs/` past 30 days.
- The report now carries a **footprint readout** — bytes and estimated tokens per vault layer — plus the distance to the tiered-loading trigger, so growth is a number you watch, not a surprise.
- Size budgets are documented in the vault README ("Size budgets"): CLAUDE.md 5KB · context files 8KB each · now.md 1KB · hot.md 500 lines · verification.md 8KB per REQ · knowledge/ 60KB soft trigger. Soft — flagged by `/analyze`, never enforced silently. No config key for now; the defaults live in one place on purpose.
- New `docs/adr-tiered-vault-loading.md` (**proposed**, trigger-armed): when `knowledge/` crosses 60KB or 30 lessons, the reflector and architect switch to a ledger-first read. Deliberately **not** implemented now — the reflector's unfiltered pass is its value; the ADR exists so the flip is a planned decision with the trade written down.

## [1.4.1] — 2026-07-22

### The vault rulebook goes on a diet **[vault-format]**

- `templates/vault/CLAUDE.md` drops from ~11KB to under 5KB. It's loaded at every phase entry — it was the single highest-frequency file in the vault, and more than half of it restated what the running skill already enforces.
- Gone as tables, kept as pointers: the three-mode git matrix (the skill enforces `git.mode`; the rulebook keeps the one-paragraph summary and the full **never** list), the isolation-mode explainer (three sentences now), and the phase-by-phase artifact map (each phase skill and the vault README carry it).
- Kept in full: identity, read order, the authority table and contradiction rule, provisional-content rules, file conventions, capture triggers, when-in-doubt rules, and the per-project tail.
- `/config`'s derived-file sync is untouched: the `### Git policy` section survives as the sync target, and its canonical body still comes from this template.
- Existing vaults keep their current CLAUDE.md until refreshed — run `/config templates` (gated, per-file, shows the diff) to adopt the slim rulebook.

### Update notes

- Re-run `node scripts/adlc.mjs build --tool=all` (or `sync`).
- Existing repos: `/config migrate` then accept the CLAUDE.md template refresh if you want the slim rulebook; skip it to keep your current file.

## [1.4.0] — 2026-07-22

### The review verdict and the review narrative part ways **[protocol]** **[vault-format]**

- `/review` now writes two files. `verification.md` becomes the compact **verdict file** — digest table, consolidated findings, summary, acceptance-criteria check; target ≤8KB. A new `review-log.md` holds the full per-finding narratives, re-review threads, and packet-gap notes.
- Why: the verdict file is what `/wrapup` and the gate packets actually load. On a real REQ, `verification.md` ran to 40KB, of which the acted-on part was ~7KB — the other 33KB is useful history that now lives **off the load path** instead of being re-read at every wrap-up. First shipped piece of the long-run vault maintenance plan.
- All five reviewer agents write their sections to the log; the `/review` orchestrator distills the verdict (reflector's `repo-doc-stale` / `vault-stale` / `adr-conflict` tags survive the distillation — wrap-up's doc-staleness backstop keys off them). `pipeline-runner` does the same split inline in sprint mode.
- `fix` loops unchanged: re-run reviewers append to the log, the verdict's digest and counts refresh, the gate card re-emits.
- `/recover` and `/proceed` know both files. **No migration:** an old REQ with one fat `verification.md` and no log is recognized as the pre-1.4.0 shape and left alone.

### Update notes

- Re-run `node scripts/adlc.mjs build --tool=all` (or `sync`).
- Nothing to change in existing vaults; the split applies from the next `/review` onward.

## [1.3.9] — 2026-07-22

### Sprint gets an adjudicated gate queue **[protocol]**

- `/sprint`'s queue now follows `autonomy.gates` — the same dial `/autopilot` reads; `--gates=<manual|assisted|auto>` overrides it per sprint. `manual` is exactly today's behavior. `assisted` attaches the decision-maker's recommendation and confidence to every gate — you still clear each one, but a clean gate is one keystroke. `auto` turns the queue into an **exception queue**: the orchestrator fast-paths clean gates (no agent call), sends the ambiguous middle to the decision-maker on a size-capped packet, routes REWORK back to the runner under the rework caps, and surfaces only what needs a human — hard-stops, critical/major findings, HALTs and confidence-floor trips, exhausted caps, blocked runners, and every REQ's final review. Merges stay yours in every mode.
- **Runners are untouched.** `pipeline-runner` still pauses at every gate; what changed is who clears it. The decision-maker runs as a true sub-agent of the orchestrator (`Judged independently: yes`) — the only fresh pair of eyes in sprint mode, since runners review inline by design.
- Auto-cleared gates render as a no-reply **ledger** in the queue view (`CLEARED FOR YOU`), and every verdict — approvals included — lands in that REQ's `gate-decisions.md`. Visibility without interruption.
- The "approve all is not a valid command" rule holds in every mode, and the old "you're using the wrong tool" answer is gone — the right tool for queue overwhelm is the `gates` dial.

### The review gate learns `fix all` **[protocol]**

- The verify gate's fix vocabulary is now `fix all` · `fix all-major` · `fix <ids>` — in `/review`, `/proceed`'s routing, and the sprint queue (`fix <N>: all`). `fix all` dispatches a task-implementer for every **actionable** finding at any severity, re-runs the affected reviewers, and brings the gate back. It's always offered when at least one actionable finding exists.
- Findings are now classified **actionable** vs **needs-decision** (a reflector `vault-stale`, an `adr-conflict`, a proposed ADR, an open question). `fix all` never touches the latter — an implementer "fixing" an ADR conflict would be making your decision for you. Excluded findings come back named on the re-emitted card ("fixed 6 of 8 — 2 need your call: m1, m3"), and the findings table gains a `Fix` column (`yes` / `your call`) so the scope is visible before you reply.

### Update notes

- Re-run `node scripts/adlc.mjs build --tool=all` (or `sync`).
- To opt a sprint into the adjudicated queue, set `autonomy.gates` in `.adlc/config.yml` or pass `--gates=assisted|auto`. With no `autonomy` block, `/sprint` behaves exactly as before.

## [1.3.8] — 2026-07-21

### Review sweep — closing the gaps the series left **[tooling]**

- **Seven principles, everywhere.** ETHOS gained "Speak Plainly" in 1.3.2, but four surfaces still said six — ETHOS's own intro, README's principle list, the vault CLAUDE.md authority table, and the generated memory file (which now also carries principle 7 and the renamed principle 6).
- **`docs/gate-cards.md` caught up with the card format it documents**: plain `GATE n/N` headers instead of rulers, the current architect example (stages, stress-test, task order, options with consequences), "a menu of sections" instead of "a palette", and no more "surviving finding".
- "Terminal review" is now the **final review** everywhere ("terminal" read as a CLI or as fatal); the decision-maker's REWORK verdict carries `{fixes}`, matching its "Fixes requested" output.
- Leftover wording caught by the sweep: toolkit-update's "idempotent installer", config's "derived twin" / "edit friction" / "decision-maker bias" / "inert", sprint's "verify-phase", proceed's "reconciles state-vs-reality", implement's "edit posture" (and a quote it attributed to ETHOS that ETHOS never said), the dense ui-reviewer / design-system-auditor / adversary descriptions, and small template fixes (lesson "manifestation", spec "provisional", bug/index/decisions glosses).
- The quickstart glossary gains its seventh term: **ADR**, finally expanded.

## [1.3.7] — 2026-07-21

### Docs pass — the reading surfaces speak plainly too **[tooling]**

- README and quickstart lose their jargon: "base model" → "starting point", "pointer-stub adapters" → "a small adapter file that just points at core/", "idempotent reconciler" → "safe to run again and again", "resolves local/ over core/" → "files in local/ win", and the every-mode git rules are now a parseable sentence instead of a noun/verb pile-up.
- The fidelity matrix is retitled **"What works on each tool"** (same filename); "hermetic" and "degrades" are gone; the reviewer-Write paragraph reads like an explanation instead of a legal clause.
- ETHOS grounds its aphorisms ("Auto-fix is borrowed time" now says what actually goes wrong) and principle 6 is titled "Offer Choices, Don't Ask Open-Ended Questions".
- Template fields a person had to guess at are named for what they want: `Anchored on` → `Based on`, `Validates by` → `Check by`, assumption status `provisional|validated|invalidated` → `unverified|confirmed|disproven`, design-system status `de facto|ratified` → `as-found|agreed`, task `Tier` gets a gloss, and hot.md leads with the one rule that matters (only add entries).
- Vault docs: CLAUDE.md is a "rulebook" not a "schema doc"; "tombstoned" is explained; config comments drop "minted", "hermetic", "invariants", and the unexplained Karpathy reference.

## [1.3.6] — 2026-07-21

### Claude extras — statusline + gate notifications **[tooling]**

- New optional **statusline** for Claude Code: a persistent terminal line showing the active REQ, its phase, and `GATE WAITING` when the pipeline is paused for you (`ADLC REQ-014 · phase 3 (implement) · GATE WAITING`; with several in flight, a count of waiting gates). Zero tokens; reads `.adlc/` pipeline state and the `.awaiting-approval` markers; prints nothing when there's nothing to say and stays silent on any error.
- New optional **gate notification hook**: on Claude Code's `Notification` event, if a gate marker exists, emits an OSC 9 desktop toast (`ADLC gate ready: REQ-014 (review)`) — supported by Windows Terminal, iTerm2, WezTerm, Ghostty. Look away during long phases; the gate finds you.
- Both live in `core/extras/claude/` with a plain-language setup README (two `settings.json` snippets) and are passed through to `adapters/claude/extras/` by the build — which previously wiped anything hand-placed in `adapters/`. `local/extras/` overrides work like everywhere else. Claude-only by nature; other tools lose nothing.

### Update notes

- Re-run `node scripts/adlc.mjs build --tool=all` (or `sync`), then follow `adapters/claude/extras/README.md` to wire the two snippets into `~/.claude/settings.json` if you want them.

## [1.3.5] — 2026-07-21

### Model discipline — the right model for every job **[protocol]**

- **No more silent inline fallback.** Skills must dispatch agents by exact registered name; if an agent isn't installed (stale sync), they stop and say so instead of quietly doing the work in the main session. That fallback was how a haiku-priced exploration became an opus-priced one — and how review lost its independence (the context that wrote the code was reviewing it). New rule in ETHOS §3 and at every dispatch site; `/autopilot` HALTs on a missing agent. The one deliberate exception stays: `pipeline-runner` reviews inline in sprint mode by design, and now labels its review sections accordingly.
- **Every agent report says who wrote it.** First line: `Written by: <agent-name> (tier: <tier>)` — with an explicit note when running inline instead of as a sub-agent. `verification.md` carries a reviewer roster line, so a model-tier leak is visible at the gate instead of on the invoice.
- **Current model IDs baked into the adapters** (verified 2026-07-21; `tierVerified` in the manifest, re-verify quarterly): Codex agents get `gpt-5.4-mini` / `gpt-5.3-codex` / `gpt-5.5` per tier plus a new `model_reasoning_effort` line (low/medium/high); Gemini's fast-tier agents get `gemini-3-flash-preview` in frontmatter (balanced/deep inherit the session default). Claude keeps `haiku`/`sonnet`/`opus` aliases on purpose — they track the latest models automatically. New optional `tierEffort` manifest block; `local/manifest.json` can override everything as before.

### Update notes

- Re-run `node scripts/adlc.mjs build --tool=all` (or `sync`) — Codex and Gemini adapters change; verify the Codex model IDs against your Codex version before relying on them.

## [1.3.4] — 2026-07-21

### Terminal-readable cards — structure over decoration **[protocol]**

- Gate cards no longer draw fixed-width rulers (`── … ──────`) — they break at narrow terminal widths. The header is now a short plain line (`GATE 2/5 · Architect · REQ-014-payment-retries`); user-facing lines stay at or under ~72 characters; cards target 20 lines or fewer, with long content offered on demand ("say `show findings` for the full list"). All example cards updated to match.
- `verification.md` now leads with a **findings-at-a-glance table** — one row per finding with an ID (C1/M1/m1), severity, one-line summary, location, and fix effort — so triage happens before any detail. Review agents gained an `Effort: small | medium | large` field to feed it; `fix <ids>` replies use the IDs.
- `/proceed --resume` **leads short**: a three-line catch-up plus the menu; the full breakdown (activity, changed files, drift checks) only on `details`. The person coming back from a break no longer gets a wall of text.
- The implementer's out-of-scope stop now has a scripted, plain-words ask: "I need to touch `<file>`, which isn't in the plan, because `<reason>`. OK to proceed, or should I find another way?"
- `pipeline-runner` must pair every machine tag with a human sentence (`gate-blocked:review` + "Review finished: 2 major findings — waiting for your call"). On Claude, each gate option's consequence now rides in its `AskUserQuestion` description.
- `/spec` asks its 2–3 highest-impact clarifying questions first, not a questionnaire; `/init`'s discovered-docs list is grouped by destination in short lines instead of a 118-character-wide table.

## [1.3.3] — 2026-07-21

### Plain-language pass 2 — gate-card examples and queues **[protocol]**

- Every example gate card rewritten in the VOICE register: severities spelled out, options carry their consequence (`approve (move on to implementation)`), no more symbol soup (`vault: 4 candidates → L-042 promoted, ^g14 gotcha` is now `knowledge saved: lesson L-042 · gotcha g14 · ADR-007 confirmed`), "red→green" spelled out as "fails without the fix, passes with it", `✓ blast radius` is now `✓ changed files match the plan`, and "hard-stop-eligible" reads "always stops for your OK — even under `/autopilot`".
- `/recover`'s queue leads with a plain status line per entry ("records are behind — this actually shipped") with the class slug in parentheses; the `resume` reply is renamed `leave` (it never resumed anything — it leaves the entry as-is).
- One payoff-for-effort phrasing across `/analyze`, `/optimize`, and `/ux-doctor` (was three different formulas, one of them contradictory).
- `/init` explains the committed-vs-gitignored split in two sentences instead of a taxonomy lecture; "hermetic" is gone; reflector's severity rules define `landmine` / `trap` / `careful` inline.

## [1.3.2] — 2026-07-21

### Plain-language layer — `core/VOICE.md` **[protocol]**

- New **`core/VOICE.md`**: the rules for every word the pipeline puts in front of the user — everyday words over academic ones (decide, not adjudicate), toolkit terms glossed on first use, machine tags always beside a plain sentence, every gate option stating its consequence, concrete over abstract, short sentences in cards. Loaded at preflight by all nine gate-bearing skills; every agent carries a short Voice digest. New ETHOS principle 7 — **Speak Plainly**: a gate the user can't cheaply read is a gate they'll rubber-stamp.
- Findings vocabulary made plain: `Locus` → `Where`, `Authority` → `Rule broken`, `Surviving refutation` → `Why this holds up`, `Escalation tolerance` → `Caution level`, `Independence` → `Judged independently (yes/no)`, `Directives` → `Fixes requested`, `Evidence considered` / `Rationale` → `What I looked at` / `Why`. One severity scale everywhere: `critical | major | minor | trivial`, spelled out on cards (no more `crit`/`maj`/`min`), trivial shown as a count.
- "Reconnaissance/recon" → **exploration** everywhere (now matches the artifact name `exploration.md`); "decision dossier" → "catch-up summary"; the shared Packet-gap instruction rewritten in plain words.
- New gate-card invariant: **every option states its consequence** (`approve — moves on to implementation`), never a bare `approve · revise · abort`.
- `docs/quickstart.md` now opens with a six-term glossary (REQ finally expanded to "requirement"); gotcha/lesson severity words defined inline in their templates.

### Update notes

- Re-run `node scripts/adlc.mjs build --tool=all` (or `sync`) so agent/skill descriptions pick up the new wording.

## [1.3.1] — 2026-07-21

### Renames — `/ship` → `/autopilot`, phase labels match skill names **[protocol]** **[breaking]**

- **`/ship` is now `/autopilot`.** "Ship" is the word users reach for when they mean "finish this piece of work" (which is `/wrapup`'s job) — typing it launched the autonomous pipeline instead. `/autopilot` says what it is, and no longer collides with the `workflow.isolation: auto` config value. Its final artifact is `run-report.md` (was `ship-report.md`). Machine state values are unchanged (`currentPhaseGate: "ship"` and friends), so in-flight REQs, `/status`, and `/recover` keep working.
- Phase display labels now match the skills that run them: Phase 4 gates read **Review** (was "Verify"), Phase 5 **Wrap up** (was "Ship").
- Doc accuracy fixes: vault README no longer claims "Claude never runs git" (it contradicted `git.mode`); SDLC → ADLC in three files; spec-template's phase row matches the real pipeline; "status machine" → "state machine"; broken sentence in `now.md`.

### Update notes

- Re-run `node scripts/adlc.mjs build --tool=all` (or `sync`) — the `ship` adapters are replaced by `autopilot` ones.

## [1.3.0] — 2026-07-20

### UX layer — `/ux-doctor`, design-system-auditor, UX adversary lens **[protocol]**

- New standalone skill **`/ux-doctor`**: whole-app UX & design-system audit, shaped like `/analyze` (no gates, dated report, trends). Two passes run in parallel — the new **`design-system-auditor`** agent audits the UI *source* (token compliance and hardcoded values, scale coherence, component duplication, naming, cross-screen consistency, drift vs `design-system.md` with the cause classified), while the **`ui-reviewer`** gains a `standalone-audit` trigger and walks the *running app* (heuristic evaluation, cross-screen-consistency screenshots, design-system match — on top of its existing browser tiers). Findings consolidate into `.adlc/audits/ux-YYYY-MM-DD.md` with a severity × effort matrix (quick wins first) and gated routing of fixes into `/task` or `/spec`. No auto-REQs; read-only on source. **Large apps segment:** the skill sizes the UI surface first and, past roughly a session's worth, proposes a gated **segment plan** (`ux-plan-*.md`, feature-area segments) run in phases — a cheap global *system pass* first (which is also when the design-system synthesis is offered, so segments audit against the contract), then per-segment passes with the plan updated at every segment boundary (a dead session loses one segment; `/ux-doctor resume` continues in a fresh one), then consolidation with a **cross-segment consistency** lens that catches misalignment between features that no per-segment pass can see. `/ux-doctor <feature|route|path>` scopes a single run instead; coverage is never silently thinned — unaudited segments stay `pending` in the plan.
- **`architecture-adversary` gains a UX & design consistency lens** and a fifth full-pass trigger, **`ui-surface`** (UI-facing ACs, frontend files in the blast radius, or a resolved design reference) — UI-heavy REQs now get attacked pre-gate: unplanned screen states, irreversible flows, design-reference contradictions, bespoke components where the system already has one. `/architect`'s quick self-check adds "what screen state has no plan."
- **`ui-reviewer`: chrome-first + auth story.** Claude in Chrome is explicitly the first-choice browser tier (it drives the user's real, signed-in session, so login walls often vanish). For apps behind a login, new optional `ui.auth` config (`login_url`, `env_file` — default `.adlc/ui-auth.env`, per-developer and gitignored) lets the headless tier authenticate from a local dotenv; with no credentials the review degrades to public surfaces and says so. Credential values never appear in reports, logs, or screenshots, and `/init`'s proposed `.gitignore` block covers the env file.

### Design-system contract **[vault-format]**

- New `templates/design-system-template.md` → `.adlc/context/design-system.md`, created **gated** by `/ux-doctor` and seeded from the observed de facto system (`STATUS: needs verification`, born minimal). One contract, three consumers: `/ux-doctor` measures drift from it, the `ui-reviewer` design-matches against it in `/review`, and the adversary's UX lens checks plans against it in `/architect`.

### Update notes

- Run `node scripts/adlc.mjs build --tool=all` (or `sync`) once to generate the new skill/agent adapters.
- In each active project, `/config templates` picks up `design-system-template.md`.

## [1.2.0] — 2026-07-02

### Visual layer — Mermaid diagrams **[protocol]**

- Diagrams are now a first-class, **judgment-call** part of specs and architecture. The architecture template ships component / sequence / ER examples and renders the task DAG as a Mermaid graph; the spec template gains an optional user-flow `stateDiagram`. `/architect`, `/spec`, and the `codebase-explorer` recon agent add a diagram when structure is hard to grasp from prose (and skip it when it would just restate a paragraph). `/status` shows a Mermaid pipeline/gate board when 2+ REQs are in flight. All text-first and portable (Obsidian, GitHub, IDE preview) — no Obsidian-only Dataview dependency.

### Shared gate protocol — consistent gate cards **[protocol]**

- New `core/GATE-PROTOCOL.md` defines one base **gate card** every human gate adapts: it separates *what's done* from *what needs you*, always gives a recommendation, and puts the decision last (delivered as an `AskUserQuestion` on Claude). Wired into every gate-bearing skill — `/spec`, `/architect`, `/implement`, `/review`, `/wrapup`, `/bugfix`, `/task`, and `/ship`'s terminal review — replacing the old ad-hoc `Gate:` prompts.

### Vault template refresh **[tooling]**

- `/config` gains a gated, per-file template refresh (`/config templates`, also offered at the end of `migrate`): it diffs each `.adlc/templates/` file against the toolkit's current templates and updates only the ones you approve, so template changes (like the new diagram sections) reach existing vaults without clobbering local edits. `/toolkit-update` advises it per project.

### Read-only reviewers write their own findings **[protocol]**

- All 10 read-only agents (the reviewers plus `codebase-explorer`, `architecture-adversary`, `health-auditor`, `performance-scanner`, `decision-maker`) are granted `Write`/`Edit`, scoped **by instruction** to their own findings/report artifact (e.g. `verification.md`, an audit report, `gate-decisions.md`) — never source, config, or any repo file, and never a git mutation. Fixes reviewers having to write reports through `Bash`. Consequence: read-only-on-source is now enforced by instruction on every tool, not the tool sandbox (reviewers always carried `Bash`, which could write regardless). ETHOS principle 3 and the fidelity matrix say so.

### Update notes

- Run `node scripts/adlc.mjs build --tool=all` (or `sync`) once to regenerate adapters — reviewers now get `Write`, and Codex agents `read_only = false`.
- In each active project, run `/config migrate` and accept the template refresh to pick up the new diagram sections.

## [1.1.0] — 2026-06-26

### Install / update system — rebuilt **[tooling]**

- **One idempotent command** for install *and* update: `node scripts/adlc.mjs sync --tool=<...>`. Re-running reconciles against a saved receipt — newly added skills/agents are linked, removed ones are pruned, content changes flow through automatically. `--pull` git-pulls the toolkit first.
- `scripts/install.mjs` and `scripts/build.mjs` are now thin aliases for `adlc.mjs sync` / `adlc.mjs build`; existing commands keep working.
- **Pre-commit hook** (`scripts/hooks/pre-commit`, activated with `node scripts/adlc.mjs hooks` → `core.hooksPath`): rebuilds and stages `adapters/` whenever a commit touches `core/`, `local/`, or the generator, so the committed snapshot never drifts from the source. No npm/husky dependency. Bypass with `git commit --no-verify`.
- Fixed the corruption mode where re-running the installer onto a symlinked target produced self-referential symlinks and `.bak` litter. `dist/` is now wiped and regenerated cleanly each run, the linker refuses any destination that resolves back inside the toolkit, and old flat-file skill installs are auto-migrated to `SKILL.md` folder form.
- **Auto-heal legacy directory-symlinks.** If a prior corrupted install left a whole tool-config dir symlinked into the toolkit (e.g. `~/.claude/skills` → `dist/claude/skills`), `sync` now replaces it with a real directory and links the per-skill children back in, instead of stopping at the loop guard. `--dry-run` previews the heal and changes nothing.

### Engine / overlay seam **[tooling]**

- New **`local/`** overlay directory, resolved *over* `core/` by the generator. Add a skill (`local/skills/<name>.md` + a `local/manifest.json` entry), override a core skill (same filename), or disable one (`{"name":x,"disabled":true}`). Customizations live only in `local/`, so `git pull upstream` merges with no conflicts. See `local/README.md`.

### New skill **[protocol]**

- **`/toolkit-update`** — guided upstream pull + adapter reconcile that also flags any `local/` override shadowing an engine file the update changed.

### Teams **[protocol]**, **[vault-format]**

- **Configurable REQ/BUG IDs** via `config.yml` → `req.id_scheme`: `ticket` (derive from your tracker — collision-proof, recommended for teams), `prefixed` (`REQ-<initials>-NNN`, offline), `sequential` (default). Honored by `/spec`, `/task`, `/bugfix`.
- **Conflict-free shared history.** `.adlc/.gitattributes` gives `hot.md`, `decisions.md`, and `glossary.md` git's `merge=union` driver, so parallel branches' appends combine instead of conflicting — these are now committed for team visibility. Mutable `now.md` and per-developer pipeline state stay gitignored and are regenerated from each REQ's `pipeline-state.json`. `/init` proposes the split.

### Tool-neutral naming **[protocol]**

- Agent tiers renamed `haiku`/`sonnet`/`opus` → **`fast`/`balanced`/`deep`**. Vendor model IDs now live only in `manifest.tierToModel` (on Claude: fast→haiku, balanced→sonnet, deep→opus). No behavior change; override per project in `config.yml`.

### Update notes

- Run `node scripts/adlc.mjs sync --tool=all` once after updating to pick up the new skill and the cleaned install.
- In each existing project, run `/config migrate` to scaffold the new `req:` block, and let `/init`'s gitignore guidance (or a manual edit) adopt the new committed-log split. No existing vault data changes.

## [1.0.0]

- Initial release: tool-agnostic spec-driven pipeline (`spec → architect → implement → review → wrapup`) with a human gate at every phase boundary, the `.adlc/` knowledge vault, per-tool adapters for Claude Code / Cursor / Copilot / Codex / Gemini CLI, and orchestrators (`/proceed`, `/ship`, `/sprint`), slim pipelines (`/bugfix`, `/task`), and utilities (`/status`, `/recover`, `/config`, `/analyze`, `/optimize`).
