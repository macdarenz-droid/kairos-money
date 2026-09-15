# Lazy-user scan — where entering data costs more than it should

Status: preliminary source scan, performed while the Session 4 gate ran. No device walkthrough, no usability acceptance and no implementation is claimed here. The interaction counts below are **read from the source**, not measured on a device: they are a map of where to look, and `LOW_EFFORT_USABILITY.md` still requires a real baseline before any target is set. Implementation belongs in the final usability pass, after Session 4 and the 36 Money Analysis capabilities.

## The user's framing

The request is not "reduce taps" in the abstract. It is: *"I'm lazy. This is my tracker. Just put this, this, this, and done."* A few clear actions, no hunting, no retyping — and **no feature removed**. Advanced fields and uncommon actions all stay reachable.

## The one structural observation

Kairos imports statements. That is an advantage a blank-form tracker does not have: **the app already knows the user's spending vocabulary** — merchants, categories, typical amounts, recurrence, accounts. So the target is not a shorter form. It is turning *entry* into *selection*: the app proposes from what it already holds, and the user confirms.

That reframing is what makes one-tap realistic without inventing data. Every proposal below is built from information the user already supplied, stays visible and editable, and keeps the confirm-before-financial-commit step intact.

## Findings by flow

| Flow | What it costs today (from source) | Where the cost is | Candidate |
|---|---|---|---|
| **Add transaction** — `Manual.tsx` | ~6 taps, 2 typing sessions | `description` is **required free text** with no reuse, so a repeat coffee is retyped every time. `accountId` defaults to `accounts[0]` — arbitrary and never remembered. Amount is the third field, not the first. Category is a 10-option `<select>` (a modal picker on Android). | Recent-entry tiles that prefill the whole form from manual history: **2 taps, no keyboard**, Save still confirms. Amount first and focused. Category chips from the user's own top categories, full list behind "More". Remember an explicitly chosen account as a preference. Today/Yesterday chips. |
| **Bulk categorise** — `BulkCategories.tsx` | Already strong: filter, select-matching, one category applied to many | Discoverability only. Reachable solely from a "Change categories" button in the Ledger header, and only when rows exist. | Surface it where the work appears: "14 uncategorised from WOOLWORTHS — set all to Groceries" as a one-tap row, driven by the Session 5 recurrence and merchant metrics. **Highest leverage in the app.** |
| **Category split** — `TransactionSplits.tsx` | 2 parts seeded; each amount typed | Remaining-to-allocate is **already computed live** (`remaining`), but the user still types every portion. | "Split evenly" and "Fill remainder" buttons. The arithmetic already exists; this is presentation, and exact currency rounding must stay bigint. |
| **Net worth value** — `NetWorth.tsx` | Open "Record a value", pick the item from a select, then amount | Updating an existing holding routes through the *general* creation form. Date already defaults to today. | An "Update value" action beside each holding that prefills item and currency, leaving only the amount. Never silently convert currencies or auto-include accounts. |
| **Account setup** — `AccountSheet.tsx` | name, institution, type, currency, last-4, opening balance | Defaults are already sensible (`checking`, `AUD`, balance `0`). `institution` is required-feeling free text. | Default currency from device locale; make institution clearly optional. Low frequency, so low priority. |
| **Foreign amount** — `ForeignCurrency.tsx` | Original amount plus a source note, both typed | Ignores original-currency evidence that the imported row may already carry. | Offer the stored evidence as an editable prefill; preserve posted amounts and source attribution. |
| **Cancellations** — `Cancellations.tsx` | Contact/confirmation date typed | No date shortcuts. | Today/Yesterday chips. Keep requested vs provider-confirmed distinct. |
| **Refunds** — `Refunds.tsx` | "Find original purchase" by typing | Candidate matching by account, amount and date proximity already exists elsewhere (`manual.candidates`). | Suggest likely purchases first; typing becomes the fallback, not the default. |
| **Quick sheet** — `App.tsx` | Action list mixed with navigation | Half the list is "Open today / ledger / insights / settings" — navigation, not verbs. | Put actions first: add expense, add income, import, scan receipt. Automatic search focus stays off, per revision 2. |

## Constraints these must respect

