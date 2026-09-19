import {useQuery} from '@tanstack/react-query';
import {Button} from './primitives';
import {useSession} from '../session';

/**
 * WHEN A FIGURE ON THIS SCREEN MIGHT BE COUNTING ONE PURCHASE TWICE.
 *
 * "all money is the same insight whatever pattern of a user, a manual and automatic type of data that
 * came inside the app is the same kind of data." It is, and it always was: every Insights figure is
 * computed from a snapshot that reads the transactions table with no filter on how a row got there.
 *
 * The honest consequence is this. Type in a coffee today, import the statement carrying the same coffee
 * next week, and until those two are matched the app holds both — because nothing has told it they are
 * one purchase, and guessing that they are would be inventing a fact. So the total is right for what the
 * app knows and wrong for what happened, and the only fix is to say so where the total is.
 *
 * It said so on the Today screen and nowhere else, which is the wrong place: the number that can be
 * double is on Insights. Shown only when there is something to match, and it names how many.
 */
export function DoubleCounted({onReview}: {onReview: () => void}) {
  const session = useSession();
  // Its own key, not ['manual'] — that one caches {entries, totals, unresolved} and this wants the count.
  // Nested, so anything invalidating ['manual'] still refreshes it.
  const unresolved = useQuery({queryKey: ['manual', 'unresolved'], enabled: session.state === 'ready',
    queryFn: () => session.run(repo => repo.manual.unresolved())});
  const count = Object.keys(unresolved.data ?? {}).length;
  if (!count) return null;
  return <div className="double-counted" role="status">
    <p>{count === 1 ? 'A transaction you recorded by hand looks like one already on a statement.'
      : `${count} transactions you recorded by hand look like ones already on a statement.`} Until they are
      matched, the figures below count those purchases twice.</p>
    <Button onClick={onReview}>Review in Ledger</Button>
  </div>;
}
