#!/usr/bin/env node
/**
 * ADLC vault generators — the files nobody edits by hand.
 *
 *   node scripts/adlc.mjs lessons [--vault <dir>] [--check]   → knowledge/lessons.md
 *   node scripts/adlc.mjs index   [--vault <dir>] [--check]   → index.md + decisions.md
 *   node scripts/adlc.mjs vault-gen [--vault <dir>] [--check] → both
 *
 * (also runnable directly: node scripts/vault-gen.mjs <lessons|index|all> …)
 *
 * Why generated: index.md on a measured vault had grown to 216KB — three hand-kept
 * tables copying what the lesson files, the ADR headers and the REQ folders already
 * said, and drifting from them. A generated file is rebuilt whole from the sources'
 * HEADER LINES only (one pass, never a full read), so it cannot drift and costs the
 * same to rebuild at 30 lessons as at 3,000. The Claude adapter refuses a hand edit
 * to a file whose first lines carry `<!-- GENERATED`.
 *
 * Reads: knowledge/lessons/LESSON-*.md (new 9-row stub OR the legacy 40-line template),
 *        specs/**\/REQ-*.md and bugs/**\/BUG-*.md records, in-flight REQ/BUG folders,
 *        architecture/adr-*.md, knowledge/{concepts,components}/*.md.
 * Writes: knowledge/lessons.md, index.md, decisions.md. --check rewrites nothing and
 *        exits 1 when a file on disk differs from what would be generated.
 * No dependencies, no YAML. Silent about files it cannot parse (listed in the summary).
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, mkdirSync, unlinkSync } from 'node:fs';
import { join, relative, basename, dirname, resolve } from 'node:path';

const args = process.argv.slice(2);
const SUB = args[0] || 'all';
const flag = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const CHECK = args.includes('--check');
const MAX_DEPTH = 5;
const SEV_ORDER = ['critical', 'trap', 'guideline', 'nice-to-know'];

// ---- fs helpers ---------------------------------------------------------------
const norm = (p) => p.replace(/\\/g, '/');
function findVault(start) {
  let dir = resolve(start);
  for (let i = 0; i < 8; i++) {
    if (basename(dir) === '.adlc' && existsSync(dir)) return dir;
    if (existsSync(join(dir, '.adlc'))) return join(dir, '.adlc');
    const up = dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return null;
}
function walk(dir, pred, depth = 0, out = []) {
  if (depth > MAX_DEPTH || !existsSync(dir)) return out;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== '_archive' && e.name !== 'node_modules') walk(p, pred, depth + 1, out); }
    else if (pred(e.name, p)) out.push(p);
  }
  return out;
}
function head(file, n = 60) {
  try { return readFileSync(file, 'utf8').replace(/\r\n/g, '\n').split('\n').slice(0, n); } catch { return []; }
}
function row(lines, field) {
  const re = new RegExp(`^\\|\\s*${field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\|\\s*(.*?)\\s*\\|\\s*$`, 'i');
  for (const l of lines) { const m = l.match(re); if (m) return m[1].trim(); }
  return '';
}
function sectionFirstLine(lines, heading) {
  const i = lines.findIndex((l) => l.trim().toLowerCase() === heading.toLowerCase());
  if (i < 0) return '';
  for (let j = i + 1; j < lines.length; j++) {
    const t = lines[j].trim();
    if (!t) continue;
    if (t.startsWith('#')) return '';
    return t.replace(/^>\s*/, '').replace(/^[-*]\s*/, '');
  }
  return '';
}
function writeOut(file, text, report) {
  const rel = norm(relative(process.cwd(), file));
  const cur = existsSync(file) ? readFileSync(file, 'utf8').replace(/\r\n/g, '\n') : null;
  if (cur === text) { report.push(`${rel}: up to date`); return true; }
  if (CHECK) { report.push(`${rel}: STALE — rerun without --check`); return false; }
  writeFileSync(file, text);
  report.push(`${rel}: ${cur === null ? 'created' : 'rebuilt'}`);
  return true;
}
const idSortKey = (id) => {
  // legacy L-NNN first (numeric), then L-<WORK_ID>-<n> by work id then n
  const legacy = id.match(/^(?:LESSON|L)-(\d+)$/);
  if (legacy) return [0, '', Number(legacy[1])];
  const m = id.match(/^(?:LESSON|L)-(.+)-(\d+)$/);
  return m ? [1, m[1], Number(m[2])] : [2, id, 0];
};
const cmpKeys = (a, b) => { for (let i = 0; i < 3; i++) { if (a[i] < b[i]) return -1; if (a[i] > b[i]) return 1; } return 0; };

