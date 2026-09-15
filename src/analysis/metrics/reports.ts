import type {MetricFn} from '../model';
import {build,windowRows} from '../metric';

/**
 * 31 — how much of the window a report can actually evidence.
 *
 * A report is only as good as the rows it can link to a source, so this measures that share rather than
 * asserting a report exists. Manual entries legitimately have no statement row and are counted separately
 * instead of being treated as a shortfall.
 */
export const evidenceReports:MetricFn=(index,window)=>{
 const rows=windowRows(index,window),m=build(index,window,'evidence_reports','count');
 if(!rows.length)return [m.none('No settled transactions in this window to report on.')];
 const sourced=rows.filter(t=>(t.sources?.length??0)>0);
 return [m.ok(String(sourced.length),{transactions:String(rows.length),withSourceRow:String(sourced.length),
  withoutSourceRow:String(rows.length-sourced.length),
  note:'Rows without a source row are manual entries, which establish no statement coverage.'},sourced.map(t=>t.id))];
};

/**
 * 32 — context a statement cannot supply.
 *
 * Import-review only. This counts rows whose classification the file did not determine, so the review
 * screen can ask about them at the point of import. It is deliberately not a coaching prompt: the details
 * are counts and field names, it carries no question and no instruction, and nothing here may render as a
 * behavioural observation. The Observation type has no question or action field for the same reason.
 */
export const contextQuestions:MetricFn=(index,window)=>{
 const rows=windowRows(index,window),m=build(index,window,'context_questions','count');
 if(!rows.length)return [m.none('No settled transactions in this window.')];
 const uncategorised=rows.filter(t=>t.category===''||t.category==='Uncategorised');
 const unknownKind=rows.filter(t=>t.kind==='unknown');
 const outstanding=[...new Set([...uncategorised,...unknownKind].map(t=>t.id))];
 if(!outstanding.length)return [m.none('Every settled transaction in this window is classified.')];
 return [m.ok(String(outstanding.length),{scope:'import-review',missingCategory:String(uncategorised.length),
  unknownKind:String(unknownKind.length),
  note:'Counts only. Asked at import review, never presented as coaching.'},outstanding)];
};
