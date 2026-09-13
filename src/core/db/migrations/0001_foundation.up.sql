CREATE TABLE accounts (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 80),
  institution TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL CHECK(type IN ('checking','savings','credit','cash','loan','investment')),
  currency TEXT NOT NULL CHECK(length(currency)=3),
  mask_last4 TEXT CHECK(mask_last4 IS NULL OR (length(mask_last4)=4 AND mask_last4 NOT GLOB '*[^0-9]*')),
  opening_balance_minor INTEGER NOT NULL DEFAULT 0 CHECK(opening_balance_minor IS NULL OR (typeof(opening_balance_minor)='integer' AND opening_balance_minor BETWEEN -9007199254740991 AND 9007199254740991)),
  archived_at TEXT
);

CREATE TABLE import_batches (
  id TEXT PRIMARY KEY NOT NULL,
  account_id TEXT REFERENCES accounts(id),
  source_file_hash TEXT NOT NULL,
  file_name TEXT NOT NULL,
  issuer_id TEXT,
  parser_version TEXT NOT NULL,
  period_start TEXT,
  period_end TEXT,
  status TEXT NOT NULL CHECK(status IN ('staged','committed','rolled_back','quarantined')),
  stated_opening_minor INTEGER CHECK(stated_opening_minor IS NULL OR (typeof(stated_opening_minor)='integer' AND stated_opening_minor BETWEEN -9007199254740991 AND 9007199254740991)),
  stated_closing_minor INTEGER CHECK(stated_closing_minor IS NULL OR (typeof(stated_closing_minor)='integer' AND stated_closing_minor BETWEEN -9007199254740991 AND 9007199254740991)),
  created_at TEXT NOT NULL,
  UNIQUE(source_file_hash, account_id),
  CHECK(period_start IS NULL OR period_end IS NULL OR period_start <= period_end)
);

CREATE TABLE coverage_ranges (
  id TEXT PRIMARY KEY NOT NULL,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  import_batch_id TEXT NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE,
  CHECK(period_start <= period_end),
  UNIQUE(account_id, period_start, period_end, import_batch_id)
);

CREATE TABLE categories (
  id TEXT PRIMARY KEY NOT NULL,
  parent_id TEXT REFERENCES categories(id),
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('essential','discretionary','debt','savings','income','transfer'))
);

CREATE TABLE merchants (
  id TEXT PRIMARY KEY NOT NULL,
  canonical_name TEXT NOT NULL,
  aliases TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(aliases)),
  default_category_id TEXT REFERENCES categories(id),
  mcc TEXT
);

CREATE TABLE rules (
  id TEXT PRIMARY KEY NOT NULL,
  priority INTEGER NOT NULL,
  matcher TEXT NOT NULL CHECK(json_valid(matcher)),
  action TEXT NOT NULL CHECK(json_valid(action)),
  created_by TEXT NOT NULL CHECK(created_by IN ('user','system'))
);

CREATE TABLE transactions (
  id TEXT PRIMARY KEY NOT NULL,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  posted_date TEXT NOT NULL,
  value_date TEXT,
  amount_minor INTEGER NOT NULL CHECK(amount_minor IS NULL OR (typeof(amount_minor)='integer' AND amount_minor BETWEEN -9007199254740991 AND 9007199254740991)),
  currency TEXT NOT NULL CHECK(length(currency)=3),
  raw_description TEXT NOT NULL,
  merchant_id TEXT REFERENCES merchants(id),
  category_id TEXT REFERENCES categories(id),
  subcategory_id TEXT REFERENCES categories(id),
  type TEXT NOT NULL CHECK(type IN ('debit','credit')),
  transfer_group_id TEXT,
  is_recurring INTEGER NOT NULL DEFAULT 0 CHECK(is_recurring IN (0,1)),
  fingerprint TEXT NOT NULL UNIQUE,
  import_batch_id TEXT REFERENCES import_batches(id),
  confidence INTEGER NOT NULL CHECK(confidence BETWEEN 0 AND 10000),
  user_verified INTEGER NOT NULL DEFAULT 0 CHECK(user_verified IN (0,1)),
  notes TEXT NOT NULL DEFAULT '',
  fx_numerator TEXT,
  fx_denominator TEXT,
  fx_quote_currency TEXT,
  CHECK((type='debit' AND amount_minor <= 0) OR (type='credit' AND amount_minor >= 0)),
  CHECK((fx_numerator IS NULL AND fx_denominator IS NULL AND fx_quote_currency IS NULL) OR (fx_numerator NOT GLOB '*[^0-9]*' AND length(fx_numerator)>0 AND fx_denominator NOT GLOB '*[^0-9]*' AND length(fx_denominator)>0 AND ltrim(fx_denominator,'0')<>'' AND length(fx_quote_currency)=3))
);

