import {expect,it} from 'vitest';
import {originalAmountEvidence} from '../src/ledger/foreign-evidence';

it('reads an original amount stated before or after its currency',()=>{
 expect(originalAmountEvidence('AMAZON USD 45.00','AUD')).toMatchObject({currency:'USD',amount:'45.00'});
 expect(originalAmountEvidence('AMAZON 45.00 USD','AUD')).toMatchObject({currency:'USD',amount:'45.00'});
 expect(originalAmountEvidence('AMAZON USD45.00','AUD')).toMatchObject({currency:'USD',amount:'45.00'});
});

it('handles thousands separators and currencies with no decimal places',()=>{
 expect(originalAmountEvidence('HOTEL JPY 3,200','AUD')).toMatchObject({currency:'JPY',amount:'3200'});
 expect(originalAmountEvidence('RENT KWD 1.234','AUD')).toMatchObject({currency:'KWD',amount:'1.234'});
});

it('cites the line it read, so the source note is evidence rather than a claim',()=>{
 const found=originalAmountEvidence('  AMAZON MKTPLACE USD 45.00  ','AUD');
 expect(found!.source).toBe('Stated on the imported statement line: AMAZON MKTPLACE USD 45.00');
});

it('offers nothing when the line states no currency and amount',()=>{
 for(const line of ['WOOLWORTHS 1234','COFFEE','','TRANSFER TO SAVINGS','USD','45.00'])
  expect(originalAmountEvidence(line,'AUD')).toBeNull();
});

it('refuses an amount in the account currency, which is the posted amount restated',()=>{
 expect(originalAmountEvidence('AMAZON AUD 45.00','AUD')).toBeNull();
 expect(originalAmountEvidence('AMAZON AUD 45.00 USD 30.00','AUD')).toBeNull();
});

it('refuses more decimals than the currency has, rather than rounding someone money',()=>{
 // JPY has no minor unit; "JPY 3200.50" is not a JPY amount, so it is not offered as one.
 expect(originalAmountEvidence('HOTEL JPY 3200.50','AUD')).toBeNull();
 expect(originalAmountEvidence('THING USD 45.005','AUD')).toBeNull();
});

it('refuses a zero amount, which cannot be an original amount',()=>{
 expect(originalAmountEvidence('THING USD 0.00','AUD')).toBeNull();
 expect(originalAmountEvidence('THING USD 0','AUD')).toBeNull();
});

it('is case-insensitive about the code but reports it canonically',()=>{
 expect(originalAmountEvidence('amazon usd 45.00','AUD')).toMatchObject({currency:'USD',amount:'45.00'});
});
