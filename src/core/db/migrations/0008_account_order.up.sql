-- The owner's order for accounts. Its own table, not a column on accounts: restore matches a table's
-- columns exactly, so a new column would refuse every backup written before it.
CREATE TABLE account_order (
  account_id TEXT PRIMARY KEY NOT NULL REFERENCES accounts(id),
  position INTEGER NOT NULL CHECK(typeof(position) = 'integer' AND position >= 0)
);
-- An existing install keeps the name order it already shows.
INSERT INTO account_order(account_id, position)
  SELECT a.id, (SELECT COUNT(*) FROM accounts b WHERE b.name < a.name OR (b.name = a.name AND b.id < a.id)) FROM accounts a;
