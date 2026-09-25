import {expect, it} from 'vitest';
import {widgetFigures} from '../src/ui/widgets';
import type {Brain} from '../src/brain/types';

const day = (date: string, outMinor: string) => ({date, outMinor, evidence: []});
const brain = (status: 'ok' | 'not_yet', spendTodayMinor = '4210') => ({
  asOf: '2026-08-26',
  today: {status, spendTodayMinor},
  spending: {days: [day('2026-08-20', '0'), day('2026-08-21', '3000'), day('2026-08-22', '0'), day('2026-08-23', '12000'),
    day('2026-08-24', '1'), day('2026-08-25', '6000'), day('2026-08-26', '24000')]},
}) as unknown as Brain;

it('gives the widgets today’s figures, formatted, and seven bar heights against the busiest day', () => {
  expect(widgetFigures(brain('ok'), 'AUD')).toEqual({left: '$42.10', spent: '$240.00', bars: [0, 13, 0, 50, 4, 25, 100]});
});

it('leaves Left for today out until the brain has one', () => {
  expect(widgetFigures(brain('not_yet'), 'AUD').left).toBeNull();
});

it('draws a quiet week as seven empty bars', () => {
  const quiet = brain('ok');
  (quiet.spending as unknown as {days: unknown[]}).days = quiet.spending.days.map(d => ({...d, outMinor: '0'}));
  expect(widgetFigures(quiet, 'AUD')).toMatchObject({spent: '$0.00', bars: [0, 0, 0, 0, 0, 0, 0]});
});
