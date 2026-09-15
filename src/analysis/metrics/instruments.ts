import type {MetricFn} from '../model';
import {build,spend,windowRows} from '../metric';

const magnitude=(minor:string)=>{const n=BigInt(minor);return n<0n?-n:n;};

/**
 * 21 — money sent in another currency.
 *
 * Reported from the original-currency evidence the user recorded, not inferred. A statement cannot
 * distinguish a remittance to family from a purchase made abroad, so `details.basis` states exactly what
 * this counts and the metric does not claim a purpose.
 */
export const remittances:MetricFn=(index,window)=>{
 const rows=windowRows(index,window).filter(t=>t.foreign&&BigInt(t.minor)<0n&&t.foreign.originalCurrency!==t.foreign.postedCurrency);
 const m=build(index,window,'remittances','minor units');
 if(!rows.length)return [m.none('No outbound payment in this window carries stored evidence in another currency.')];
 return [m.ok(spend(rows).toString(),{payments:String(rows.length),
  currencies:[...new Set(rows.map(t=>t.foreign!.originalCurrency))].sort().join(','),
  basis:'Outbound payments carrying stored original-currency evidence. Purpose is not inferred.'},rows.map(t=>t.id))];
};

/**
 * 22 — foreign exchange at the stored rate.
 *
 * The rate is the one implied by the amounts the user recorded, held as an exact integer ratio; it is
 * never recomputed from a market rate, and no rate is invented for a row that has no stored evidence.
 */
export const foreignExchange:MetricFn=(index,window)=>{
 const rows=windowRows(index,window).filter(t=>t.foreign),m=build(index,window,'foreign_exchange','minor units');
 if(!rows.length)return [m.none('No transaction in this window has stored original-currency evidence.')];
 const details:Record<string,string>={transactions:String(rows.length)};
 for(const t of rows.slice(0,10)){
  const f=t.foreign!;
  details['posted:'+t.id]=`${f.postedMinor} ${f.postedCurrency}`;
  details['original:'+t.id]=`${f.originalMinor} ${f.originalCurrency}`;
 }
 return [m.ok(spend(rows.filter(t=>BigInt(t.minor)<0n)).toString(),details,rows.map(t=>t.id))];
};

/** 23 — fees, including any the user marked as an overdraft fee. */
export const fees:MetricFn=(index,window)=>{
 const rows=windowRows(index,window).filter(t=>t.overdraftFee===true||/\bfee\b|\bcharge\b/i.test(t.category));
 const m=build(index,window,'fees','minor units');
 if(!rows.length)return [m.none('No transaction in this window is categorised as a fee.')];
 const overdraft=rows.filter(t=>t.overdraftFee===true);
 return [m.ok(spend(rows).toString(),{fees:String(rows.length),overdraftFees:String(overdraft.length),
  overdraftMinor:spend(overdraft).toString()},rows.map(t=>t.id))];
};

/**
 * 24 — refunds and chargebacks.
 *
 * The snapshot has already applied confirmed refund links, so a refunded credit carries kind 'refund' and
 * points at its purchase. Nothing here re-decides a link the user confirmed.
 */
export const refundsAndChargebacks:MetricFn=(index,window)=>{
 const rows=(index.kinds.get('refund')??[]).filter(t=>t.date>=window.start&&t.date<=window.end);
 const m=build(index,window,'refunds_and_chargebacks','minor units');
 if(!rows.length)return [m.none('No confirmed refund falls in this window.')];
 const linked=rows.filter(t=>t.refundOf);
 return [m.ok(rows.reduce((sum,t)=>sum+magnitude(t.minor),0n).toString(),
  {refunds:String(rows.length),linkedToPurchase:String(linked.length)},rows.map(t=>t.id))];
};

/** 25 — cash entries, from the instrument the user recorded rather than guessed from a description. */
export const cashEntries:MetricFn=(index,window)=>{
 const rows=(index.byInstrument.get('cash')??[]).filter(t=>t.date>=window.start&&t.date<=window.end);
 const m=build(index,window,'cash_entries','minor units');
 if(!rows.length)return [m.none('No transaction in this window is recorded as cash.')];
 return [m.ok(spend(rows).toString(),{entries:String(rows.length)},rows.map(t=>t.id))];
};

/**
 * 26 — account balances.
 *
 * Only a verified liquid position is reported. The snapshot sets that after checking a Tier A closing
 * balance with unbroken coverage, so an unverified figure is withheld rather than shown as a balance.
 */
export const accountBalances:MetricFn=(index,window)=>{
 const m=build(index,window,'account_balances','minor units');
 const liquid=index.snapshot.liquid;
 if(!liquid||!liquid.verified)return [m.none('No verified balance: a Tier A closing balance with unbroken coverage is required.')];
 const details:Record<string,string>={accounts:String(index.snapshot.accountIds.length),asOf:liquid.asOf};
 const liability=index.snapshot.committedLiability;
 if(liability)details.committedLiability=liability.minor;
 return [m.ok(liquid.minor,details,liquid.evidence)];
};
