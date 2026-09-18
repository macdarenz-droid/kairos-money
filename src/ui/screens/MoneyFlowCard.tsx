import {useQuery} from '@tanstack/react-query';
import {currency, format, money} from '../../core/money';
import {localDay} from '../../ingest/reminders';
import {moneyFlow, type Amount} from '../../intelligence/visuals/flow';
import type {Transaction} from '../../intelligence/model';
import {MoneyFlow} from '../design/MoneyFlow';
import {useSession} from '../session';
import {useDisplayCurrency} from '../currency';

const UNCATEGORISED = 'Uncategorised';

/** Settled money that actually moved in or out of the accounts on show, in the displayed currency. */
function moved(transactions: readonly Transaction[], accountIds: readonly string[], code: string, from: string) {
  return transactions.filter(t => t.status === 'settled' && !t.transfer && t.kind !== 'transfer'
    && t.currency === code && accountIds.includes(t.accountId) && t.date >= from);
}

function group(rows: readonly Transaction[], key: (t: Transaction) => string): Amount[] {
  const totals = new Map<string, bigint>();
  for (const t of rows) {
    const label = key(t) || UNCATEGORISED;
    const amount = BigInt(t.minor);
    totals.set(label, (totals.get(label) ?? 0n) + (amount < 0n ? -amount : amount));
  }
  return [...totals].map(([label, minor]) => ({id: label, label, minor: minor.toString()}));
}

/**
 * The month as one flow, on the screen you arrive at deliberately.
 *
 * Income is grouped by who paid it and spending by what it was for, which are the two questions each
 * side answers. Renders nothing when the month has neither — an empty flow diagram is not a picture of a
 * quiet month, it is a picture of nothing.
 */
export function MoneyFlowCard() {
  const session = useSession();
  const today = localDay();
  const code = useDisplayCurrency();
  const report = useQuery({
    queryKey: ['intelligence', today, code, {extra: '0', cut: 0}],
    queryFn: () => session.run(r => r.intelligence.analyse(today, code, '0', 0)),
    enabled: session.state === 'ready',
  });
  if (!report.data) return null;
  const snapshot = report.data.snapshot;
  const from = snapshot.asOf.slice(0, 7) + '-01';
  const rows = moved(snapshot.transactions, snapshot.accountIds, code, from);
  const flow = moneyFlow(
    group(rows.filter(t => BigInt(t.minor) > 0n), t => t.description.trim()),
    group(rows.filter(t => BigInt(t.minor) < 0n), t => t.category));
  if (!flow) return null;

  const amount = (minor: string) => format(money(BigInt(minor), currency(code)));
  const left = BigInt(flow.leftoverMinor);
  const caption = `${amount(flow.totalInMinor)} in · ${amount(flow.totalOutMinor)} out · `
    + (left >= 0n ? `${amount(left.toString())} left` : `${amount((-left).toString())} more than came in`);
  return <section className="stack">
    <div className="list-heading"><h2>Where it went</h2><span className="meta">{snapshot.asOf.slice(0, 7)}</span></div>
    <MoneyFlow flow={flow} caption={caption}/>
  </section>;
}
