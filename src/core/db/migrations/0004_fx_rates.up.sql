CREATE TABLE fx_rates (
  as_of TEXT NOT NULL,
  base TEXT NOT NULL,
  quote TEXT NOT NULL,
  rate_e8 INTEGER NOT NULL CHECK(rate_e8 > 0),
  source TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  PRIMARY KEY (as_of, base, quote)
);
CREATE INDEX fx_rates_pair ON fx_rates(base, quote, as_of DESC);
