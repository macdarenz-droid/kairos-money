import {currency, format, money} from '../../core/money';
import {DueStrip} from './DueStrip';
import {useBrain} from '../money';
import {FixedFree, Runway} from './Runway';
import {useDisplayCurrency} from '../currency';

/**
 * The part of the home screen that is usually not there.
 *
 * Renders nothing at all when nothing is true — no heading, no empty state, no "you're all caught up"
 * card. A reassuring empty card is still a thing on the screen, and a thing on the screen that is always
 * there is a thing you stop seeing. The absence IS the message.
*/
export function Surfaces() {
  const code = useDisplayCurrency();
  const brain = useBrain();
  // Silence on error too: the screens that exist to show that evidence say so in their own words.
  const showing = brain.data?.attention ?? [];
  if (!showing.length) return null;

  const amount = (minor: string) => format(money(BigInt(minor), currency(code)));
  return <section className="surfaces" aria-label="Worth knowing now">
    {showing.map(item => {
      if (item.kind === 'runway') return <div className="surface-card" key={item.kind}>
        <Runway days={item.days} ceiling={item.ceilingDays}/>
      </div>;
      if (item.kind === 'fixed-burden') return <div className="surface-card" key={item.kind}>
        <FixedFree basisPoints={item.basisPoints}/>
      </div>;
      if (item.kind === 'debt-due') return <div className="surface-card" key={item.kind}>
        <p>{item.name} · {amount(item.minor)} due {item.date}</p>
      </div>;
      if (item.kind === 'due-soon') return <div className="surface-card" key={item.kind}>
        {/* The strip, not a list. Which day, and which side of payday, is the whole question. */}
        <DueStrip window={item.window} label={`${amount(item.minor)} due by ${item.date}`}/>
      </div>;
      return <div className="surface-card" key={item.kind}>
        {/* Stated, not judged: the app reports the comparison and stops talking. */}
        <p>{item.merchant} · {amount(item.minor)}</p>
        <p className="meta">usually {amount(item.usualMinor)}</p>
      </div>;
    })}
  </section>;
}
