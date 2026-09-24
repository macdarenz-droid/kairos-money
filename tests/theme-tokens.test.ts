import {describe, expect, it} from 'vitest';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
// @ts-expect-error plain ESM script without types
import {generate, themes} from '../scripts/tokens.mjs';
import {THEMES} from '../src/ui/design/theme-registry';

type Theme = {id: string; scheme: string; colors: Record<string, string>};
const out = generate() as {css: string; report: string; registry: string; xml: string; failures: string[]};

describe('generated theme tokens', () => {
  it('match the committed files', () => {
    expect(readFileSync('src/ui/design/tokens.css', 'utf8')).toBe(out.css);
    expect(readFileSync('docs/CONTRAST.md', 'utf8')).toBe(out.report);
    expect(readFileSync('src/ui/design/theme-registry.ts', 'utf8')).toBe(out.registry);
    expect(readFileSync('android/app/src/main/res/values/kairos_theme_colors.xml', 'utf8')).toBe(out.xml);
  });

  it('leave dark and light byte-identical to before', () => {
    const prefix = out.css.slice(0, out.css.indexOf('[data-theme="black"]'));
    expect(createHash('sha256').update(prefix).digest('hex')).toBe('8f5d71b4cad4eaca1cd371ac49c48e89e1df173f03a464a6b399867f926f06cc');
  });

  it('give every theme one block of 41 properties with the scheme it declares', () => {
    for (const theme of themes as Theme[]) {
      const block = new RegExp(`\\[data-theme="${theme.id}"\\] \\{\\n([^}]*)\\}`).exec(out.css)![1]!;
      expect(block.match(/^ {2}--/gm)).toHaveLength(41);
      expect(block).toContain(`color-scheme: ${theme.scheme};`);
    }
    expect(out.css.match(/\[data-theme=/g)).toHaveLength(5);
  });

  it('pass every gated pair, and fail the build on a weak one', () => {
    expect(out.failures).toEqual([]);
    expect(out.report).not.toContain('| FAIL |');
    const broken = (themes as Theme[]).map(t => t.id === 'contrast' ? {...t, colors: {...t.colors, 'text-meta': '#777777'}} : t);
    expect((generate(broken) as {failures: string[]}).failures).toEqual(['contrast text-meta / surfaces']);
  });

  it('describe the same themes to the web and to Android', () => {
    const colours = [...out.xml.matchAll(/<color name="kairos_bg_(\w+)">(#[0-9A-F]{6})<\/color>/g)].map(m => [m[1], m[2]]);
    expect(colours).toEqual(THEMES.map(t => [t.id, t.background]));
    expect(THEMES.map(t => t.label)).toEqual(['Dark', 'Light', 'True black', 'Paper', 'High contrast']);
  });
});
