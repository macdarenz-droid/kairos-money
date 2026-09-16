import {expect, it} from 'vitest';
import {readdirSync, readFileSync, statSync} from 'node:fs';
import {join} from 'node:path';

/**
 * Network access lives in exactly one module, and this is what keeps it there.
 *
 * Kairos shipped with INTERNET removed from its manifest, so "nothing leaves this device" was a property
 * of the build rather than a claim in a README. The owner decided some features should be online, which
 * is his to decide — but it costs the app that guarantee, and a guarantee that is merely dropped is worth
 * nothing. This replaces it with a narrower one that a machine can check: one file may reach the network,
 * and it is a file that cannot read the ledger.
 *
 * If this test fails, the question is not how to make it pass. It is why a second file wants the network,
 * and whether what it would send belongs to the person using the app.
 */
const ALLOWED = 'src/core/net/rates.ts';
/**
 * The global fetch, not any method that happens to share its name.
 *
 * The first version of this matched the word alone and flagged five files that never touch a network:
 * the ingest pipeline's Source interface declares `fetch(options)`, and FileSource implements it to read
 * a file off the device. Requiring the call to follow await, =, return or ( separates a call to the
 * global from both `source.fetch(...)` and a method declaration.
 */
const CALLS = /(?:await|=|return|\()\s*fetch\s*\(|\bnew\s+(?:XMLHttpRequest|WebSocket|EventSource)\b|\bsendBeacon\s*\(/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(entry => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry) ? [path] : [];
  });
}

it('reaches the network from one module only', () => {
  const offenders = sourceFiles('src')
    .filter(path => path.replace(/\\/g, '/') !== ALLOWED)
    .filter(path => {
      // Comments discuss the rule; only real calls break it.
      const code = readFileSync(path, 'utf8').split('\n')
        .filter(line => !/^\s*(?:\/\/|\*|\/\*)/.test(line)).join('\n');
      return CALLS.test(code);
    });
  expect(offenders).toEqual([]);
});

it('keeps the ledger out of the one module that can reach it', () => {
  const code = readFileSync(ALLOWED, 'utf8');
  // It imports currency codes and the rate scale. A database import here would mean a rate lookup could
  // carry a balance, a merchant or an account number to a stranger's server.
  for (const forbidden of ['/db/', 'repository', 'drizzle', 'schema', 'driver', 'ledger/', 'intelligence'])
    expect(code).not.toContain(forbidden);
});
