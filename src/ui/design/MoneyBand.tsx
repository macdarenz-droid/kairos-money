import {ArrowDown, ArrowUp} from 'lucide-react';
import {useQuery} from '@tanstack/react-query';
import {currency, format, money} from '../../core/money';
import {convert, rateBetween, type Rate as FxRate} from '../../core/fx';
import {displayRatio} from '../../intelligence/visuals';
import {changePercent, moneyBand, type BandBlock} from '../../intelligence/visuals/band';
import {localDay} from '../../ingest/reminders';
import {useSession} from '../session';
import {useDisplayCurrency} from '../currency';
import {Explain, Skeleton} from './primitives';

/**
 * The four figures a person opens a money app to see, before they have asked anything.
 *
 * Every screen in Kairos answered a question that had to be arrived at first — pick a currency, pick an
 * account, pick a period, read a chart. None of them answered the one that is already in someone's head
 * when they unlock their phone: how am I doing. So the home screen led with a list of today's entries and
 * a button, and the balance he had been asking about for weeks was two taps away on another tab.
 *
 * Four tiles, no controls, no question to answer first. What came in, what went out, what that left, and
 * what is actually in the accounts right now.
 *
 * WHY THE DELTAS CARRY NO COLOUR. The obvious version paints a rise green and a fall red, and it is wrong
 * twice over. It is wrong because in this app colour already means something exact — copper is money
 * arriving, blue is money leaving — and a third meaning spent on "good news" weakens the one place colour
 * is load-bearing. And it is wrong because the sign has no fixed morality: spending down is usually good,
 * income down is not, so one palette across four tiles would be telling the owner his pay cut was
 * excellent. The arrow states the direction. What it is worth is his to decide.
 *
 * Two tiles carry a shape and two do not, which is a distinction rather than an omission: money in and
 * money out are flows and have a history worth drawing. What that left is a subtraction of the two, and it
 * crosses zero, so drawing it needs a zero line and a scale shared across both signs — which is exactly
 * what the monthly balance chart on Insights already does properly, and duplicating it badly here would be
 * the worse of the two. Balance now has no honest history at all: the ledger stores what each account
 * holds, not what it held, and a line reconstructed backwards through partial imports would be a
 * confident-looking guess.
 */
