-- MONEY BETWEEN PEOPLE, which is not the same thing as a debt.
--
-- The debts table is about lenders: a rate, a minimum payment, a due day. None of that is true of the
-- two thousand pesos a friend covered at dinner. What is true of that is a name, an amount, which way it
-- goes, and whether it has been settled — and none of those had anywhere to live, so this kind of money
-- was either recorded as an ordinary expense, which makes it look spent, or not recorded at all.
--
-- DIRECTION IS A COLUMN, NOT A SIGN. A signed amount would work and would be shorter, but every read of
-- it has to remember which way positive points, and the one place that forgets turns money you are owed
-- into money you owe. The amount here is always positive; direction says who is holding it.
CREATE TABLE ious (
  id TEXT PRIMARY KEY,
  -- The person, as the user writes their name. Deliberately not a foreign key to anything: there is no
  -- contacts table, and there should not be one — a name typed once is the whole record anybody wants.
  person TEXT NOT NULL,
  direction TEXT NOT NULL CHECK(direction IN ('owed_to_me', 'owed_by_me')),
  currency TEXT NOT NULL,
  amount_minor INTEGER NOT NULL CHECK(amount_minor > 0),
  -- What it was for. Six months later this is the only thing that makes the amount mean anything.
  reason TEXT NOT NULL,
  occurred_on TEXT NOT NULL,
  -- The ledger row this came from or went to, when there is one. An IOU can exist without one: cash
  -- handed over leaves no statement line anywhere.
  transaction_id TEXT REFERENCES transactions(id) ON DELETE SET NULL,
  -- Set when it is squared up. Settled entries are kept, not deleted: "did I ever pay that back" is a
  -- real question, and a deleted row answers it with silence.
  settled_at TEXT
);
CREATE INDEX ious_open ON ious(settled_at, person);
