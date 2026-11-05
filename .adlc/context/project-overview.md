# Project Overview

The plain-English what-and-why of this project. Read by every Claude session so context doesn't have to be re-derived.

> **STATUS: needs verification** — synthesized from `README.md` on 2026-11-06. Review and edit; remove this banner when confirmed.

**Full source:** [README.md](../../README.md) — the repo README stays the public, canonical description. This page is the short version the pipeline loads on every run; when the two disagree, fix this page.

## What this is

ADLC Toolkit is a spec-driven pipeline that makes building with AI fast, accountable, and cumulative. ADLC (AI Development Life Cycle) turns an AI coding assistant into an engineering partner: the assistant drafts specs, architecture, code, and reviews; the human approves at every phase gate; and what the assistant learns about a codebase compounds in a knowledge vault (`.adlc/`) instead of evaporating with the session.

The protocol lives once, tool-agnostic, in `core/`. `scripts/adlc.mjs` generates a thin adapter stub per assistant into `adapters/<tool>/`; each stub points the assistant back at the real instructions in `core/`. Team customizations go in `local/`, which the generator resolves over `core/`.

## Who uses it

Developers and teams (solo or team) using Claude Code, Cursor, GitHub Copilot, OpenAI Codex, or Gemini CLI, on macOS, Windows, or Linux.

## Core flows

1. **Install / update** — clone the repo, run `node scripts/adlc.mjs sync --tool=<claude|cursor|copilot|codex|gemini|all>`; re-run to update.
2. **Run the pipeline in a project** — `/init` once, then spec → architect → implement → review → wrapup, each ending in a human gate. Chain with `proceed`, `autopilot`, or `sprint`; bugs use `bugfix`, small changes use `task`.
3. **Extend the engine** — edit `core/skills/*.md` / `core/agents/*.md` (or override in `local/`), then `sync`/`build` to regenerate `adapters/`.

## Stack snapshot

| Layer | Tech |
|---|---|
| Frontend | _(none)_ |
| Backend | Node.js ESM scripts — `scripts/adlc.mjs` (sync, build, hooks, vault generators), Claude Code hook scripts in `core/extras/claude/hooks/` |
| Database | _(none)_ |
| Auth | _(none)_ |
| Deploy | Distributed as a git repo (`https://github.com/shamimfahad/adlc-toolkit`); installed with `scripts/adlc.mjs sync` |

## What this project is **not**

_(not stated in README — fill in)_

## Constraints

From the README:

- `core/` is the upstream-owned engine; team customizations belong in `local/` so `git pull upstream` stays conflict-free.
- `adapters/` is generated from `core/` — never hand-edited; the pre-commit hook (`scripts/hooks/pre-commit`) rebuilds and stages it.
- Git invariants hold in every `git.mode`: only the REQ's feature branch, never a protected branch, no force-push / rewrite / branch delete / `gh pr create` / `gh pr merge` / `--no-verify`.

## Status

| Field | Value |
|---|---|
| Phase | initial \| building \| maintaining \| sunsetting |
| Started | 2026-11-06 |
| Repo | /Users/shamimfahad/code/adlc-toolkit |