export function MoneyBand() {
  const session = useSession(), today = localDay();

  const accounts = useQuery({queryKey: ['accounts'], queryFn: () => session.run(repo => repo.accounts()), enabled: session.state === 'ready'});
  const live = (accounts.data ?? []).filter(account => !account.archived_at);
  const codes = [...new Set(live.map(account => account.currency))];
  /**
   * THE CURRENCY HE CHOSE, like every other figure on this screen.
   *
   * This preferred AUD from the accounts while Surfaces and Intelligence followed the display setting,
   * so one screen gave two different answers to "whose money is this" — his was set to PHP and these
   * two carried on in AUD. Both now ask the one hook every screen shares, which is where that same
   * disagreement — an explicit choice honoured everywhere, an unset one inferred from the account
   * everywhere — actually lives, rather than each screen re-deciding it on its own.
   */
  const code = useDisplayCurrency();

  const balances = useQuery({queryKey: ['account-balances'], queryFn: () => session.run(repo => repo.accountBalances()), enabled: session.state === 'ready'});
  const stored = useQuery({queryKey: ['fx-rates'], enabled: session.state === 'ready',
    queryFn: () => session.run(repo => repo.rates())});
  const rates: FxRate[] = (stored.data ?? []).map(r => ({asOf: r.asOf, base: currency(r.base),
    quote: currency(r.quote), rateE8: BigInt(r.rateE8), source: r.source}));
  /**
   * THE SAME ANALYSIS THE REST OF THIS SCREEN IS ALREADY WAITING FOR.
   *
   * This asked for its own snapshot under its own key while Surfaces and Intelligence asked for an
   * analysis under theirs — and an analysis begins by building exactly this snapshot. Two full passes
   * over every transaction and every source row, for one screen. On a 20,000-row ledger the device
   * profile caught them side by side: 160 paged reads of the transactions and 158 of the provenance,
   * 7,985 ms between them, about half of it the same work done twice, and the Ledger tab queued behind
   * all of it because database access is serialised.
   *
   * One key, one pass. `analyse` returns the snapshot it built, which is what MoneyFlowCard already
   * reads, so nothing here needs its own copy.
   */
  const report = useQuery({
    queryKey: ['intelligence', today, code, {extra: '0', cut: 0}], staleTime: 0,
    queryFn: () => session.run(repo => repo.intelligence.analyse(today, code, '0', 0)),
    enabled: session.state === 'ready' && !!accounts.data,
  });
  const snapshot = report.data?.snapshot;

  if (session.state !== 'ready') return null;
  if (accounts.error || report.error) return <p role="alert">Your money summary could not be read.</p>;
  if (report.isPending || accounts.isPending || !snapshot) return <Skeleton label="Reading your money"/>;
  // Absent rather than empty. With no accounts every tile is a zero, and four zeros above the first-run
  // prompt is the app reporting on its own emptiness — the same thing the thirty-six roll-call was doing.
  // The screen that asks for an account should be the only thing on it.
  if (!live.length) return null;

  const band = moneyBand(snapshot, today);
  /**
   * "Balance now" READ PHP 0.00 WHILE HE HELD A$116, because this kept only the accounts whose currency
   * already matched the one being displayed. Everything else on the screen had been taught to convert;
   * this one line was still filtering, so the tiles reported what changed correctly and what he has as
   * nothing at all.
   *
   * A balance converts at TODAY'S rate — it is what is held now, and what it is worth now is today's
   * rate, which is the same rule the combined total states at length. An account no rate reaches is left
   * out rather than counted as nought, and Unconverted at the top of this screen names it.
   */
  /**
   * SAVINGS IS SEPARATE MONEY. "savings money doesnt mix in overall balance. its a separate money."
   *
   * A savings or investment account is money being KEPT; everything else is money to spend. They were one
   * figure, so the number he read as "what I can spend" included the money he had deliberately put out of
   * reach — the one mistake a money app must not make.
   */
  const kept = (account: {type?: string}) => account.type === 'savings' || account.type === 'investment';
  const total = (rows: typeof live) => rows.reduce((sum, account) => {
    const rate = rateBetween(rates, currency(account.currency), code, today);
    if (rate === null) return sum;
    const minor = BigInt(balances.data?.find(row => row.accountId === account.id)?.minor ?? 0n);
    return sum + convert(money(minor, currency(account.currency)), code, rate).minor;
  }, 0n);
  const spending = live.filter(account => !kept(account));
  const held = total(spending);
  // Plus what was set aside with no savings account to set it in, which the snapshot counted from the
  // ledger. A transfer into a tracked savings account is not in that figure, so nothing is doubled.
  const saved = total(live.filter(kept)) + BigInt(snapshot.savings?.asideMinor ?? '0');
  const show = (minor: string | bigint) => format(money(BigInt(minor), code));

  // A change is printed only against a block that had movement, so a first month never reports a rise
  // from nothing, and the change beside a figure is always a change in the same thing over the same
  // number of days.
  const change = (pick: (block: BandBlock) => string) =>
    band.comparable ? changePercent(pick(band.now), pick(band.before)) : null;

  return <section className="stack money-band-block" aria-label="Your money">
    <span className="heading-row">
      <h2>Your money</h2>
      <Explain title="Your money">
        <p>Thirty days up to {stamp(band.end)}, compared with the thirty before it. Equal lengths, so the
          comparison holds on any day of the month rather than only at the end of one.</p>
        <p>Money moved between your own accounts is left out of both figures. Moving it is not earning or
          spending it.</p>
        <p>Balance now is each account's opening balance plus everything recorded against it since —
          imported, approved or entered by hand. Savings and investment accounts are not in it: that
          money is in Savings, beside it.</p>
        <p>A change is shown only when the thirty days before had movement to compare against.</p>
      </Explain>
    </span>

    <div className="money-band">
      {/* HIS LAYOUT: "Short by" crossed out, "move up" beside Money out, "put savings display" in the
          space it left. What went out, what came in, what is being kept, what is left to spend. */}
      <Tile label="Money out" figure={show(band.now.outMinor)} percent={change(block => block.outMinor)}
        spark={band.trend ? {values: band.blocks.map(block => block.outMinor), tone: 'out'} : null}/>
      <Tile label="Money in" figure={show(band.now.inMinor)} percent={change(block => block.inMinor)}
        spark={band.trend ? {values: band.blocks.map(block => block.inMinor), tone: 'in'} : null}/>
      <Tile label="Savings" figure={show(saved)}/>
      <Tile label="Balance now" figure={show(held)}
        note={`${spending.length} ${spending.length === 1 ? 'account' : 'accounts'}`}/>
    </div>

    <p className="meta">{stamp(band.now.start)} – {stamp(band.end)}{codes.length > 1 ? ` · ${code}` : ''}
      {band.now.unconfirmed && <> · <span className="tag">Not on a statement yet</span></>}</p>

    {/* The shapes are the fast read; these are the numbers behind them, for anyone who wants them or
        cannot see a line. Closed, so it costs nothing on a screen meant to be glanced at. */}
  </section>;
}

const stamp = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString('en-AU', {day: 'numeric', month: 'short', timeZone: 'UTC'});

function Tile({label, figure, percent, note, spark}: {
  label: string; figure: string; percent?: string | null; note?: string;
  spark?: {values: string[]; tone: 'in' | 'out'} | null;
}) {
  return <div className="band-tile">
    <span className="band-label">{label}</span>
    <span className="band-figure">{figure}</span>
    {percent !== null && percent !== undefined ? <Change percent={percent}/> : note ? <span className="band-note">{note}</span> : null}
    {spark && <Spark values={spark.values} tone={spark.tone}/>}
  </div>;
}

/** Sign read off the string rather than parsed: the percent is already whole, and nothing here is money. */
function Change({percent}: {percent: string}) {
  if (percent === '0') return <span className="band-note">No change</span>;
  const down = percent.startsWith('-');
  return <span className="band-note">
    {down ? <ArrowDown size={12} aria-hidden="true"/> : <ArrowUp size={12} aria-hidden="true"/>}
    {down ? percent.slice(1) : percent}% on the 30 days before
  </span>;
}

/**
 * Six blocks as one line. Geometry comes from displayRatio, which returns dimensionless millionths of a
 * ceiling — the only sanctioned route from exact money to a coordinate, and the reason no amount here
 * becomes a float.
 */
function Spark({values, tone}: {values: readonly string[]; tone: 'in' | 'out'}) {
  const ceiling = values.reduce((highest, value) => BigInt(value) > highest ? BigInt(value) : highest, 0n);
  if (ceiling <= 0n) return null;
  // Inset top and bottom by the stroke's own width, so a block at the ceiling or at zero is drawn whole
  // rather than sliced in half by the edge of the box.
  const points = values.map((value, index) =>
    `${index * 100 / (values.length - 1)},${92 - Number(displayRatio(value, ceiling.toString())) * 84 / 1000000}`).join(' ');
  return <svg className="band-spark" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" focusable="false">
    <polyline className={`band-spark-line band-spark-${tone}`} points={points} vectorEffect="non-scaling-stroke"/>
  </svg>;
}
