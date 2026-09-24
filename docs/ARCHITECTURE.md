# Architecture — target (owner decision 2026-09-24)

Kairos is a private Android money tracker (React 18, strict TS, Vite, Capacitor 6, SQLCipher, bigint money). This file is the target design for the next build. Where older docs disagree, this file wins.

## Why it changes
- Three engines answer the same questions differently: `src/intelligence`, `src/analysis` (36 metrics) and scattered rules. Today shows two different "safe to spend today" figures. There are six "how much to save" rules, four income definitions and four merchant keys.
- About 35 charts (23 on Insights) repeat the same answers: spending by category 5×, money in vs out 7×, bills 5×.
- Insights reads the whole ledger 4× per open, and `analyse()` writes tables on every read.
- There is too much to read: about 71k words of docs, and about 23% of source bytes are comments.

## Layers
| Layer | Folder | Rule |
|---|---|---|
| Money | `src/core/money` | Exact bigint only |
| Storage | `src/core/db`, `src/core/crypto` | SQLCipher behind the native PIN vault; export/backup/restore |
| Capture | `src/ingest`, `src/ledger` (writes) | Files, bank notices, widget and manual entries. Writes staging until the user confirms. |
| Brain | `src/brain` | Pure and deterministic; reads the ledger, never writes it |
| Network | `src/core/net` | Only `rates.ts` and `claude.ts`; neither may import db/ledger code |
| UI | `src/ui` | Renders brain output; owns all wording |
| Native | `android/` | Vault, widget, notices, reminders, themes |

## The brain (`src/brain`)
Input, read once per (date, display currency):
- `repo.intelligence.snapshot()` (the only ledger read);
- debts, holdings, buffer, goals, cancellations and dismissals.

The hook `useBrain` in `src/ui/money.ts` replaces `useAnalysis` and keeps its single shared query key.

`shared.ts` holds one definition of each basic idea:
- **Merchant key:** `merchantName()` from `src/ingest/normalize/index.ts`, the key the rules and the categoriser also use.
- **Income:** payslips, otherwise rows of kind income; refunds are not income.
- **Small purchase:** at or under 15 units.
- **Recurrence:** from `forecast.recurrences`.
- **Pay model:** forecast `payCycle` + `nextPayDate`.
- **Unusual charge:** one rule.
- **Sufficiency tier:** `verified | recorded | insufficient`. It labels; it never hides spending (ADR 0025). Pending and transfers are never counted as spending.

Output `Brain` (type in `src/brain/types.ts`, written first):
- `today`: the only spend/keep today, horizon, committed bills, method reading, savings path, debt targets.
- `attention`: at most 3 items (runway, fixed burden, unusual charge, due soon, debt due), each a typed payload.
- `spending`: this month and last month (in, out, left); categories (split-aware); top merchants; bills (yearly cost, next date, cancelled); small purchases, fees, refunds; busiest weekday; payday effect; 30-day `band`; 7-day `days`.
- `plan`: monthly keep/save/spend split, leaks, next roadmap step, debt strategy, targets, goals per pay, pay rise.
- `advice`: at most 3 items, each a closed rule id plus figures and evidence ids. Ranked by yearly impact × ease; hidden after 2 dismissals.
- `triage`: when distress is active, hide advice and plan, and show essentials plus free help.
- `coverage` and `tier` for the whole result.

`notificationPlan` stays a pure export, called once per account currency. `summary.ts` builds the redacted `BrainSummary` for the advisor.

Removed:
- `src/analysis/**`
- intelligence insights, profile archetypes and axes, fingerprint, daily cashflow
- forecast safe-to-spend and horizons

`displayRatio` moves to `src/ui/design/ratio.ts`. The signals, insights and profiles tables stay (for export compatibility) but are no longer written.

## Claude advisor (optional; owner's own key; off by default)
**Module and transport**
- `src/core/net/claude.ts` uses the official `@anthropic-ai/sdk` with a fetch adapter over native `CapacitorHttp`.
- It is lazy-loaded and non-streaming, with timeouts.

**Request**
- `messages.create` with `output_config.format: {type: 'json_schema', schema}`, then a local validator: every point must cite fact ids that exist in the summary.
- Default `claude-opus-5`: adaptive thinking, effort `medium`, server-side refusal fallback.
- `claude-sonnet-5`: adaptive thinking.
- `claude-haiku-4-5`: no thinking or effort settings.
- Always check `stop_reason` (including `refusal`). On any failure, show local advice only.

**What is sent:** `BrainSummary` only, which is aggregates and rule ids. No transaction ids, account names or raw descriptions. Merchant names are sent only if the owner switches that on.

**Screens:** "Money review" and "Ask Kairos". Every number on screen comes from the brain; Claude's text is labelled "AI wording".

**Key and log**
- The key is stored in `app_settings` under the reserved `secret:` prefix.
- Export and backup skip `secret:%`. Restore keeps local secrets and rejects any backup that contains them.
- Every call is logged in `privacy_log` (`action='advisor_call'`: time, model, tokens, cost) and shown in Settings › Privacy log.
- "See exactly what is sent" shows the payload before any call.

