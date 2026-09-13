import type { Driver } from '../core/db/driver';
import { currency, money, toDatabase } from '../core/money';
import { categorize, type CategoryRule } from '../ledger/rules';
import { hash, isoDay, rowFingerprint } from './normalize';
import { balance, gaps, nearDuplicates, reconcile } from './reconcile';
import { linkNet } from './parse/payslip';
import type { Batch, Document, NormalizedRow } from './types';
const integer = (s: string, c: string) => toDatabase(money(BigInt(s), currency(c)));
function validate(doc: Document): void {
  if (doc.id !== hash(JSON.stringify([doc.context.accountId, doc.hash])) || !/^[a-f0-9]{64}$/.test(doc.hash)) throw new Error('Import identity does not match the source. Choose the file again.');
  isoDay(doc.context.period.start); isoDay(doc.context.period.end);
  if (doc.context.period.start > doc.context.period.end) throw new Error('Statement dates are reversed. Correct the period.');
  integer(doc.opening, doc.context.currency); integer(doc.closing, doc.context.currency);
  if (!doc.rows.length && !doc.payslip) throw new Error('No transactions were extracted. Choose a statement containing a transaction table.');
  if (new Set(doc.rows.map(r => r.sourceId)).size !== doc.rows.length || doc.rows.some(r => r.sourceId === '__document__')) throw new Error('Source row IDs repeat. Re-extract this file.');
  for (const row of doc.rows) {
    isoDay(row.date); integer(row.minor, row.currency);
    if (row.accountId !== doc.context.accountId || row.currency !== doc.context.currency || row.date < doc.context.period.start || row.date > doc.context.period.end || row.fingerprint !== rowFingerprint(row)) throw new Error('A row does not match its account, period or identity. Review the row again.');
    if (!Number.isInteger(row.confidence) || row.confidence < 0 || row.confidence > 10000) throw new Error('Invalid extraction confidence. Re-extract the file.');
  }
  if (doc.payslip) {
    const p = doc.payslip; isoDay(p.payDate); isoDay(p.period.start); isoDay(p.period.end);
    if (!p.employer.trim() || p.currency !== doc.context.currency || p.period.start > p.period.end || BigInt(p.net) < 0n || BigInt(p.gross) < 0n) throw new Error('Payslip employer, currency, dates or values need correction.');
    for (const s of [p.gross, p.net, p.tax, p.super, ...p.deductions.map(v => v.minor), ...p.allowances.map(v => v.minor), ...Object.values(p.ytd)]) integer(s, p.currency);
  }
}
export function importService(driver: Driver) {
  async function batches(): Promise<Batch[]> {
    const records = await driver.query("SELECT d.payload,b.status FROM staging_rows d JOIN import_batches b ON b.id=d.import_batch_id WHERE d.source_row_id='__document__' ORDER BY b.id");
    return records.map(record => { const doc = JSON.parse(String(record.payload)) as Document; validate(doc); return { ...doc, status: String(record.status) as Batch['status'] }; });
  }
  async function rules(): Promise<CategoryRule[]> {
    const rows = await driver.query("SELECT id,priority,matcher,action FROM rules WHERE created_by='user' ORDER BY priority,id");
    return rows.flatMap(row => { const match: unknown = JSON.parse(String(row.matcher)), action: unknown = JSON.parse(String(row.action)); if (match && action && typeof match === 'object' && typeof action === 'object' && 'merchant' in match && 'category' in action && typeof match.merchant === 'string' && typeof action.category === 'string') return [{ id: String(row.id), priority: Number(row.priority), merchant: match.merchant, category: action.category }]; return []; });
  }
  async function aliases() { return (await driver.query("SELECT canonical_name,aliases FROM merchants WHERE aliases<>'[]' ORDER BY id")).map(r => { const list: unknown = JSON.parse(String(r.aliases)); return { canonical: String(r.canonical_name), aliases: Array.isArray(list) ? list.filter((v): v is string => typeof v === 'string') : [] }; }); }
  async function defaults(): Promise<Record<string, string>> { return Object.fromEntries((await driver.query('SELECT m.canonical_name,c.name FROM merchants m JOIN categories c ON c.id=m.default_category_id')).map(r => [String(r.canonical_name), String(r.name)])); }
  async function stage(doc: Document): Promise<{ id: string; alreadyImported: boolean }> {
    validate(doc);
    return driver.transaction(async () => {
      const account = (await driver.query('SELECT type,currency FROM accounts WHERE id=?', [doc.context.accountId]))[0];
      if (!account || account.currency !== doc.context.currency || account.type !== doc.context.accountKind) throw new Error('The selected account changed. Select the account again.');
      const existing = (await driver.query('SELECT status FROM import_batches WHERE id=?', [doc.id]))[0];
      if (existing?.status === 'committed') return { id: doc.id, alreadyImported: true };
      if (existing && existing.status !== 'rolled_back') return { id: doc.id, alreadyImported: false };
      if (existing) { await driver.execute('DELETE FROM staging_rows WHERE import_batch_id=?', [doc.id]); await driver.execute('DELETE FROM import_batches WHERE id=?', [doc.id]); }
      await driver.execute('INSERT INTO import_batches(id,account_id,source_file_hash,file_name,issuer_id,parser_version,period_start,period_end,status,stated_opening_minor,stated_closing_minor,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)', [doc.id, doc.context.accountId, doc.hash, doc.fileName, null, doc.parser, doc.context.period.start, doc.context.period.end, balance(doc).valid ? 'staged' : 'quarantined', integer(doc.opening, doc.context.currency), integer(doc.closing, doc.context.currency), new Date().toISOString()]);
      await save(doc); return { id: doc.id, alreadyImported: false };
    });
  }
  async function save(doc: Document) {
    await driver.execute('DELETE FROM staging_rows WHERE import_batch_id=?', [doc.id]);
    await driver.execute('INSERT INTO staging_rows(id,import_batch_id,source_row_id,payload,confidence,issues) VALUES(?,?,?,?,?,?)', [hash(doc.id + ':__document__'), doc.id, '__document__', JSON.stringify(doc), 10000, '[]']);
    for (const row of doc.rows) await driver.execute('INSERT INTO staging_rows(id,import_batch_id,source_row_id,payload,confidence,issues) VALUES(?,?,?,?,?,?)', [hash(doc.id + ':' + row.sourceId), doc.id, row.sourceId, JSON.stringify(row), row.confidence, JSON.stringify(row.issues)]);
    await driver.execute('UPDATE import_batches SET status=?, stated_opening_minor=?, stated_closing_minor=? WHERE id=?', [balance(doc).valid ? 'staged' : 'quarantined', integer(doc.opening, doc.context.currency), integer(doc.closing, doc.context.currency), doc.id]);
  }
  async function review(id: string) {
    const all = await batches(), doc = all.find(b => b.id === id); if (!doc) throw new Error('This staged import was not found. Choose the file again.');
    const existing = reconcile(all.filter(b => b.status === 'committed' && b.id !== id));
    const combined = reconcile([...all.filter(b => b.status === 'committed' && b.id !== id), doc]);
    const userRules = await rules(), merchantDefaults = await defaults();
    const items = doc.rows.map(row => {
      const suggestion = categorize(row, userRules, merchantDefaults, row.mcc);
      const near = nearDuplicates(row, combined).filter(r => !r.sources.some(s => s.batchId === id && s.sourceId === row.sourceId));
      const duplicate = existing.some(r => r.fingerprint === row.fingerprint || r.id === row.duplicateOf);
      const collisions = doc.rows.filter(r => r.fingerprint === row.fingerprint).length > 1 || existing.some(r => r.fingerprint === row.fingerprint && ((r.reference && row.reference && r.reference !== row.reference) || r.merchant !== row.merchant));
      return { row, suggestion, original: doc.rawRows?.find(r => r.sourceId === row.sourceId), near, duplicate, collision: collisions, blocked: !row.verified && (row.issues.length > 0 || row.confidence < 9000 || near.length > 0 || collisions || (!row.category && !!suggestion.category && suggestion.confidence < 9000)) };
    }).sort((a, b) => Number(b.blocked) - Number(a.blocked) || a.row.confidence - b.row.confidence || a.row.sourceId.localeCompare(b.row.sourceId));
    return { doc, items, balance: balance(doc), coverageAdded: doc.payslip ? [] : gaps(all.filter(b => b.status === 'committed' && b.id !== id && b.context.accountId === doc.context.accountId && !b.payslip).map(b => b.context.period), doc.context.period), newCount: new Set(items.filter(i => !i.duplicate).map(i => i.row.fingerprint)).size, duplicateCount: items.filter(i => i.duplicate).length, uncertainCount: items.filter(i => i.blocked).length };
  }
  async function correct(id: string, sourceId: string, change: Pick<NormalizedRow, 'date' | 'description' | 'merchant' | 'minor' | 'category' | 'occurrence' | 'duplicateOf'>, makeRule: boolean) {
    return driver.transaction(async () => {
      const doc = (await batches()).find(b => b.id === id); if (!doc || !['staged', 'quarantined'].includes(doc.status)) throw new Error('Only staged rows can be corrected.');
      const row = doc.rows.find(r => r.sourceId === sourceId); if (!row) throw new Error('This row was not found. Reopen the import review.');
      Object.assign(row, change, { verified: true, issues: [], createRule: makeRule }); row.fingerprint = rowFingerprint(row); validate(doc);
      if (row.duplicateOf) { const target = reconcile((await batches()).filter(b => b.status === 'committed')).find(r => r.id === row.duplicateOf || r.fingerprint === row.duplicateOf); if (!target || target.accountId !== row.accountId || target.currency !== row.currency || target.minor !== row.minor) throw new Error('That duplicate target does not match this account and amount. Keep the row separately.'); row.duplicateOf = target.id; }
      await save(doc);
    });
  }
  async function rebuild() {
    const docs = (await batches()).filter(b => b.status === 'committed');
    const ledger = reconcile(docs);
    for (const doc of await batches()) for (const row of doc.rows) await driver.execute('DELETE FROM rules WHERE id=?', [hash('import-rule:' + doc.id + ':' + row.sourceId)]);
    for (const doc of docs) for (const row of doc.rows) if (row.createRule && row.category) await driver.execute('INSERT INTO rules(id,priority,matcher,action,created_by) VALUES(?,0,?,?,?)', [hash('import-rule:' + doc.id + ':' + row.sourceId), JSON.stringify({ merchant: row.merchant }), JSON.stringify({ category: row.category }), 'user']);
    const userRules = await rules(), merchantDefaults = await defaults();
    const notes = new Map((await driver.query('SELECT id,notes FROM transactions WHERE import_batch_id IS NOT NULL')).map(r => [String(r.id), String(r.notes)]));
    await driver.execute('UPDATE payslips SET linked_transaction_id=NULL');
    await driver.execute(`DELETE FROM transaction_sources WHERE import_batch_id IN (SELECT import_batch_id FROM staging_rows WHERE source_row_id='__document__')`);
    await driver.execute(`DELETE FROM transactions WHERE import_batch_id IN (SELECT import_batch_id FROM staging_rows WHERE source_row_id='__document__')`);
    await driver.execute(`DELETE FROM coverage_ranges WHERE import_batch_id IN (SELECT import_batch_id FROM staging_rows WHERE source_row_id='__document__')`);
    await driver.execute(`DELETE FROM payslips WHERE import_batch_id IN (SELECT import_batch_id FROM staging_rows WHERE source_row_id='__document__')`);
    for (const row of ledger) {
      const suggested = categorize(row, userRules, merchantDefaults, row.mcc); const category = row.category ?? (suggested.confidence >= 9000 ? suggested.category : null);
      const categoryId = category ? hash('category:' + category) : null;
      if (categoryId) await driver.execute('INSERT OR IGNORE INTO categories(id,name,kind) VALUES(?,?,?)', [categoryId, category, category === 'Income' ? 'income' : category === 'Transfer' ? 'transfer' : category === 'Savings' ? 'savings' : category === 'Debt' ? 'debt' : ['Groceries', 'Housing', 'Utilities', 'Transport', 'Health'].includes(category!) ? 'essential' : 'discretionary']);
      const merchantId = hash('merchant:' + row.merchant);
      await driver.execute('INSERT OR IGNORE INTO merchants(id,canonical_name,aliases,mcc) VALUES(?,?,?,?)', [merchantId, row.merchant, '[]', row.mcc]);
      await driver.execute('INSERT INTO transactions(id,account_id,posted_date,amount_minor,currency,raw_description,merchant_id,category_id,type,transfer_group_id,is_recurring,fingerprint,import_batch_id,confidence,user_verified,notes) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [row.id, row.accountId, row.date, integer(row.minor, row.currency), row.currency, row.description, merchantId, categoryId, BigInt(row.minor) < 0n ? 'debit' : 'credit', row.transferGroup, 0, row.id, row.owner, row.confidence, row.verified ? 1 : 0, notes.get(row.id) ?? '']);
      for (const source of row.sources) { const original = docs.find(d => d.id === source.batchId)!.rows.find(r => r.sourceId === source.sourceId)!; await driver.execute('INSERT INTO transaction_sources VALUES(?,?,?,?)', [row.id, source.batchId, source.sourceId, JSON.stringify(original)]); }
    }
    // Namespaced importer entities are removed only when no ledger or merchant uses them.
    for (const doc of await batches()) for (const row of doc.rows) {
      await driver.execute('DELETE FROM merchants WHERE id=? AND NOT EXISTS(SELECT 1 FROM transactions WHERE merchant_id=merchants.id)', [hash('merchant:' + row.merchant)]);
      if (row.category) await driver.execute('DELETE FROM categories WHERE id=? AND NOT EXISTS(SELECT 1 FROM transactions WHERE category_id=categories.id OR subcategory_id=categories.id) AND NOT EXISTS(SELECT 1 FROM merchants WHERE default_category_id=categories.id) AND NOT EXISTS(SELECT 1 FROM categories child WHERE child.parent_id=categories.id)', [hash('category:' + row.category)]);
    }
    for (const doc of docs) {
      if (!doc.payslip) await driver.execute('INSERT INTO coverage_ranges VALUES(?,?,?,?,?)', [hash('coverage:' + doc.id), doc.context.accountId, doc.context.period.start, doc.context.period.end, doc.id]);
      else { const p = doc.payslip; await driver.execute('INSERT INTO payslips(id,employer,pay_date,period_start,period_end,gross_minor,net_minor,tax_minor,super_minor,deductions,allowances,ytd,currency,linked_transaction_id,import_batch_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [hash('payslip:' + doc.id), p.employer, p.payDate, p.period.start, p.period.end, integer(p.gross, p.currency), integer(p.net, p.currency), integer(p.tax, p.currency), integer(p.super, p.currency), JSON.stringify(p.deductions), JSON.stringify(p.allowances), JSON.stringify(p.ytd), p.currency, linkNet(p, ledger.filter(r => r.accountId === doc.context.accountId)), doc.id]); }
    }
  }
  async function commit(id: string) {
    return driver.transaction(async () => {
      const check = await review(id);
      if (check.doc.status === 'committed') return { added: 0, alreadyImported: true };
      if (check.doc.status === 'rolled_back') throw new Error('Import this file again before committing it.');
      if (!check.balance.valid) throw new Error(`Balance differs by ${check.balance.difference.toString()} minor units. Correct the statement or rows before committing.`);
      if (check.uncertainCount) throw new Error(`Review ${check.uncertainCount} uncertain rows before committing.`);
      const proposed = [...(await batches()).filter(b => b.status === 'committed' && b.id !== id), check.doc];
      const projection = reconcile(proposed);
      for (const document of proposed) if (!document.payslip) {
        const contribution = projection.filter(r => r.sources.some(source => source.batchId === document.id)).reduce((sum, r) => sum + BigInt(r.minor), 0n);
        if (BigInt(document.opening) + contribution !== BigInt(document.closing)) throw new Error(`The duplicate decision would break the balance of ${document.fileName}. Keep the transactions separately or review that statement first.`);
      }
      check.doc.rows.forEach(row => { row.verified = true; });
      await save(check.doc);
      await driver.execute("UPDATE import_batches SET status='committed' WHERE id=?", [id]); await rebuild();
      return { added: check.newCount, alreadyImported: false };
    });
  }
  async function rollback(id: string) {
    return driver.transaction(async () => { const doc = (await batches()).find(b => b.id === id); if (!doc) throw new Error('That import was not found.'); await driver.execute("UPDATE import_batches SET status='rolled_back' WHERE id=?", [id]); await rebuild(); });
  }
  async function ledger() {
    const rows = reconcile((await batches()).filter(b => b.status === 'committed'));
    const labels = new Map((await driver.query('SELECT t.id,c.name FROM transactions t LEFT JOIN categories c ON c.id=t.category_id')).map(r => [String(r.id), r.name === null ? null : String(r.name)]));
    return rows.map(r => ({ ...r, category: labels.get(r.id) ?? r.category }));
  }
  async function stageFile(fileName: string, data: string, fileHash: string) {
    if (!/^[a-f0-9]{64}$/.test(fileHash) || data.length > 27962032) throw new Error('File is too large or its identity is invalid. Choose a file below 20 MB.');
    const id = hash('incoming:' + fileHash);
    await driver.transaction(async () => {
      await driver.execute('INSERT OR IGNORE INTO import_batches(id,source_file_hash,file_name,parser_version,status,created_at) VALUES(?,?,?,?,?,?)', [id, fileHash, fileName, 'awaiting-extraction-v1', 'staged', new Date().toISOString()]);
      await driver.execute('INSERT OR IGNORE INTO staging_rows(id,import_batch_id,source_row_id,payload,confidence,issues) VALUES(?,?,?,?,?,?)', [id, id, '__file__', JSON.stringify({ fileName, data, hash: fileHash }), 0, '[]']);
    }); return id;
  }
  async function files() { return (await driver.query(`SELECT s.id,b.file_name FROM staging_rows s JOIN import_batches b ON b.id=s.import_batch_id WHERE s.source_row_id='__file__' ORDER BY b.created_at,s.id`)).map(r => ({ id: String(r.id), name: String(r.file_name) })); }
  async function loadFile(id: string): Promise<{ fileName: string; data: string; hash: string }> { const row = (await driver.query(`SELECT payload FROM staging_rows WHERE id=? AND source_row_id='__file__'`, [id]))[0]; if (!row) throw new Error('That staged file was removed. Choose it again.'); return JSON.parse(String(row.payload)) as { fileName: string; data: string; hash: string }; }
  async function removeFile(id: string) { await driver.transaction(async () => { await driver.execute(`DELETE FROM import_batches WHERE id=? AND parser_version='awaiting-extraction-v1'`, [id]); }); }
  async function correctPayslip(id: string, payslip: NonNullable<Document['payslip']>) {
    await driver.transaction(async () => { const doc = (await batches()).find(b => b.id === id); if (!doc || !doc.payslip || !['staged', 'quarantined'].includes(doc.status)) throw new Error('Only a staged payslip can be corrected.'); doc.payslip = payslip; validate(doc); await save(doc); });
  }
  async function correctBalances(id: string, opening: string, closing: string) {
    await driver.transaction(async () => { const doc = (await batches()).find(b => b.id === id); if (!doc || !['staged', 'quarantined'].includes(doc.status)) throw new Error('Only staged balances can be corrected.'); doc.opening = opening; doc.closing = closing; validate(doc); await save(doc); });
  }
  return { batches, stage, review, correct, correctBalances, correctPayslip, commit, rollback, ledger, rules, aliases, stageFile, files, loadFile, removeFile };
}
