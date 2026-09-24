import {ArrowDown, ArrowUp} from 'lucide-react';
import {useQuery} from '@tanstack/react-query';
import {format, money} from '../../core/money';
import {displayRatio} from '../../intelligence/visuals';
import {changePercent} from '../../intelligence/visuals/band';
import type {Band} from '../../brain/types';
import {useSession} from '../session';
import {useBrain} from '../money';
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
  const session = useSession();
  const accounts = useQuery({queryKey: ['accounts'], queryFn: () => session.run(repo => repo.accounts()), enabled: session.state === 'ready'});
  const live = (accounts.data ?? []).filter(account => !account.archived_at);
  const codes = [...new Set(live.map(account => account.currency))];
  const code = useDisplayCurrency();
  // One read of the ledger for the whole screen: the brain (ADR 0042).
  const brain = useBrain();

  if (session.state !== 'ready') return null;
  if (accounts.error || brain.error) return <p role="alert">Your money summary could not be read.</p>;
  if (brain.isPending || accounts.isPending || !brain.data) return <Skeleton label="Reading your money"/>;
  // Absent rather than empty: with no accounts the screen that asks for one should be the only thing on it.
  if (!live.length) return null;
  const missing: readonly string[] = brain.data.coverage.unconverted;
  if (live.every(account => missing.includes(account.currency))) return <section className="stack" aria-label="Your money">
    <h2>Your money</h2><p className="meta">No {missing.join(', ')} to {code} rate yet, so nothing to show.</p></section>;

  const band = brain.data.spending.band;
  const spending = live.filter(account => account.type !== 'savings' && account.type !== 'investment');
  const held = brain.data.today.holdings.spendableMinor;
  // Savings accounts plus money set aside with no savings account to set it in; nothing is doubled.
  const saved = brain.data.today.savingsPath.potMinor;
  const show = (minor: string | bigint) => format(money(BigInt(minor), code));

  // A change is printed only against a block that had movement, so a first month never reports a rise
  // from nothing, and the change beside a figure is always a change in the same thing over the same
  // number of days.
  const change = (pick: (block: Band['now']) => string) =>
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

    <p className="meta">{stamp(band.now.start)} – {stamp(band.end)}{codes.length > 1 ? ` · ${code}` : ''}{missing.length ? ` · Leaves out ${missing.join(', ')}` : ''}
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
