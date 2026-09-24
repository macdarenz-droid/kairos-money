import {describe, expect, it} from 'vitest';
import {readFileSync} from 'node:fs';
import {THEMES} from '../src/ui/design/theme-registry';

const java = (name: string) => readFileSync(`android/app/src/main/java/app/kairos/money/${name}.java`, 'utf8');
const appearance = java('Appearance');
const method = (name: string) => appearance.slice(appearance.search(new RegExp(`static \\w+ ${name}\\(`))).split('\n    }\n')[0]!;
const cases = (body: string) => [...body.matchAll(/case "(\w+)"/g)].map(m => m[1]);

describe('Appearance.java', () => {
  it('knows every theme id', () => {
    expect(cases(method('known')).sort()).toEqual(THEMES.map(t => t.id).sort());
  });
  it('treats exactly the light-scheme themes as light', () => {
    expect(cases(method('light')).sort()).toEqual(THEMES.filter(t => t.scheme === 'light').map(t => t.id).sort());
  });
  it('has a background colour for every theme', () => {
    const body = method('background');
    for (const theme of THEMES.filter(t => t.id !== 'dark')) expect(body).toContain(`case "${theme.id}": return R.color.kairos_bg_${theme.id};`);
    expect(body).toContain('default: return R.color.kairos_bg_dark;');
  });
  it('is the only list the plugin and activities use', () => {
    for (const name of ['KairosVaultPlugin', 'MainActivity', 'QuickAddActivity']) {
      const source = java(name);
      expect(source, name).not.toMatch(/equals\("(dark|light)"\)/);
      expect(source, name).not.toMatch(/#FCFCFD|#08090A/);
    }
    expect(java('KairosVaultPlugin')).toContain('Appearance.known(theme)');
  });
});
