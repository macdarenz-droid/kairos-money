import { covered, dates, day, type Key, type Signal, type Snapshot, type Window } from '../model';

const fingerprintAxes: { key: Key; label: string; ceiling: bigint }[] = [
  { key: 'spend_volatility', label: 'Spending variability', ceiling: 20000n },
  { key: 'impulse_ratio', label: 'Unplanned spending', ceiling: 10000n },
  { key: 'payday_decay', label: 'Post-pay spending', ceiling: 30000n },
  { key: 'category_concentration', label: 'Category concentration', ceiling: 10000n },
  { key: 'buffer_days', label: 'Buffer days', ceiling: 300000n },
];

/** Geometry inputs only: these display scales are not behavioural thresholds. */
export function moneyFingerprint(signals: Signal[], period: string) {
  if (!/^\d{4}-\d{2}$/.test(period)) throw new Error('Choose a calendar month.');
  day(period + '-01');
  const monthEnd = new Date(Date.UTC(Number(period.slice(0, 4)), Number(period.slice(5, 7)), 0)).toISOString().slice(0, 10);
  const selected = signals.filter(s => s.period === period);
  const axes = fingerprintAxes.map(axis => {
    const signal = selected.find(s => s.key === axis.key);
    const value = signal?.status === 'ok' && signal.value !== null ? BigInt(signal.value) : null;
    const clipped = value === null ? null : value < 0n ? 0n : value > axis.ceiling ? axis.ceiling : value;
    return { key: axis.key, label: axis.label, value: value?.toString() ?? null,
      radius: clipped === null ? null : (clipped * 10000n / axis.ceiling).toString(),
      evidence: [...(signal?.evidence ?? [])].sort(),
      reason: signal?.reason ?? 'No signal for this month.', unverified: signal?.unverified ?? false };
  });
  const monthDays = day(monthEnd) - day(period + '-01') + 1;
  const complete = axes.every(a => a.radius !== null) && selected.length > 0 &&
    selected.every(s => s.inputs.window.start === period + '-01' && s.inputs.window.end === monthEnd && s.inputs.coveredDays === monthDays);
  return { version: 1 as const, period, provisional: !complete, unverified: axes.some(a => a.unverified), axes };
}

/** A missing historical day and a stale live edge must never become zero spending. */
export function dailyCashflow(snapshot: Snapshot, window: Window) {
  const lastCovered = snapshot.coverage.filter(c => snapshot.accountIds.includes(c.accountId) && c.start <= snapshot.asOf)
    .map(c => c.end < snapshot.asOf ? c.end : snapshot.asOf).sort().at(-1);
  const amounts = new Map<string, { income: bigint; spending: bigint; evidence: string[] }>();
  for (const t of snapshot.transactions) {
    if (t.status !== 'settled' || t.transfer || t.kind === 'transfer' || t.currency !== snapshot.currency || !snapshot.accountIds.includes(t.accountId) || t.date > snapshot.asOf) continue;
    const row = amounts.get(t.date) ?? { income: 0n, spending: 0n, evidence: [] };
    const amount = BigInt(t.minor);
    if (amount >= 0n) row.income += amount; else row.spending -= amount;
    row.evidence.push(t.id); amounts.set(t.date, row);
  }
  return dates(window).map(date => {
    const state = date > snapshot.asOf ? 'future' : covered(snapshot, date) ? 'covered' : lastCovered && date > lastCovered ? 'stale' : 'gap';
    const row = amounts.get(date) ?? { income: 0n, spending: 0n, evidence: [] };
    return { date, state, income: state === 'covered' ? row.income.toString() : null,
      spending: state === 'covered' ? row.spending.toString() : null,
      net: state === 'covered' ? (row.income - row.spending).toString() : null,
      evidence: state === 'covered' ? row.evidence.sort() : [] };
  });
}
