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

// Two real notification SHAPES, with synthetic digits and a synthetic name — the wording is what these
// tests are about, and no real mask, reference or person's name belongs in this repository. The first
// was recorded as money leaving because the outward word list contained "paid" and "been paid" matched it.
it('reads "you have been paid" as money arriving, not as spending', () => {
 const parsed = read("You've been paid $5.00 into your account ending 4072.", AUD);
 expect(parsed.status).toBe('ok');
 if (parsed.status !== 'ok') return;
 expect(parsed.minor).toBe('500');
});

it('reads "paid from account" as money leaving', () => {
 const parsed = read('$5.00 paid from account ending...3319. WITHDRAWAL-OSKO PAYMENT 4471902 SYNTHETIC PAYEE', AUD);
 expect(parsed.status).toBe('ok');
 if (parsed.status !== 'ok') return;
 expect(parsed.minor).toBe('-500');
 // "account ending" names nobody. The bank's own words are kept instead of a label that says nothing.
 expect(parsed.merchant).not.toBe('account ending');
 expect(parsed.merchant).toContain('OSKO');
});

// ── Philippine e-wallet and bank alerts ────────────────────────────────────────────────────────────
// No bank in the Philippines offers this app an API, so a push notification is the only thing that
// arrives at the moment money moves. That makes these shapes load-bearing rather than nice to have.
// All synthetic: the wording is what is being tested, never anyone's real transaction.
const PHP = currency('PHP');
const peso = (text: string) => parseNotice({id: 'n1', source: 'com.synthetic.wallet', title: 'Synthetic Wallet', text, postedAt: at}, PHP);

it('reads a round peso amount written with the peso sign and no centavos', () => {
 // The commonest message a Philippine user gets, and the one that used to be dropped: ₱1,200 carries
 // no currency code, no symbol the app knew, and no cents, so it read as having no amount at all.
 const parsed = peso('You have received ₱1,200 from SYNTHETIC PAYEE.');
 expect(parsed.status).toBe('ok');
 if (parsed.status !== 'ok') return;
 expect(parsed.minor).toBe('120000');
});

it('reads the currency code whatever case the bank writes it in', () => {
 // PHP, Php and php are used interchangeably there. A case-sensitive list read only the first.
 for (const code of ['PHP', 'Php', 'php']) {
  const parsed = peso(`You have sent ${code} 500.00 to SYNTHETIC MERCHANT. Your new balance is ${code} 2,050.00.`);
  expect(parsed.status, code).toBe('ok');
  if (parsed.status !== 'ok') return;
  expect(parsed.minor, code).toBe('-50000');
 }
});

it('reads a wallet transfer that names no currency at all', () => {
 // The amount is marked only by its centavos. The trailing balance is still stripped, so this stays
 // one transaction rather than two.
 const parsed = peso('You have sent 2,950.00 GCASH to SYNTHETIC PAYEE. Your new balance is 2,050.00.');
 expect(parsed.status).toBe('ok');
 if (parsed.status !== 'ok') return;
 expect(parsed.minor).toBe('-295000');
});

it('does not mistake a three-letter word for a currency', () => {
 // The code is now matched as any standalone three-letter word and validated afterwards. "Ref" must
 // not turn a reference number into an amount — that would make the notice ambiguous and lose it.
 const parsed = peso('Purchase of ₱349.50 at SYNTHETIC GROCER. Ref 4471902');
 expect(parsed.status).toBe('ok');
 if (parsed.status !== 'ok') return;
 expect(parsed.minor).toBe('-34950');
});

it('still refuses a notification in a currency the account is not held in', () => {
 // Case-insensitivity must not become currency-blindness: a USD alert on a PHP account is skipped,
 // not converted and not assumed.
 const parsed = peso('You have sent usd 20.00 to SYNTHETIC MERCHANT.');
 expect(parsed.status).toBe('skip');
 if (parsed.status !== 'skip') return;
 expect(parsed.reason).toContain('USD');
});
