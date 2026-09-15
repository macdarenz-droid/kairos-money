import {expect,it} from 'vitest';
import {memoryDriver} from './db-helper';
import {migrate} from '../src/core/db/migrate';
import {repository} from '../src/core/db/repository';
import type {Cancellation} from '../src/ledger/cancellations';
const value:Cancellation={merchant:'Synthetic membership',currency:'AUD',date:'2026-01-01',status:'requested',note:''};
it('preserves cancellation records in backup, isolates currencies and leaves money and coverage untouched',async()=>{
 const {driver}=memoryDriver();await migrate(driver);const repo=repository(driver);
 await repo.cancellations.save(value);await repo.cancellations.save({...value,currency:'USD'});
 await repo.cancellations.save({...value,merchant:' SYNTHETIC MEMBERSHIP ',status:'confirmed',note:'Provider reference ABC'});
 expect(await repo.cancellations.list()).toHaveLength(2);
 expect(await driver.query('SELECT * FROM transactions')).toEqual([]);expect(await driver.query('SELECT * FROM coverage_ranges')).toEqual([]);
 const fresh=memoryDriver();await migrate(fresh.driver);const restored=repository(fresh.driver);await restored.restoreBackup(await repo.exportAll());
 expect(await restored.cancellations.list()).toEqual(await repo.cancellations.list());
 await restored.cancellations.remove(value.merchant,'AUD');expect(await restored.cancellations.list()).toEqual([{...value,merchant:value.merchant.toLowerCase(),currency:'USD'}]);
});
it('requires confirmation evidence and a real calendar date without replacing a saved record on error',async()=>{
 const {driver}=memoryDriver();await migrate(driver);const repo=repository(driver);await repo.cancellations.save(value);
 await expect(repo.cancellations.save({...value,status:'confirmed'})).rejects.toThrow('confirmation');
 await expect(repo.cancellations.save({...value,date:'2026-02-30'})).rejects.toThrow('calendar');
 await expect(repo.cancellations.save({...value,note:'x'.repeat(1001)})).rejects.toThrow('1,000');
 expect(await repo.cancellations.list()).toEqual([{...value,merchant:value.merchant.toLowerCase()}]);
});
