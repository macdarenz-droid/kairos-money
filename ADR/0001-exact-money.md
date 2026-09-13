# 0001 — Bigint arithmetic, exact SQLite bridge range

Decision: Money is an immutable `{ minor: bigint, currency }` value. Arithmetic and allocation use bigint exclusively. SQLite stores signed INTEGER minor units with an exact ±9,007,199,254,740,991 constraint. Conversion to the native bridge's JSON number occurs only after range validation. Exported table numbers remain exact integers within that range; nested Money values use strings.

Alternatives: Dinero v2; unrestricted SQLite int64; decimal or floating values. Bigint provides a small auditable implementation. Unrestricted int64 cannot pass safely through the Capacitor JSON number bridge. Values outside the bridge range fail explicitly. FX fields reserve integer numerator/denominator strings; no conversion is shipped in Session 1.

Evidence: 10,000 randomized operation sequences plus boundary, allocation, currency and formatting tests; type-aware ESLint rule with unsafe-operation regression fixture; database constraints reject fractional and overflowing amounts.
