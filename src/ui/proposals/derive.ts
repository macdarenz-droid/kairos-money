import {editableCategories} from '../../ledger/categories';
import type {ManualEntry} from '../../ledger/manual';
import type {LedgerRow} from '../../ingest/types';
import type {BulkCategoryPrefill,MatchCandidatePrefill,Proposal,RepeatEntryPrefill,ValueUpdatePrefill} from './model';

/** The same normalization the analysis index uses, so a merchant groups identically everywhere. */
const merchantKey=(name:string)=>name.trim().toLowerCase().replace(/\s+/g,' ');

/** A group has to be worth a tap; below this the user is faster categorising the rows individually. */
const minimumGroup=3;

/**
 * Bulk-category proposals.
 *
 * Only ever proposes a category the user already applied to that same merchant, so nothing is invented and
 * the proposal cannot introduce a classification they have never chosen. Rows that cannot take a bulk
 * category — matched transfers and rows already categorised — are excluded here rather than failing later.
 */
export function bulkCategoryProposals(rows:readonly LedgerRow[]):Proposal<BulkCategoryPrefill>[]{
 type Group={merchant:string;uncategorised:LedgerRow[];counts:Map<string,number>};
 const groups=new Map<string,Group>();
 for(const row of rows){
  if(row.transferGroup)continue;
  const key=merchantKey(row.merchant||row.description||'');
  if(!key)continue;
  const group:Group=groups.get(key)??{merchant:key,uncategorised:[],counts:new Map<string,number>()};
  if(row.category)group.counts.set(row.category,(group.counts.get(row.category)??0)+1);
  else group.uncategorised.push(row);
  groups.set(key,group);
 }
 const proposals:Proposal<BulkCategoryPrefill>[]=[];
 for(const group of groups.values()){
  if(group.uncategorised.length<minimumGroup||!group.counts.size)continue;
  const ranked=[...group.counts].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]));
  const category=ranked[0]![0];
  if(!editableCategories.some(c=>c===category))continue;
  const ids=group.uncategorised.map(r=>r.id);
  proposals.push({
   id:'bulk_category:'+group.merchant+':'+category,
   kind:'bulk_category',
   label:`${ids.length} uncategorised from ${group.merchant} — set all to ${category}`,
   detail:`You already filed ${ranked[0]![1]} transaction${ranked[0]![1]===1?'':'s'} from this merchant as ${category}.`,
   prefill:{ids,category,merchant:group.merchant},
   evidence:ids,source:'analysis_metric',metric:'merchant_breakdown',
  });
 }
 return proposals.sort((a,b)=>b.prefill.ids.length-a.prefill.ids.length||a.id.localeCompare(b.id));
}

/**
 * Repeat-entry tiles from the user's own manual history.
 *
 * A tile is a copy of an entry they wrote, dated today. Transfers are excluded because a transfer needs a
 * destination account chosen deliberately rather than carried over.
 */
export function repeatEntryProposals(entries:readonly ManualEntry[],today:string,limit=3):Proposal<RepeatEntryPrefill>[]{
 const seen=new Set<string>();
 const recent=[...entries].sort((a,b)=>b.date.localeCompare(a.date)||b.id.localeCompare(a.id));
 const proposals:Proposal<RepeatEntryPrefill>[]=[];
 for(const entry of recent){
  if(entry.kind==='transfer')continue;
  const key=merchantKey(entry.description)+'|'+entry.minor+'|'+entry.accountId;
  if(seen.has(key))continue;
  seen.add(key);
  proposals.push({
   id:'repeat_entry:'+entry.id,
   kind:'repeat_entry',
   label:entry.description,
   detail:`Last recorded ${entry.date}.`,
   prefill:{kind:entry.kind,accountId:entry.accountId,minor:entry.minor,description:entry.description,category:entry.category,date:today},
   evidence:[entry.id],source:'manual_history',metric:null,
  });
  if(proposals.length>=limit)break;
 }
 return proposals;
}

/** The categories this user actually uses, most-used first, for a chip row that keeps the full list behind it. */
export function preferredCategories(entries:readonly ManualEntry[],limit=4):string[]{
 const counts=new Map<string,number>();
 for(const entry of entries)if(entry.category)counts.set(entry.category,(counts.get(entry.category)??0)+1);
 return [...counts].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).slice(0,limit).map(([name])=>name);
}

