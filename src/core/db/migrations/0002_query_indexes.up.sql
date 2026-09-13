CREATE INDEX idx_transactions_account_date ON transactions(account_id, posted_date);
CREATE INDEX idx_coverage_account_period ON coverage_ranges(account_id, period_start, period_end);
CREATE INDEX idx_sources_batch ON transaction_sources(import_batch_id);
CREATE INDEX idx_staging_review ON staging_rows(import_batch_id, confidence);
CREATE INDEX idx_transactions_transfer ON transactions(transfer_group_id);
CREATE INDEX idx_rules_priority ON rules(priority);
