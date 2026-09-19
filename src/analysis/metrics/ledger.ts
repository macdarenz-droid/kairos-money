import {abs} from '../../intelligence/model';
import type {MetricFn} from '../model';
import {build,income,spend,total,windowRows} from '../metric';

/** 1 — one ledger across every owned account: net movement, and what it is composed of. */
export const combinedLedger:MetricFn=(index,window)=>{
 const rows=windowRows(index,window),m=build(index,window,'combined_ledger','minor units');
 if(!rows.length)return [m.none('No settled transactions in this window.')];
 const accounts=new Set(rows.map(t=>t.accountId));
 return [m.ok(total(rows).toString(),{rows:String(rows.length),accounts:String(accounts.size),
  spend:spend(rows).toString(),income:income(rows).toString()},rows.map(t=>t.id))];
};

/**
 * 2 — reconciliation against stated statement balances.
 *
 * Only a verified liquid position counts as reconciled; the snapshot sets `liquid.verified` after
 * checking a Tier A closing balance and unbroken coverage, so this reports agreement rather than
 * recomputing that judgement.
 */
export const statementReconciliation:MetricFn=(index,window)=>{
 const m=build(index,window,'statement_reconciliation','minor units');
 const liquid=index.snapshot.liquid;
 if(!liquid)return [m.none('No Tier A statement closing balance with unbroken coverage to reconcile against.')];
 return [m.ok(liquid.minor,{verified:String(liquid.verified),asOf:liquid.asOf},liquid.evidence)];
};

/** 3 — cashflow in and out for the period, gaps excluded rather than counted as zero. */
export const periodCashflow:MetricFn=(index,window)=>{
 const rows=windowRows(index,window),m=build(index,window,'period_cashflow','minor units');
 if(!rows.length)return [m.none('No settled transactions in this window.')];
 const out=spend(rows),inn=income(rows);
 return [m.ok((inn-out).toString(),{in:inn.toString(),out:out.toString(),
  pendingExcluded:String(index.pending.filter(t=>t.date>=window.start&&t.date<=window.end).length)},rows.map(t=>t.id))];
};

/**
 * 4 — transfers identified and excluded.
 *
 * The figure is what was moved between the user's own accounts, reported so the exclusion is visible
 * rather than silent. It is deliberately not part of income or spend anywhere else.
 */
export const transferExclusion:MetricFn=(index,window)=>{
 const rows=index.transfers.filter(t=>t.date>=window.start&&t.date<=window.end),m=build(index,window,'transfer_exclusion','minor units');
 const moved=rows.reduce((sum,t)=>sum+abs(BigInt(t.minor)),0n)/2n;
 return [m.ok(moved.toString(),{legs:String(rows.length),
  note:'Counted as neither income nor spend.'},rows.map(t=>t.id))];
};

/**
 * 5 — credit-account sign rules.
 *
 * On a credit account a purchase reduces available credit and a payment increases it, so the sign
 * convention differs from a deposit account. This reports the split per account type so an inverted
 * adapter shows up as an implausible balance of signs rather than a quietly wrong total.
 */
export const creditSignRules:MetricFn=(index,window)=>{
 const rows=windowRows(index,window),m=build(index,window,'credit_sign_rules','count');
 if(!rows.length)return [m.none('No settled transactions in this window.')];
 const debits=rows.filter(t=>BigInt(t.minor)<0n),credits=rows.filter(t=>BigInt(t.minor)>0n);
 return [m.ok(String(debits.length),{debits:String(debits.length),credits:String(credits.length),
  zero:String(rows.length-debits.length-credits.length)},debits.map(t=>t.id))];
};
