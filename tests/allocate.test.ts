import {expect,it} from 'vitest';
import {fillTarget,splitEvenly} from '../src/ui/proposals/allocate';

const sum=(parts:readonly bigint[])=>parts.reduce((n,p)=>n+p,0n);

it('divides evenly when the total divides exactly',()=>{
 expect(splitEvenly(900n,3)).toEqual([300n,300n,300n]);
 expect(splitEvenly(0n,4)).toEqual([0n,0n,0n,0n]);
 expect(splitEvenly(1000n,1)).toEqual([1000n]);
});

it('sums to the total exactly for every remainder, which is the property that matters',()=>{
 // A cent lost here is a split that does not reconcile against the payment it came from.
 for(let total=0;total<=400;total++)for(let count=1;count<=10;count++){
  const parts=splitEvenly(BigInt(total),count);
  expect(parts).toHaveLength(count);
  expect(sum(parts)).toBe(BigInt(total));
  // The shares differ by at most one minor unit, so no part quietly absorbs the whole remainder.
  expect(parts.reduce((m,p)=>p>m?p:m,parts[0]!)-parts.reduce((m,p)=>p<m?p:m,parts[0]!)).toBeLessThanOrEqual(1n);
 }
});

it('hands the indivisible remainder to the parts at the front',()=>{
 expect(splitEvenly(1000n,3)).toEqual([334n,333n,333n]);
 expect(splitEvenly(1001n,3)).toEqual([334n,334n,333n]);
});

it('stays exact for a negative total, where truncation toward zero would otherwise sum short',()=>{
 // bigint division truncates toward zero: -1000n/3n is -333n, so three floors sum to -999n, not -1000n.
 expect(sum(splitEvenly(-1000n,3))).toBe(-1000n);
 expect(splitEvenly(-1000n,3)).toEqual([-334n,-333n,-333n]);
 for(let total=-200;total<0;total++)for(let count=1;count<=7;count++)expect(sum(splitEvenly(BigInt(total),count))).toBe(BigInt(total));
});

it('stays exact at a magnitude no float could hold',()=>{
 const total=9_007_199_254_740_993n;// Number.MAX_SAFE_INTEGER + 2, which a float cannot represent.
 expect(sum(splitEvenly(total,7))).toBe(total);
});

it('refuses a part count that cannot be allocated',()=>{
 expect(()=>splitEvenly(100n,0)).toThrow('Split across at least one part.');
 expect(()=>splitEvenly(100n,-1)).toThrow('Split across at least one part.');
 expect(()=>splitEvenly(100n,1.5)).toThrow('Split across at least one part.');
});

it('fills the first part the user has not typed into',()=>{
 expect(fillTarget(['10.00','','5.00'])).toBe(1);
 expect(fillTarget(['','',''])).toBe(0);
 expect(fillTarget(['10.00','   ','5.00'])).toBe(1);
});

it('fills the last part when every part already has an amount, so the button still closes a gap',()=>{
 expect(fillTarget(['10.00','5.00'])).toBe(1);
 expect(fillTarget(['10.00'])).toBe(0);
});

it('refuses to fill when there are no parts',()=>{
 expect(()=>fillTarget([])).toThrow('Fill into at least one part.');
});
