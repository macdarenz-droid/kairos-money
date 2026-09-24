import {describe, expect, it} from 'vitest';
import {statements} from '../src/core/db/migrate';

/**
 * Migrations are where the reasoning behind a schema belongs, and that reasoning is worth nothing if
 * writing it down can corrupt the schema. Splitting on every ";" used to do exactly that: a semicolon
 * inside a comment cut the statement in half and the fragments went to SQLite as SQL. It stayed hidden
 * because no migration had ever carried a comment — and it surfaced as a syntax error naming an English
 * word, which points nowhere near the punctuation that caused it.
 */
describe('splitting a migration into statements', () => {
  it('keeps a trigger body whole, up to its END', () => {
    const sql = "CREATE TRIGGER g BEFORE INSERT ON t WHEN NEW.a IS NULL BEGIN SELECT RAISE(ABORT, 'no; really'); END;\nCREATE TABLE u (b TEXT);";
    expect(statements(sql)).toEqual(["CREATE TRIGGER g BEFORE INSERT ON t WHEN NEW.a IS NULL BEGIN SELECT RAISE(ABORT, 'no; really'); END", 'CREATE TABLE u (b TEXT)']);
  });

  it('drops a line comment', () => {
    expect(statements('-- why this table exists\nCREATE TABLE t (a TEXT);')).toEqual(['CREATE TABLE t (a TEXT)']);
  });

  it('is not cut in half by a semicolon inside a comment', () => {
    const sql = '-- one thing; and another\nCREATE TABLE t (a TEXT);';
    expect(statements(sql)).toEqual(['CREATE TABLE t (a TEXT)']);
  });

  it('drops a comment sitting between columns', () => {
    const sql = 'CREATE TABLE t (\n  a TEXT,\n  -- b is null when unknown; a guess would be worse\n  b TEXT\n);';
    expect(statements(sql)).toEqual(['CREATE TABLE t (\n  a TEXT,\n  \n  b TEXT\n)']);
  });

  it('leaves a double hyphen inside a string literal alone', () => {
    // Removing this one would silently change a default value rather than a comment.
    expect(statements("INSERT INTO t(a) VALUES ('a--b');")).toEqual(["INSERT INTO t(a) VALUES ('a--b')"]);
  });

  it('leaves a double hyphen inside a quoted identifier alone', () => {
    expect(statements('CREATE TABLE "od--d" (a TEXT);')).toEqual(['CREATE TABLE "od--d" (a TEXT)']);
  });

  it('does not treat a semicolon inside a string as a statement break', () => {
    expect(statements("INSERT INTO t(a) VALUES ('x;y');")).toEqual(["INSERT INTO t(a) VALUES ('x;y')"]);
  });

  it('still splits ordinary statements, and drops empty fragments', () => {
    expect(statements('CREATE TABLE a (x TEXT);\n\nCREATE INDEX i ON a(x);\n')).toEqual(
      ['CREATE TABLE a (x TEXT)', 'CREATE INDEX i ON a(x)']);
  });
});
