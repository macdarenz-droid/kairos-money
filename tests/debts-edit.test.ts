import {expect, it} from 'vitest';
import {currency, parseDecimal} from '../src/core/money';
import {bpFromPercent, toDraft} from '../src/ui/screens/Debts';

const debt = {id: 'd', name: 'Card', accountId: null, currency: currency('AUD'), balanceMinor: '150000', annualRateBp: '1999',
  minimumMinor: '250000', dueDay: null, openedAt: '2026-01-01', targetDate: null, closedAt: null};

it('re-saves a debt of 1,000 or more without editing', () => {
  const draft = toDraft(debt as Parameters<typeof toDraft>[0]);
  expect(parseDecimal(draft.balance, currency('AUD')).minor).toBe(150000n);
  expect(parseDecimal(draft.minimum, currency('AUD')).minor).toBe(250000n);
});

it('takes the annual rate in percent', () => {
  expect(toDraft(debt as Parameters<typeof toDraft>[0]).rate).toBe('19.99');
  expect([bpFromPercent('19.99'), bpFromPercent('20'), bpFromPercent('0.5'), bpFromPercent(' 7.1 ')]).toEqual(['1999', '2000', '50', '710']);
  for (const bad of ['', '19.999', '-1', 'abc', '1,5']) expect(() => bpFromPercent(bad)).toThrow();
});
