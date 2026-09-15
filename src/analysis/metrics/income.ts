import {median} from '../../intelligence/model';
import type {MetricFn} from '../model';
import {build} from '../metric';

/**
 * 6 — salary pattern from payslips and their net-pay links.
 *
 * Payslips are the evidence, not an inference from credits: a credit that merely looks like salary is
 * not treated as one. Evidence cites the linked ledger transactions where a link exists, so the figure
 * remains resolvable to a source row.
 */
export const salaryPattern:MetricFn=(index,window)=>{
 const m=build(index,window,'salary_pattern','minor units');
 const pays=index.pays.filter(p=>p.date>=window.start&&p.date<=window.end);
 if(pays.length<1)return [m.none('No payslip falls in this window.')];
 const nets=pays.map(p=>BigInt(p.net));
 const employers=new Set(pays.map(p=>p.employer));
 const linked=pays.flatMap(p=>p.transactionId?[p.transactionId]:[]);
 return [m.ok(median(nets).toString(),{payslips:String(pays.length),employers:String(employers.size),
  linkedToLedger:String(linked.length),lowest:nets.reduce((a,b)=>b<a?b:a).toString(),
  highest:nets.reduce((a,b)=>b>a?b:a).toString()},linked)];
};
