import type { Driver } from '../src/core/db/driver';
// Explicit synthetic fixture. Imported by test/developer entry points only.
export async function seedSynthetic(driver: Driver): Promise<void> {
  const inserts = [
    "INSERT INTO accounts(id,name,institution,type,currency,mask_last4,opening_balance_minor) VALUES('fake-account','Synthetic test account','Fake Bank','checking','AUD','0000',100000)",
    "INSERT INTO import_batches(id,account_id,source_file_hash,file_name,parser_version,status,created_at,period_start,period_end,stated_opening_minor,stated_closing_minor) VALUES('fake-batch','fake-account','synthetic-hash','SYNTHETIC-NOT-A-REAL-STATEMENT.csv','fixture-1','committed','2026-01-31T00:00:00Z','2026-01-01','2026-01-31',100000,99500)",
    "INSERT INTO coverage_ranges VALUES('fake-coverage','fake-account','2026-01-01','2026-01-31','fake-batch')",
    "INSERT INTO categories VALUES('fake-category',NULL,'Synthetic essentials','essential')",
    "INSERT INTO merchants VALUES('fake-merchant','Synthetic shop','[]','fake-category',NULL)",
    "INSERT INTO rules VALUES('fake-rule',1,'{}','{}','user')",
    "INSERT INTO transactions(id,account_id,posted_date,amount_minor,currency,raw_description,merchant_id,category_id,type,fingerprint,import_batch_id,confidence) VALUES('fake-txn','fake-account','2026-01-05',-500,'AUD','SYNTHETIC TEST PURCHASE','fake-merchant','fake-category','debit','synthetic-fingerprint','fake-batch',10000)",
    "INSERT INTO transaction_sources VALUES('fake-txn','fake-batch','row-1','{}')",
    "INSERT INTO staging_rows VALUES('fake-stage','fake-batch','row-2','{}',5000,'[]')",
    "INSERT INTO payslips(id,employer,pay_date,period_start,period_end,gross_minor,net_minor,tax_minor,super_minor,currency,import_batch_id) VALUES('fake-pay','Synthetic employer','2026-01-15','2026-01-01','2026-01-14',100000,80000,20000,12000,'AUD','fake-batch')",
    "INSERT INTO goals(id,name,target_minor,funded_minor,kind,currency) VALUES('fake-goal','Synthetic goal',10000,0,'goal','AUD')",
    "INSERT INTO signals VALUES('fake-signal','2026-01','fixture',NULL,'2026-02-01T00:00:00Z',1,'insufficient_data','{}')",
    "INSERT INTO profiles VALUES('fake-profile','2026-01',NULL,'{}',0,1,31)",
    "INSERT INTO insights VALUES('fake-insight','2026-02-01T00:00:00Z','test','test','Synthetic title','Synthetic body','{}','dismissed',0,'AUD','fixture','Synthetic action','fixture')",
    "INSERT INTO privacy_log VALUES('fake-log','2026-01-01T00:00:00Z','fixture',NULL,'{}')",
    "INSERT INTO app_settings VALUES('fixture','true')",
  ];
  await driver.transaction(async () => { for (const sql of inserts) await driver.execute(sql); });
}
