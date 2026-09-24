# 0044 — Secrets never leave the phone

Accepted 24 September 2026 (owner decision; see `docs/ARCHITECTURE.md` › Claude advisor › Key and log).

## Decision
- `app_settings` keys starting `secret:` (for example the owner's Claude API key) are reserved for secrets.
- `exportAll` skips them, so the JSON/CSV ZIP and the encrypted backup never carry one.
- Restore refuses any backup that contains a `secret:` row, and keeps the phone's own secrets across it.
- Export and backup now read each table in pages of 256 rows (ADR 0033) and carry `fx_rates`
  (export `schema_version` 3; older exports restore without rates).
- Each advisor call is logged in `privacy_log` as `advisor_call`: model, tokens, cost in micro-dollars, result.

## Consequences
A restored phone needs its key typed again. Tests prove no `secret:` text reaches the ZIP or the backup.
