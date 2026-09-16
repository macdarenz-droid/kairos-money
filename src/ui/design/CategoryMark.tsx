/**
 * A row's category, as a mark rather than another word in a line of words.
 *
 * Every comparable money app puts a coloured symbol at the head of each transaction row, and it is the
 * single thing that makes a list scannable instead of readable: the eye finds "the groceries ones" by
 * colour long before it reads six labels. Kairos rows were text all the way across.
 *
 * The letter is the category's initial rather than a drawn icon, because categories here are the owner's
 * own — a fixed icon set would have nothing to show for "Vet" or "Band gear" and would quietly fall back
 * to a generic blob on exactly the rows that matter to them.
 *
 * Colour is picked from the tile ramp the treemap already uses, so no new colour enters the app and every
 * step is one whose contrast against `--tile-ink` has already been measured. Same category, same colour,
 * every time and on every screen, because the mapping is a hash of the name and nothing else.
 */
export function CategoryMark({name}: {name: string}) {
  const label = name.trim() || 'Uncategorised';
  let sum = 0;
  for (let i = 0; i < label.length; i++) sum = (sum * 31 + label.charCodeAt(i)) % 100003;
  const step = (sum % 5) + 1;
  // Uncategorised is deliberately the flattest step: a row the app knows nothing about should not be the
  // brightest thing in the list.
  const level = label === 'Uncategorised' ? 1 : step;
  return <span className={`category-mark level-${level}`} aria-hidden="true">
    {[...label][0]!.toUpperCase()}
  </span>;
}

/**
 * A date a person reads at a glance: "Today", "Yesterday", then "15 Sep", and the year only once it stops
 * being obvious. The ledger showed "2026-09-15" on every row, which is precise, unambiguous and the
 * slowest possible way to answer "was this today".
 *
 * Exact dates are not lost — the transaction's own detail sheet and every table still carry the ISO date,
 * which is the place someone checking a statement against a row actually looks.
 */
export function relativeDay(date: string, today: string): string {
  if (date === today) return 'Today';
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return date;
  const yesterday = new Date(`${today}T00:00:00Z`);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  if (date === yesterday.toISOString().slice(0, 10)) return 'Yesterday';
  const sameYear = date.slice(0, 4) === today.slice(0, 4);
  return parsed.toLocaleDateString('en-AU',
    sameYear ? {day: 'numeric', month: 'short', timeZone: 'UTC'}
             : {day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC'});
}
