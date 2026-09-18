import {describe, expect, it} from 'vitest';
import {categorize} from '../src/ledger/rules';
import {categoryKind, editableCategories, expenseCategories, categoryNames} from '../src/ledger/categories';
import {normalizeRow} from '../src/ingest/normalize';
import type {ImportContext} from '../src/ingest/types';

/**
 * "i dont want to see uncategorised. expand our database in terms of categories... the app should be
 * able to tell what kind of category is this."
 *
 * Eleven categories and two keyword patterns meant almost nothing outside groceries and a salary deposit
 * was ever recognised — every fuel stop, every streaming bill, every pharmacy visit landed as
 * Uncategorised, not because the wording was unclear but because the app had never been taught the word.
 * This is the ordinary shape of a household's spending, generalised the way a written taxonomy would be
 * for any daily user's transactions, not one ledger's own history.
 */
const context: ImportContext = {accountId: 'a', accountKind: 'checking', currency: 'AUD',
  period: {start: '2026-01-01', end: '2026-01-31'}, dateOrder: 'DMY', decimal: '.', creditPositivePurchases: false};
const spend = (description: string, minor = '-10.00') =>
  normalizeRow({sourceId: '0', date: '2026-01-02', description, amount: minor, confidence: 10000}, context);

describe('reading a category from the wording a bank actually sends', () => {
  it.each([
    ['EFTPOS BP ROCKBANK 14/09', 'Transport'],
    ['DEBIT CARD PURCHASE WOOLWORTHS 1234', 'Groceries'],
    ['DEBIT CARD PURCHASE COLES EXPRESS', 'Groceries'],
    ['DEBIT CARD PURCHASE KFC MELTON', 'Eating out'],
    ['DEBIT CARD PURCHASE NETFLIX.COM', 'Subscriptions'],
    ['DEBIT CARD PURCHASE AMZNPRIMEA', 'Subscriptions'],
    ['DEBIT CARD PURCHASE OPENAI *CHATGPT', 'Software & apps'],
    ['DEBIT CARD PURCHASE AIRBNB * HMXYZ', 'Travel'],
    ['DEBIT CARD PURCHASE FLYSCOOT SINGAPORE', 'Travel'],
    ['DEBIT CARD PURCHASE BUNNINGS WAREHOUSE', 'Home & garden'],
    ['DEBIT CARD PURCHASE CHEMIST WAREHOUSE', 'Health'],
    ['DEBIT CARD PURCHASE PETBARN', 'Pets'],
    ["DEBIT CARD PURCHASE DAN MURPHY'S", 'Alcohol & tobacco'],
    ['AGL ELECTRICITY DIRECT DEBIT', 'Utilities'],
    ['TELSTRA MOBILE BILL', 'Utilities'],
    ['NRMA INSURANCE PREMIUM', 'Insurance'],
    ['ATO PAYMENT PLAN', 'Government & tax'],
    ['WITHDRAWAL AT HANDYBANK MELTON', 'Cash withdrawal'],
    ['ACCOUNT SERVICE FEE', 'Bank fees'],
    ['COMMSEC SHARE PURCHASE', 'Investing'],
    ['RED CROSS DONATION', 'Gifts & donations'],
    ['ANYTIME FITNESS DIRECT DEBIT', 'Fitness & wellbeing'],
    ['MECCA COSMETICA', 'Personal care'],
    ['JB HI-FI ONLINE', 'Electronics'],
    ['UBER TRIP HELP.UBER.COM', 'Transport'],
    ['UBER EATS ORDER', 'Eating out'],
  ])('reads %s as %s', (description, category) => {
    const result = categorize(spend(description), []);
    expect(result.category).toBe(category);
    // A brand match is a suggestion to confirm, never something applied silently — the same rule that
    // already governed the single grocery pattern this replaces.
    expect(result.confidence).toBeLessThan(9000);
  });

  it('reads salary landing as Salary, and a refund from a shop by the shop, not the wording of "paid"', () => {
    expect(categorize(spend('DEPOSIT-SALARY EMPLOYER PTY LTD', '2000.00'), []).category).toBe('Salary');
    expect(categorize(spend('WOOLWORTHS REFUND 1234', '10.00'), []).category).toBe('Groceries');
  });

  it('reads a government payment and investment income apart from an ordinary salary', () => {
    expect(categorize(spend('CENTRELINK PAYMENT', '500.00'), []).category).toBe('Government payment');
    expect(categorize(spend('INTEREST PAID', '2.50'), []).category).toBe('Interest & investment income');
  });

  it('invents nothing for a payment that names no business at all', () => {
    // "the app should able to tell exactly how the user spends" is not the same claim as inventing a
    // category for words that carry no signal at all — the same restraint a misread bank notice needs.
    const result = categorize(spend('WITHDRAWAL-OSKO PAYMENT 1234567'), []);
    expect(result.category).toBeNull();
    expect(result.confidence).toBe(0);
  });

  it('still gives a merchant category code priority over a brand-name guess', () => {
    expect(categorize(spend('SQ *UNKNOWN VENDOR'), [], {}, '5411').category).toBe('Groceries');
    expect(categorize(spend('SQ *UNKNOWN VENDOR'), [], {}, '5541').category).toBe('Transport');
    expect(categorize(spend('SQ *UNKNOWN VENDOR'), [], {}, '8011').category).toBe('Health');
  });
});

describe('the one table every write path reads instead of its own copy', () => {
  it('classifies essential, discretionary, income, savings and debt names correctly', () => {
    expect(categoryKind('Groceries')).toBe('essential');
    expect(categoryKind('Utilities')).toBe('essential');
    expect(categoryKind('Subscriptions')).toBe('discretionary');
    expect(categoryKind('Cash withdrawal')).toBe('discretionary');
    expect(categoryKind('Salary')).toBe('income');
    expect(categoryKind('Savings')).toBe('savings');
    expect(categoryKind('Debt repayment')).toBe('debt');
    expect(categoryKind('Transfer')).toBe('transfer');
  });

  it('defaults an unrecognised name to discretionary, never to a made-up kind', () => {
    expect(categoryKind('Something new')).toBe('discretionary');
  });

  it('offers far more than the original eleven, without duplicating Transfer into the editable list', () => {
    expect(editableCategories.length).toBeGreaterThan(30);
    expect(editableCategories).not.toContain('Transfer');
    expect(categoryNames).toContain('Transfer');
    expect(new Set(editableCategories).size).toBe(editableCategories.length);
  });

  it('keeps income-only categories off the expense form: a purchase cannot be a salary', () => {
    expect(expenseCategories).not.toContain('Salary');
    expect(expenseCategories).not.toContain('Refund');
    expect(expenseCategories).toContain('Groceries');
    expect(expenseCategories).toContain('Savings');
    expect(expenseCategories).toContain('Debt repayment');
  });
});
