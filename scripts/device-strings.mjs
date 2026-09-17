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
  ['9d', 'template: Freshness renders `${days}d`'],
  ['20 covered days', 'template: `${days} covered days`'],
  ['Added 1 new transaction', 'template: `Added ${n} new transaction${n === 1 ? "" : "s"}`'],
  ['Added 2 new transactions', 'template: as above'],
  ['Amount 1', 'template: split rows are `Amount ${i}`'],
  ['Amount 2', 'template: as above'],
  ['No cancellation records in USD.', 'template: `No cancellation records in ${code}.`'],
  ['Open settings', 'template: `Open ${tab === "You" ? "settings" : tab.toLowerCase()}`'],
  ['Record cancellation · synthetic fortnightly membership', 'template: `Record cancellation · ${name}`'],
  ['Review 1 later payment', 'template: `Review ${n} later payment${…}`'],
  ['Synthetic discretionary', 'synthetic fixture the test seeds itself'],
  ['Synthetic everyday', 'synthetic fixture the test seeds itself'],
  ['synthetic fortnightly membership:', 'synthetic fixture the test seeds itself'],
  ['That PIN did not match', 'thrown by the native Vault plugin, not the web source'],
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

const source = walk(SOURCE).filter(f => /\.(tsx?|css)$/.test(f)).map(f => readFileSync(f, 'utf8')).join('\n');
const missing = [...wanted].filter(value => !source.includes(value) && !COMPOSED.has(value)).sort();
const stale = [...COMPOSED.keys()].filter(value => !wanted.has(value)).sort();

for (const value of missing) console.error(`MISSING  the device tests press or read ${JSON.stringify(value)}, and no source file contains it`);
for (const value of stale) console.error(`STALE    ${JSON.stringify(value)} is listed as composed but no device test looks for it any more`);
console.log(`${wanted.size} device strings checked, ${COMPOSED.size} composed, ${missing.length} missing, ${stale.length} stale`);
if (missing.length || stale.length) process.exit(1);
