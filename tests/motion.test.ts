import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * The stylesheet is where this app's motion lives, and CSS fails silently: a misspelt keyframe name,
 * a token that no longer exists, or a lost !important produce no error anywhere — just an animation
 * that quietly stops happening, or one that keeps happening for somebody who asked it not to.
 *
 * The last of those is the one that matters. Motion is a nausea trigger, so the off switch is checked
 * first and hardest.
 */
const css = readFileSync('src/ui/design/styles.css', 'utf8');

/** Values that may appear in an `animation:` shorthand without naming a @keyframes rule. */
const KEYWORDS = new Set(['none', 'linear', 'ease', 'ease-in', 'ease-out', 'ease-in-out', 'infinite',
  'normal', 'reverse', 'alternate', 'alternate-reverse', 'forwards', 'backwards', 'both', 'running',
  'paused', 'step-start', 'step-end', 'important', 'inherit', 'initial', 'unset']);

function declarations(property: string): string[] {
  return [...css.matchAll(new RegExp(`(?:^|[;{\\s])${property}\\s*:([^;}]+)`, 'g'))].map(m => m[1]!.trim());
}

describe('motion', () => {
  it('can be switched off wholesale by prefers-reduced-motion', () => {
    // Not "most animations". Every one, including any added after this test was written, which is the
    // only reason a blanket selector is worth the !important it costs.
    const block = /@media\s*\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)\s*\{\s*\*\s*,\s*\*::before\s*,\s*\*::after\s*\{([^}]*)\}/.exec(css);
    expect(block, 'a universal prefers-reduced-motion:reduce rule must exist').not.toBeNull();
    expect(block![1]).toMatch(/animation\s*:\s*none\s*!important/);
    expect(block![1]).toMatch(/transition\s*:\s*none\s*!important/);
    expect(block![1]).toMatch(/scroll-behavior\s*:\s*auto\s*!important/);
  });

  it('names only keyframes that exist', () => {
    const defined = new Set([...css.matchAll(/@keyframes\s+([\w-]+)/g)].map(m => m[1]!));
    const used = [...declarations('animation'), ...declarations('animation-name')]
      // Strip every function call and time so only bare identifiers are left to judge.
      .flatMap(value => value.replace(/[\w-]+\([^)]*\)/g, ' ').replace(/[\d.]+m?s\b/g, ' ').split(/\s+/))
      .map(token => token.replace(/!$/, '').trim())
      .filter(token => token && !KEYWORDS.has(token) && /^[a-zA-Z][\w-]*$/.test(token));
    expect([...new Set(used)].filter(name => !defined.has(name))).toEqual([]);
  });

  it('declares every motion token it uses, and uses every one it declares', () => {
    const declared = new Set([...css.matchAll(/(--(?:motion|ease)-[\w-]+)\s*:/g)].map(m => m[1]!));
    const referenced = new Set([...css.matchAll(/var\((--(?:motion|ease)-[\w-]+)\)/g)].map(m => m[1]!));
    expect([...referenced].filter(token => !declared.has(token)), 'referenced but never declared').toEqual([]);
    expect([...declared].filter(token => !referenced.has(token)), 'declared but never used').toEqual([]);
  });

  it('never lets the scroll timeline outrank the entrance cascade', () => {
    // `.screen .row` beats `.screen > *` on specificity, so a row that is a direct child of the screen
    // would arrive instantly while the heading above it was still fading in. Nested selectors only.
    const scroll = /@supports \(animation-timeline: view\(\)\)\s*\{[\s\S]*?\n\}/.exec(css);
    expect(scroll, 'the scroll-driven block must exist').not.toBeNull();
    for (const selector of scroll![0].matchAll(/\.screen\s+(?!>)[.\w-]+/g)) {
      expect.unreachable(`scroll-driven selector "${selector[0].trim()}" must be nested under .screen > *`);
    }
  });

  it('keeps the screen stagger bounded, so a long screen never waits on choreography', () => {
    // An uncapped nth-child stagger turns the ninth section into a stall. The last step must be an
    // open-ended nth-child(n+N) sharing one delay.
    expect(css).toMatch(/\.screen > \*:nth-child\(n\+\d+\)\s*\{\s*animation-delay:/);
    const steps = [...css.matchAll(/\.screen > \*:nth-child\((\d+)\)/g)].map(m => Number(m[1]));
    expect(Math.max(...steps)).toBeLessThanOrEqual(8);
  });
});
