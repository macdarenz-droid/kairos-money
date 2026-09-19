import {expect, it} from 'vitest';
import {checkReceipt, describeReceipt} from '../src/ledger/receipt-check';
import {currency} from '../src/core/money';

const AUD = currency('AUD');
const docket = ['SYNTHETIC GROCER', '2 x Bread        7.00', 'Milk             3.20', 'SUBTOTAL        10.20',
  'GST              1.02', 'TOTAL           11.22', 'CARD            11.22'].join('\n');

it('reads the total off a receipt and agrees with the recorded amount', () => {
 // The reason to take the photo: the docket is the only record of what was paid at the till.
 const check = checkReceipt(docket, '-1122', AUD);
 expect(check.status).toBe('agrees');
 expect(describeReceipt(check, AUD)).toContain('$11.22');
 expect(describeReceipt(check, AUD)).toContain('matches');
});

it('says how far apart they are when they disagree', () => {
 const check = checkReceipt(docket, '-1500', AUD);
 expect(check).toMatchObject({status: 'differs', totalMinor: '1122', differenceMinor: '378'});
 // The explanations offered are the ones that actually cause this, not a suggestion the ledger is wrong.
 expect(describeReceipt(check, AUD)).toContain('$3.78');
 expect(describeReceipt(check, AUD)).toMatch(/tip|adjustment|wrong purchase/);
});

it('never mistakes a subtotal, a discount or the change for the total', () => {
 const tricky = ['SUBTOTAL        90.00', 'TOTAL SAVINGS    5.00', 'TOTAL           85.00',
   'CHANGE           15.00'].join('\n');
 expect(checkReceipt(tricky, '-8500', AUD)).toMatchObject({status: 'agrees', totalMinor: '8500'});
});

it('stays silent rather than guessing when no total is readable', () => {
 const check = checkReceipt('SYNTHETIC GROCER\nthank you for shopping', '-1122', AUD);
 expect(check.status).toBe('unreadable');
 if (check.status !== 'unreadable') return;
 expect(check.reason).toContain('No total');
});

it('stays silent when the photo shows two different totals', () => {
 // A guessed figure that contradicts a statement is worse than silence: it invites someone to "correct"
 // a ledger that was right.
 const check = checkReceipt('TOTAL  11.22\nTOTAL  19.90', '-1122', AUD);
 expect(check.status).toBe('unreadable');
 if (check.status !== 'unreadable') return;
 expect(check.reason).toContain('more than one total');
});

it('says nothing at all for a photo with no text', () => {
 expect(checkReceipt('   ', '-1122', AUD).status).toBe('unreadable');
});

it('reads a total written with a comma for cents', () => {
 expect(checkReceipt('TOTAL  1.234,56', '-123456', AUD)).toMatchObject({status: 'agrees'});
});

it('does not check a currency that has no cents', () => {
 const check = checkReceipt('TOTAL  1122', '-1122', currency('JPY'));
 expect(check.status).toBe('unreadable');
 if (check.status !== 'unreadable') return;
 expect(check.reason).toContain('JPY');
});
