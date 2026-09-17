import {reconcileAsync} from './reconcile/async';
import { syncManual } from '../ledger/manual';
import { syncNotices } from '../ledger/notices';
import {applyCategoryEdits} from '../ledger/categories';
import { hasStatementBalanceChain } from './normalize/statement-evidence';
import type { Driver } from '../core/db/driver';
import { currency, money, toDatabase } from '../core/money';
import { categorize, type CategoryRule } from '../ledger/rules';
import { continuity } from './integrity';
import { reanchorOpening } from './opening-anchor';
import type { ExportMapping } from './sources/types';
import { hash, isoDay, rowFingerprint, dayNumber, similarity } from './normalize';
import { balance, gaps, nearDuplicates } from './reconcile';
import { linkNet } from '../ledger/payslips';
import type { Batch, BatchSummary, Document, NormalizedRow, Payslip } from './types';
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
    await driver.execute('UPDATE import_batches SET integrity_tier=?,source_rank=? WHERE id=?', [doc.integrityTier ?? 'A', doc.sourceRank ?? 0, doc.id]);
    await driver.execute('DELETE FROM staging_rows WHERE import_batch_id=?', [doc.id]);
    await driver.execute('INSERT INTO staging_rows(id,import_batch_id,source_row_id,payload,confidence,issues) VALUES(?,?,?,?,?,?)', [hash(doc.id + ':__document__'), doc.id, '__document__', JSON.stringify(doc), 10000, '[]']);
    for (const row of doc.rows) await driver.execute('INSERT INTO staging_rows(id,import_batch_id,source_row_id,payload,confidence,issues) VALUES(?,?,?,?,?,?)', [hash(doc.id + ':' + row.sourceId), doc.id, row.sourceId, JSON.stringify(row), row.confidence, JSON.stringify(row.issues)]);
    await driver.execute('UPDATE import_batches SET status=?, stated_opening_minor=?, stated_closing_minor=? WHERE id=?', [balance(doc).valid ? 'staged' : 'quarantined', integer(doc.opening, doc.context.currency), integer(doc.closing, doc.context.currency), doc.id]);
  }
  async function review(id: string) {
    const all = await batches(), doc = all.find(b => b.id === id); if (!doc) throw new Error('This staged import was not found. Choose the file again.');
    const existing = await reconcileAsync(all.filter(b => b.status === 'committed' && b.id !== id));
    const combined = await reconcileAsync([...all.filter(b => b.status === 'committed' && b.id !== id), doc]);
    const userRules = await rules(), merchantDefaults = await defaults();
    const distinctStatementEntries = hasStatementBalanceChain(doc);
    const balancedSources = new Set(all.filter(b => (b.id === id || b.status === 'committed') && hasStatementBalanceChain(b)).map(b => b.id));
    const items = doc.rows.map(row => {
      const suggestion = categorize(row, userRules, merchantDefaults, row.mcc);
      const settlementCandidates = doc.sourceRank ? combined.filter(r=>r.pending!==row.pending && r.accountId===row.accountId && r.currency===row.currency && Math.abs(dayNumber(r.date)-dayNumber(row.date))<=3 && similarity(r.merchant,row.merchant)>=9000) : [];
      const near = [...new Map([...nearDuplicates(row, combined),...settlementCandidates].map(r=>[r.id,r])).values()].filter(r => !r.sources.some(s => s.batchId === id && s.sourceId === row.sourceId)).filter(r => !(distinctStatementEntries && !row.pending && !r.pending && r.sources.some(s => s.batchId === id || (balancedSources.has(s.batchId) && row.runningBalance !== r.runningBalance))));
      const projected = combined.find(r => r.sources.some(s => s.batchId === id && s.sourceId === row.sourceId));
      const previous = existing.find(r => r.id === projected?.id || r.sources.some(s => projected?.sources.some(p => p.batchId === s.batchId && p.sourceId === s.sourceId)));
      const superseded = !!previous?.pending && !projected?.pending;
      const duplicate = !!previous || existing.some(r => r.fingerprint === row.fingerprint || r.id === row.duplicateOf);
      const collisions = doc.rows.filter(r => r.fingerprint === row.fingerprint).length > 1 || existing.some(r => r.fingerprint === row.fingerprint && ((r.reference && row.reference && r.reference !== row.reference) || r.merchant !== row.merchant));
      const categoryOnly = !row.verified && !row.category && !!suggestion.category && suggestion.confidence < 9000 && !row.issues.length && row.confidence >= 9000 && !near.length && !collisions;
      return { row, suggestion, categoryOnly, superseded, original: doc.rawRows?.find(r => r.sourceId === row.sourceId), near, duplicate, collision: collisions, blocked: !row.verified && (row.issues.length > 0 || row.confidence < 9000 || near.length > 0 || collisions || (!row.category && !!suggestion.category && suggestion.confidence < 9000)) };
    }).sort((a, b) => Number(b.blocked) - Number(a.blocked) || a.row.confidence - b.row.confidence || a.row.sourceId.localeCompare(b.row.sourceId));
    return { doc, items, continuity: continuity(doc.context.period, all.filter(b=>b.status==='committed' && !b.payslip && b.context.accountId===doc.context.accountId).map(b=>b.context.period)), supersededCount: items.filter(i=>i.superseded).length, balance: balance(doc), coverageAdded: doc.payslip ? [] : gaps(all.filter(b => b.status === 'committed' && b.id !== id && b.context.accountId === doc.context.accountId && !b.payslip).map(b => b.context.period), doc.context.period), newCount: new Set(items.filter(i => !i.duplicate).map(i => i.row.fingerprint)).size, duplicateCount: items.filter(i => i.duplicate && !i.superseded).length, uncertainCount: items.filter(i => i.blocked).length };
  }
  /**
   * Accepts the category the app already worked out for each row it could not be certain enough about.
   *
   * Until this existed the only one-press way past the category review was to throw every suggestion
   * away, so a statement the app had read correctly still arrived as hundreds of uncategorised rows —
   * and an uncategorised ledger makes every category figure in the app useless. Nothing is invented
   * here: a row with no suggestion stays uncategorised, and each accepted category is marked as coming
   * from a suggestion rather than from the person, so it can be found and changed later.
   */
  async function useSuggestedCategories(id: string) {
    return driver.transaction(async () => {
      const check = await review(id);
      if (!['staged', 'quarantined'].includes(check.doc.status)) throw new Error('Only staged categories can be reviewed.');
      for (const item of check.items) {
        if (!item.categoryOnly || !item.suggestion.category) continue;
        item.row.category = item.suggestion.category;
        item.row.categoryFrom = 'suggestion';
        item.row.verified = true;
      }
      await save(check.doc);
    });
  }
  async function leaveCategoriesUnassigned(id: string) {
    return driver.transaction(async () => {
      const check = await review(id);
      if (!['staged', 'quarantined'].includes(check.doc.status)) throw new Error('Only staged categories can be reviewed.');
      for (const item of check.items) if (item.categoryOnly) item.row.verified = true;
      await save(check.doc);
    });
  }
  async function correct(id: string, sourceId: string, change: Pick<NormalizedRow, 'date' | 'description' | 'merchant' | 'minor' | 'category' | 'occurrence' | 'duplicateOf'>, makeRule: boolean) {
    return driver.transaction(async () => {
      const doc = (await batches()).find(b => b.id === id); if (!doc || !['staged', 'quarantined'].includes(doc.status)) throw new Error('Only staged rows can be corrected.');
      const row = doc.rows.find(r => r.sourceId === sourceId); if (!row) throw new Error('This row was not found. Reopen the import review.');
      Object.assign(row, change, { verified: true, issues: [], createRule: makeRule }); row.fingerprint = rowFingerprint(row); validate(doc);
      if (row.duplicateOf) { const target = (await reconcileAsync((await batches()).filter(b => b.status === 'committed'))).find(r => r.id === row.duplicateOf || r.fingerprint === row.duplicateOf); if (!target || target.accountId !== row.accountId || target.currency !== row.currency || (target.minor !== row.minor && !(target.pending && !row.pending && Math.abs(dayNumber(target.date)-dayNumber(row.date))<=3 && similarity(target.merchant,row.merchant)>=9000))) throw new Error('That duplicate target does not match this account and amount. Keep the row separately.'); row.duplicateOf = target.id; }
      await save(doc);
    });
  }
  /**
   * "when i click confirm, nothing happens."
   *
   * Confirm was disabled, because rows the app is unsure about have to be settled first. Most of them
   * were one question asked many times over: a statement full of the same $11.95 at the same petrol
   * station on three consecutive days, and the same $1.90 twice in one afternoon. Of 44 uncertain rows
   * in his file, 34 were that — identical to another row IN THE SAME FILE — and answering them one sheet
   * at a time is not review, it is attrition.
   *
   * So they are answered once. Every row that looks like another row in this same file is marked a
   * separate purchase, which is what RowCorrection's "Keep as a separate purchase" does for one row.
   *
   * WHAT THIS DELIBERATELY WILL NOT TOUCH: a row that resembles something ALREADY IN THE LEDGER. That is
   * the case where saying "they are both real" double counts money, and it is the one that has to be
   * looked at. Categories are left alone too, so this and "Use these categories" can be pressed in
   * either order without one undoing the other.
   *
   * @returns how many rows it settled, so the screen can say so rather than appear to do nothing.
   */
  async function keepSeparate(id: string) {
    return driver.transaction(async () => {
      const check = await review(id);
      const doc = (await batches()).find(b => b.id === id);
      if (!doc || !['staged', 'quarantined'].includes(doc.status)) throw new Error('Only staged rows can be corrected.');
      let settled = 0;
      for (const item of check.items) {
        if (!item.blocked || (!item.collision && item.near.length === 0)) continue;
        if (item.near.some(r => r.sources.some(source => source.batchId !== id))) continue;
        const row = doc.rows.find(r => r.sourceId === item.row.sourceId);
        if (!row) continue;
        Object.assign(row, {occurrence: row.reference || `${id}:${row.sourceId}`, duplicateOf: null, verified: true, issues: []});
        row.fingerprint = rowFingerprint(row);
        settled += 1;
      }
      if (settled) { validate(doc); await save(doc); }
      return settled;
    });
  }
  async function rebuild() {
    const docs = (await batches()).filter(b => b.status === 'committed');
    const ledger = await reconcileAsync(docs);
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
      await driver.execute('UPDATE transactions SET status=? WHERE id=?', [row.pending ? 'pending' : 'settled', row.id]);
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
    await syncManual(driver);
    await syncNotices(driver);
    await applyCategoryEdits(driver);
  }
  async function commitUnlocked(id: string) {
      const check = await review(id);
      if (check.doc.status === 'committed') return { added: 0, alreadyImported: true, known: check.duplicateCount, superseded: 0 };
      if (check.doc.status === 'rolled_back') throw new Error('Import this file again before committing it.');
      if (!check.balance.valid) throw new Error(`Balance differs by ${check.balance.difference.toString()} minor units. Correct the statement or rows before committing.`);
      if (check.uncertainCount) throw new Error(`Review ${check.uncertainCount} uncertain rows before committing.`);
      const proposed = [...(await batches()).filter(b => b.status === 'committed' && b.id !== id), check.doc];
      const projection = await reconcileAsync(proposed);
      for (const document of proposed) if (!document.payslip && (!document.integrityTier || document.integrityTier === 'A')) {
        const contribution = projection.filter(r => r.sources.some(source => source.batchId === document.id)).reduce((sum, r) => { const source = r.sources.find(s=>s.batchId===document.id)!; return sum + BigInt(document.rows.find(v=>v.sourceId===source.sourceId)!.minor); }, 0n);
        if (BigInt(document.opening) + contribution !== BigInt(document.closing)) throw new Error(`The duplicate decision would break the balance of ${document.fileName}. Keep the transactions separately or review that statement first.`);
      }
      const before = await reconcileAsync((await batches()).filter(b=>b.status==='committed'));
      for(const row of projection) { const prior=before.find(r=>r.id===row.id); if(prior?.pending && !row.pending) await driver.execute('INSERT OR IGNORE INTO privacy_log(id,created_at,action,import_batch_id,metadata) VALUES(?,?,?,?,?)', [hash('supersession:'+id+':'+row.id),new Date().toISOString(),'transaction_superseded',id,JSON.stringify({transactionId:row.id,before:prior,after:row})]); }
      check.doc.rows.forEach(row => { row.verified = true; });
      await save(check.doc);
      await driver.execute("UPDATE import_batches SET status='committed' WHERE id=?", [id]); await rebuild();
      await reanchorOpening(driver, check.doc.context.accountId, (await batches()).filter(b => b.status === 'committed'));
      return { added: check.newCount, alreadyImported: false, known: check.duplicateCount, superseded: check.supersededCount };
  }
  async function commit(id: string) { return driver.transaction(()=>commitUnlocked(id)); }
  async function rollback(id: string) {
    return driver.transaction(async () => { const doc = (await batches()).find(b => b.id === id); if (!doc) throw new Error('That import was not found.'); await driver.execute("UPDATE import_batches SET status='rolled_back' WHERE id=?", [id]); await rebuild();
      await reanchorOpening(driver, doc.context.accountId, (await batches()).filter(b => b.status === 'committed')); });
  }
  /**
   * Take a rolled-back import off the list for good.
   *
   * A rolled-back file left a row sitting there saying "Removed from ledger" with nothing to press and
   * nothing more to say — "whats the purpose sitting there". It is a record of something that no longer
   * affects anything, so it is kept until somebody says otherwise and then it goes completely.
   *
   * ONLY A ROLLED-BACK ONE. A committed import is the evidence behind transactions in the ledger, and a
   * staged one is a file waiting to be reviewed; neither is something to quietly drop.
   */
  async function forget(id: string) {
    return driver.transaction(async () => {
      const doc = (await batches()).find(b => b.id === id);
      if (!doc) throw new Error('That import was not found.');
      if (doc.status !== 'rolled_back') throw new Error('Only an import that has been rolled back can be removed from this list.');
      for (const table of ['transaction_sources', 'transactions', 'staging_rows', 'coverage_ranges']) {
        await driver.execute(`DELETE FROM ${table} WHERE import_batch_id=?`, [id]);
      }
      await driver.execute('DELETE FROM import_batches WHERE id=?', [id]);
    });
  }
  async function ledger() {
    return (await import('./materialized')).materializedLedger(driver);
  }
  /** One window of the Transactions list, with search and ordering applied in SQL. */
  async function ledgerPage(search = '', offset = 0, limit = 200) {
    return (await import('./materialized')).materializedPage(driver, search, offset, limit);
  }
  /** Bounded candidates for the bulk-categorisation sheet, matched in SQL on its own filter. */
  async function ledgerBulk(search = '') {
    return (await import('./materialized')).materializedBulk(driver, search);
  }
  /** Per-account data-health counts, aggregated rather than transferred. */
  async function ledgerHealth() {
    return (await import('./materialized')).materializedHealth(driver);
  }
  async function summaries(): Promise<BatchSummary[]> {
    const rows = await driver.query(`SELECT b.id,b.file_name,b.account_id,b.period_start,b.period_end,b.status,b.integrity_tier,
      CASE WHEN b.status IN ('staged','quarantined') THEN json_extract(d.payload,'$.sessionId') ELSE NULL END AS session_id,
      p.employer,p.pay_date,p.period_start AS pay_period_start,p.period_end AS pay_period_end,p.gross_minor,p.net_minor,p.tax_minor,p.super_minor,p.deductions,p.allowances,p.ytd,p.currency AS pay_currency
      FROM import_batches b JOIN staging_rows d ON d.import_batch_id=b.id AND d.source_row_id='__document__'
      LEFT JOIN payslips p ON p.import_batch_id=b.id ORDER BY b.id`);
    return rows.map(record => {
      const payslip: Payslip | null = record.employer === null ? null : {
        employer: String(record.employer), payDate: String(record.pay_date), period: { start: String(record.pay_period_start), end: String(record.pay_period_end) },
        gross: String(record.gross_minor), net: String(record.net_minor), tax: String(record.tax_minor), super: String(record.super_minor),
        deductions: JSON.parse(String(record.deductions)) as Payslip['deductions'], allowances: JSON.parse(String(record.allowances)) as Payslip['allowances'],
        ytd: JSON.parse(String(record.ytd)) as Payslip['ytd'], currency: currency(String(record.pay_currency)),
      };
      return {
        id: String(record.id), fileName: String(record.file_name), status: String(record.status) as BatchSummary['status'],
        context: { accountId: String(record.account_id), period: { start: String(record.period_start), end: String(record.period_end) } },
        ...(record.integrity_tier === null ? {} : { integrityTier: String(record.integrity_tier) as NonNullable<BatchSummary['integrityTier']> }),
        ...(record.session_id === null ? {} : { sessionId: String(record.session_id) }), payslip,
      };
    });
  }
  async function workspace(search = '', offset = 0, limit = 200) {
    const pending = await files(), documents = await summaries();
    const page = await ledgerPage(search, offset, limit);
    return { files: pending, batches: documents, ledger: page.rows, ledgerTotal: page.total, health: await ledgerHealth() };
  }
  async function stageFile(fileName: string, data: string, fileHash: string, sessionId = hash('session:'+fileHash)) {
    if (!/^[a-f0-9]{64}$/.test(fileHash) || data.length > 27962032) throw new Error('File is too large or its identity is invalid. Choose a file below 20 MB.');
    const id = hash('incoming:' + fileHash);
    await driver.transaction(async () => {
      await driver.execute('INSERT OR IGNORE INTO import_batches(id,source_file_hash,file_name,parser_version,status,created_at) VALUES(?,?,?,?,?,?)', [id, fileHash, fileName, 'awaiting-extraction-v1', 'staged', new Date().toISOString()]);
      await driver.execute('INSERT OR IGNORE INTO staging_rows(id,import_batch_id,source_row_id,payload,confidence,issues) VALUES(?,?,?,?,?,?)', [id, id, '__file__', JSON.stringify({ fileName, data, hash: fileHash, sessionId }), 0, '[]']);
    }); return id;
  }
  async function files() { return (await driver.query(`SELECT s.id,b.file_name FROM staging_rows s JOIN import_batches b ON b.id=s.import_batch_id WHERE s.source_row_id='__file__' ORDER BY b.created_at,s.id`)).map(r => ({ id: String(r.id), name: String(r.file_name) })); }
  async function loadFile(id: string): Promise<{ fileName: string; data: string; hash: string; sessionId?: string }> { const row = (await driver.query(`SELECT payload FROM staging_rows WHERE id=? AND source_row_id='__file__'`, [id]))[0]; if (!row) throw new Error('That staged file was removed. Choose it again.'); return JSON.parse(String(row.payload)) as { fileName: string; data: string; hash: string; sessionId?: string }; }
  async function removeFile(id: string) { await driver.transaction(async () => { await driver.execute(`DELETE FROM import_batches WHERE id=? AND parser_version='awaiting-extraction-v1'`, [id]); }); }
  async function correctPayslip(id: string, payslip: NonNullable<Document['payslip']>) {
    await driver.transaction(async () => { const doc = (await batches()).find(b => b.id === id); if (!doc || !doc.payslip || !['staged', 'quarantined'].includes(doc.status)) throw new Error('Only a staged payslip can be corrected.'); doc.payslip = payslip; validate(doc); await save(doc); });
  }
  async function correctBalances(id: string, opening: string, closing: string) {
    await driver.transaction(async () => { const doc = (await batches()).find(b => b.id === id); if (!doc || !['staged', 'quarantined'].includes(doc.status)) throw new Error('Only staged balances can be corrected.'); doc.opening = opening; doc.closing = closing; validate(doc); await save(doc); });
  }
  async function savedMapping(issuer: string): Promise<ExportMapping | undefined> { const r=(await driver.query('SELECT value FROM app_settings WHERE key=?',['export-mapping:'+issuer]))[0]; return r ? JSON.parse(String(r.value)) as ExportMapping : undefined; }
  async function saveMapping(issuer: string, mapping: ExportMapping) { await driver.execute('INSERT OR REPLACE INTO app_settings(key,value) VALUES(?,?)',['export-mapping:'+issuer,JSON.stringify(mapping)]); }
  async function audit(transactionId: string) { return (await driver.query("SELECT metadata FROM privacy_log WHERE action='transaction_superseded' ORDER BY created_at,id")).map(r=>JSON.parse(String(r.metadata)) as {transactionId:string;before:unknown;after:unknown}).filter(r=>r.transactionId===transactionId); }
  async function commitSession(ids: string[]) { return driver.transaction(async()=> { const results=[]; for(const id of ids) results.push(await commitUnlocked(id)); return results; }); }
  async function reminderDay(): Promise<number|null> { const r=(await driver.query("SELECT value FROM app_settings WHERE key='update-reminder'"))[0]; if(!r)return null;const value=JSON.parse(String(r.value)) as unknown;return typeof value==='number' && Number.isInteger(value)&&value>=0&&value<=6?value:null; }
  async function setReminderDay(day:number|null) { if(day!==null&&(!Number.isInteger(day)||day<0||day>6))throw new Error('Choose a weekday.');await driver.execute("INSERT OR REPLACE INTO app_settings(key,value) VALUES('update-reminder',?)",[JSON.stringify(day)]); }
  return { workspace, keepSeparate, forget, ledgerPage, ledgerBulk, ledgerHealth, leaveCategoriesUnassigned, useSuggestedCategories, reminderDay, setReminderDay, savedMapping, saveMapping, audit, commitSession, batches, summaries, stage, review, correct, correctBalances, correctPayslip, commit, rollback, ledger, rules, aliases, stageFile, files, loadFile, removeFile };
}
