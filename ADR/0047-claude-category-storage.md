# 0047 — Claude category storage

Accepted 24 September 2026 (owner request; see `docs/ARCHITECTURE.md` › Claude sorts categories).

## Decision
- `src/ledger/ai-categories.ts` builds what is sent: one entry per `merchantName()` key under an opaque id,
  masked description (4+ digit runs), in/out, amount band, count, MCC, current category, plus owner-correction
  examples. Never transfers, split rows, dates, exact amounts or accounts.
- High and medium answers are stored as `ai-category:<merchantKey>`; low ones return as proposals.
- Precedence in `categorize()`: owner tag > owner rule > confirmed default > Claude > MCC > hint.
  An accepted import suggestion gives way to the first four.
- Each run is `ai-run:<id>` with the previous values; `undoRun` restores them. Such rows read `categoryFrom: 'ai'`.

## Consequences
Answers are keyed by merchant, so they survive rebuilds and re-imports. Pending notice rows are not sorted.
