# 0037 — Proposals turn entry into selection, without turning confirmation into a tap

Status: accepted; first implementation landed with the low-effort access pass. Device verification rides the pass's own gate.

The request was "just put this, this, this, and done" — not a shorter form. A shorter form still asks the user to supply the content. Kairos imports statements, so it already holds the user's own vocabulary: their merchants, categories, typical amounts, recurrence, accounts and pay cycle. The design therefore turns entry into selection. The app proposes from what it already holds, and the user confirms.

One `Proposal` type carries every such offer, rather than nine screen-specific shortcuts. Nine bespoke paths would be nine places for a financial mistake to hide, and nine places to audit when one of them proposed something it should not. Three properties make one mechanism safe to spread across the app.

A proposal is form state and never a committed record. `Save` still commits and still confirms, so "one tap" means one typing-free selection, not a skipped confirmation. A tap count that improves because a confirmation disappeared is a regression, and the tests assert the confirmation remains: filling a split commits nothing until Save, a repeat tile opens the form with Save still to press, and selecting a refund candidate still requires Confirm.

A proposal is always attributable. `evidence` lists the transaction ids it was derived from and `source` says where it came from, so the user can ask why something is offered and be answered from their own ledger, the same way a metric's evidence resolves in two taps.

A proposal never carries a statement about the user's behaviour. `Observation` exists for that and deliberately has no action affordance; `Proposal` has no statement. The two do not merge. A proposal helps with data entry the user has already decided to do.

Nothing proposed is invented. Bulk categorisation only ever offers a category the user already applied to that same merchant, so it cannot introduce a classification they never chose; with no history for a merchant it offers nothing. A repeat tile is a copy of an entry they wrote, dated today, and transfers are excluded because a destination account should be chosen deliberately. A value update carries the holding's own item and currency and never converts silently. Refund candidates are the eligible purchases the existing matcher already found, surfaced rather than hidden behind typing. Split fills use the live remainder that already existed, in bigint, so `$10.01` across two parts is `5.01` and `5.00` and still sums exactly.

A remembered account is a preference, not a financial fact. `src/ledger/preferences.ts` has a closed key set so it cannot drift into general-purpose storage, values are bounded strings, and a test asserts writing one touches no ledger data. It changes what a form starts with and nothing that is recorded.

No feature is removed. Chips are added above inputs that remain; the full category select is still present behind the chip row, the Quick sheet still lists every navigation action below the verbs, and every advanced field keeps its labelled route. Accessibility is part of the same work rather than a later pass: each proposal control names its figure and its reason in its label, because a one-tap affordance a screen reader cannot name is not easy for everyone.

Alternatives: per-screen shortcuts would ship faster and audit worse; inferring a category from a merchant name would invent classifications the user never chose; prefilling and saving in one action would buy a tap by removing the confirmation that makes the app trustworthy with money.

Validation: 381 tests in 77 files, including derivation tests for what each proposal refuses to do, UI tests asserting the confirmation survives, exact-cent split arithmetic, and a preference test asserting ledger data is untouched. Lint, strict TypeScript, build, schema diff, money lint and native-gate unit tests pass. The measured usability baseline that `LOW_EFFORT_USABILITY.md` requires before any tap-count target is still outstanding, and no tap-count improvement is claimed here.
