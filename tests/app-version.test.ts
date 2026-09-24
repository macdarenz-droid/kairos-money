import {expect, it} from 'vitest';
import {readFileSync} from 'node:fs';

it('shows the version from package.json, not a typed-in one', () => {
  expect(__KAIROS_VERSION__).toBe((JSON.parse(readFileSync('package.json', 'utf8')) as {version: string}).version);
  expect(readFileSync('src/ui/screens/Settings.tsx', 'utf8')).not.toMatch(/Tracker · \d+\.\d+\.\d+/);
});
