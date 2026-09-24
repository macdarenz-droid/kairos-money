# 0042 — One brain

Accepted 24 September 2026 (owner decision; see `docs/ARCHITECTURE.md` › The brain).

## Decision
- `src/brain` is the only engine. It reads one snapshot per (date, display currency) and returns one `Brain`.
- The contract is `src/brain/types.ts`, written before any logic: today, attention (≤3), spending, plan,
  goals, advice (≤3, closed rule ids, closed figures per rule), triage, coverage and tier. The ≤3 limits are
  tuple types.
- Money is a bigint string of minor units. A figure drawn from transactions carries the ids it rests on: each
  spending figure, leak, pay rise, unusual charge, bill due soon, finding but debt interest, and advice built on
  these, on the figure itself; today, plan and triage on the section. Runway, fixed burden, debt interest, debts
  due and other advice rest on balances, debts or the plan split and carry an empty list; goals carry none.
- `BrainSummary` is the only shape the optional advisor sees: aggregates and rule ids, no transaction ids,
  account names, goal names or raw descriptions; merchant names only when the owner allows. A type test
  enforces this; it rejects any open (index-signature) key and proves it can fail.

## Consequences
Screens stop computing their own answers and read `useBrain`; `src/analysis` and the duplicate rules go (S3).
