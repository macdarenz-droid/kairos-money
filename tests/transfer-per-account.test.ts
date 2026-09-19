import {describe, expect, it} from 'vitest';
import {countsAsMovement} from '../src/intelligence/visuals/spending-patterns';

const transfer = {transfer: true, kind: 'transfer'};
const purchase = {transfer: false, kind: 'discretionary'};

describe('whether a transfer belongs in a picture of spending', () => {
  it('is not spending when every account is pooled', () => {
    // The owner moving $1 between his own banks did not spend a dollar, and the two legs cancel anyway.
    expect(countsAsMovement(transfer, 'all')).toBe(false);
    expect(countsAsMovement(purchase, 'all')).toBe(true);
  });

  it('is a real movement when one account is being looked at', () => {
    // "I transferred from account 1 to account 2, so it should be negative on 1 and positive on 2."
    // One leg, read from two sides: the same rule admits it for either account.
    expect(countsAsMovement(transfer, 'account-1')).toBe(true);
    expect(countsAsMovement(transfer, 'account-2')).toBe(true);
    expect(countsAsMovement(purchase, 'account-1')).toBe(true);
  });
});
