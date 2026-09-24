import { CoinStack } from './Motion';
import { useModal } from './primitives';

/**
 * The Kairos aperture, in motion.
 *
 * The brand mark is a disc split by a stepped diagonal into two interlocking halves. As a PNG it can only
 * be spun or faded as one lump, so a loading state built from it was never going to be more than a logo on
 * a turntable. Drawn as two paths behind one circular clip, the halves become separable and the mark can
 * do the one thing that means something here.
 *
 * WHAT MOVES IS THE STEP. Both halves translate together behind a fixed clip, so the staircase between
 * them sweeps across the disc: one half grows, the other shrinks, and the disc is never less than whole.
 * It does not rotate. A spinner says "time is passing"; this says "a balance is shifting", which is what
 * the app is doing while it runs — settling hundreds of rows into a ledger. The two halves are already the
 * app's two directions, so the motion is the product rather than decoration attached to it.
 *
 * Monochrome, in whatever ink the caller is using. Colour in this app means an amount, and a loading state
 * has no amount.
 */
export function KairosMark({size = 44, still = false}: {size?: number; still?: boolean}) {
  return <svg className="kairos-mark" width={size} height={size} viewBox="0 0 100 100"
    aria-hidden="true" focusable="false">
    <defs>
      <clipPath id="kairos-disc"><circle cx="50" cy="50" r="46"/></clipPath>
    </defs>
    {/* The halves separate PERPENDICULAR to the staircase, not sideways: offsetting them horizontally
        opened the vertical runs of the stair and left the horizontal ones welded shut, which drew a disc
        with slits in it rather than two interlocking pieces. They also extend well past the disc so the
        clip stays covered at either end of the sweep. */}
    {/* The clip and the movement MUST sit on different elements.
        With both on one group, the clip-path resolves in that group's own coordinate system — which the
        animation is moving — so the disc travelled along with its contents instead of holding still. What
        you saw was a circle sliding inside the SVG's rectangle, squaring off against the viewBox at each
        end of the sweep: "it moves like inside a box", and broken across the middle.
        Clipping outside, moving inside: the disc is now fixed and only the staircase behind it travels. */}
    <g clipPath="url(#kairos-disc)">
      <g className={still ? 'kairos-halves' : 'kairos-halves kairos-halves-moving'}>
        <path d="M-60 -20 H66 V38 H50 V62 H34 V120 H-60 Z" transform="translate(-4 -4)"/>
        <path d="M160 -20 H66 V38 H50 V62 H34 V120 H160 Z" transform="translate(4 4)"/>
      </g>
    </g>
  </svg>;
}

/**
 * A wait that covers the screen, because a wait nobody can see is not a wait at all.
 *
 * The previous version carried this class name and none of its behaviour: no positioning, so it rendered
 * as an ordinary block wherever it happened to sit — at the bottom of a sheet holding hundreds of rows,
 * which is thousands of pixels below anything the owner was looking at. He pressed Confirm and the app
 * appeared to do nothing.
 *
 * Fixed to the viewport rather than absolute inside the sheet: the sheet is its own scroll container, so
 * an absolutely positioned child would stretch to the scrolled content and centre itself in the middle of
 * all of it — off-screen again, and harder to notice being wrong.
 */
export function BusyOverlay({message}: {message: string}) {
  const ref = useModal();
  // A modal dialog in the top layer, so it covers an open sheet; Escape cannot dismiss a running job.
  return <dialog ref={ref} className="busy-dialog" aria-label={message} onCancel={event => event.preventDefault()}>
    <div className="busy-overlay" role="status" aria-live="polite" aria-atomic="true">
      <div className="busy-card"><CoinStack/><p>{message}</p></div>
    </div>
  </dialog>;
}