## Claude sorts categories (owner request 2026-09-24)
Goal: accurate categories across the whole history, with nothing left uncategorised. This makes the brain's charts and advice accurate too. The brain stays read-only; this step is a separate writer that needs its own consent.

**What is sent**
- One entry per unique merchant (key = `merchantName()` from `src/ingest/normalize/index.ts`, the same key the rules and the brain use).
- For each merchant: its description with runs of 4 or more digits masked, direction in/out, an amount band, count, MCC if known, and its current category.
- Examples from the owner's own corrections, so Claude learns them.
- Never sent: transfers, split rows, dates, exact amounts, accounts.

**The call**
- `claude.ts categorise()`, with at most 150 merchants per request.
- The JSON schema limits the answer to the app's category list, with confidence `high | medium | low`.
- Unknown keys and categories are dropped.

**Where the answer is stored:** `app_settings` key `ai-category:<merchantKey>` holding `{category, confidence, model, at}`.

**Precedence in `categorize()`, strongest first**
1. The owner's tag on a single transaction.
2. The owner's merchant rule.
3. A confirmed merchant default.
4. **Claude's category.**
5. MCC.
6. Description hint.
7. Uncategorised.

The owner's tags always win. Claude never overwrites them.

**Applying**
- `high` and `medium` answers apply in one run. The run record `ai-run:<id>` keeps the previous values, so **Undo** restores the whole run.
- `low` answers become one-tap proposals under "Check these", using the existing Proposal chips.
- History rows show a small "AI" mark. Correcting one offers "All from this merchant", which creates an owner rule.
- A cost estimate is shown before starting. Every call is logged in `privacy_log`.

**Consent:** switch "Send merchant names to Claude for sorting" (off by default), with "See exactly what is sent".

**After imports:** an optional switch sorts only new merchants after each import.

**Streams:** S5a (storage, precedence, undo, payload builder in `src/ledger/ai-categories.ts`), S2a (`categorise()`), S2b (screen, consent, AI mark, "All from this merchant"). This depends on S5a's fix for transaction ids changing on re-import.

## Screens after the cut (~35 charts → ~9)
- **Today:** MoneyBand, SavingsPath (single spend/keep today), Attention (≤3, including DueStrip), DayStrip, Recorded today, triage card.
- **Insights:**
  - Month summary (FlowBar + change vs last month).
  - Where it went (one CategorySplit + top merchants).
  - Bills & subscriptions, with the cancelled marker.
  - Advice (≤3) + Money review / Ask Kairos.
  - Plan (split, leaks, DebtBurn, money set aside: buffer + goals).
- **Ledger:** unchanged, including the multi-file update review. The coverage bar and /100 score become one line that still names gap dates.
- **You:** Currency, Appearance, Brain, Notifications, Bank notices, Privacy, Net worth.
- **Removed:** SpendRing, second safe-to-spend, SpendingPatterns, MoneyFlowCard, MoneyVisuals, Habits, Every measure, CurrencyExposureCard (becomes one line under Currency), settlement history, import note.
- **Kept strings** (hash-frozen tests): "Still learning", "Your JSON and CSV export was saved.", "That PIN did not match.", "✓ Balance check passed".

## Themes (5)
**The themes:** `dark` and `light` (unchanged), `black` (OLED), `paper` (warm, low glare), `contrast` (7:1). Preference is `system | <id>`.

**Generation:** `scripts/tokens.mjs` produces `tokens.css`, `docs/CONTRAST.md` and `android/app/src/main/res/values/kairos_theme_colors.xml`. It fails the build below AA (7:1 for `contrast`).

**Where the theme is applied:**
- **Web:** `theme.ts` registry `{id, label, scheme, metaColor}`; the `index.html` bootstrap script, with a test that checks its CSP hash.
- **Native:** `KairosVaultPlugin.setTheme`; `MainActivity` and `QuickAddActivity` choose by scheme.

**Button labels:** "Dark" and "Light" keep their exact labels.

## Work streams
Each stream branches from the integration branch and returns one PR. Parallel lanes never share files.

| Step | Stream | Starts |
|---|---|---|
| 0 | Keep the CI signing key (owner token + one CI job) | now |
| 1 | S1a Brain contract (`src/brain/types.ts`) | now |
| 2a | S1b Brain core, additive only (`src/brain/**`, brain tests, lint rules) | after 1 |
| 2b | S4 Themes | now |
| 2c | S5a Bug fixes + db (export paging, `fx_rates` backup v3, `secret:` rule, advisor log) | now |
| 2d | S2a Advisor core (`claude.ts`, network allow-list, mocked tests) | after 1 |
| 3 | S3 Screens cut + rewire (UI, deletions, Android tests, gate scripts) | after 2a–2c |
| 4 | S2b Advisor UI | after 3 + 2d |
| 5 | S5b Docs + dead-code cleanup | after 4 |

**Done means**
- `npm run check` + money lint green.
- New logic has tests; no test is skipped or weakened.
- The Android CI gate is green.
- One ADR per decision (0042 onwards).
- A result posted to Relay.
