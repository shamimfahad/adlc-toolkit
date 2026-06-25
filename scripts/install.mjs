#!/usr/bin/env node
/**
 * COMPATIBILITY ALIAS — forwards to `adlc.mjs sync`.
 *
 * The install AND update path is now a single idempotent reconciler:
 *
 *   node scripts/adlc.mjs sync --tool=<...|all> [--repo=<path>] [--pull] [--dry-run]
 *
 * Re-running `sync` is always safe — it reconciles the install against what the
 * toolkit currently ships, adding new skills/agents and pruning removed ones.
 * This shim keeps `node scripts/install.mjs ...` working; all flags pass through.
 */
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const r = spawnSync('node', [join(here, 'adlc.mjs'), 'sync', ...process.argv.slice(2)], {
  stdio: 'inherit',
});
process.exit(r.status ?? 1);
