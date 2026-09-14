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
 const page=await repo.imports.ledgerPage();
 const expected={files:await repo.imports.files(),batches:await repo.imports.summaries(),ledger:page.rows,ledgerTotal:page.total,health:await repo.imports.ledgerHealth()};
 let documentReads=0;
 const guarded:Driver={...driver,async query(sql,values){if(/SELECT\s+d\.payload\b/i.test(sql)){documentReads++;throw new Error('Large source document read');}return driver.query(sql,values);}};
 const workspace=await repository(guarded).imports.workspace();
 expect(workspace).toEqual(expected);
 expect(documentReads).toBe(0);
 expect(workspace.batches.some(b=>b.status==='staged')).toBe(true);
 expect(workspace.ledger).toHaveLength(4);
 expect(workspace.ledgerTotal).toBe(4);
 // The window is a window: the list reads one page and a count, never every row.
 expect((await repo.imports.ledgerPage('',0,2)).rows).toHaveLength(2);
 expect((await repo.imports.ledgerPage('',0,2)).total).toBe(4);
 expect((await repo.imports.ledgerPage('refund thirty')).rows.map(r=>r.description)).toEqual(['Synthetic refund thirty']);
 expect(workspace.ledger.map(r=>r.id)).toEqual([...workspace.ledger].sort((a,b)=>b.date.localeCompare(a.date)||a.id.localeCompare(b.id)).map(r=>r.id));
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

it('ignores committed records that the importer never materialized from a source document',async()=>{
 const {repo,driver}=await refundFixture();
 const expected=await repo.imports.ledger();
 // Screens outside the importer seed transactions directly under their own batch and keep no staged
 // document. The importer's ledger owns only what it rebuilt, so those rows are neither read nor required.
 await driver.execute("INSERT INTO import_batches(id,account_id,source_file_hash,file_name,parser_version,period_start,period_end,status,stated_opening_minor,stated_closing_minor,created_at,integrity_tier,source_rank) VALUES('outside','a','outside-hash','Outside.csv','native-fixture','2026-03-01','2026-03-31','committed',0,0,'2026-03-01T00:00:00.000Z','A',3)");
 await driver.execute("INSERT INTO transactions(id,account_id,posted_date,amount_minor,currency,raw_description,type,is_recurring,fingerprint,import_batch_id,confidence,user_verified,notes,status) VALUES('outside-row','a','2026-03-02',-1000,'AUD','Outside record','debit',0,'outside-row','outside',10000,1,'','settled')");
 expect(await repo.imports.ledger()).toEqual(expected);
 // A payload that is not the importer's own provenance must not be parsed as evidence either.
 await driver.execute("INSERT INTO transaction_sources VALUES('outside-row','outside','outside-row',?)",[JSON.stringify({note:'Outside source'})]);
 expect(await repo.imports.ledger()).toEqual(expected);
 expect(new Set((await repo.imports.workspace()).ledger.map(r=>r.id))).toEqual(new Set(expected.map(r=>r.id)));
 expect((await repo.imports.workspace()).ledgerTotal).toBe(expected.length);
 expect((await repo.imports.ledgerHealth()).some(h=>h.accountId==='outside')).toBe(false);
});

it('offers bulk categorisation candidates without transferring the whole ledger',async()=>{
 const {repo,driver}=await refundFixture();
 const all=await repo.imports.ledger();
 const purchase=all.find(r=>r.description==='Synthetic purchase')!;
 await driver.execute('UPDATE transactions SET transfer_group_id=? WHERE id=?',['group',purchase.id]);
 const candidates=await repo.imports.ledgerBulk();
 // Matched transfers are excluded, as the sheet has always excluded them.
 expect(candidates.rows.map(r=>r.id)).not.toContain(purchase.id);
 expect(candidates.total).toBe(all.length-1);
 // The sheet filters on merchant, date and category, and that filter runs in SQL.
 const merchant=candidates.rows[0]!.merchant;
 expect((await repo.imports.ledgerBulk(merchant)).rows.every(r=>r.merchant===merchant)).toBe(true);
 expect((await repo.imports.ledgerBulk('no such merchant')).total).toBe(0);
});
