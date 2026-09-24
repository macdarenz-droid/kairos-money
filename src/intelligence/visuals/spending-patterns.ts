import {covered,dates,isSmall,smallLimit,type Snapshot,type Transaction,type Window} from '../model';
export function spendingMerchant(t:Transaction){return t.description.replace(/^(?:DEBIT CARD PURCHASE|CREDIT CARD PURCHASE|PURCHASE|EFTPOS DEBIT|DEBIT)\s+/i,'').replace(/\s+CARD\s+XX\d+.*$/i,'').replace(/\s+VALUE DATE.*$/i,'').replace(/\s+(?:(?:VI|VIC|NSW|QLD|SA|WA|AU)\s+)?AUS$/i,'').trim()||t.description;}
/** Describes evidence, never supplies ledger categories or changes a forecast. */
export function spendingKind(t:Transaction):'transfer'|'review'|'spending'{
 if(t.transfer||t.kind==='transfer')return 'transfer';
 if(t.allocations)return 'spending';
 const text=t.rawDescription??t.description;
 if(/\b(?:AFTERPAY|ZIPPAY|ZIP PAY|KLARNA|HUMM|TRANSFER|OSKO|PAYID|BPAY|WORLDREMIT|REMITLY|REVOLUT|ATM)\b|CASH WITHDRAWAL/i.test(text))return 'review';
 if(['essential','discretionary'].includes(t.kind)||/\b(?:CARD|EFTPOS|POS|PURCHASE|FEE)\b/i.test(text))return 'spending';
 return 'review';
}
/**
 * Whether a transfer leg belongs in a picture of spending, which depends entirely on what is being looked
 * at.
 *
 * Across ALL accounts, moving your own money is not spending and never was: counting it would invent an
 * expense that never happened, and the two legs would cancel to nothing anyway.
 *
 * Looking at ONE account, the same movement genuinely left it. Money went out of this account and into
 * another, and a picture of this account that hides that is wrong about what the account did. The very
 * same leg is negative on the account it left and positive on the one it reached — one row, read from two
 * sides — which is why this takes the selection rather than the transaction alone.
 */
export function countsAsMovement(row: {transfer: boolean; kind: string}, account: string): boolean {
  if (account !== 'all') return true;
  return !(row.transfer || row.kind === 'transfer');
}

export function spendingPatterns(snapshot:Snapshot,month='all',account='all'){
 const eligible=snapshot.transactions.filter(t=>t.currency===snapshot.currency&&snapshot.accountIds.includes(t.accountId)&&t.date<=snapshot.asOf&&(account==='all'||t.accountId===account));
 const months=[...new Set(eligible.map(t=>t.date.slice(0,7)))].sort().reverse();
 const rows=eligible.filter(t=>t.status==='settled'&&(month==='all'||t.date.startsWith(month)));
 const repayments=rows.filter(t=>BigInt(t.minor)<0n&&!t.transfer&&t.kind!=='transfer'&&!t.allocations&&/\b(?:AFTERPAY|ZIPPAY|ZIP PAY|KLARNA|HUMM)\b/i.test(t.rawDescription??t.description));
 const out=rows.filter(t=>BigInt(t.minor)<0n),spending=out.filter(t=>spendingKind(t)==='spending'),review=out.filter(t=>spendingKind(t)==='review'),transfers=rows.filter(t=>spendingKind(t)==='transfer');
 const total=(items:Transaction[])=>items.reduce((n,t)=>n+(BigInt(t.minor)<0n?-BigInt(t.minor):BigInt(t.minor)),0n).toString();
 const selectedPurchases=new Set(spending.map(t=>t.id));
 // Refunds follow their purchase cohort, including later dates and other selected-currency accounts.
 const cohortRefunds=snapshot.transactions.filter(t=>t.currency===snapshot.currency&&snapshot.accountIds.includes(t.accountId)&&t.date<=snapshot.asOf&&t.status==='settled'&&!t.transfer&&t.refundOf&&selectedPurchases.has(t.refundOf)&&BigInt(t.minor)>0n);
 const refunded=total(cohortRefunds);
 const groups=new Map<string,{name:string;rows:Transaction[]}>();for(const t of spending){const name=spendingMerchant(t),key=name.toLowerCase();const group=groups.get(key)??{name,rows:[]};group.rows.push(t);groups.set(key,group);}
 const merchants=[...groups.values()].map(g=>({name:g.name,count:g.rows.length,minor:total(g.rows),ids:g.rows.map(t=>t.id)})).sort((a,b)=>BigInt(a.minor)>BigInt(b.minor)?-1:BigInt(a.minor)<BigInt(b.minor)?1:a.name.localeCompare(b.name));
 const selectedIds=account==='all'?snapshot.accountIds:[account],s={...snapshot,accountIds:selectedIds};
 const monthly=[...new Set(rows.map(t=>t.date.slice(0,7)))].sort().map(label=>{
  const start=label+'-01',d=new Date(start+'T00:00:00Z');d.setUTCMonth(d.getUTCMonth()+1);d.setUTCDate(0);const end=d.toISOString().slice(0,10),window:Window={start,end,label};const items=spending.filter(t=>t.date.startsWith(label));
  return {month:label,minor:total(items),ids:items.map(t=>t.id),complete:end<=snapshot.asOf&&dates(window).every(date=>covered(s,date))};
 });
 const weekdays=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].map((name,i)=>{const items=spending.filter(t=>new Date(t.date+'T00:00:00Z').getUTCDay()===i);return {name,minor:total(items),count:items.length,ids:items.map(t=>t.id)};});
 const small=spending.filter(t=>isSmall(t.minor,snapshot.currency));
 const ordered=rows.map(t=>t.date).sort();
 return {refunds:{minor:refunded,ids:cohortRefunds.map(t=>t.id),net:(BigInt(total(spending))-BigInt(refunded)).toString()},months,rows,spending,review,transfers,repayments:{minor:total(repayments),ids:repayments.map(t=>t.id)},merchants,monthly,weekdays,small:{minor:total(small),limit:smallLimit(snapshot.currency).toString(),ids:small.map(t=>t.id)},total:total(spending),otherDebits:total(review),credits:total(rows.filter(t=>BigInt(t.minor)>0n&&spendingKind(t)!=='transfer')),debits:total(out),pending:eligible.filter(t=>t.status==='pending'&&(month==='all'||t.date.startsWith(month))).length,start:ordered[0]??null,end:ordered.at(-1)??null};
}
