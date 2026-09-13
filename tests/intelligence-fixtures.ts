import {shift,type Snapshot} from '../src/intelligence/model';
export function fixture():Snapshot{
 const s:Snapshot={asOf:'2026-07-01',currency:'AUD',accountIds:['a'],coverage:[{accountId:'a',start:'2026-01-01',end:'2026-07-01',tier:'A'}],transactions:[],pays:[],liquid:{minor:'100000',asOf:'2026-07-01',verified:true,evidence:['essential-0']}};
 for(let i=0;i<182;i++){const date=shift('2026-01-01',i);for(const [kind,minor] of [['essential','-1000'],['discretionary','-500']] as const)s.transactions.push({id:kind+'-'+i,accountId:'a',date,minor,currency:'AUD',description:kind==='essential'?'Daily essential '+i:'Coffee',category:kind,kind,status:'settled',transfer:false,recurring:false,instrument:'card'});if(i%14===0){s.transactions.push({id:'pay-'+i,accountId:'a',date,minor:'100000',currency:'AUD',description:'Pay',category:'Income',kind:'income',status:'settled',transfer:false,recurring:false,instrument:'transfer'});s.pays.push({id:'slip-'+i,employer:'Synthetic employer',date,start:shift(date,-13),end:date,net:'100000',gross:'130000',currency:'AUD',transactionId:'pay-'+i});}}
 return s;
}
