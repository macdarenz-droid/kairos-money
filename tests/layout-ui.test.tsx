// @vitest-environment jsdom
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {cleanup, fireEvent, render, screen} from '@testing-library/react';
import {readFileSync} from 'node:fs';
import {Button, Explain, Sheet, Switch} from '../src/ui/design/primitives';
import {BusyOverlay} from '../src/ui/design/KairosMark';

const order: string[] = [];
beforeEach(() => {
  order.length = 0;
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) { order.push(this.className); this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) { this.removeAttribute('open'); };
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const css = readFileSync('src/ui/design/styles.css', 'utf8');

describe('buttons', () => {
  it('draws primary filled, danger outlined in the negative colour and quiet as accent text', () => {
    render(<><Button variant="primary">Next</Button><Button>Other</Button><Button variant="danger">Remove</Button><Button variant="quiet">Cancel</Button></>);
    expect(screen.getByRole('button', {name: 'Next'}).className).toContain('button-primary');
    expect(screen.getByRole('button', {name: 'Other'}).className).toContain('button-default');
    expect(css).toMatch(/\.button-primary\{background:var\(--accent-solid\);[^}]*color:var\(--on-accent\)/);
    expect(css).toMatch(/\.button-danger\{border-color:var\(--negative-text\);color:var\(--negative-text\)\}/);
    expect(css).toMatch(/\.button-quiet\{border-color:transparent;background:transparent;color:var\(--accent-text\)\}/);
  });

  it('keeps one primary per screen or sheet in the import review', () => {
    const review = readFileSync('src/ui/screens/ImportWorkspace.tsx', 'utf8').split('\n').find(line => line.includes('Keep all ${sameFileLookalikes}'))!;
    expect(review).not.toContain('variant="primary"');
  });
});

describe('switch', () => {
  it('keeps aria-pressed and the setting as its name, and flips on press', () => {
    const flip = vi.fn();
    const {rerender} = render(<Switch label="Upcoming bills" on={false} onChange={flip}/>);
    const button = screen.getByRole('button', {name: 'Upcoming bills'});
    expect(button.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(button);
    expect(flip).toHaveBeenCalledOnce();
    rerender(<Switch label="Upcoming bills" on onChange={flip}/>);
    expect(screen.getByRole('button', {name: 'Upcoming bills'}).getAttribute('aria-pressed')).toBe('true');
  });

  it('keeps the whole switch a 44px touch target', () => {
    const rule = /\.switch \{([^}]*)\}/.exec(css)![1]!;
    expect(rule).toMatch(/width: 52px; height: 44px/);
  });
});

describe('layering', () => {
  it('opens a blocking wait as a modal dialog after, and so above, an open sheet', () => {
    const {rerender} = render(<Sheet title="Review import" onClose={() => undefined}>{null}</Sheet>);
    rerender(<Sheet title="Review import" onClose={() => undefined}><BusyOverlay message="Adding these transactions to your ledger…"/></Sheet>);
    expect(order).toEqual(['sheet', 'busy-dialog']);
    const wait = document.querySelector('dialog.busy-dialog')!;
    fireEvent(wait, new Event('cancel', {cancelable: true}));
    expect(wait.hasAttribute('open')).toBe(true);
  });

  it('opens Explain inline inside a sheet, and as a sheet elsewhere', () => {
    render(<Sheet title="Outer" onClose={() => undefined}><Explain title="Runway"><p>How long the money lasts.</p></Explain></Sheet>);
    fireEvent.click(screen.getByRole('button', {name: 'What Runway means'}));
    expect(document.querySelectorAll('dialog')).toHaveLength(1);
    expect(screen.getByText('How long the money lasts.').closest('.explain-inline')).toBeTruthy();
    expect(screen.getByRole('button', {name: 'What Runway means'}).getAttribute('aria-expanded')).toBe('true');
    cleanup();
    render(<Explain title="Runway"><p>How long the money lasts.</p></Explain>);
    fireEvent.click(screen.getByRole('button', {name: 'What Runway means'}));
    expect(screen.getByRole('dialog', {name: 'Runway'})).toBeTruthy();
  });

  it('uses the z-index scale and keeps room for a toast above the tab bar', () => {
    expect([...css.matchAll(/z-index:\s*([^;}]+)/g)].map(m => m[1]!.trim()).filter(v => !v.startsWith('var(--z-'))).toEqual([]);
    expect(css).toMatch(/\.form-actions\{display:flex;flex-wrap:wrap/);
  });
});
