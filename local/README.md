# `local/` — your team's overlay

**This is where your customizations live. Nothing here is owned by upstream.**

`core/` is the engine — the upstream-maintained protocol. You don't edit it. Instead
you layer changes on top in `local/`, and the generator resolves `local/` **over**
`core/` when it builds your adapters. Because your changes never touch `core/`,
pulling a new upstream release merges cleanly — there's nothing to rebase around.

## The three moves

**Add a skill or agent of your own**

1. Write the protocol file: `local/skills/<name>.md` (or `local/agents/<name>.md`),
   same frontmatter shape as the files in `core/`.
2. Register it in `local/manifest.json` (see below).

**Override a core skill or agent** — tune a prompt to your team's taste

- Drop a file with the **same name** into `local/skills/` or `local/agents/`.
  The stub will point at your version instead of the core one. The core file is
  untouched, so upstream can keep improving it; you just shadow it.

**Disable a core skill or agent** — drop one you don't use

- Add an entry to `local/manifest.json` with `"disabled": true`:

  ```json
  { "name": "optimize", "disabled": true }
  ```

## `local/manifest.json`

A **partial** manifest, deep-merged over `core/manifest.json`. Only include what you
change. Entries are matched by `name`; your fields override the core entry's fields,
new names are added, and `"disabled": true` removes one.

```json
{
  "skills": [
    { "name": "deploy", "category": "pipeline", "gate": true, "agents": [],
      "summary": "Our internal deploy pipeline." },
    { "name": "optimize", "disabled": true }
  ],
  "agents": [
    { "name": "compliance-reviewer", "tier": "balanced", "readonly": true,
      "dispatchable": true, "role": "Checks changes against our compliance rules." }
  ]
}
```

## After editing

Re-run the reconciler — added stubs are linked, removed ones pruned, overrides
re-pointed:

```bash
node scripts/adlc.mjs sync --tool=all
```

## Updating from upstream

Because everything you changed is in `local/` (plus each repo's `.adlc/config.yml`),
you never edit `core/`. So:

```bash
git pull upstream main          # merges cleanly — you don't touch core/
node scripts/adlc.mjs sync --tool=all
```

The only thing to watch: if you've **overridden** a core skill and upstream later
improves that same core file, your override keeps shadowing it. Skim the upstream
CHANGELOG for changes to files you shadow, and fold anything worth keeping into your
`local/` copy.
