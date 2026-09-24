import {currency} from '../src/core/money';
import {holdingsFrom} from '../src/ledger/holdings';
import type {BrainInputs} from '../src/brain/types';
import type {Snapshot} from '../src/intelligence/model';

/** Brain inputs for a mocked repo: the snapshot a test builds, plus holdings the way inputs() values them. */
export function brainInputs(snapshot: Snapshot, ledger: {accounts?: readonly {id: string; type?: string; currency: string; archived_at?: string | null}[];
  balances?: readonly {accountId: string; minor: string}[]; rates?: readonly {asOf: string; base: string; quote: string; rateE8: string | bigint; source: string}[]},
  over: Partial<BrainInputs> = {}): BrainInputs {
  const rates = (ledger.rates ?? []).map(r => ({...r, base: currency(r.base), quote: currency(r.quote), rateE8: BigInt(r.rateE8)}));
  return {snapshot, holdings: holdingsFrom(ledger.accounts ?? [], ledger.balances ?? [], rates, snapshot.currency, snapshot.asOf),
    bufferMinor: '0', debts: [], scheduled: [], cancelled: new Set(), dismissals: {}, ...over};
}
