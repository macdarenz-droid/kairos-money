import {describe, expect, it} from 'vitest';
import {purchaseKind} from '../src/ui/design/purchase-kind';

describe('what kind of purchase a bank description describes', () => {
  it('reads the merchant out of a real statement line', () => {
    expect(purchaseKind('WOOLWORTHS METRO 1284 SYDNEY')).toBe('groceries');
    expect(purchaseKind('BP CONNECT 2231 PARRAMATTA')).toBe('fuel');
    expect(purchaseKind('NETFLIX.COM')).toBe('entertainment');
    expect(purchaseKind('SPOTIFY P1A2B3C4D')).toBe('music');
    expect(purchaseKind('CHEMIST WAREHOUSE 412')).toBe('pharmacy');
    expect(purchaseKind('TERRY WHITE CHEMMART')).toBe('pharmacy');
    expect(purchaseKind('BUNNINGS WAREHOUSE 3301')).toBe('shopping');
    expect(purchaseKind('ANYTIME FITNESS MARRICKVILLE')).toBe('fitness');
    expect(purchaseKind('TELSTRA CORPORATION')).toBe('telecom');
  });

  it('settles the overlaps in the right order', () => {
    // "UBER EATS" is dinner; "UBER" alone is a ride.
    expect(purchaseKind('UBER *EATS SYDNEY')).toBe('dining');
    expect(purchaseKind('UBER *TRIP HELP.UBER.COM')).toBe('transport');
    // BPAY is a bill payment, not a service station, even though it starts with BP.
    expect(purchaseKind('BPAY BILL PAYMENT 12345')).toBe('transfer');
    expect(purchaseKind('BP SERVICE STATION')).toBe('fuel');
  });

  it('falls back to the category only when the words say nothing', () => {
    expect(purchaseKind('EFTPOS 4821993', 'Groceries')).toBe('groceries');
    expect(purchaseKind('POS AUTH 77213', 'Transport')).toBe('transport');
    // The merchant still wins when it is readable, whatever the category says.
    expect(purchaseKind('WOOLWORTHS METRO', 'Transport')).toBe('groceries');
  });

  it('says unknown rather than guessing', () => {
    // A merchant nobody has seen, with no category: a real state, not the nearest match.
    expect(purchaseKind('SQ *THE CORNER PLACE')).toBe('unknown');
    expect(purchaseKind('')).toBe('unknown');
    expect(purchaseKind('4821993', null)).toBe('unknown');
    expect(purchaseKind('ANYTHING', 'A category nobody defined')).toBe('unknown');
  });

  it('recognises the two lines from the owner\'s own phone', () => {
    expect(purchaseKind('WITHDRAWAL-OSKO PAYMENT 4471902')).toBe('transfer');
    expect(purchaseKind("CommBank You've been paid $3.00 into your account ending 407")).toBe('unknown');
  });

  it('is case-insensitive and does not match inside a longer word', () => {
    expect(purchaseKind('woolworths metro')).toBe('groceries');
    // "uni" must not fire on "union", nor "pet" on "petition".
    expect(purchaseKind('CREDIT UNION DEPOSIT')).toBe('unknown');
    expect(purchaseKind('PETITION SIGNING FEE')).toBe('unknown');
  });
});
