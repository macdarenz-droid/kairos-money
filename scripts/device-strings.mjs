/**
 * Every literal the Android device tests look for must still exist in the source.
 *
 * Run 135 went red because a label was renamed and a device assertion for the old wording was not.
 * Nothing local catches that: the web tests pass, tsc passes, lint passes, and the break only appears
 * twenty minutes later on an emulator. So it is checked here, before pushing.
 *
 *   node scripts/device-strings.mjs
 *
 * Composed strings — ones the app builds from a template, or that the test types in itself — cannot be
 * found by a literal search and are listed in COMPOSED below. Adding to that list is how you say "this
 * one is not a literal", so each entry carries the reason it is not.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const TESTS = 'android/app/src/androidTest';
const SOURCE = 'src';

/** Not literals in the source, with why. Every entry is a claim that can be checked by reading the code. */
const COMPOSED = new Map([
  [' · excluded', 'template: `${name} · ${excluded ? …}`'],
  [' · included', 'template: `${name} · ${excluded ? …}`'],
  ['2 files staged in one update', 'template: `${n} files staged in one update`'],
  ['3 new', 'template: `${n} new`'],
  ['3 transactions', 'template: `${n} transactions`'],
  ['20000 transactions', 'template: History renders `${total} transactions`'],
  ['Added 1 new transaction', 'template: `Added ${n} new transaction${n === 1 ? "" : "s"}`'],
  ['Added 2 new transactions', 'template: as above'],
  ['Amount 1', 'template: split rows are `Amount ${i}`'],
  ['Amount 2', 'template: as above'],
  ['Track cancellation · Synthetic fortnightly membership', 'template: `Track cancellation · ${bill.merchant}`; the test names the fixture rows'],
  ['Review 1 later payment', 'template: `Review ${n} later payment${…}`'],
  ['Synthetic everyday', 'synthetic fixture the test seeds itself'],
  ['That PIN did not match', 'thrown by the native Vault plugin, not the web source'],
  ['Type DELETE KAIROS to confirm', 'template: DeleteConfirm renders `Type ${phrase} to confirm`; Lock passes DELETE KAIROS'],
]);

function walk(dir) {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const PATTERNS = [
  /textContent(?:\.trim\(\))?\s*===?\s*'([^']+)'/g,
  /innerText\.includes\('([^']+)'\)/g,
  /startsWith\('([^']+)'\)/g,
  /\bclick\("([^"]+)"\)/g,
  /\bclickLabel\("([^"]+)"\)/g,
  /\binput\("([^"]+)"/g,
];

const wanted = new Set();
for (const file of walk(TESTS)) {
  const text = readFileSync(file, 'utf8');
  for (const pattern of PATTERNS) for (const [, value] of text.matchAll(pattern)) {
    // A Java expression spliced into the literal ("…" + theme + "…") leaves a fragment that was never
    // a whole string; there is nothing to look for.
    if (value && !value.includes('"+')) wanted.add(value);
  }
}

/**
 * One number in Java that has to agree with one list in TypeScript.
 *
 * The device test opens the real exported ZIP and counts its CSVs — one per ledger table. That count is
 * written as a literal in Java, and the table list lives in src/core/db/schema.ts, and nothing in either
 * language connects them. Adding `debts` to the export moved the list and left the literal behind, so
 * the emulator failed twenty minutes after a fully green local run. This is the cheapest possible bridge
 * between the two.
 */
function crossCheckExportedTableCount() {
  const schema = readFileSync('src/core/db/schema.ts', 'utf8');
  const declared = /export const tableNames = \[([^\]]*)\]/.exec(schema);
  if (!declared) return ['could not read tableNames from src/core/db/schema.ts'];
  const expected = (declared[1].match(/'[^']+'/g) ?? []).length;
  const problems = [];
  for (const file of walk(TESTS)) {
    for (const [, counted] of readFileSync(file, 'utf8').matchAll(/assertEquals\((\d+),\s*csvCount\)/g)) {
      if (Number(counted) !== expected) problems.push(
        `${file} expects ${counted} exported CSVs; src/core/db/schema.ts lists ${expected} tables`);
    }
  }
  return problems;
}

const source = walk(SOURCE).filter(f => /\.(tsx?|css)$/.test(f)).map(f => readFileSync(f, 'utf8')).join('\n');
const missing = [...wanted].filter(value => !source.includes(value) && !COMPOSED.has(value)).sort();
const stale = [...COMPOSED.keys()].filter(value => !wanted.has(value)).sort();

const mismatched = crossCheckExportedTableCount();
for (const problem of mismatched) console.error(`MISMATCH ${problem}`);
for (const value of missing) console.error(`MISSING  the device tests press or read ${JSON.stringify(value)}, and no source file contains it`);
for (const value of stale) console.error(`STALE    ${JSON.stringify(value)} is listed as composed but no device test looks for it any more`);
console.log(`${wanted.size} device strings checked, ${COMPOSED.size} composed, ${missing.length} missing, ${stale.length} stale, ${mismatched.length} count mismatches`);
if (missing.length || stale.length || mismatched.length) process.exit(1);
