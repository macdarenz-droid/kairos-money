import {expect,it} from 'vitest';
import {valueUpdateProposals} from '../src/ui/proposals/derive';

type Holding={id:string;itemId:string;name:string;kind:'asset'|'liability';currency:string;date:string};
const holding=(over:Partial<Holding>&{id:string;itemId:string}):Holding=>
 ({name:'Car',kind:'asset',currency:'AUD',date:'2026-01-01',...over});

it('offers one proposal per holding, not one per recorded valuation',()=>{
 const proposals=valueUpdateProposals([
  holding({id:'v1',itemId:'car',date:'2026-01-01'}),
  holding({id:'v2',itemId:'car',date:'2026-03-01'}),
  holding({id:'v3',itemId:'house',name:'House',date:'2026-02-01'}),
 ],'2026-04-01');
 expect(proposals).toHaveLength(2);
 expect(new Set(proposals.map(p=>p.prefill.itemId))).toEqual(new Set(['car','house']));
});

it('carries the latest name, kind and currency rather than the first ones recorded',()=>{
 const [proposal]=valueUpdateProposals([
  holding({id:'v1',itemId:'loan',name:'Old name',kind:'asset',currency:'AUD',date:'2026-01-01'}),
  holding({id:'v2',itemId:'loan',name:'Car loan',kind:'liability',currency:'USD',date:'2026-03-01'}),
 ],'2026-04-01');
 expect(proposal!.label).toBe('Car loan');
 expect(proposal!.prefill.kind).toBe('liability');
 expect(proposal!.prefill.currency).toBe('USD');
 expect(proposal!.evidence).toEqual(['v2']);
});

it('never proposes an amount, because a past value is not evidence for the next one',()=>{
 const [proposal]=valueUpdateProposals([holding({id:'v1',itemId:'car'})],'2026-04-01');
 expect(Object.keys(proposal!.prefill).sort()).toEqual(['currency','date','itemId','kind','name']);
 expect(JSON.stringify(proposal!.prefill)).not.toMatch(/minor|amount|value/i);
});

it('dates the new valuation today, not the day the holding was last valued',()=>{
 const [proposal]=valueUpdateProposals([holding({id:'v1',itemId:'car',date:'2026-01-01'})],'2026-04-01');
 expect(proposal!.prefill.date).toBe('2026-04-01');
 expect(proposal!.detail).toContain('Last valued 2026-01-01');
});

it('puts the holding nobody has valued for longest first',()=>{
 const order=valueUpdateProposals([
  holding({id:'v1',itemId:'fresh',name:'Fresh',date:'2026-03-01'}),
  holding({id:'v2',itemId:'stale',name:'Stale',date:'2026-01-01'}),
  holding({id:'v3',itemId:'middle',name:'Middle',date:'2026-02-01'}),
 ],'2026-04-01').map(p=>p.prefill.itemId);
 expect(order).toEqual(['stale','middle','fresh']);
});

it('orders holdings valued on the same day by name, so the list does not shuffle',()=>{
 const input=[
  holding({id:'v1',itemId:'b',name:'Boat',date:'2026-01-01'}),
  holding({id:'v2',itemId:'a',name:'Apartment',date:'2026-01-01'}),
 ];
 const order=valueUpdateProposals(input,'2026-04-01').map(p=>p.label);
 expect(order).toEqual(['Apartment','Boat']);
 expect(valueUpdateProposals([...input].reverse(),'2026-04-01').map(p=>p.label)).toEqual(order);
});

it('honours a limit and returns nothing when there are no holdings',()=>{
 const many=Array.from({length:9},(_,i)=>holding({id:'v'+i,itemId:'i'+i,date:'2026-01-0'+(i+1)}));
 expect(valueUpdateProposals(many,'2026-04-01')).toHaveLength(6);
 expect(valueUpdateProposals(many,'2026-04-01',many.length)).toHaveLength(9);
 expect(valueUpdateProposals([],'2026-04-01')).toEqual([]);
});
