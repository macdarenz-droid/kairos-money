-- A debt the app can reason about, rather than a category called "Debt".
--
-- balance_minor is what is OWED, held as a positive number. Accounts store a credit balance as a
-- negative opening balance; this table does the opposite on purpose, because every question asked of it
-- ("how long until this is gone", "what is it costing") reads naturally with a positive amount owed, and
-- a sign convention that flips halfway through a calculation is how interest ends up subtracted.
--
-- annual_rate_bp is BASIS POINTS: 1999 is 19.99%. A rate is a ratio, not money, so it is not in minor
-- units — and it is not a float either, for the same reason no amount in this database is.
CREATE TABLE debts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  -- The account this debt is held on, when there is one. A debt can exist without one: money owed to a
  -- person, or a loan whose statements are not imported.
  account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL,
  currency TEXT NOT NULL,
  balance_minor INTEGER NOT NULL CHECK(balance_minor >= 0),
  annual_rate_bp INTEGER NOT NULL CHECK(annual_rate_bp >= 0),
  minimum_minor INTEGER NOT NULL CHECK(minimum_minor >= 0),
  -- Day of the month a payment is due, when the lender sets one. Null is honest for a debt with no
  -- fixed date; a guessed date would put a mark on the strip that means nothing.
  due_day INTEGER CHECK(due_day IS NULL OR (due_day >= 1 AND due_day <= 31)),
  opened_at TEXT NOT NULL,
  -- Set when it is paid off. Cleared debts are kept, not deleted: what it cost is part of the record.
  closed_at TEXT
);
CREATE INDEX debts_open ON debts(closed_at, currency);
