import {expect,it} from 'vitest';
import {matchCandidateProposals} from '../src/ui/proposals/derive';

type Choice={id:string;minor:string;currency:string;date:string;description:string;account:string};
const choice=(over:Partial<Choice>&{id:string}):Choice=>
 ({minor:'-1000',currency:'AUD',date:'2026-01-02',description:'Acme Store',account:'Synthetic',...over});

// A refund credit is positive; the purchase it refunds is negative for the same magnitude.
const credit=choice({id:'c',minor:'1000',date:'2026-02-10',description:'ACME  STORE'});

it('offers nothing when the transaction is not a credit the repository recognised', ()=>{
 expect(matchCandidateProposals(null,[choice({id:'p'})])).toEqual([]);
});

it('puts the same merchant and same amount first, ahead of anything more recent', ()=>{
 const exact=choice({id:'exact',minor:'-1000',date:'2026-01-02',description:'Acme Store'});
 const newer=choice({id:'newer',minor:'-4200',date:'2026-02-09',description:'Other Shop'});
 const proposals=matchCandidateProposals(credit,[newer,exact]);
 expect(proposals[0]!.prefill.purchaseId).toBe('exact');
 expect(proposals[0]!.detail).toBe('Same merchant and the same amount as this credit.');
 // The date-only ordering this replaces would have put `newer` first and hidden the exact match.
 expect(proposals.map(p=>p.prefill.purchaseId)).toEqual(['exact','newer']);
});

it('ranks amount above merchant, and merchant above recency', ()=>{
 const sameAmount=choice({id:'amount',minor:'-1000',date:'2026-01-01',description:'Other Shop'});
 const sameMerchant=choice({id:'merchant',minor:'-2500',date:'2026-01-03',description:'acme store'});
 const recent=choice({id:'recent',minor:'-9900',date:'2026-02-09',description:'Third Place'});
 const proposals=matchCandidateProposals(credit,[recent,sameMerchant,sameAmount]);
 expect(proposals.map(p=>p.prefill.purchaseId)).toEqual(['amount','merchant','recent']);
 expect(proposals.map(p=>p.detail)).toEqual([
  'The same amount as this credit.','Same merchant as this credit.','Most recent eligible purchase.',
 ]);
});

it('breaks a tie by date then id, so the order does not shift between renders', ()=>{
 const older=choice({id:'b',minor:'-1000',date:'2026-01-01',description:'Acme Store'});
 const newer=choice({id:'a',minor:'-1000',date:'2026-01-05',description:'Acme Store'});
 const sameDay=choice({id:'z',minor:'-1000',date:'2026-01-05',description:'Acme Store'});
 const order=matchCandidateProposals(credit,[older,sameDay,newer],3).map(p=>p.prefill.purchaseId);
 expect(order).toEqual(['a','z','b']);
 expect(matchCandidateProposals(credit,[newer,older,sameDay],3).map(p=>p.prefill.purchaseId)).toEqual(order);
});

it('carries both transactions as evidence and claims nothing about them', ()=>{
 const [proposal]=matchCandidateProposals(credit,[choice({id:'p',minor:'-1000',description:'Acme Store'})]);
 expect(proposal!.evidence).toEqual(['c','p']);
 expect(proposal!.kind).toBe('match_candidate');
 expect(proposal!.source).toBe('stored_evidence');
 // Evidence, never a verdict: no proposal may assert that this is the refunded purchase.
 for(const text of [proposal!.detail,proposal!.label])expect(text).not.toMatch(/refunds this|is the refund|confirmed|proof/i);
});

it('offers at most the limit, so the quick list cannot grow into a second search', ()=>{
 const many=Array.from({length:12},(_,i)=>choice({id:'p'+i,date:'2026-01-'+String(i+1).padStart(2,'0')}));
 expect(matchCandidateProposals(credit,many)).toHaveLength(3);
 expect(matchCandidateProposals(credit,many,1)).toHaveLength(1);
});
