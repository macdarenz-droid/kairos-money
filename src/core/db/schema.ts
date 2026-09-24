import { integer, text, sqliteTable, primaryKey } from 'drizzle-orm/sqlite-core';

export const accounts = sqliteTable('accounts', {
  id: text('id').primaryKey().notNull(),
  name: text('name').notNull(),
  institution: text('institution').notNull(),
  type: text('type').notNull(),
  currency: text('currency').notNull(),
  mask_last4: text('mask_last4'),
  opening_balance_minor: integer('opening_balance_minor').notNull(),
  archived_at: text('archived_at'),
});

export const import_batches = sqliteTable('import_batches', {
  id: text('id').primaryKey().notNull(),
  account_id: text('account_id'),
  source_file_hash: text('source_file_hash').notNull(),
  file_name: text('file_name').notNull(),
  issuer_id: text('issuer_id'),
  parser_version: text('parser_version').notNull(),
  period_start: text('period_start'),
  period_end: text('period_end'),
  status: text('status').notNull(),
  stated_opening_minor: integer('stated_opening_minor'),
  stated_closing_minor: integer('stated_closing_minor'),
  created_at: text('created_at').notNull(),
  integrity_tier: text('integrity_tier'),
  source_rank: integer('source_rank').notNull(),
});

export const coverage_ranges = sqliteTable('coverage_ranges', {
  id: text('id').primaryKey().notNull(),
  account_id: text('account_id').notNull(),
  period_start: text('period_start').notNull(),
  period_end: text('period_end').notNull(),
  import_batch_id: text('import_batch_id').notNull(),
});

export const categories = sqliteTable('categories', {
  id: text('id').primaryKey().notNull(),
  parent_id: text('parent_id'),
  name: text('name').notNull(),
  kind: text('kind').notNull(),
});

export const merchants = sqliteTable('merchants', {
  id: text('id').primaryKey().notNull(),
  canonical_name: text('canonical_name').notNull(),
  aliases: text('aliases').notNull(),
  default_category_id: text('default_category_id'),
  mcc: text('mcc'),
});

export const rules = sqliteTable('rules', {
  id: text('id').primaryKey().notNull(),
  priority: integer('priority').notNull(),
  matcher: text('matcher').notNull(),
  action: text('action').notNull(),
  created_by: text('created_by').notNull(),
});

export const transactions = sqliteTable('transactions', {
  id: text('id').primaryKey().notNull(),
  account_id: text('account_id').notNull(),
  posted_date: text('posted_date').notNull(),
  value_date: text('value_date'),
  amount_minor: integer('amount_minor').notNull(),
  currency: text('currency').notNull(),
  raw_description: text('raw_description').notNull(),
  merchant_id: text('merchant_id'),
  category_id: text('category_id'),
  subcategory_id: text('subcategory_id'),
  type: text('type').notNull(),
  transfer_group_id: text('transfer_group_id'),
  is_recurring: integer('is_recurring').notNull(),
  fingerprint: text('fingerprint').notNull(),
  import_batch_id: text('import_batch_id'),
  confidence: integer('confidence').notNull(),
  user_verified: integer('user_verified').notNull(),
  notes: text('notes').notNull(),
  fx_numerator: text('fx_numerator'),
  fx_denominator: text('fx_denominator'),
  fx_quote_currency: text('fx_quote_currency'),
  status: text('status').notNull(),
});

export const transaction_sources = sqliteTable('transaction_sources', {
  transaction_id: text('transaction_id').notNull(),
  import_batch_id: text('import_batch_id').notNull(),
  source_row_id: text('source_row_id').notNull(),
  original_payload: text('original_payload').notNull(),
}, table => [primaryKey({ columns: [table.transaction_id, table.import_batch_id, table.source_row_id] })]);

export const staging_rows = sqliteTable('staging_rows', {
  id: text('id').primaryKey().notNull(),
  import_batch_id: text('import_batch_id').notNull(),
  source_row_id: text('source_row_id').notNull(),
  payload: text('payload').notNull(),
  confidence: integer('confidence').notNull(),
  issues: text('issues').notNull(),
});

export const payslips = sqliteTable('payslips', {
  id: text('id').primaryKey().notNull(),
  employer: text('employer').notNull(),
  pay_date: text('pay_date').notNull(),
  period_start: text('period_start').notNull(),
  period_end: text('period_end').notNull(),
  gross_minor: integer('gross_minor').notNull(),
  net_minor: integer('net_minor').notNull(),
  tax_minor: integer('tax_minor').notNull(),
  super_minor: integer('super_minor').notNull(),
  deductions: text('deductions').notNull(),
  allowances: text('allowances').notNull(),
  ytd: text('ytd').notNull(),
  currency: text('currency').notNull(),
  linked_transaction_id: text('linked_transaction_id'),
  import_batch_id: text('import_batch_id').notNull(),
});

