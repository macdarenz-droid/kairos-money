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
- Skipped: merchants the owner or an earlier run already sorted; undoing that run makes them eligible again.

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

## Motion and feedback (owner request 2026-09-24)
Goal: every tap answers at once, every wait shows a money-themed animation, and the dashboard feels alive without slowing anything.

**Rules**
- Any action that can take over 300 ms uses the Button busy state. Any wait over 1 s with nothing new on screen shows a loader.
- Only `transform` and `opacity` animate. Loops run only while waiting. No new dependency (no animation library, no Lottie).
- `prefers-reduced-motion` turns every animation off (the blanket rule and `tests/motion.test.ts` stay). JS effects show the final state at once.
- Never hold the UI for an animation: data first, motion on top.

**Parts** (all in `src/ui/design/Motion.tsx` plus `styles.css`; each shown on `/dev/kitchen-sink`)
| Part | Looks like | Used for |
|---|---|---|
| `Coin` | a 16 px coin flipping on its edge | inside busy buttons |
| `CoinStack` | three coins drop in and stack, then fade, 1.6 s loop | replaces `BusyOverlay`'s KairosMark and the "Reading your money", "Reading accounts" and lock-check waits |
| `KairosAiWorking` | the Kairos AI mark thinking (below) with a status line | every Kairos AI call |
| Skeleton shimmer | a soft highlight sweeping the grey bars | list placeholders only |
| Count-up | a hero amount rolls from its old value to the new one in 600 ms | MoneyBand, month summary, FlowBar, SpendingCalendar totals |
| Chart grow-in | bars grow from zero, lines draw in, 400–600 ms, once per mount | FlowBar, CategorySplit, DayStrip (20 ms stagger), SavingsPath, DebtBurn, and the attention cards (Runway, FixedFree, DueStrip) |
| Success drop | a coin drops into the toast's check mark | toasts after a save |

**Button busy state:** `Button` gets `busy` and `busyLabel`. Busy means disabled, `aria-busy="true"`, a `Coin` before the label. Every hand-written `x ? 'Saving…' : 'Save'` moves to it (Lock, Manual, AccountSheet, ImportWorkspace, Settings, Backup, BulkProposals, SortCategories, AdvisorPanel), keeping today's exact busy words.

**Kairos AI waits:** `KairosAiWorking` sits under the button while a call runs: a fixed label for screen readers, one status line that changes every 3 s (at most 12 words each), and seconds elapsed after 10 s.

**Count-up is exact:** frames are bigint, `from + (to - from) * BigInt(i) / BigInt(n)` for n ≤ 20, formatted by the same formatter as today; the last frame is exactly `to`. The digits are `aria-hidden` and the label carries the final value. It runs once per value change, never per render.

**Keep:** loaders keep `role="status"` and today's labels. Hash-frozen tests and frozen strings stay untouched.

**Tests:** busy Button (disabled, `aria-busy`, label); count-up ends on the exact value and shows it at once under reduced motion; loaders keep their labels; `KairosAiWorking` shows during a slow mocked call and leaves after; `motion.test.ts` passes; money lint passes.

**Later:** haptics (needs a native plugin).

