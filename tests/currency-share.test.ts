import {expect, it} from 'vitest';
import {currency} from '../src/core/money';
import {currencyShare} from '../src/ui/screens/CurrencyShare';

const rate = (base: string, quote: string, rateE8: bigint) => ({asOf: '2026-09-01', base: currency(base), quote: currency(quote), rateE8, source: 'test'});
const account = (id: string, code: string, archived: string | null = null) => ({id, currency: code, archived_at: archived});

it('says in one line what share of the money sits in each currency', () => {
  const line = currencyShare([account('a', 'AUD'), account('u', 'USD'), account('old', 'EUR', '2026-01-01')],
    [{accountId: 'a', minor: '10000'}, {accountId: 'u', minor: '10000'}, {accountId: 'old', minor: '99999'}],
    [rate('USD', 'AUD', 150000000n)], currency('AUD'), '2026-09-24');
  expect(line).toEqual({text: 'USD 60% · AUD 40%', missing: []});
});

it('names a currency it cannot convert, and says nothing with one currency', () => {
  expect(currencyShare([account('a', 'AUD'), account('p', 'PHP'), account('u', 'USD')],
    [{accountId: 'a', minor: '10000'}, {accountId: 'p', minor: '5000'}, {accountId: 'u', minor: '10000'}],
    [rate('USD', 'AUD', 100000000n)], currency('AUD'), '2026-09-24')).toEqual({text: 'AUD 50% · USD 50%', missing: ['PHP']});
  expect(currencyShare([account('a', 'AUD')], [{accountId: 'a', minor: '10000'}], [], currency('AUD'), '2026-09-24')).toBeNull();
});
