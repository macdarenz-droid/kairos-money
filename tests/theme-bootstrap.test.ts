import {describe, expect, it} from 'vitest';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {THEMES} from '../src/ui/design/theme-registry';

const html = readFileSync('index.html', 'utf8');
const script = /<script id="theme-bootstrap">([\s\S]*?)<\/script>/.exec(html)![1]!;

/** Runs the inline bootstrap against a stored value and the system's light/dark answer. */
function boot(stored: string | null | Error, systemLight: boolean) {
  const root = {dataset: {} as Record<string, string>}, meta = {content: ''};
  const storage = {getItem: () => { if (stored instanceof Error) throw stored; return stored; }};
  new Function('localStorage', 'matchMedia', 'document', script)(storage, () => ({matches: systemLight}),
    {documentElement: root, querySelector: () => meta});
  return {theme: root.dataset.theme, meta: meta.content};
}

describe('the theme bootstrap in index.html', () => {
  it('is the script the CSP hash allows', () => {
    const hash = createHash('sha256').update(script).digest('base64');
    expect(html).toContain(`'sha256-${hash}'`);
  });

  it('applies every known id, and follows the system for anything else', () => {
    const background = Object.fromEntries(THEMES.map(t => [t.id, t.background]));
    const stored = [...THEMES.map(t => t.id), 'system', null, 'bogus', '__proto__', 'toString', 'constructor'];
    let cases = 0;
    for (const value of stored) for (const light of [true, false]) {
      const expected = value !== null && value in background && Object.hasOwn(background, value) ? value : light ? 'light' : 'dark';
      expect(boot(value, light), `${value} / ${light}`).toEqual({theme: expected, meta: background[expected]});
      cases++;
    }
    expect(cases).toBe(22);
  });

  it('falls back to dark when storage throws', () => {
    expect(boot(new Error('blocked'), true).theme).toBe('dark');
  });

  it('paints every theme before the styles load', () => {
    for (const theme of THEMES.filter(t => t.id !== 'dark')) expect(html).toContain(`html[data-theme=${theme.id}]{background:${theme.background};`);
    expect(html).toContain(`html{background:${THEMES[0].background};`);
  });
});
