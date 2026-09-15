import {expect, it} from 'vitest';
import {parseNotice, type Notice} from '../src/ingest/notices/parse';
import {currency} from '../src/core/money';

const AUD = currency('AUD');
const at = Date.parse('2026-08-26T04:15:00Z');
const notice = (text: string, title = 'Synthetic Bank'): Notice => ({id: 'n1', source: 'app.synthetic.bank', title, text, postedAt: at});
const read = (text: string, code = AUD) => parseNotice(notice(text), code);

it('reads a purchase as money leaving, with the merchant the bank named', () => {
 const parsed = read('You spent $12.50 at WOOLWORTHS 1234 on your Everyday account.');
 expect(parsed.status).toBe('ok');
 if (parsed.status !== 'ok') return;
 expect(parsed.minor).toBe('-1250');
 expect(parsed.merchant).toBe('WOOLWORTHS 1234 on your Everyday account');
 expect(parsed.date).toBe('2026-08-26');
});

it('ignores the balance the bank tacks on, which is not a second transaction', () => {
 // The commonest format there is. Counting both amounts would make every notice ambiguous and skipped.
 const parsed = read('Purchase of $43.20 at CAFE MIKA. Available balance $1,204.55.');
 expect(parsed.status).toBe('ok');
 if (parsed.status !== 'ok') return;
 expect(parsed.minor).toBe('-4320');
 expect(parsed.merchant).toBe('CAFE MIKA');
});

it('reads money arriving as money arriving', () => {
 const parsed = read('Deposit received: $2,430.00 from ACME PAYROLL.');
 expect(parsed.status).toBe('ok');
 if (parsed.status !== 'ok') return;
 expect(parsed.minor).toBe('243000');
});

it('skips a notice that never says which way the money went', () => {
 expect(read('Your statement for August is ready. $1,204.55').status).toBe('skip');
});

it('skips a balance alert, which reports no transaction at all', () => {
 expect(read('Your available balance is $431.20.').status).toBe('skip');
});

it('skips a security code rather than filing it as money', () => {
 expect(read('Your one-time passcode is 4821. Never share it.').status).toBe('skip');
 expect(read('Verification code 918273 for your login.').status).toBe('skip');
});

it('skips when two amounts could each be the transaction', () => {
 const parsed = read('You paid $20.00 and $35.00 today.');
 expect(parsed.status).toBe('skip');
 if (parsed.status !== 'skip') return;
 expect(parsed.reason).toMatch(/more than one amount/);
});

it('never converts a foreign amount into the account currency', () => {
 // Guessing a rate would put a number in the ledger no statement will ever agree with.
 const parsed = read('You spent USD 40.00 at SYNTHETIC ONLINE.');
 expect(parsed.status).toBe('skip');
 if (parsed.status !== 'skip') return;
 expect(parsed.reason).toContain('USD');
});

it('keeps the bank’s own words when it names no merchant, rather than inventing one', () => {
 const parsed = read('Card payment of $9.90 processed.');
 expect(parsed.status).toBe('ok');
 if (parsed.status !== 'ok') return;
 expect(parsed.merchant).toContain('Card payment of $9.90');
 expect(parsed.description).toContain('Card payment of $9.90 processed.');
});

it('refuses a notice reporting no money moving', () => {
 expect(read('You spent $0.00 at SYNTHETIC.').status).toBe('skip');
});

it('reads cents exactly, with no floating point anywhere', () => {
 const parsed = read('You spent $1,234.56 at SYNTHETIC STORE.');
 expect(parsed.status).toBe('ok');
 if (parsed.status !== 'ok') return;
 expect(parsed.minor).toBe('-123456');
});

it('does not mistake a card suffix or a store number for a second amount', () => {
 // "WOOLWORTHS 1234" and "card ending 4321" are digits the bank never marked as money. Counting them
 // made every ordinary notice ambiguous and thrown away.
 const parsed = read('You spent $12.50 at BP 1234 with card ending 4321. Balance: $431.20');
 expect(parsed.status).toBe('ok');
 if (parsed.status !== 'ok') return;
 expect(parsed.minor).toBe('-1250');
});

it('reads a currency with no cents on its own terms', () => {
 const parsed = read('You spent JPY 1200 at SYNTHETIC RAMEN.', currency('JPY'));
 expect(parsed.status).toBe('ok');
 if (parsed.status !== 'ok') return;
 expect(parsed.minor).toBe('-1200');
});

it('treats a refund as money coming back, not as spending', () => {
 const parsed = read('Refund of $15.00 from SYNTHETIC STORE.');
 expect(parsed.status).toBe('ok');
 if (parsed.status !== 'ok') return;
 expect(parsed.minor).toBe('1500');
});

it('skips a notice that says money both left and arrived', () => {
 // Wording that reads both ways is not resolved by picking whichever verb came first.
 expect(read('Payment received and refund sent.').status).toBe('skip');
});

it('dates the row by when the phone showed it, which is all a notification knows', () => {
 const parsed = parseNotice({id: 'n', source: 's', title: 'Synthetic Bank',
  text: 'You spent $5.00 at SYNTHETIC.', postedAt: Date.parse('2026-01-02T22:30:00Z')}, AUD);
 expect(parsed.status).toBe('ok');
 if (parsed.status !== 'ok') return;
 expect(parsed.date).toBe('2026-01-02');
});

// The two notifications the owner's phone actually captured, verbatim. The first was recorded as money
// leaving because the outward word list contained "paid" and "been paid" matched it.
it('reads "you have been paid" as money arriving, not as spending', () => {
 const parsed = read("You've been paid $5.00 into your account ending 1898.", AUD);
 expect(parsed.status).toBe('ok');
 if (parsed.status !== 'ok') return;
 expect(parsed.minor).toBe('500');
});

it('reads "paid from account" as money leaving', () => {
 const parsed = read('$5.00 paid from account ending...2485. WITHDRAWAL-OSKO PAYMENT 1307861 M MASARATE', AUD);
 expect(parsed.status).toBe('ok');
 if (parsed.status !== 'ok') return;
 expect(parsed.minor).toBe('-500');
 // "account ending" names nobody. The bank's own words are kept instead of a label that says nothing.
 expect(parsed.merchant).not.toBe('account ending');
 expect(parsed.merchant).toContain('OSKO');
});
