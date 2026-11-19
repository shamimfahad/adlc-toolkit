#!/usr/bin/env node
// pack-chat — build the chat-home copy of the planning skill from the same module files /roadmap reads.
//
// /roadmap's method lives once, in core/skills/roadmap/<module>.md. In a repo, the skill reads those files
// at run time. A chat skill (claude.ai, Cowork) is one self-contained SKILL.md with no toolkit beside it, so
// this packs: the chat preamble (home-chat.md) + every module + the templates the modules name + the
// plan-challenger brief. Nothing is rewritten: a module's text is identical in both homes, and home-chat.md
// carries the table that says what a toolkit path or a gate marker means in chat.
//
//   node scripts/adlc.mjs pack-chat [--out=<dir>] [--check]
//
// --out    where to write (default: <toolkit>/dist/chat). The file lands at <out>/plan-with-adlc/SKILL.md.
// --check  write nothing; exit 1 if the packed file is not there (MISSING) or differs from what would be written (STALE).
//
// A module overridden in local/skills/roadmap/<module>.md is packed from there, same as the run-time rule.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const args = Object.fromEntries(
  process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => {
    const [k, ...v] = a.slice(2).split('=');
    return [k, v.length ? v.join('=') : true];
  }),
);

const NAME = 'plan-with-adlc';
const DESCRIPTION =
  'Plan a software project, feature or change for a team using the ADLC toolkit: turn an idea, PRD, RFQ, kickoff doc, estimate or backlog into a dependency roadmap, one minimal draft spec per REQ, and, when asked, an estimate and a playbook. Use when asked to plan, break down, roadmap or estimate work that is more than one REQ.';

// Order is the order the run uses them; resync last because it is its own entry point.
const MODULES = ['intake', 'frame', 'breakdown', 'estimate', 'roadmap', 'specs', 'playbook', 'registers', 'challenge', 'resync'];
const TEMPLATES = ['spec-template.md', 'roadmap-template.md', 'playbook-template.md', 'risk-register-template.md', 'gap-register-template.md'];

const fail = (msg) => {
  console.error(`pack-chat: ${msg}`);
  process.exit(1);
};
const read = (p) => {
  if (!existsSync(p)) fail(`missing ${p.replace(ROOT, '<toolkit>')}`);
  return readFileSync(p, 'utf8').replace(/\r\n/g, '\n').trimEnd();
};
/** local/ wins over core/, the same rule the generator and the run-time preflight use. */
const pick = (rel) => {
  const local = join(ROOT, 'local', rel);
  return existsSync(local) ? local : join(ROOT, 'core', rel);
};
const stripFrontmatter = (text) => text.replace(/^---\n[\s\S]*?\n---\n?/, '').trimStart();
/** Push every heading down by `by` levels so a packed file keeps one H1. Fenced blocks are left alone. */
const demote = (text, by) => {
  let fenced = false;
  return text
    .split('\n')
    .map((line) => {
      if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
      return !fenced && /^#{1,6} /.test(line) ? '#'.repeat(by) + line : line;
    })
    .join('\n');
};
const yamlStr = (s) => `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

const version = JSON.parse(read(join(ROOT, 'core/manifest.json'))).version;
const parts = [
  `---\nname: ${NAME}\ndescription: ${yamlStr(DESCRIPTION)}\n---`,
  `<!-- Packed from adlc-toolkit ${version} by scripts/pack-chat.mjs. Do not edit: change core/skills/roadmap/ and re-pack. -->`,
  read(pick('skills/roadmap/home-chat.md')),
  '# Modules',
];
for (const m of MODULES) parts.push(demote(read(pick(`skills/roadmap/${m}.md`)), 1));
parts.push('# Templates');
for (const t of TEMPLATES) {
  // A template is material to copy, so it is fenced whole; four backticks because templates contain ``` blocks.
  parts.push(`## ${t}\n\n\`\`\`\`markdown\n${read(join(ROOT, 'templates', t))}\n\`\`\`\``);
}
parts.push('# plan-challenger brief', demote(stripFrontmatter(read(pick('agents/plan-challenger.md'))), 1));

const packed = parts.join('\n\n') + '\n';
const outDir = join(resolve(ROOT, args.out && args.out !== true ? String(args.out) : 'dist/chat'), NAME);
const outFile = join(outDir, 'SKILL.md');

if (args.check) {
  const shown = outFile.replace(ROOT, '<toolkit>');
  if (!existsSync(outFile)) {
    console.error(`pack-chat: MISSING — ${shown} has not been built. Run without --check to build it.`);
    process.exit(1);
  }
  // Compare with line endings normalised: a pack checked out as CRLF is not stale.
  if (readFileSync(outFile, 'utf8').replace(/\r\n/g, '\n') !== packed) {
    console.error(`pack-chat: STALE — ${shown} differs from the modules. Re-run without --check.`);
    process.exit(1);
  }
  console.log(`pack-chat: up to date (${packed.split('\n').length} lines)`);
} else {
  mkdirSync(outDir, { recursive: true });
  writeFileSync(outFile, packed);
  console.log(`pack-chat: wrote ${outFile.replace(ROOT, '<toolkit>')}  (${MODULES.length} modules, ${TEMPLATES.length} templates, ${packed.split('\n').length} lines, ${Buffer.byteLength(packed)} bytes)`);
}
