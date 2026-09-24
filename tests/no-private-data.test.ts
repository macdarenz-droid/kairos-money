import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Nothing real belongs in this repository.
 *
 * Fixtures were once copied verbatim from the owner's own phone, comments said so proudly, and his name
 * went to GitHub inside a test about notification wording. What those tests are actually about is SHAPE —
 * which words mean money leaving, how many digits a bank prints — and a shape does not need a real
 * person's name, account tail or payment reference to be tested.
 *
 * This is a lint, not a leak detector: it cannot recognise data it has not been told about. It pins the
 * two things that went wrong, so they cannot go wrong again in the same way.
 */
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}
const files = [...walk('src'), ...walk('tests')].filter(f => /\.(ts|tsx|css|json)$/.test(f) && !f.endsWith('no-private-data.test.ts'));
const contents = files.map(file => [file, readFileSync(file, 'utf8')] as const);

describe('no private data in the repository', () => {
  it('claims no fixture is verbatim from a real phone', () => {
    // The comment is the confession. A fixture described as verbatim from someone's phone IS their data,
    // whatever it happens to say.
    const offenders = contents
      .filter(([, text]) => /verbatim from (?:the owner|a real|his|her|their)|the owner's phone actually captured|copied from my (?:phone|statement|bank)/i.test(text))
      .map(([file]) => file);
    expect(offenders).toEqual([]);
  });

  it('carries no payee name inside a payment description', () => {
    // "OSKO PAYMENT 1307861 M MASARATE" — a reference followed by a person. The reference alone is fine;
    // the name after it is somebody.
    const offenders = contents
      .filter(([, text]) => /(?:OSKO|BPAY|PAYID|NPP)[A-Z ]*?\d{5,}\s+[A-Z]\s+[A-Z]{3,}/.test(text))
      .map(([file]) => file);
    expect(offenders).toEqual([]);
  });
});
