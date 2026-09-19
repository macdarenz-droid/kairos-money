import {expect,it} from 'vitest';
import {memoryDriver} from './db-helper';
import {migrate} from '../src/core/db/migrate';
import {repository} from '../src/core/db/repository';
it('retains notes and receipt data in backup without changing money, and removes manual attachments with their entry',async()=>{
 const {driver}=memoryDriver();await migrate(driver);const repo=repository(driver);await repo.addAccount({id:'a',name:'Synthetic cash',institution:'',type:'cash',currency:'AUD',mask_last4:null,opening_balance_minor:0n});
 await repo.manual.save({id:'m',kind:'expense',accountId:'a',destinationId:null,date:'2026-03-01',minor:'1000',description:'Synthetic receipt purchase',category:null,notes:''});
 await repo.attachments.note('manual:m','Synthetic note');await repo.attachments.attach('manual:m',{id:'receipt',name:'Synthetic.txt',data:'U3ludGhldGlj',text:'Synthetic text'});
 const before=await repo.exportAll();expect((await repo.manual.today('2026-03-01'))[0]?.spending).toBe('1000');
 const fresh=memoryDriver();await migrate(fresh.driver);const restored=repository(fresh.driver);await restored.restoreBackup(before);expect(await restored.attachments.read('manual:m')).toEqual(await repo.attachments.read('manual:m'));
 await repo.manual.remove('m');expect(await repo.attachments.read('manual:m')).toEqual({note:'',receipts:[]});await expect(repo.attachments.note('missing','text')).rejects.toThrow('no longer');
});
it('rejects oversized or invalid receipt payloads without partial changes',async()=>{const {driver}=memoryDriver();await migrate(driver);const repo=repository(driver);await expect(repo.attachments.attach('missing',{id:'bad',name:'Synthetic',data:'not base64!',text:''})).rejects.toThrow('readable receipt');expect((await repo.exportAll()).tables.app_settings).toEqual([]);});