**Kairos AI (the advisor's name)**
- The owner sees "Kairos AI" wherever the advisor, its sorting or its log is named. Examples: the section "Kairos AI", the switch "Use Kairos AI", "Asking Kairos AI…", "Sorted by Kairos AI", "No Kairos AI calls".
- Where data leaves the phone, the words still name Claude and Anthropic:
  - the section line "Runs on Claude with your own Anthropic key.";
  - the switch "Let Kairos AI send merchant names to Claude";
  - the privacy lines;
  - "Anthropic did not accept the key." instead of "Claude did not accept the key.".
- Code names (`claude.ts`, `advisor`) stay.
- **Mark** (`public/branding/kairos-ai.svg`): a gradient ring with a gap and a dot, with a four-point sparkle inside.
- **`KairosAiMark({size, thinking})`:** gradient ids come from `useId`.
- **While thinking:**
  - the ring and dot turn once every 2.4 s, so the dot orbits;
  - the sparkle turns 45° and pulses between 0.82 and 1.04 every 1.2 s.
- **When idle:** still.
- **Used in:**
  - the Settings section title and the Money review / Ask panel title, at 20 px;
  - `KairosAiWorking`, at 36 px;
  - the ledger's "AI" tag, at 12 px, labelled "Sorted by Kairos AI".

**App logo: option C** ("the right moment": a ring with a gap and a dot, with savings bars rising inside).
- **Web:**
  - `public/branding/kairos-logo.svg` becomes the favicon (`image/svg+xml`) and the header/lock `Brand` image.
  - The aperture PNGs, `KairosMark` and its `kairos-step` keyframes are deleted once nothing uses them.
- **Android:** `kairos_launcher.xml` (adaptive icon) and `kairos_mark.xml` (notification icon) are already redrawn as vectors of logo C.


## Layout, layering and polish (S7, from the 2026-09-24 app audit)
Goal: one clear thing to press on each screen, fewer boxes, and everything in the right place and on the right layer. It comes after S6, on the same branch and PR. Hash-frozen tests must pass unchanged. When one of them asserts a label or structure, keep that label or structure and meet the goal another way.

**System** (`primitives.tsx`, `styles.css`, `tokens.css`)
- **Buttons.** Tokens: `--accent-solid` / `--on-accent`, which exist and are unused today.
  - `primary` is filled with the accent. There is one per screen or sheet: the next step.
  - `default` is outlined, for other actions.
  - `danger` has a negative-colour border and text.
  - `quiet` is accent-coloured text with no box, for Cancel and tertiary actions.
  - Extra primaries become `default`: BulkProposals "Set …", and more than one per screen.
- **Switches.** Every On/Off setting keeps its `<button aria-pressed>` and name, drawn as a switch: a track and a thumb that slides on `--motion-quick`. This covers Settings, Notifications and Kairos AI.
- **Borders.**
  - Only for controls (inputs, default and danger buttons) and row dividers.
  - Cards are `surface-1` on `surface-0` with no border, through one `.card` class that replaces `.surface`, `.band-tile` and `.notice-card`.
  - The Quick tab becomes a filled accent circle, not a boxed icon.
- **Scales.** Radius {4, 6, 10, 16, 999} px. Layering tokens: `--z-sticky: 2`, `--z-tabbar: 10`, `--z-toast: 30`.
- **Blocking waits and nesting.**
  - Blocking waits (`BusyOverlay`/`CoinStack`) open as a non-dismissable `<dialog>`, so they sit above an open sheet and stay fixed to the screen.
  - `Explain` inside a sheet opens inline, never as a second sheet.
- **Toasts and wrapping.** `.app` bottom padding clears the tab bar and a toast, so a toast never covers the last control. `.form-actions` wraps.
- **Clean-up.**
  - Delete the unused CSS families: `.balance-*`, `.axis-*`, `.answer-*`, `.fact*`, `.ring-*`, `.timeline*`, `.money-flow*`/`.flow-*`, `.exposure-*`, `.ranked*`, `.audit-*`, `.row-actions`, `.spending-bar`, `.drop-surface`, `.export-range`, `.money-visuals*`, `.fingerprint*`. Grep for each before deleting.
  - Merge the two `.sheet-actions` rules.
  - Focus rings use `--accent-text`.

**Today**
- **Order:**
  1. The triage card, only when active.
  2. MoneyBand.
  3. SavingsPath.
  4. Attention.
  5. DayStrip.
  6. Recorded today.
- **Numbers.**
  - One hero number at the top: today's spend figure at 40 px, counting up. The other figures stay small.
  - "Recorded today" drops to normal size.
  - SavingsPath's "Spend today" becomes "Left for today", so it no longer echoes "Spent today".
- **Rhythm and help.**
  - The sections sit in one `.stack`, so spacing no longer depends on whether Attention shows.
  - Runway, DueStrip, SavingsPath and DebtBurn get the inline Explain.
- **No data yet:** one card with a still coin stack and one primary, "Add your first statement", instead of a long blank.

**Insights**
- Advice goes in one card with row dividers.
- Add a "Top merchants" heading.
- Drop FlowBar's second heading under "This month".
- The "Money set aside" button reads "Edit".
- "Track a cancellation" becomes a quiet action on each bill row, not a separate list.

**Ledger**
- **Order:**
  1. A screen header with the primary "Import statements".
  2. Accounts, compact.
  3. History: search and list.
  4. Imports: "Files waiting" and "Imports" merged into one list, with a status per row.
  5. Coverage.
- **Coverage** becomes the one line promised above: gaps are named, and the score, bar and tiers are dropped.
- **Transaction sheets** (splits, original currency, refunds): Save is `primary`, Remove/confirm is `danger`, Cancel is `quiet`.
- **Smaller fixes.**
  - BulkCategories uses Load more.
  - "Change categories" is `quiet`.
  - Space is added between "History" and the search label.

**You** (Settings)
- **Order:**
  1. Currency.
  2. Appearance.
  3. Kairos AI.
  4. Notifications.
  5. Bank notices.
  6. Privacy.
  7. Net worth.
  8. Data: accounts set up, statement history, backup, restore and export.
  9. A spaced-off "Delete all data" at the very bottom.
- **Kairos AI in steps.**
  - At first, only the "Use Kairos AI" switch and the key field show.
  - Once a key is saved, the model, the two merchant-name switches and "Sort my categories" appear.
  - The switches read "Send merchant names with reviews" and "Send merchant names for sorting", under "Runs on Claude with your own Anthropic key."
- **Consistency.**
  - Deleting all data asks for the same confirmation in Settings and on the lock screen.
  - All icons in a list are leading.
  - Net worth gets the `settings-section` wrapper.
  - Info sheets are at most 2 sentences (bank notices, privacy log, delete).

**Tests:** new or updated focused tests for the button variants, the switch (state and name), Kairos AI steps, Ledger and Today order, and the blocking wait above an open sheet. Update non-frozen tests only alongside the code they test.

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

**Generation:** `scripts/tokens.mjs` produces `tokens.css`, `docs/CONTRAST.md`, `src/ui/design/theme-registry.ts` and `android/app/src/main/res/values/kairos_theme_colors.xml`. It fails the build below AA (7:1 for `contrast`).

**Where the theme is applied:**
- **Web:** generated `theme-registry.ts` `{id, label, scheme, background, swatch}`, re-exported by `theme.ts`; the `index.html` bootstrap script, with a test that checks its CSP hash.
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
| 6 | S6 Motion and feedback (branch `claude/kairos-motion`) | now |
| 7 | S7 Layout, layering and polish (same branch and PR) | after 6 |

**Done means**
- `npm run check` + money lint green.
- New logic has tests; no test is skipped or weakened.
- The Android CI gate is green.
- One ADR per decision (0042 onwards).
- A result posted to Relay.
