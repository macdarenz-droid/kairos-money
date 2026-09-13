ALTER TABLE transactions ADD COLUMN status TEXT NOT NULL DEFAULT 'settled' CHECK(status IN ('pending','settled'));
ALTER TABLE import_batches ADD COLUMN integrity_tier TEXT CHECK(integrity_tier IN ('A','B','C'));
ALTER TABLE import_batches ADD COLUMN source_rank INTEGER NOT NULL DEFAULT 0 CHECK(source_rank BETWEEN 0 AND 4);