// ---- lessons ------------------------------------------------------------------
function parseLesson(file) {
  const lines = head(file, 80);
  if (!lines.length) return null;
  const h1 = lines.find((l) => l.startsWith('# ')) || '';
  const anchor = (h1.match(/\^(L-[A-Za-z0-9-]+)\s*$/) || [])[1];
  const title = h1.replace(/^#\s*/, '').replace(/\s*\^L-[A-Za-z0-9-]+\s*$/, '').trim();
  let id = row(lines, 'ID');
  if (!id && anchor) id = anchor.replace(/^L-/, 'LESSON-');
  if (!id) id = basename(file).replace(/\.md$/, '').replace(/^(LESSON-[A-Za-z0-9]+(?:-\d+)+)-.*$/, '$1');
  const short = id.replace(/^LESSON-/, 'L-');
  const supersededBanner = lines.slice(0, 6).find((l) => /STATUS:\s*superseded by/i.test(l));
  const supersededBy = supersededBanner ? ((supersededBanner.match(/(LESSON-[A-Za-z0-9-]+|L-[A-Za-z0-9-]+)/) || [])[1] || '?').replace(/^LESSON-/, 'L-') : null;
  const sev = (row(lines, 'Severity').split(/[\s|\\]/)[0] || 'guideline').toLowerCase();
  const tags = row(lines, 'Tags').split(/\s+[—-]\s+/)[0].split(',').map((s) => s.trim()).filter(Boolean).slice(0, 5).join(', ');
  const req = row(lines, 'REQ') || (id.match(/^LESSON-(.+)-\d+$/) || [])[1] || '';
  let lesson = row(lines, 'Lesson');
  let sawIn = row(lines, 'Saw in');
  const legacy = !lesson;
  if (legacy) {
    lesson = sectionFirstLine(lines, '## The lesson');
    sawIn = sectionFirstLine(lines, '## Saw it in').split(' — ')[0];
  }
  lesson = lesson.replace(/\s+/g, ' ').trim();
  if (lesson && !/[.!?]$/.test(lesson)) lesson += '.';
  const enforced = row(lines, 'Enforced by');
  const enforcedBy = enforced && !/^[—–-]?$/.test(enforced) && !/^_?\(?optional/i.test(enforced) ? enforced : '';
  // grown: anything after the first horizontal rule that follows the table (new) or any
  // filled optional section (legacy: a non-empty line under "### What happened")
  const all = readFileSync(file, 'utf8').replace(/\r\n/g, '\n').split('\n');
  let grown = false;
  if (!legacy) {
    const rule = all.findIndex((l, i) => i > 3 && /^---\s*$/.test(l));
    grown = rule >= 0 && all.slice(rule + 1).some((l) => l.trim() && !l.startsWith('#') && !/^_?\(?optional/i.test(l.trim()) && !/^## Grown on demand/.test(l));
  } else {
    grown = Boolean(sectionFirstLine(all, '### What happened')) && !/^One paragraph/.test(sectionFirstLine(all, '### What happened'));
  }
  return { file, id, short, title, sev, tags, req, lesson, sawIn, enforcedBy, grown, supersededBy, legacy };
}

function genLessons(vault, report) {
  const dir = join(vault, 'knowledge', 'lessons');
  const files = existsSync(dir) ? readdirSync(dir).filter((n) => /^LESSON-.*\.md$/.test(n)).map((n) => join(dir, n)) : [];
  const items = files.map(parseLesson).filter(Boolean);
  items.sort((a, b) => cmpKeys(idSortKey(a.short), idSortKey(b.short)));
  const skipped = items.filter((i) => !i.lesson && !i.supersededBy);
  const out = [];
  out.push('# Lessons');
  out.push('');
  out.push('<!-- GENERATED from knowledge/lessons/ by `node $TOOLKIT_PATH/scripts/adlc.mjs lessons` — do not hand-edit (the Claude adapter refuses the write).');
  out.push('     Rebuilt whole by /wrapup, /task, /bugfix, /recover, /config migrate|lessons. Carries merge=union; a duplicated');
  out.push('     line after a parallel merge is expected and the next rebuild clears it. Edit the lesson\'s own file, then rebuild. -->');
  out.push('');
  out.push('One line per lesson. **Grep this file; never read the folder.** Sorted: legacy `L-NNN` ascending, then `L-<WORK_ID>-<n>`.');
  out.push('Severity → read discipline: `critical` = always-read (injected at implementer dispatch) · `trap` = read when the path or tag matches · `guideline` / `nice-to-know` = reflector and grep only.');
  out.push('A line ending in `↗` has grown sections in its file. `enforced:` names the rule, sensor, or lint that now catches it — such lines are skipped by the knowledge hook and by the reflector\'s repeated-mistake pass.');
  out.push('');
  for (const i of items) {
    if (i.supersededBy) { out.push(`- ~~${i.short}~~ → superseded by ${i.supersededBy} ^${i.short}`); continue; }
    if (!i.lesson) continue;
    const parts = [`- **${i.short}**`, i.sev, i.tags ? `\`${i.tags}\`` : '`—`', i.lesson];
    let line = parts.join(' · ');
    line += ` — ${i.sawIn ? i.sawIn : '`—`'} · ${i.req || '—'}`;
    if (i.enforcedBy) line += ` · enforced: ${i.enforcedBy}`;
    if (i.grown) line += ' · ↗';
    line += ` ^${i.short}`;
    out.push(line);
  }
  out.push('');
  const counts = SEV_ORDER.map((s) => `${items.filter((i) => i.sev === s && !i.supersededBy).length} ${s}`).join(' · ');
  const summary = `lessons.md rebuilt: ${items.length} lessons · ${counts} · ${items.filter((i) => i.supersededBy).length} superseded · ${items.filter((i) => i.enforcedBy).length} enforced · ${items.filter((i) => i.grown).length} grown · ${items.filter((i) => i.legacy).length} legacy-format${skipped.length ? ` · ${skipped.length} unparsable: ${skipped.map((s) => basename(s.file)).join(', ')}` : ''}`;
  const ok = writeOut(join(vault, 'knowledge', 'lessons.md'), out.join('\n'), report);
  report.push(summary);
  return ok;
}

// ---- index + decisions --------------------------------------------------------
function parseRecord(file, vault) {
  const lines = head(file, 25);
  const h1 = lines.find((l) => l.startsWith('# ')) || '';
  const m = h1.match(/^#\s*((?:REQ|BUG|[A-Z]+)-[A-Za-z0-9-]+?)\s*[—-]\s*(.*)$/);
  const id = m ? m[1] : basename(file).replace(/\.md$/, '').replace(/^((?:REQ|BUG)-[A-Za-z0-9]+)-.*$/, '$1');
  return {
    id, title: m ? m[2].trim() : basename(file, '.md'),
    status: row(lines, 'Status').split(/\s*\\?\|\s*/)[0] || 'merged',
    kind: row(lines, 'Path kind').split(/\s*\\?\|\s*/)[0] || '',
    merged: (row(lines, 'Opened → merged').match(/→\s*(\S+)/) || [])[1] || '',
    path: norm(relative(vault, file)),
  };
}
function readState(folder) {
  try {
    const s = JSON.parse(readFileSync(join(folder, 'pipeline-state.json'), 'utf8'));
    return s.prState === 'merged' ? 'merged' : s.status === 'cancelled' ? 'cancelled' : `in flight — phase ${s.currentPhase ?? '?'}${s.gateState ? ` (${s.gateState})` : ''}`;
  } catch { return 'in flight'; }
}
function folderTitle(folder) {
  for (const f of ['requirement.md', 'bug.md']) {
    const h = head(join(folder, f), 5).find((l) => l.startsWith('# '));
    if (h) return h.replace(/^#\s*/, '').replace(/^(REQ|BUG)-[A-Za-z0-9-]+\s*[—:-]\s*/, '').trim();
  }
  return basename(folder).replace(/^(REQ|BUG)-[A-Za-z0-9]+-/, '').replace(/-/g, ' ');
}
function collectWork(vault, tree, prefix) {
  const root = join(vault, tree);
  const records = walk(root, (n) => new RegExp(`^${prefix}-.*\\.md$`).test(n)).map((f) => parseRecord(f, vault));
  const have = new Set(records.map((r) => r.id));
  const folders = [];
  (function w(dir, depth) {
    if (depth > 4 || !existsSync(dir)) return;
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (!e.isDirectory() || e.name === '_archive') continue;
      const p = join(dir, e.name);
      if (new RegExp(`^${prefix}-`).test(e.name)) {
        const id = (e.name.match(new RegExp(`^(${prefix}-[A-Za-z0-9]+(?:-\\d+)?)`)) || [])[1] || e.name;
        if (!have.has(id)) folders.push({ id, title: folderTitle(p), status: readState(p), kind: '', merged: '', path: norm(relative(vault, p)) + '/' });
      } else w(p, depth + 1);
    }
  })(root, 0);
  return [...records, ...folders].sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
}
function parseAdr(file, vault) {
  const lines = head(file, 20);
  const h1 = lines.find((l) => l.startsWith('# ')) || '';
  const m = h1.match(/^#\s*(ADR-[0-9A-Za-z]+)\s*[—-]\s*(.*?)(?:\s*\^ADR-[0-9A-Za-z]+)?\s*$/);
  const id = m ? m[1] : basename(file, '.md').replace(/^adr-([0-9A-Za-z]+).*/i, 'ADR-$1');
  const clean = (v) => v.replace(/\{\{.*?\}\}/g, '').replace(/^\(none\)$|^—$|^-$/, '').trim();
  return {
    id, title: m ? m[2].trim() : basename(file, '.md'),
    status: (row(lines, 'Status').split(/\s*\\?\|\s*/)[0] || 'proposed').toLowerCase(),
    decided: row(lines, 'Decided'), supersedes: clean(row(lines, 'Supersedes')), supersededBy: clean(row(lines, 'Superseded by')),
    path: norm(relative(vault, file)),
  };
}
function parsePage(file, vault) {
  const lines = head(file, 30);
  const h1 = (lines.find((l) => l.startsWith('# ')) || basename(file, '.md')).replace(/^#\s*/, '').trim();
  let summary = '';
  for (const l of lines) {
    const t = l.trim();
    if (!t || t.startsWith('#') || t.startsWith('|') || t.startsWith('>') || t.startsWith('<!--') || /STATUS:/.test(t)) continue;
    summary = t.replace(/\s+/g, ' ');
    break;
  }
  if (summary.length > 140) summary = summary.slice(0, 137).trimEnd() + '…';
  return { title: h1, summary, path: norm(relative(vault, file)) };
}
const link = (path, text) => `[[${path.replace(/\.md$/, '')}|${text}]]`;

function genIndex(vault, report) {
  const reqs = collectWork(vault, 'specs', 'REQ');
  const bugs = collectWork(vault, 'bugs', 'BUG');
  const adrs = walk(join(vault, 'architecture'), (n) => /^adr-.*\.md$/i.test(n)).map((f) => parseAdr(f, vault)).sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
  const concepts = walk(join(vault, 'knowledge', 'concepts'), (n) => n.endsWith('.md') && n !== 'README.md').map((f) => parsePage(f, vault)).sort((a, b) => a.title.localeCompare(b.title));
  const components = walk(join(vault, 'knowledge', 'components'), (n) => n.endsWith('.md') && n !== 'README.md').map((f) => parsePage(f, vault)).sort((a, b) => a.title.localeCompare(b.title));
  const existing = existsSync(join(vault, 'index.md')) ? readFileSync(join(vault, 'index.md'), 'utf8').replace(/\r\n/g, '\n') : '';
  const refIdx = existing.indexOf('\n## Reference');
  const reference = refIdx >= 0 ? existing.slice(refIdx + 1).trimEnd() : '## Reference\n\nCross-cutting reference docs that don\'t fit elsewhere. _This section is yours — the generator keeps it verbatim._\n\n| Page | What it covers |\n|---|---|\n| _(empty)_ | |';

  const o = [];
  o.push('# Vault Index');
  o.push('');
  o.push('<!-- GENERATED by `node $TOOLKIT_PATH/scripts/adlc.mjs index` from the records, ADR headers and knowledge pages — do not hand-edit (the Claude adapter refuses the write).');
  o.push('     Rebuilt whole by /wrapup, /task, /bugfix, /analyze, /recover, /config migrate. Everything below "## Reference" is kept verbatim — that section is hand-maintained. -->');
  o.push('');
  o.push('A table of contents for the vault, built from the files themselves. Each row links to its source; the summary is the source\'s own first line.');
  o.push('');
  o.push('## Work items');
  o.push('');
  o.push('`Path` is vault-relative: a **record** (`…/REQ-042-slug.md`, the one committed file per finished item) or an in-flight folder (`…/REQ-042-slug/`). Lessons: [[knowledge/lessons]] · Gotchas: [[knowledge/gotchas]] · Activity: [[hot]].');
  o.push('');
  o.push('| ID | Title | Status | Kind | Merged | Path |');
  o.push('|---|---|---|---|---|---|');
  const all = [...reqs, ...bugs];
  if (!all.length) o.push('| _(empty)_ | | | | | |');
  for (const w of all) o.push(`| ${w.id} | ${link(w.path.replace(/\/$/, ''), w.title)} | ${w.status} | ${w.kind || '—'} | ${w.merged || '—'} | \`${w.path}\` |`);
  o.push('');
  o.push('## ADRs');
  o.push('');
  o.push('Full ledger with supersession chains: [[decisions]].');
  o.push('');
  o.push('| ID | Title | Status | Decided |');
  o.push('|---|---|---|---|');
  if (!adrs.length) o.push('| _(empty)_ | | | |');
  for (const a of adrs) o.push(`| ${a.id} | ${link(a.path, a.title)} | ${a.status} | ${a.decided || '—'} |`);
  o.push('');
  o.push('## Concepts');
  o.push('');
  o.push('| Page | One-line summary |');
  o.push('|---|---|');
  if (!concepts.length) o.push('| _(empty)_ | |');
  for (const c of concepts) o.push(`| ${link(c.path, c.title)} | ${c.summary || '—'} |`);
  o.push('');
  o.push('## Components');
  o.push('');
  o.push('| Page | One-line summary |');
  o.push('|---|---|');
  if (!components.length) o.push('| _(empty)_ | |');
  for (const c of components) o.push(`| ${link(c.path, c.title)} | ${c.summary || '—'} |`);
  o.push('');
  o.push(reference);
  o.push('');
  const okIdx = writeOut(join(vault, 'index.md'), o.join('\n'), report);

  const d = [];
  d.push('# Decisions');
  d.push('');
  d.push('<!-- GENERATED by `node $TOOLKIT_PATH/scripts/adlc.mjs index` from architecture/adr-*.md headers — do not hand-edit. Change an ADR\'s own Status / Supersedes / Superseded by rows, then rebuild. -->');
  d.push('');
  d.push('One row per ADR. **accepted** is in effect; **superseded** points at its successor; **proposed** awaits a gate; **rejected** was considered and not pursued. The architect reads this file in full and opens an ADR only when its domain intersects the REQ.');
  d.push('');
  d.push('| ID | Title | Status | Decided | Supersedes | Superseded by |');
  d.push('|---|---|---|---|---|---|');
  if (!adrs.length) d.push('| _(empty)_ | | | | | |');
  for (const a of adrs) d.push(`| ${a.id} | ${link(a.path, a.title)} | ${a.status} | ${a.decided || '—'} | ${a.supersedes || '—'} | ${a.supersededBy || '—'} |`);
  d.push('');
  const okDec = writeOut(join(vault, 'decisions.md'), d.join('\n'), report);
  report.push(`index: ${reqs.length} REQ · ${bugs.length} BUG · ${adrs.length} ADR (${adrs.filter((a) => a.status === 'accepted').length} accepted) · ${concepts.length} concepts · ${components.length} components`);
  return okIdx && okDec;
}

// ---- rules: context/conventions-paths.md → <repo>/.claude/rules/adlc-<slug>.md ----
// Source of truth stays hand-written (conventions-paths.md: one `##` section per path family,
// each with a `<!-- paths: glob, glob -->` line right under its heading). The generated rule
// files are the Claude adapter's delivery mechanism — loaded natively when a matching file is
// read, injected by adlc-knowledge.mjs on the first Write in the family. Other adapters read
// conventions-paths.md directly (grep by path). Nothing here edits conventions.md.
const RULE_SOFT_BUDGET = 2 * 1024;
function slugify(s) { return s.toLowerCase().replace(/[`*_]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'section'; }
function parseConventionPaths(file) {
  if (!existsSync(file)) return [];
  const lines = readFileSync(file, 'utf8').replace(/\r\n/g, '\n').split('\n');
  const sections = [];
  let cur = null;
  for (const l of lines) {
    const h = l.match(/^##\s+(.+?)\s*$/);
    if (h) { if (cur) sections.push(cur); cur = { title: h[1], paths: [], body: [] }; continue; }
    if (!cur) continue;
    const pm = l.match(/^<!--\s*paths:\s*(.+?)\s*-->\s*$/);
    if (pm && !cur.paths.length && !cur.body.some((b) => b.trim())) { cur.paths = pm[1].split(',').map((p) => p.trim().replace(/^["']|["']$/g, '')).filter(Boolean); continue; }
    cur.body.push(l);
  }
  if (cur) sections.push(cur);
  return sections.map((s) => ({ ...s, slug: slugify(s.title), body: s.body.join('\n').replace(/^\n+|\n+$/g, '') }));
}
function genRules(vault, report) {
  const repo = dirname(vault);
  const src = join(vault, 'context', 'conventions-paths.md');
  const rulesDir = join(repo, '.claude', 'rules');
  const sections = parseConventionPaths(src);
  const withPaths = sections.filter((s) => s.paths.length);
  const without = sections.filter((s) => !s.paths.length);
  let ok = true;
  const written = new Set();
  for (const s of withPaths) {
    const name = `adlc-${s.slug}.md`;
    written.add(name);
    const out = [
      '---', 'paths:', ...s.paths.map((p) => `  - "${p}"`), '---',
      `<!-- GENERATED from .adlc/context/conventions-paths.md §${s.title} by \`node $TOOLKIT_PATH/scripts/adlc.mjs rules\` — do not hand-edit (the Claude adapter refuses the write). Edit the section there, then regenerate. -->`,
      `# ${s.title} — ${s.paths.join(', ')}`, '', s.body, '',
      `Rationale and the full rulebook: \`.adlc/context/conventions.md\`, \`.adlc/context/conventions-paths.md\` §${s.title}. Related knowledge: grep these paths in \`.adlc/knowledge/lessons.md\` and \`gotchas.md\`.`, '',
    ].join('\n');
    if (out.length > RULE_SOFT_BUDGET) report.push(`rules: §${s.title} is ${(out.length / 1024).toFixed(1)}KB (soft budget 2KB) — a long rule usually wants splitting by path`);
    if (!CHECK && !existsSync(rulesDir)) { try { mkdirSync(rulesDir, { recursive: true }); } catch {} }
    ok = writeOut(join(rulesDir, name), out, report) && ok;
  }
  // stale generated rules: adlc-*.md whose section no longer exists
  if (existsSync(rulesDir)) {
    for (const n of readdirSync(rulesDir)) {
      if (!/^adlc-.*\.md$/.test(n) || written.has(n)) continue;
      const text = readFileSync(join(rulesDir, n), 'utf8');
      if (!/<!--\s*GENERATED from \.adlc\/context\/conventions-paths\.md/.test(text)) continue;
      if (CHECK) { report.push(`${norm(relative(process.cwd(), join(rulesDir, n)))}: STALE — its section is gone; rerun without --check to remove`); ok = false; }
      else { try { unlinkSync(join(rulesDir, n)); report.push(`${norm(relative(process.cwd(), join(rulesDir, n)))}: removed (section gone)`); } catch (e) { report.push(`${n}: could not remove (${e.code}) — delete it by hand`); } }
    }
  }
  report.push(`rules: ${withPaths.length} generated (${withPaths.map((s) => s.slug).join(', ') || 'none'})${without.length ? ` · ${without.length} section(s) in conventions-paths.md have no <!-- paths: --> line and were skipped: ${without.map((s) => s.title).join(', ')}` : ''}${existsSync(src) ? '' : ' · no context/conventions-paths.md in this vault'}`);
  return ok;
}

// ---- main ---------------------------------------------------------------------
const vault = findVault(flag('--vault') || process.cwd());
if (!vault) { console.error('vault-gen: no .adlc/ found at or above ' + (flag('--vault') || process.cwd())); process.exit(2); }
const report = [];
let ok = true;
const KNOWN = ['lessons', 'index', 'rules', 'all', 'vault-gen'];
if (!KNOWN.includes(SUB)) { console.error('usage: vault-gen <lessons|index|rules|all> [--vault <dir>] [--check]'); process.exit(2); }
if (SUB === 'lessons' || SUB === 'all' || SUB === 'vault-gen') ok = genLessons(vault, report) && ok;
if (SUB === 'index' || SUB === 'all' || SUB === 'vault-gen') ok = genIndex(vault, report) && ok;
if (SUB === 'rules' || SUB === 'all' || SUB === 'vault-gen') ok = genRules(vault, report) && ok;
console.log(report.join('\n'));
process.exit(ok ? 0 : 1);
