import {useQuery} from '@tanstack/react-query';
import {currency, format, money} from '../../core/money';
import {categoryAmounts} from '../../intelligence/allocations';
import {displayRatio} from '../../intelligence/visuals';
import {bandRows, moneyBand} from '../../intelligence/visuals/band';
import {localDay} from '../../ingest/reminders';
import {useSession} from '../session';

/** Five named slices and a remainder. Past six the ring is stripes and the legend is a list again. */
const SHOWN = 5;
/** Millionths of the ring left blank between slices, so two neighbours never read as one arc. */
const GAP = 6000n;

/**
 * Where the month's money went, as one ring.
 *
 * ONE HUE, NOT SIX. The usual version of this chart gives every category its own colour, and in this app
 * that would break the only rule the palette has: colour means an amount — copper arriving, blue leaving.
 * A third meaning spent on "this slice is groceries" costs the app the one place colour is load-bearing,
 * and it is unreadable to a red-green colourblind reader without a legend anyway. So the slices are steps
 * of the single blue ramp the treemap already uses, ordered largest to smallest, and identity comes from
 * the legend rather than from hue. Biggest is darkest: the ordering is the encoding.
 *
 * THIN, because the ring is not the point — the gap in it is. A fat donut reads as a pie with a hole and
 * invites comparing areas, which nobody does accurately. A hairline ring reads as proportion.
 *
 * The geometry is exact. pathLength normalises the circle to a million units, which is precisely what
 * displayRatio returns, so a slice's share becomes its arc length with no division and no float anywhere
 * between the ledger and the screen.
 */
export function SpendRing() {
  const session = useSession(), today = localDay();

  const accounts = useQuery({queryKey: ['accounts'], queryFn: () => session.run(repo => repo.accounts()), enabled: session.state === 'ready'});
  const live = (accounts.data ?? []).filter(account => !account.archived_at);
  const codes = [...new Set(live.map(account => account.currency))];
  const code = currency(codes.includes('AUD') ? 'AUD' : codes[0] ?? 'AUD');
  const snapshot = useQuery({
    queryKey: ['visual-snapshot', today, code], staleTime: 0,
    queryFn: () => session.run(repo => repo.intelligence.snapshot(today, code)),
    enabled: session.state === 'ready' && !!accounts.data,
  });

  if (session.state !== 'ready' || snapshot.isPending || accounts.isPending || snapshot.error || !live.length) return null;

  const band = moneyBand(snapshot.data, today);
  const totals = new Map<string, bigint>();
  for (const row of bandRows(snapshot.data)) {
    if (row.date < band.now.start || row.date > band.now.end || BigInt(row.minor) >= 0n) continue;
    for (const part of categoryAmounts(row)) {
      const name = part.category && part.category !== 'Uncategorised' ? part.category : 'Uncategorised';
      totals.set(name, (totals.get(name) ?? 0n) + BigInt(part.minor));
    }
  }

  const ordered = [...totals].filter(([, minor]) => minor > 0n).sort((a, b) => a[1] > b[1] ? -1 : 1);
  const spent = ordered.reduce((sum, [, minor]) => sum + minor, 0n);
  if (spent <= 0n) return null;

  const rest = ordered.slice(SHOWN).reduce((sum, [, minor]) => sum + minor, 0n);
  const slices = [...ordered.slice(0, SHOWN), ...(rest > 0n ? [['Everything else', rest] as const] : [])];

  // Each slice starts where the last one ended, so the ring is one continuous measure rather than six
  // arcs that happen to sit near each other.
  let offset = 0n;
  const arcs = slices.map(([name, minor], index) => {
    const share = BigInt(displayRatio(minor.toString(), spent.toString()));
    const start = offset;
    offset += share;
    return {name, minor, index, start, length: share > GAP ? share - GAP : share};
  });

  const show = (value: bigint) => format(money(value, code));

  return <figure className="ring">
    <figcaption className="list-heading"><h3>Where it went</h3><span className="meta">{show(spent)}</span></figcaption>

    <div className="ring-body">
      <svg className="ring-plot" viewBox="0 0 100 100" role="img"
        aria-label={`Spending by category. ${arcs.map(arc => `${arc.name} ${show(arc.minor)}`).join(', ')}.`}>
        {arcs.map(arc => <circle key={arc.name} className="ring-arc" cx="50" cy="50" r="42"
          pathLength="1000000" data-slice={arc.index}
          strokeDasharray={`${arc.length} ${1000000n - arc.length}`}
          strokeDashoffset={`${-arc.start}`}/>)}
      </svg>

      {/* Identity never comes from the ring alone: the legend names every slice it draws. */}
      <ul className="ring-legend">
        {arcs.map(arc => <li key={arc.name}>
          <span className="ring-key" data-slice={arc.index} aria-hidden="true"/>
          <span className="ring-name">{arc.name}</span>
          <span className="amount">{show(arc.minor)}</span>
        </li>)}
      </ul>
    </div>
  </figure>;
}
