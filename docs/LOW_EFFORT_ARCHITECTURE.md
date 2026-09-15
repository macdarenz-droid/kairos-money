# Low-effort access — the architecture

Status: design, authorized now. `ROADMAP.md` permits the scan and the design at this point; implementation
follows Session 5 phase 5.7, because most proposals below are produced by the analysis layer and cannot be
built before it exists. `LAZY_USER_SCAN.md` holds the per-flow source findings; `LOW_EFFORT_USABILITY.md`
holds the intent and the acceptance method. This document is the mechanism: what gets built, and why it is
one mechanism rather than nine screen-specific shortcuts.

## The reframing this rests on

The request is "just put this, this, this, and done" — not a shorter form. A shorter form still asks the user
to supply the content. Kairos imports statements, so **the app already holds the user's own vocabulary**:
their merchants, their categories, their typical amounts, their recurrence, their accounts, their pay cycle.

So the design turns **entry into selection**. The app proposes from what it already holds; the user confirms.
Nothing is invented, because every proposal is derived from data the user already supplied or imported.

## One mechanism: the Proposal

Nine bespoke shortcuts would be nine places for a financial mistake to hide. Instead there is one type, and
each screen renders proposals of the kinds it supports.

```ts
export type Proposal<T> = {
  id: string;                       // stable, so a dismissal sticks
  kind: 'repeat_entry' | 'bulk_category' | 'value_update' | 'match_candidate' | 'split_fill' | 'date_shortcut';
  label: string;                    // what the user reads, in their own data's words
  detail: string;                   // why this is being offered, from their data
  prefill: T;                       // the form state, never a committed record
  evidence: string[];               // transaction ids the proposal was derived from
  source: 'manual_history' | 'analysis_metric' | 'stored_evidence' | 'preference';
  metric: MetricKey | null;         // set when an analysis capability produced it
};
```

Three properties make this safe to spread across the app:

- **A proposal is never a financial fact.** It is form state. `Save` still commits, and the
  confirm-before-financial-commit rule is untouched. "One tap" means one *typing-free selection*, then the
  same confirmation that exists today — not a skipped confirmation.
- **A proposal is always attributable.** `evidence` and `source` mean the user can ask "why is this here"
  and get an answer from their own ledger, in two taps, exactly as metrics do.
- **A proposal is never a coaching prompt.** `Observation` (Session 5) carries no action affordance by
  type; `Proposal` carries no statement about the user's behaviour. The two do not merge. A proposal helps
  with *data entry the user has already decided to do*.

## What produces proposals

This is the architectural payoff of doing Session 5 first. The analysis capabilities are the proposal engine:

| Proposal | Produced from | Why it is not a guess |
|---|---|---|
| **Bulk category** — "14 uncategorised from one merchant → Groceries" | `merchant_breakdown` (8) plus the shared recurrence groups in `buildIndex` | The merchant grouping and the uncategorised count are both measured, and the category is the one the user already applied to that merchant |
| **Repeat entry tile** — prefills a whole manual entry | the user's own `manual.list()` history | It is a copy of an entry the user wrote, with today's date |
| **Preferred account** | a stored preference, set only by an explicit choice | A preference is not a financial fact; it changes no amount, date or provenance |
| **Value update** for a holding | the holding's own currency and item identity | Only the amount is left to type; currency is never converted silently |
| **Match candidate** — statement ↔ manual, purchase ↔ refund | existing `manual.candidates`, `refunds_and_chargebacks` (24) | Candidate matching by account, amount and date proximity already exists and already requires confirmation |
| **Foreign amount** | `foreign_exchange` (22) and the row's stored original-currency evidence | The evidence came from the statement; the rate is the stored one, never recomputed |
| **Split fill** — "split evenly", "fill remainder" | `TransactionSplits`' existing live remainder | The arithmetic already exists and stays bigint; this is presentation |
| **Date shortcut** — Today / Yesterday | the device clock | Statement dates are never touched; this applies to fields the user types by hand |

The highest-leverage item is not in any form. Statements import the transactions; what recurs forever is
**categorising them**. `bulk_category` is therefore the first thing to build, and it is the one that needed
the analysis layer.

## Where they surface

Proposals appear where the work already is, not in a new "suggestions" screen that becomes another place to
navigate to:

- **Today** — repeat-entry tiles above the existing Add transaction button.
- **Ledger** — bulk-category rows at the top of the uncategorised set, which is where the user is already
  looking when they notice uncategorised rows.
- **Manual sheet** — amount first and focused, category chips from the user's own top categories with the
  full list behind "More", date chips, remembered account.
- **Net worth** — "Update value" beside each holding.
- **Refunds, cancellations, foreign amount, splits** — candidates and fills inline, typing as the fallback.
- **Quick sheet** — verbs first (add expense, add income, import, scan receipt); navigation below, since half
  that list is currently navigation masquerading as action.

## What does not change

- **No feature is removed.** Every advanced field and uncommon action keeps a labelled route. A chip row is
  added *above* an input; the input stays.
- Duplicate detection, exact bigint money, integrity tiers, coverage gaps, pending exclusion, provenance,
  reversible imports, ambiguous-match review, account ownership and destructive confirmations are untouched.
- Prefill is not invention: statement dates and balances are never fabricated, and a manual entry never
  silently becomes statement coverage.
- Offline and local only. No server, no API, no analytics. No new dependency for any of this.

## Accessibility is part of "easy", not a separate pass

A one-tap affordance that a screen reader cannot name is not accessible and therefore not easy. Every
proposal control carries a full label including its figure ("Repeat Cafe Mika, 15 dollars, expense"), is a
44px target, survives 200% text without truncation or horizontal overflow, and reads in both themes. This
is the same standard the accessibility instrumentation already asserts per screen.

## Measurement before targets

`LOW_EFFORT_USABILITY.md` requires a device baseline before any target is set, and that still holds: the
interaction counts in `LAZY_USER_SCAN.md` were read from source, not measured. The acceptance method is a
recorded per-task baseline (taps, typing sessions, keyboard appearances) on device, then the same tasks after,
with no feature lost and no assertion weakened. A tap count that improves while a confirmation disappears is
a regression, not a win.

## Sequencing

1. Session 5 phases 5.2–5.7 complete the analysis layer. `bulk_category` depends on it.
2. `Proposal` and its store land once, with the shared safety invariants tested in one place.
3. Screens adopt proposals in leverage order: bulk category, repeat entry, manual-form ergonomics, then the
   remaining inline candidates and fills.
4. One combined regression and acceptance gate for the whole usability pass, with the device baseline.
