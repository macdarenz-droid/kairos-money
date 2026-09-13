import { expect,it } from 'vitest';
import { nextReminder } from '../src/ingest/reminders';
import type { Batch } from '../src/ingest/types';
const batch=(end:string)=>[{status:'committed',payslip:null,context:{accountId:'a',period:{start:'2026-03-01',end}}}] as Batch[];
it('skips a fresh weekday and schedules the next stale weekday',()=>{const at=nextReminder(2,['a'],batch('2026-03-22'),'2026-03-23');const date=new Date(at!);expect(date.getFullYear()).toBe(2026);expect(date.getMonth()).toBe(2);expect(date.getDate()).toBe(31);});
it('does not schedule without accounts or a valid chosen weekday',()=>{expect(nextReminder(-1,['a'],[],'2026-03-23')).toBeNull();expect(nextReminder(2,[],[],'2026-03-23')).toBeNull();});