export const goals = sqliteTable('goals', {
  id: text('id').primaryKey().notNull(),
  name: text('name').notNull(),
  target_minor: integer('target_minor').notNull(),
  target_date: text('target_date'),
  funded_minor: integer('funded_minor').notNull(),
  kind: text('kind').notNull(),
  currency: text('currency').notNull(),
});

export const signals = sqliteTable('signals', {
  id: text('id').primaryKey().notNull(),
  period: text('period').notNull(),
  key: text('key').notNull(),
  value: text('value'),
  computed_at: text('computed_at').notNull(),
  version: integer('version').notNull(),
  status: text('status').notNull(),
  inputs: text('inputs').notNull(),
});

export const profiles = sqliteTable('profiles', {
  id: text('id').primaryKey().notNull(),
  period: text('period').notNull(),
  archetype: text('archetype'),
  axis_scores: text('axis_scores').notNull(),
  confidence: integer('confidence').notNull(),
  version: integer('version').notNull(),
  covered_days: integer('covered_days').notNull(),
});

export const insights = sqliteTable('insights', {
  id: text('id').primaryKey().notNull(),
  created_at: text('created_at').notNull(),
  kind: text('kind').notNull(),
  severity: text('severity').notNull(),
  title: text('title').notNull(),
  body: text('body').notNull(),
  evidence: text('evidence').notNull(),
  state: text('state').notNull(),
  projected_effect_minor: integer('projected_effect_minor').notNull(),
  currency: text('currency').notNull(),
  research_id: text('research_id').notNull(),
  action: text('action').notNull(),
  threshold: text('threshold').notNull(),
});

export const privacy_log = sqliteTable('privacy_log', {
  id: text('id').primaryKey().notNull(),
  created_at: text('created_at').notNull(),
  action: text('action').notNull(),
  import_batch_id: text('import_batch_id'),
  metadata: text('metadata').notNull(),
});

/** Mirrors migration 0005. balance_minor is what is OWED, held positive; see that migration for why. */
export const debts = sqliteTable('debts', {
  id: text('id').primaryKey().notNull(),
  name: text('name').notNull(),
  account_id: text('account_id'),
  currency: text('currency').notNull(),
  balance_minor: integer('balance_minor').notNull(),
  annual_rate_bp: integer('annual_rate_bp').notNull(),
  minimum_minor: integer('minimum_minor').notNull(),
  due_day: integer('due_day'),
  opened_at: text('opened_at').notNull(),
  closed_at: text('closed_at'),
});

/** Mirrors migration 0006. amount_minor is always positive; `direction` says who is holding it. */
export const ious = sqliteTable('ious', {
  id: text('id').primaryKey().notNull(),
  person: text('person').notNull(),
  direction: text('direction').notNull(),
  currency: text('currency').notNull(),
  amount_minor: integer('amount_minor').notNull(),
  reason: text('reason').notNull(),
  occurred_on: text('occurred_on').notNull(),
  transaction_id: text('transaction_id'),
  settled_at: text('settled_at'),
});

export const app_settings = sqliteTable('app_settings', {
  key: text('key').primaryKey().notNull(),
  value: text('value').notNull(),
});

export const fx_rates = sqliteTable('fx_rates', {
  as_of: text('as_of').notNull(),
  base: text('base').notNull(),
  quote: text('quote').notNull(),
  rate_e8: integer('rate_e8').notNull(),
  source: text('source').notNull(),
  fetched_at: text('fetched_at').notNull(),
}, table => [primaryKey({ columns: [table.as_of, table.base, table.quote] })]);

export const schema = { accounts, import_batches, coverage_ranges, categories, merchants, rules, transactions, transaction_sources, staging_rows, payslips, goals, signals, profiles, insights, privacy_log, app_settings, debts, ious, fx_rates };
/**
 * The migration each table first appeared in.
 *
 * Restoring needs this to tell two different things apart that look identical in a backup file: a table
 * MISSING because the app that wrote it did not have that table yet, and a table missing because the
 * backup is damaged. The first must restore empty; the second must refuse. Without the distinction you
 * have to choose one, and either choice is wrong half the time — silently losing a ledger, or rejecting
 * every backup taken before the newest feature.
 *
 * Add a row here whenever a migration creates a table. A table absent from this map is assumed to have
 * been there from the beginning, which is true of the sixteen from migration 1.
 */
/** app_settings keys under this prefix hold secrets: never exported, backed up or restored. */
export const SECRET_PREFIX = 'secret:';
export const tableIntroduced: Partial<Record<(typeof tableNames)[number], number>> = { fx_rates: 4, debts: 5, ious: 6 };
export const tableNames = ['accounts', 'import_batches', 'coverage_ranges', 'categories', 'merchants', 'rules', 'transactions', 'transaction_sources', 'staging_rows', 'payslips', 'goals', 'signals', 'profiles', 'insights', 'privacy_log', 'app_settings', 'debts', 'ious', 'fx_rates'] as const;
