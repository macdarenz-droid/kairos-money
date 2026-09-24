import {expect, it} from 'vitest';
// @ts-expect-error: a plain .mjs script with no type declarations
import {needsAndroid} from '../scripts/android-needed.mjs';

it('skips the Android gate only when every change is a doc', () => {
  expect(needsAndroid(['ADR/0049-advisor-screens.md', 'docs/ARCHITECTURE.md', 'README.md'])).toBe(false);
  expect(needsAndroid(['docs/ARCHITECTURE.md', 'src/ui/App.tsx'])).toBe(true);
  // Generated docs are checked against the code, and evidence comes from the gate itself.
  for (const path of ['docs/SCHEMA.md', 'docs/CONTRAST.md', 'docs/evidence/native-run-status.json', 'android/README.md', 'package.json']) expect(needsAndroid([path])).toBe(true);
  expect(needsAndroid([])).toBe(true);
});
