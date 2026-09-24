import {displayRatio} from '../../intelligence/visuals';

/**
 * WHICH WAY THE MONEY GOES, BEFORE ANY DIGIT IS READ.
 *
 * A list of names and amounts cannot say which of them you owe and which owe you without a sign or a
 * word in front of every figure, and a minus sign is the easiest mark in typography to miss. Position
 * says it instead: a centre line, bars to the RIGHT for money coming back to you and to the LEFT for
 * money you are holding that is not yours.
 *
 * This is a true diverging encoding — two poles with a neutral middle — so it gets the diverging pair
 * this app already uses for money in and money out, warm against cool. Colour REINFORCES the side; the
 * side is the message, and the amount is written out beside it, so nobody is relying on hue.
 *
 * Every bar is scaled against the largest amount outstanding in either direction, so the longest bar in
 * the list is the one to deal with first, whether it is owed to you or by you.
 */
export function PersonBalance({netMinor, largestMinor}: {netMinor: string; largestMinor: string}) {
  const net = BigInt(netMinor);
  const toMe = net > 0n;
  const size = net < 0n ? -net : net;
  // Halving the scale is done by doubling the ceiling rather than by dividing the result: each side of
  // the centre is half the plot, and the full-length bar must land exactly on the edge.
  const half = displayRatio(size.toString(), (BigInt(largestMinor) * 2n).toString());
  // ZERO IS A PLACE HERE, NOT AN ABSENCE, and a diverging chart whose middle you cannot find is two
  // charts. Drawn inside the plot it was invisible: it always fell exactly on the end of a bar, where a
  // hairline reads as the bar's own edge. So it is a tick on the wrapper instead, standing PROUD of the
  // bar at both ends, which no bar can hide and no rounded corner clips.
  return <span className="person-plot">
    <svg viewBox="0 0 1000000 1" preserveAspectRatio="none" className="person-balance" aria-hidden="true">
      <rect x="0" y="0" width="1000000" height="1" className="person-track"/>
      <rect x={toMe ? '500000' : (500000 - Number(half)).toString()} y="0" width={half} height="1"
        className={toMe ? 'person-bar-to-me' : 'person-bar-by-me'}/>
    </svg>
  </span>;
}
