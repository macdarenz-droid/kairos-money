import {expect,it} from 'vitest';
import {repository} from '../src/core/db/repository';
import type {Driver} from '../src/core/db/driver';
import {hash} from '../src/ingest/normalize';
import {refundFixture} from './refund-fixture';

it('loads compact import history and current categories without transferring source documents',async()=>{
 const {repo,driver,doc}=await refundFixture();
 const id=(await repo.imports.ledger())[0]!.id;
 await repo.categories.set([id],'Health');
 const pending={...doc,hash:hash('pending workspace'),id:hash(JSON.stringify(['a',hash('pending workspace')])),fileName:'Pending.csv'};
 await repo.imports.stage(pending);
 await repo.imports.stageFile('Waiting.csv','c3ludGhldGlj',hash('waiting workspace'));
 const expected={files:await repo.imports.files(),batches:await repo.imports.summaries(),ledger:await repo.imports.ledger()};
 let documentReads=0;
 const guarded:Driver={...driver,async query(sql,values){if(/SELECT\s+d\.payload\b/i.test(sql)){documentReads++;throw new Error('Large source document read');}return driver.query(sql,values);}};
 const workspace=await repository(guarded).imports.workspace();
 expect(workspace).toEqual(expected);
 expect(documentReads).toBe(0);
 expect(workspace.batches.some(b=>b.status==='staged')).toBe(true);
 expect(workspace.ledger).toHaveLength(4);
 expect(workspace.ledger.find(r=>r.id===id)?.category).toBe('Health');
 documentReads=0;
 await repo.categories.set([id],'Transport');
 expect((await repository(guarded).imports.workspace()).ledger.find(r=>r.id===id)?.category).toBe('Transport');
});

it('does not expose a ledger if its compact source evidence is invalid',async()=>{
 const {repo,driver,doc}=await refundFixture();
 await driver.execute("UPDATE transaction_sources SET original_payload='{}' WHERE import_batch_id=?",[doc.id]);
 await expect(repo.imports.workspace()).rejects.toThrow('transaction evidence');
});
