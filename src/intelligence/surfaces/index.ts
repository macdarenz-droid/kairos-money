import {abs, median, type Signal, type Snapshot, type Transaction} from '../model';

/**
 * WHAT DESERVES SCREEN SPACE RIGHT NOW.
 *
 * "those thing would just re appear if needed only, not always. if not needed hidden all time,
 *  the app will decide if its hidden or not."
 *
 * The rule this module exists to enforce: SILENCE IS THE DEFAULT, NOT THE EMPTY STATE. A home screen
 * with nothing on it is not a screen that failed to load — it is the app saying nothing needs you. An
 * app that always has something to show teaches you to stop reading it, and then it cannot tell you the
 * one thing that mattered.
 *
 * Every surface below is a pure function of the ledger that returns null far more often than not. None
 * of them is a place to put a chart that would be nice to have; a chart you always want lives in
 * Insights, where you go deliberately, not here.
 *
 * URGENCY is what it costs to miss this, never how interesting it is:
 *   3 — there is a date attached and it is close.
 *   2 — something changed that you did not choose.
 *   1 — a standing fact about your money that is worth a glance.
 *
 * At most three show at once. The fourth-most-urgent thing is, by definition, not urgent.
 */
export type Surface = {
  id: 'runway' | 'fixed-burden' | 'unusual-charge';
  urgency: 1 | 2 | 3;
  /** Exact values as decimal strings. Never a float, never a formatted string — the screen formats. */
  data: Record<string, string>;
  /** Transaction ids this rests on, so any claim can be opened and checked. */
  evidence: string[];
};

export const MAX_SURFACES = 3;

/** Below this many days of essential spending in reserve, runway is worth the space. */
export const RUNWAY_DAYS = 30n;
/** And below this it has a date attached rather than being a fact about the month. */
export const RUNWAY_URGENT_DAYS = 7n;
/** Fixed costs above this share of income is a standing fact worth one glance, not an alarm. */
export const FIXED_BURDEN_BP = 6000n;
/** A charge this many times the usual at the same merchant is worth naming. */
export const UNUSUAL_MULTIPLE = 3n;

function value(signals: Signal[], key: Signal['key']): bigint | null {
  const found = signals.find(s => s.key === key && s.status === 'ok' && s.value !== null);
  return found ? BigInt(found.value!) : null;
}

/**
 * A purchase far above what this merchant usually costs you.
 *
 * Compared against the SAME merchant rather than against all spending, because "large" is meaningless
 * across categories — rent is always large and a coffee never is. Four prior purchases are required
 * before any merchant has a "usual" at all, and the median is used rather than the mean so that one
 * previous big charge cannot quietly raise the bar and hide the next one.
 *
 * TWO TESTS, AND THE SECOND IS WHAT KEEPS IT QUIET. Being a multiple of its own usual makes a charge
 * unusual; it does not make it worth a word. Five times a small coffee is still a small coffee. So the
 * SURPRISE — what this charge cost over its usual — must also be at least one typical purchase in size,
 * measured across everything you spend. That scales itself: it needs no threshold in dollars or pesos,
 * and it means the same thing to someone whose typical purchase is 200 as to someone whose is 200,000.
 */
function unusual(s: Snapshot): Surface | null {
  const spending = s.transactions.filter(t =>
    t.currency === s.currency && s.accountIds.includes(t.accountId) &&
    !t.transfer && t.kind !== 'transfer' && BigInt(t.minor) < 0n);
  const byMerchant = new Map<string, Transaction[]>();
  for (const t of spending) {
    const name = t.description.trim().toLowerCase();
    if (name) byMerchant.set(name, [...(byMerchant.get(name) ?? []), t]);
  }
  const typical = median(spending.map(t => abs(BigInt(t.minor))));
  let worst: {row: Transaction; usual: bigint} | null = null;
  for (const rows of byMerchant.values()) {
    if (rows.length < 5) continue;
    const sorted = [...rows].sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
    const latest = sorted.at(-1)!;
    const usual = median(sorted.slice(0, -1).map(t => abs(BigInt(t.minor))));
    const amount = abs(BigInt(latest.minor));
    if (usual <= 0n || amount < usual * UNUSUAL_MULTIPLE || amount - usual < typical) continue;
    if (!worst || amount - usual > abs(BigInt(worst.row.minor)) - worst.usual) worst = {row: latest, usual};
  }
  if (!worst) return null;
  return {
    id: 'unusual-charge', urgency: 2, evidence: [worst.row.id],
    data: {merchant: worst.row.description.trim(), minor: abs(BigInt(worst.row.minor)).toString(),
      usualMinor: worst.usual.toString(), date: worst.row.date},
  };
}

export function surfaces(s: Snapshot, signals: Signal[]): Surface[] {
  const out: Surface[] = [];

  // buffer_days is days × 10000, because days are not whole. Truncating toward zero is deliberate:
  // 6.9 days of money left is 6 days you can count on.
  const buffer = value(signals, 'buffer_days');
  if (buffer !== null) {
    const days = buffer / 10000n;
    if (days < RUNWAY_DAYS) out.push({
      id: 'runway', urgency: days < RUNWAY_URGENT_DAYS ? 3 : 2, evidence: [],
      data: {days: days.toString(), ceiling: RUNWAY_DAYS.toString()},
    });
  }

  const fixed = value(signals, 'fixed_burden');
  if (fixed !== null && fixed >= FIXED_BURDEN_BP) out.push({
    id: 'fixed-burden', urgency: 1, evidence: [],
    data: {basisPoints: fixed.toString()},
  });

  const odd = unusual(s);
  if (odd) out.push(odd);

  // Ties break by id so the same ledger always produces the same screen. A home screen that reorders
  // itself between two identical openings is one you cannot learn the shape of.
  return out.sort((a, b) => b.urgency - a.urgency || a.id.localeCompare(b.id)).slice(0, MAX_SURFACES);
}
