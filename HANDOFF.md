# Handoff

Current state as of 24 September 2026. Session history lives in git and in `docs/GATE_SESSION_*.md`.

## Read first
- `AGENTS.md`: working rules, including test-first bug fixes and the checks before every push.
- `docs/ARCHITECTURE.md`: the target design and the work streams.
- The ADRs from 0042 onwards: the brain (0042, 0048), the screen cut (0046), the Claude advisor (0045, 0047, 0049).

## What the app is now
- **One brain.** `src/brain/think(inputs)` is pure. `ledger/intelligence.ts` `inputs()` reads the ledger once and writes nothing. Every screen reads it through `useBrain()`.
- **Today:** money band, add transaction, triage, savings path, attention, week strip, today's entries.
- **Insights:** this month, where it went, bills and subscriptions, advice, the Claude advisor (when on), plan, money set aside. While money is tight, triage replaces all of these.
- **You:** currency (with the one-line currency split), net worth, settings, the Claude advisor, the privacy log.
- **Claude advisor:** optional and off by default, using the owner's own key. It sends the brain summary for reviews and masked merchant lists for sorting. Every call is logged.

## Checks
- Before every push: `npm run check` and `node scripts/test-money-lint.mjs`.
- CI runs the source gate on every push. The Android gate runs unless the push changes only docs (`scripts/android-needed.mjs`).
- `npm run device:strings` keeps the Android tests' wording in step with the app.

## Open
- The Low bugs listed in the Relay `tasks/TASKS.md`.
- The owner's device checks: one real Claude run with their key, and the three theme screenshots.
- The one-off `save-signing-key` job in `android.yml` on PR #1's branch can go. That branch is outside this stream.
