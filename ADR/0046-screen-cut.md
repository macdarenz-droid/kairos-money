# 0046 — Screen cut

Accepted 24 September 2026. Builds on ADR 0042 and 0048; replaces the analysis screens of ADR 0025–0039.
## Decision
- Every screen reads one `useBrain()` query (`['intelligence', day, code]`, one-minute staleTime); writes
  invalidate it. `useAnalysis`, `src/analysis`, and the signals, profile and insights engines are deleted.
- Today: money band, add transaction, triage, savings path, attention, week strip, today's entries.
- Insights: this month, where it went, bills and subscriptions (with cancellations and later charges),
  advice, an empty advisor slot for S2b, plan, money set aside. Triage replaces all of it.
- You holds net worth. About 35 charts become 9.
- The signals, insights and profiles tables stay for export compatibility and are no longer written.
- Device tests wait on a hidden `data-brain` mark, not on cards.

Consequence: removed tests went with their code (listed in the PR); S5b removes the claim audit script.