- **Nothing is removed.** Every advanced field and uncommon action keeps a labelled route.
- **Prefill is not invention.** Proposals come only from what the user already entered or imported. Statement dates and balances are never invented; a manual entry never silently becomes statement coverage.
- **Confirm before a financial commit stays.** A tile prefills; Save still commits. "One tap" means one tap of *typing-free selection*, not a skipped confirmation.
- **Preferences are not financial facts.** A remembered account is a preference, stored and overridable; it never changes a recorded amount, date or provenance.
- Duplicate detection, exact bigint money, source evidence, ambiguous-match review, account ownership and destructive confirmations are untouched. Undo only where reliable recovery already exists.
- Offline: no server, no API, no new dependency.

## Note for whoever implements this

The instrumented tests locate fields by **label text**, not document order (`IntelligenceInstrumentedTest.input()` matches `label` elements by `textContent`). Reordering a form to put amount first therefore does not break them — but adding a chip row above an input does not change the label lookup either, so the existing native assertions stay valid. Verify keyboard behaviour on a device rather than inferring it from jsdom.

The highest-value item is not in the manual form at all. Statements import the transactions; what recurs forever is **categorising them**. Fix that first.

## Implementation status — all nine flows, run 34934836916 and after

Every flow in the table above now has its candidate implemented. Recorded here so the scan stops reading
like a plan.

| Flow | Landed as |
|---|---|
| Add transaction | Repeat tiles from manual history, amount first and focused, category chips over the full select, remembered account preference, Today/Yesterday chips. Device-measured: 2 taps and 2 typing sessions from scratch, 2 taps and none repeating. |
| Bulk categorise | `BulkProposals` surfaces "N uncategorised from MERCHANT — set all to CATEGORY" where the work appears, from a category the user already applied to that merchant. |
| Category split | Split evenly and Fill remainder, exact in bigint for either sign, extracted to `src/ui/proposals/allocate.ts` and tested at their boundaries. |
| Net worth value | `value_update` proposals beside each holding, stalest first, carrying everything except the amount. |
| Account setup | Institution is labelled optional and says why it is safe to leave blank. **The region-derived currency default was implemented and then reverted** — see below. |
| Foreign amount | The original amount the statement line already states is offered as an editable prefill that cites the line; the chosen original currency is remembered as a preference. |
| Cancellations | Today/Yesterday chips beside the date field, which stays. |
| Refunds | Candidates ranked by evidence — same merchant and amount, then amount, then merchant, then recency — each showing why. |
| Quick sheet | Verbs first, navigation below; every previous entry still present. |

No feature was removed to add any of this. Every shortcut sits beside the full route it shortens: the
category select, the manual form, Change categories, the refund search and its hundred-purchase select, the
typed date fields and the currency select are all still there and still reachable.

What remains is not implementation. `LOW_EFFORT_USABILITY.md` asks for a full task inventory with taps,
typed fields, backtracking and one-handed reach recorded per task, in both themes, at 200% text, under
screen reader and keyboard. Two tasks are measured on the device; the rest of that inventory is not, and no
before/after matrix exists for the flows above. They are implemented and tested, not usability-accepted.

### One candidate in this scan was wrong, and is not coming back

"Default currency from device locale" was implemented and reverted the same day. Run 34940983240 caught it
— `FoundationInstrumentedTest` creates an account without choosing a currency and expects `$123.45`, and on
an `en-US` emulator the account was created in USD, which the app renders as `USD 123.45`.

The failing test was the symptom. The reason not to do it is that an account's currency is a financial
fact, not a preference: it decides how every amount in that account is read and whether an imported
statement reconciles at all. That puts it under this scan's own constraint — prefill is not invention, and
preferences are never financial facts — which the candidate was written without weighing.

A region guess is also wrong for exactly the people it fails quietly: anyone who travels, has moved, or
holds an account abroad, all of whom Kairos supports multi-currency accounts for. A fixed default is
visibly wrong to everyone it is wrong for, and that visibility is what prompts a deliberate choice. Saving
one tap is not worth mis-denominating an account.

The general rule this produced: a shortcut may default anything the user can see and correct, but it must
not guess a value that changes how money is interpreted. Category, date and account are preferences that a
wrong guess costs a tap. Currency is not one of them.
