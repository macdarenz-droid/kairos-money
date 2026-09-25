// @vitest-environment jsdom
import {afterEach, expect, it, vi} from 'vitest';
import {cleanup, render} from '@testing-library/react';

const day = (date: string, outMinor: string) => ({date, outMinor, evidence: []});
vi.mock('../src/ui/money', () => ({useBrain: () => ({data: {asOf: '2026-08-26', spending: {days: [
  day('2026-08-20', '0'), day('2026-08-21', '3000'), day('2026-08-22', '0'), day('2026-08-23', '12000'),
  day('2026-08-24', '1'), day('2026-08-25', '6000'), day('2026-08-26', '24000'),
]}}})}));
vi.mock('../src/ui/currency', () => ({useDisplayCurrency: () => 'AUD'}));
const {WeekStrip} = await import('../src/ui/screens/Today');

afterEach(cleanup);

it('draws each day of the brain week against the heaviest day, not flat', () => {
  render(<WeekStrip/>);
  const heights = [...document.querySelectorAll<HTMLElement>('.strip-bar')].map(n => n.style.height);
  // The brain reports money out as a positive amount; reading it as money in drew every bar at zero.
  expect(heights).toEqual(['0%', '12.5%', '0%', '50%', '4%', '25%', '100%']);
  expect(document.querySelector('.strip-plot')!.getAttribute('aria-label')).toContain('$240.00');
});
