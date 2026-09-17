import {sharePercent, type CurrencyExposure as Exposure} from '../../intelligence/visuals/exposure';

/**
 * ONE BAR, READ LEFT TO RIGHT, LARGEST FIRST.
 *
 * The question is what share of the money sits in each currency, and a share is one bar rather than a
 * set of them: the parts are of one whole and the whole is the width.
 *
 * ONE HUE, ORDERED BY MAGNITUDE — never a colour per currency. A currency is not a category with a
 * personality, and the code is printed on or beside every band, so identity is never carried by colour
 * alone. Shade only repeats size, which helps place a narrow band without measuring it.
 *
 * THE LABEL ON THE BAND WEARS THE TILE'S OWN INK, not the page's text ink. A band is a block of colour
 * and the text sits ON it, so it needs the ink that ramp was paired with — page ink on a mid-blue band
 * came out barely legible, which is the one thing a direct label exists to avoid.
 *
 * LABELLED ON THE BAND ONLY WHERE THE BAND CAN HOLD IT. Below a tenth of the width the text would
 * overrun its neighbour, so it drops to the list underneath, which names every band with its percentage
 * whatever its size.
 */
const W = 1000, H = 96;
/** Display geometry only: these are dimensionless millionths, never money. */
const x = (millionths: string) => Number(millionths) * W / 1000000;
/** The largest band takes the strongest shade, as everywhere else in the app. */
const shade = (rank: number) => `flow-band level-${Math.max(5 - rank, 1)}`;
/** Narrower than this and a code printed inside it collides with the next band. */
const WIDE_ENOUGH = 100000n;

export function CurrencyExposure({exposure, caption}: {exposure: Exposure; caption: string}) {
  return <figure className="currency-exposure" aria-label={caption}>
    <svg viewBox={`0 0 ${W} ${H}`} className="currency-exposure-plot" role="img" aria-label={caption}>
      {exposure.bands.map(band => <rect key={band.code} x={x(band.left)} y="0" width={x(band.share)} height={H}
        className={shade(band.rank)}/>)}
      {exposure.bands.filter(band => BigInt(band.share) >= WIDE_ENOUGH).map(band =>
        <text key={band.code} x={x(band.left) + 16} y={H / 2} className="exposure-label">{band.code}</text>)}
    </svg>
    <ul className="currency-exposure-key">
      {exposure.bands.map(band => <li key={band.code}>
        <span className={`exposure-key-mark ${shade(band.rank)}`}/>{band.code}<span className="meta">{sharePercent(band.share)}</span>
      </li>)}
    </ul>
    <figcaption>{caption}</figcaption>
  </figure>;
}
