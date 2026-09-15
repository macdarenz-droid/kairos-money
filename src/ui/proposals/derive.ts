import {editableCategories} from '../../ledger/categories';
import type {ManualEntry} from '../../ledger/manual';
import type {LedgerRow} from '../../ingest/types';
import type {BulkCategoryPrefill,Proposal,RepeatEntryPrefill} from './model';

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
