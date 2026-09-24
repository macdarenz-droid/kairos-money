import {currencyDigits,type Currency} from '../core/money';

/**
 * The original amount a statement line already states, read back out of the line.
 *
 * A foreign purchase usually arrives with its original amount written into the description — "USD 45.00",
 * "45.00 EUR", "JPY 3,200". That is the user's own imported evidence, so offering it saves retyping
 * something the app already holds. It is a proposal and nothing more: the currency, the amount and the
 * source note are all editable, and saving still goes through the same validation as a typed entry.
 *
 * This reads; it never infers. No conversion is attempted, no rate is applied, and a line that does not
 * plainly state a currency and an amount returns nothing rather than a guess. The posted amount on the
 * transaction is untouched and remains authoritative.
 */
export type OriginalAmountEvidence={currency:Currency;amount:string;source:string};

const codes=Object.keys(currencyDigits) as Currency[];
// "USD 45.00" / "USD45.00" and "45.00 USD" / "45.00USD". Thousands separators allowed, decimals optional.
const pattern=new RegExp(String.raw`(?:\b(${codes.join('|')})\s*([0-9][0-9,]*(?:\.[0-9]+)?)|\b([0-9][0-9,]*(?:\.[0-9]+)?)\s*(${codes.join('|')})\b)`,'i');

export function originalAmountEvidence(description:string,posted:Currency):OriginalAmountEvidence|null{
 const match=pattern.exec(description??'');
 if(!match)return null;
 const code=(match[1]??match[4])!.toUpperCase() as Currency;
 const amount=(match[2]??match[3])!.replace(/,/g,'');
 // An amount in the account's own currency is the posted amount restated, not an original amount.
 if(code===posted)return null;
 // More decimals than the currency has is not that currency's amount; refuse rather than round.
 const decimals=amount.includes('.')?amount.split('.')[1]!.length:0;
 if(decimals>currencyDigits[code])return null;
 if(!/[1-9]/.test(amount))return null;
 return {currency:code,amount,source:'Stated on the imported statement line: '+description.trim()};
}
