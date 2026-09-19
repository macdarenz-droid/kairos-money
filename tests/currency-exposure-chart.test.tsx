// @vitest-environment jsdom
import {afterEach, expect, it} from 'vitest';
import {cleanup, render} from '@testing-library/react';
import {currencyExposure} from '../src/intelligence/visuals/exposure';
import {CurrencyExposure} from '../src/ui/design/CurrencyExposure';

afterEach(cleanup);

const held = () => currencyExposure([{code: 'AUD', minor: '750000'}, {code: 'PHP', minor: '200000'},
  {code: 'USD', minor: '50000'}])!;

/** A share is one whole, so the bands fill the width exactly and never overlap. */
it('lays the bands end to end across the full width', () => {
  const {container} = render(<CurrencyExposure exposure={held()} caption="Held"/>);
  const bars = [...container.querySelectorAll('rect')];
  expect(bars).toHaveLength(3);
  const edges = bars.map(bar => [Number(bar.getAttribute('x')), Number(bar.getAttribute('width'))] as const);
  expect(edges[0]![0]).toBe(0);
  expect(edges[1]![0]).toBe(edges[0]![0] + edges[0]![1]);
  expect(edges[2]![0]).toBe(edges[1]![0] + edges[1]![1]);
  expect(edges[2]![0] + edges[2]![1]).toBe(1000);
});

/** The largest band takes the strongest shade, so "stronger" means "bigger" here as everywhere else. */
it('shades by size, strongest first, and never by which currency it is', () => {
  const {container} = render(<CurrencyExposure exposure={held()} caption="Held"/>);
  expect([...container.querySelectorAll('rect')].map(bar => bar.getAttribute('class')))
    .toEqual(['flow-band level-5', 'flow-band level-4', 'flow-band level-3']);
});

/** Identity is never colour alone: every band is named in the key with its share. */
it('names every currency and its share in the key', () => {
  const {container} = render(<CurrencyExposure exposure={held()} caption="Held"/>);
  expect([...container.querySelectorAll('.currency-exposure-key li')].map(item => item.textContent))
    .toEqual(['AUD75%', 'PHP20%', 'USD5%']);
});

/** A code printed inside a sliver overruns its neighbour, so below a tenth it lives in the key only. */
it('labels a band on the bar only when the band can hold the text', () => {
  const {container} = render(<CurrencyExposure exposure={held()} caption="Held"/>);
  expect([...container.querySelectorAll('text')].map(label => label.textContent)).toEqual(['AUD', 'PHP']);
});
