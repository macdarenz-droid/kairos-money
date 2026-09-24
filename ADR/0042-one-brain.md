# 0042 — One brain

Accepted 24 September 2026 (owner decision; see `docs/ARCHITECTURE.md` › The brain).

## Decision
- `src/brain` is the only engine. It reads one snapshot per (date, display currency) and returns one `Brain`.
- The contract is `src/brain/types.ts`, written before any logic: today, attention (≤3), spending, plan,
  goals, advice (≤3, closed rule ids), triage, coverage and tier.
- Money is a bigint string of minor units; every figure carries the transaction ids it rests on.
- `BrainSummary` is the only shape the optional advisor sees: aggregates and rule ids, no transaction ids,
  account names, goal names or raw descriptions; merchant names only when the owner allows. A type test
  enforces this.

## Consequences
Screens stop computing their own answers and read `useBrain`; `src/analysis` and the duplicate rules go (S3).