/** The shape `refunds.read()` returns for the credit and for each eligible purchase. */
type Choice={id:string;minor:string;currency:string;date:string;description:string;account:string};

/**
 * Refund match candidates, ordered by the evidence behind them rather than by date alone.
 *
 * The repository already decides which purchases are *eligible* — settled, same currency, earlier, with
 * enough unrefunded value. This only decides which of them to put in front of the user first, so that the
 * common case (a refund of a specific purchase, for its exact amount, from the same merchant) is a tap
 * instead of a search. Ranking by most recent, which is what the surface did before, hides the exact match
 * whenever anything newer is eligible.
 *
 * Every rank is evidence the user can check against their own two statement lines, and every proposal
 * carries the reason it was ranked. None of it is proof: a coincidental amount from the same merchant
 * ranks first and can still be the wrong purchase, which is why selecting a proposal only fills the choice
 * and confirmation remains a separate, explicit step.
 */
export function matchCandidateProposals(credit:Choice|null,candidates:readonly Choice[],limit=3):Proposal<MatchCandidatePrefill>[]{
 if(!credit)return [];
 const creditMinor=BigInt(credit.minor),creditMerchant=merchantKey(credit.description);
 const ranked=candidates.map(purchase=>{
  // Purchases are stored negative; a refund credit is positive. Compare their magnitudes.
  const sameAmount=-BigInt(purchase.minor)===creditMinor;
  const sameMerchant=!!creditMerchant&&merchantKey(purchase.description)===creditMerchant;
  const rank=sameAmount&&sameMerchant?0:sameAmount?1:sameMerchant?2:3;
  const reason=sameAmount&&sameMerchant?'Same merchant and the same amount as this credit.'
   :sameAmount?'The same amount as this credit.'
   :sameMerchant?'Same merchant as this credit.'
   :'Most recent eligible purchase.';
  return {purchase,rank,reason};
 });
 // Within a rank the most recent purchase comes first; id breaks a same-day tie so the order is stable.
 ranked.sort((a,b)=>a.rank-b.rank||b.purchase.date.localeCompare(a.purchase.date)||a.purchase.id.localeCompare(b.purchase.id));
 return ranked.slice(0,limit).map(({purchase,reason})=>({
  id:'match_candidate:'+credit.id+':'+purchase.id,
  kind:'match_candidate',
  label:`${purchase.description} · ${purchase.date}`,
  detail:reason,
  prefill:{purchaseId:purchase.id,creditId:credit.id,reason},
  evidence:[credit.id,purchase.id],source:'stored_evidence',metric:null,
 }));
}

/** The fields of a recorded valuation this needs. Structural, so the ledger type stays where it is. */
type Holding={id:string;itemId:string;name:string;kind:'asset'|'liability';currency:string;date:string};

/**
 * One proposal per recorded holding, stalest first.
 *
 * Updating a holding meant opening the general valuation form, finding the item in a select, and checking
 * its currency matched. All of that is already recorded, so all of it carries over; the amount is the only
 * thing genuinely new, and it is the only thing left to type.
 *
 * Stalest first because the holding nobody has valued for longest is the one whose recorded value is least
 * likely to still be true. That is an ordering, not a nudge: nothing here says a holding is overdue, and a
 * holding that is never updated is never mentioned anywhere else.
 */
export function valueUpdateProposals(holdings:readonly Holding[],today:string,limit=6):Proposal<ValueUpdatePrefill>[]{
 // A holding can have many valuations; the latest one carries its current name, kind and currency.
 const latest=new Map<string,Holding>();
 for(const holding of [...holdings].sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id)))latest.set(holding.itemId,holding);
 return [...latest.values()]
  .sort((a,b)=>a.date.localeCompare(b.date)||a.name.localeCompare(b.name)||a.itemId.localeCompare(b.itemId))
  .slice(0,limit)
  .map(holding=>({
   id:'value_update:'+holding.itemId,
   kind:'value_update',
   label:holding.name,
   detail:`Last valued ${holding.date} in ${holding.currency}. Only the amount is left to enter.`,
   prefill:{itemId:holding.itemId,name:holding.name,kind:holding.kind,currency:holding.currency,date:today},
   evidence:[holding.id],source:'manual_history',metric:null,
  }));
}