CREATE TABLE transaction_sources (
  transaction_id TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  import_batch_id TEXT NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE,
  source_row_id TEXT NOT NULL,
  original_payload TEXT NOT NULL CHECK(json_valid(original_payload)),
  PRIMARY KEY(transaction_id, import_batch_id, source_row_id)
);

CREATE TABLE staging_rows (
  id TEXT PRIMARY KEY NOT NULL,
  import_batch_id TEXT NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE,
  source_row_id TEXT NOT NULL,
  payload TEXT NOT NULL CHECK(json_valid(payload)),
  confidence INTEGER NOT NULL CHECK(confidence BETWEEN 0 AND 10000),
  issues TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(issues)),
  UNIQUE(import_batch_id, source_row_id)
);

CREATE TABLE payslips (
  id TEXT PRIMARY KEY NOT NULL,
  employer TEXT NOT NULL,
  pay_date TEXT NOT NULL,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  gross_minor INTEGER NOT NULL CHECK(gross_minor IS NULL OR (typeof(gross_minor)='integer' AND gross_minor BETWEEN -9007199254740991 AND 9007199254740991)),
  net_minor INTEGER NOT NULL CHECK(net_minor IS NULL OR (typeof(net_minor)='integer' AND net_minor BETWEEN -9007199254740991 AND 9007199254740991)),
  tax_minor INTEGER NOT NULL CHECK(tax_minor IS NULL OR (typeof(tax_minor)='integer' AND tax_minor BETWEEN -9007199254740991 AND 9007199254740991)),
  super_minor INTEGER NOT NULL CHECK(super_minor IS NULL OR (typeof(super_minor)='integer' AND super_minor BETWEEN -9007199254740991 AND 9007199254740991)),
  deductions TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(deductions)),
  allowances TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(allowances)),
  ytd TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(ytd)),
  currency TEXT NOT NULL CHECK(length(currency)=3),
  linked_transaction_id TEXT REFERENCES transactions(id),
  import_batch_id TEXT NOT NULL REFERENCES import_batches(id),
  CHECK(period_start <= period_end)
);

CREATE TABLE goals (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  target_minor INTEGER NOT NULL CHECK(target_minor IS NULL OR (typeof(target_minor)='integer' AND target_minor BETWEEN -9007199254740991 AND 9007199254740991)),
  target_date TEXT,
  funded_minor INTEGER NOT NULL DEFAULT 0 CHECK(funded_minor IS NULL OR (typeof(funded_minor)='integer' AND funded_minor BETWEEN -9007199254740991 AND 9007199254740991)),
  kind TEXT NOT NULL CHECK(kind IN ('goal','sinking','budget')),
  currency TEXT NOT NULL CHECK(length(currency)=3)
);

CREATE TABLE signals (
  id TEXT PRIMARY KEY NOT NULL,
  period TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT CHECK(value IS NULL OR json_valid(value)),
  computed_at TEXT NOT NULL,
  version INTEGER NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('ready','insufficient_data')),
  inputs TEXT NOT NULL CHECK(json_valid(inputs)),
  UNIQUE(period,key,version)
);

CREATE TABLE profiles (
  id TEXT PRIMARY KEY NOT NULL,
  period TEXT NOT NULL UNIQUE,
  archetype TEXT,
  axis_scores TEXT NOT NULL CHECK(json_valid(axis_scores)),
  confidence INTEGER NOT NULL CHECK(confidence BETWEEN 0 AND 10000),
  version INTEGER NOT NULL,
  covered_days INTEGER NOT NULL CHECK(covered_days >= 0),
  CHECK(covered_days >= 60 OR archetype IS NULL)
);

CREATE TABLE insights (
  id TEXT PRIMARY KEY NOT NULL,
  created_at TEXT NOT NULL,
  kind TEXT NOT NULL,
  severity TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  evidence TEXT NOT NULL CHECK(json_valid(evidence)),
  state TEXT NOT NULL CHECK(state IN ('new','seen','acted','dismissed')),
  projected_effect_minor INTEGER NOT NULL CHECK(projected_effect_minor IS NULL OR (typeof(projected_effect_minor)='integer' AND projected_effect_minor BETWEEN -9007199254740991 AND 9007199254740991)),
  currency TEXT NOT NULL CHECK(length(currency)=3),
  research_id TEXT NOT NULL,
  action TEXT NOT NULL,
  threshold TEXT NOT NULL
);

CREATE TABLE privacy_log (
  id TEXT PRIMARY KEY NOT NULL,
  created_at TEXT NOT NULL,
  action TEXT NOT NULL,
  import_batch_id TEXT REFERENCES import_batches(id),
  metadata TEXT NOT NULL CHECK(json_valid(metadata))
);

CREATE TABLE app_settings (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL CHECK(json_valid(value))
);
