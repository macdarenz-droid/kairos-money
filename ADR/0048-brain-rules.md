# 0048 — Brain rules

Accepted 24 September 2026. Builds on ADR 0042 and 0025 (label, don't hide).
## Decision
- `think(inputs)` in `src/brain` composes the existing kernel; `inputs()` in `ledger/intelligence.ts` reads
  everything once and writes nothing. Lint keeps `src/brain` free of db, network, ledger and UI imports.
- One definition each (`shared.ts`): merchant key = `merchantName()`; income = payslips, else income rows,
  never refunds; a small purchase is **at or under 15 units** of the display currency; bills from
  `recurrences`; one unusual-charge rule (3× usual, 5 visits, within 7 days).
- Spending is settled, non-transfer, non-savings money out. Pending rows and transfers never count.
- The tier (`verified | recorded | insufficient`) labels a result; hand-entered history is still used.
- Advice: at most 3, ranked by yearly impact × ease; a dismissal hides it for 30 days, two hide the rule.
- Triage (runway under 5 days, rising high-interest debt, 2+ overdraft fees) hides plan and advice.

Consequence: S3 rewires screens to `useBrain` and moves the kernel into `src/brain`.
