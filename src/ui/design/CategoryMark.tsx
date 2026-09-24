import {
  ArrowLeftRight, Banknote, Bus, CircleDashed, Clapperboard, Coffee, CreditCard, Dumbbell, Fuel,
  GraduationCap, Home, Music, PawPrint, Pill, Plane, ShieldCheck, ShoppingBag, ShoppingCart,
  Stethoscope, Utensils, Wallet, Wifi, Zap,
} from 'lucide-react';
import {purchaseKind, type PurchaseKind} from './purchase-kind';

const GLYPH: Readonly<Record<PurchaseKind, typeof Home>> = {
  groceries: ShoppingCart, dining: Utensils, coffee: Coffee, transport: Bus, fuel: Fuel,
  shopping: ShoppingBag, entertainment: Clapperboard, music: Music, pharmacy: Pill,
  medical: Stethoscope, fitness: Dumbbell, utilities: Zap, telecom: Wifi, housing: Home,
  insurance: ShieldCheck, education: GraduationCap, pets: PawPrint, travel: Plane, cash: Banknote,
  transfer: ArrowLeftRight, income: Wallet, subscription: CreditCard, unknown: CircleDashed,
};

/**
 * What a row was, as a picture at the head of it.
 *
 * Every comparable money app marks each transaction this way, and it is the single thing that makes a
 * list scannable rather than readable: the eye finds the groceries by their shape long before it reads six
 * labels. Kairos rows were text all the way across.
 *
 * Monochrome, on one neutral chip, in the ink the rest of the screen uses. An earlier version tinted the
 * chip per category from the treemap ramp; with a real glyph that colour said the same thing twice and
 * made a quiet list busy. Colour in this app means an amount — copper in, blue out — and spending it on
 * decoration would weaken the one place it carries meaning.
 *
 * Unknown draws a dashed circle rather than a guess. A merchant the app has never seen is a real state,
 * and a confident wrong icon teaches the eye something false about a row.
 */
export function CategoryMark({description, category}: {description: string; category?: string | null}) {
  const kind = purchaseKind(description, category);
  const Glyph = GLYPH[kind];
  return <span className="category-mark" data-kind={kind} aria-hidden="true">
    <Glyph size={17} strokeWidth={1.6}/>
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
