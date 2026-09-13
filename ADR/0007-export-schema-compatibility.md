# Keep the export envelope backward compatible

The database advances to version 3 with additive transaction status and batch source/tier columns. The JSON/CSV export remains the version-2 export schema: the same 16 named tables, exact integer money and original table relationships. Additive columns are retained in the exported rows; no financial data is dropped.

`schema_version: 2` identifies that stable export contract. New `database_schema_version: 3` explicitly identifies the actual migrated storage schema. `version: 1` remains the archive format version. Future restore code must use `database_schema_version` for database migration decisions and reject unsupported required structure rather than assuming the export contract equals the database version.

Alternatives: change the existing export discriminator for additive columns, breaking the frozen Session 2 native export consumer; or strip the new fields, losing data. Both were rejected. The original native test remains unchanged; a revision assertion verifies the new database version and status fields separately.
