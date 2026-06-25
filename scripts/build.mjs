#!/usr/bin/env node
/**
 * COMPATIBILITY ALIAS — forwards to `adlc.mjs build`.
 *
 * Adapter generation now lives in adlc.mjs. You normally never run this — `sync`
 * builds into the gitignored dist/ for you. Run it only to refresh the committed,
 * portable adapters/ snapshot:
 *
 *   node scripts/adlc.mjs build --tool=<...|all> [--mode=vendored|global] [--toolkit-path=<p>] [--out=<dir>]
 *
 * This shim keeps `node scripts/build.mjs ...` working; all flags pass through.
 */
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const r = spawnSync('node', [join(here, 'adlc.mjs'), 'build', ...process.argv.slice(2)], {
  stdio: 'inherit',
});
process.exit(r.status ?? 1);
