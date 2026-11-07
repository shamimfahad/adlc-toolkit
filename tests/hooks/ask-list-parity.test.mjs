// The ask list (predict · summary · debrief: rounds the trail records beside a gate's, never a gate round)
// lives twice: ASK_DECISIONS in the trail hook, and ASK_DECISIONS in the flightdeck mod's model.ts (the mod
// cannot import the hook). This test reads both as text and fails when they differ. Run: node --test tests/hooks/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const HOOK = join(ROOT, 'core', 'extras', 'claude', 'hooks', 'adlc-trail.mjs');
const MOD = join(ROOT, 'core', 'extras', 'claude', 'mods', 'adlc-flightdeck', 'hooks');

/** The quoted words inside the first `[...]` after `const ASK_DECISIONS =`. */
function listOf(text, where) {
  const m = /const ASK_DECISIONS\s*=\s*[^[]*\[([^\]]*)\]/.exec(text);
  assert.ok(m, `no ASK_DECISIONS list in ${where}`);
  return [...m[1].matchAll(/['"]([^'"]+)['"]/g)].map((x) => x[1]).sort();
}

test('the hook and the mod name the same asks', () => {
  const hook = listOf(readFileSync(HOOK, 'utf8'), 'adlc-trail.mjs');
  const mod = listOf(readFileSync(join(MOD, 'model.ts'), 'utf8'), 'model.ts');
  assert.ok(hook.length > 0);
  assert.deepEqual(mod, hook);
});

test('the mod spells the ask list once: no other file filters rounds by an ask word', () => {
  for (const f of readdirSync(MOD).filter((n) => /\.tsx?$/.test(n))) {
    const text = readFileSync(join(MOD, f), 'utf8');
    assert.doesNotMatch(text, /decision !== '(?:predict|summary|debrief)'/, `${f} filters rounds by hand; use isGateRound from model.ts`);
  }
});
