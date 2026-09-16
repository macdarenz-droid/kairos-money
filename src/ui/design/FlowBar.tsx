import {format, money, type Currency} from '../../core/money';
import {displayRatio} from '../../intelligence/visuals';
import {Explain} from './primitives';

export type Flow = {inMinor: string; outMinor: string};

/**
 * Where the money went, as two lengths instead of three numbers.
 *
 * The usual version of this card is three separate bars — in, out, left — each scaled to itself, which
 * makes the three look equally important and answers nothing. Here both bars start at the same edge and
 * share one scale, so the only thing the eye has to do is compare two lengths. The gap between their ends
 * IS the answer, and it is drawn as the answer: a marked span, labelled once.
 *
 * One axis, one currency, no second scale. The hero line says which way the gap goes in three words.
 */
export function FlowBar({flow, code, label}: {flow: Flow; code: Currency; label: string}) {
  const received = BigInt(flow.inMinor) > 0n ? BigInt(flow.inMinor) : 0n;
  const spent = BigInt(flow.outMinor) > 0n ? BigInt(flow.outMinor) : 0n;
  const ceiling = received > spent ? received : spent;
  const kept = received - spent;
  const show = (value: bigint) => format(money(value, code));

  if (ceiling <= 0n) return <p className="meta">Nothing has moved in this selection yet.</p>;

  // Dimensionless geometry only: displayRatio returns signed millionths of the ceiling, never a currency
  // conversion, so no money ever becomes a float.
  const span = (value: bigint) => Number(displayRatio(value.toString(), ceiling.toString())) / 10000;
  const shortfall = kept < 0n;

  return <figure className="flow">
    <figcaption>
      <span className="heading-row"><h3>Money movement</h3>
        <Explain title="Money movement">
          <p>Both bars use the same scale, so their lengths can be compared directly. The marked span is the
            difference between them — what stayed, or what had to come from somewhere else.</p>
        </Explain>
      </span>
      <p className="hero-amount">{show(kept < 0n ? -kept : kept)}</p>
      <p>{shortfall ? 'more went out than came in' : 'stayed with you'} · {label}</p>
    </figcaption>

    <div className="flow-track">
      <div className="flow-line">
        <span className="flow-key flow-key-in" aria-hidden="true"/>
        <span className="flow-name">Came in</span>
        <span className="flow-bar"><span className="flow-fill flow-fill-in" style={{width: `${span(received)}%`}}/></span>
        <span className="amount">{show(received)}</span>
      </div>
      <div className="flow-line">
        <span className="flow-key flow-key-out" aria-hidden="true"/>
        <span className="flow-name">Went out</span>
        <span className="flow-bar"><span className="flow-fill flow-fill-out" style={{width: `${span(spent)}%`}}/></span>
        <span className="amount">{show(spent)}</span>
      </div>
      {/* The gap between the two bar ends, drawn where the eye already is. */}
      <div className="flow-line flow-gap-line">
        <span className="flow-key" aria-hidden="true"/>
        <span className="flow-name">{shortfall ? 'Short by' : 'Left over'}</span>
        <span className="flow-bar">
          <span className={`flow-gap ${shortfall ? 'flow-gap-short' : ''}`}
            style={{insetInlineStart: `${span(received < spent ? received : spent)}%`, width: `${span(kept < 0n ? -kept : kept)}%`}}/>
        </span>
        <span className="amount">{show(kept < 0n ? -kept : kept)}</span>
      </div>
    </div>
  </figure>;
}
