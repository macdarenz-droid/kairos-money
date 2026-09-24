## Revision 2 sequencing accepted 14 September 2026

Immediate: explicit receipt-attachment label and visible save confirmation; Quick without automatic search focus. Implemented in the current continuation, pending native validation. Deferred to final pass: receipt OCR to an editable Tier C draft committed only on confirmation; visible disclosure affordances/counts; primary-action prominence; sheet back paths; shorter non-evidence copy; manual-history search/pagination. Preserve all features and current visual design. Validate keyboard behavior on Android rather than inferring from jsdom.

# Final usability pass: fewer taps, less typing, all features retained

Status: accepted future work; preliminary source scan only. No UI implementation or device usability acceptance is claimed.

## User intent and timing

Make Kairos easy for someone who wants to track money with minimal effort. Audit every function from the user's starting screen through completion: finding it, opening it, choosing an account, entering dates and amounts, saving, correcting and returning. Aim for a few clear actions, not a literal one-tap promise for tasks that require new information. Keep every existing and planned capability.

Implement this pass after Session 4, all 36 Money Analysis capabilities, the six quiet-coaching concepts and every other accepted addition have been reconciled with the roadmap and implemented. Rescan the finished feature set then, including features not yet present. Preliminary inspection is allowed now while CI runs; do not restart or poll the current gate for this planning work.

The quiet-coaching presentation remains declarative: observations and concepts, without questions or acceptance/action buttons. Input shortcuts elsewhere must not introduce coaching response buttons.

The app-wide input scan, including the interaction cost of each flow read from source and the one-tap candidates, is in [LAZY_USER_SCAN.md](LAZY_USER_SCAN.md). Its counts are source-derived, not device baselines, and do not satisfy the measured baseline this document requires.

## Preliminary source findings and candidates

| Flow and source | Observed today | Candidate improvement to evaluate later |
|---|---|---|
| Manual entry — `src/ui/screens/Manual.tsx` | Today is already prefilled; the first account defaults. Type, account, amount, date, required description, category and optional note share one form. | Keep amount and a suggested/recent description prominent; remember an explicit preferred account; recent merchants/templates; Today/Yesterday shortcuts; place optional detail behind a clear expander. Confirm save explicitly. |
| Statement import — `src/ui/screens/ImportWorkspace.tsx` | Recognized files already prefill stated dates/balances; saved column mappings are reused. Details, extraction, review and confirmation are separate steps. | Compact review of already-known details, prominent unresolved fields, reuse confirmed account/format choices, fewer repeated transitions for multiple files. Preserve review and reconciliation; never invent statement dates or balances. |
| Category correction — import review and `BulkCategories.tsx` | Merchant-rule reuse and bulk category changes already exist. | Make those existing shortcuts easier to discover in context; show impact before applying to several records. |
| Splitting — `TransactionSplits.tsx` and manual history | User opens split controls and types each portion; remaining amount is already shown. | Equal split and Fill remainder actions, exact currency rounding, editable suggested portions; make access direct from the transaction. |
| Net worth — `NetWorth.tsx` | Currency is independent of history charts; updating an item requires opening the general valuation form and selecting the item. Date already defaults to today. | Update value next to each holding; prefill the chosen item and currency; amount-first editing; make active currency clear and remember explicit selections. Do not silently convert currencies or include accounts. |
| Receipts — `Manual.tsx`, `TransactionAttachments.tsx`, `ReceiptCamera.tsx` | Manual receipts are reached through saved history and Notes and receipts. Camera preview/review is a separate flow. | Evaluate attaching during entry and a direct receipt shortcut; reuse readable extracted fields with editable review, preserving lock/lifecycle handling. |
| Foreign amount — `ForeignCurrency.tsx` | User enters original currency, amount and source note separately. | Reuse original-currency evidence when available; remember explicit currency choices; preserve posted amounts and source attribution. |
| Cancellation records — `Cancellations.tsx` | Date, status and note/reference are entered in a sheet. | Convenient date shortcuts and reuse of merchant context; retain the distinction between requested and provider-confirmed cancellation. |
| All remaining screens and planned analysis | Full device walkthrough has not been performed for this request. | Audit search/filter persistence, account creation, refunds, matching, transfers, notifications, backup/export, scenarios and every future input. Rank only after inspecting the final implementation. |

## Interaction principles

- Reuse information the user already supplied; keep defaults visible and editable. Distinguish preferences from financial facts.
- Preserve drafts where appropriate, with encrypted local storage and existing lock/reset behavior. Avoid asking users to retype after a validation error.
- Put frequent actions within easy thumb reach. Use numeric keyboards for amounts, useful keyboard Next/Done behavior, sensible focus and inline validation.
- Never require hover, a hidden long press or a gesture as the only route. Keep labeled buttons and keyboard/screen-reader alternatives.
- Retain all advanced fields and uncommon actions with clear access. Simplification must not silently remove capabilities.
- Preserve duplicate detection, exact money, source evidence, review of ambiguous matches, account ownership, backup/recovery and required destructive confirmations. Consider undo only where reliable recovery is implemented.
- Stay offline; this pass does not introduce a server or AI API.

## Final audit and acceptance

Create a complete inventory from the final code and accepted roadmap. For each task record starting screen, taps, typed fields, repeated details, completion time, errors/backtracking and one-handed reach. Include first-time and repeat use, ordinary and exceptional cases, both themes, 200% text and screen-reader/keyboard operation.

Compare the existing route with the proposed route using real device walkthroughs and synthetic financial fixtures. Prioritize frequent high-effort tasks. Set measured per-task targets after baselining rather than inventing current tap counts. Verify equal financial results, preserved feature access, editable defaults and successful error recovery. Produce a before/after matrix and evidence-linked report, then run one combined regression/acceptance gate for the completed usability work. Do not create a separate milestone or gate per shortcut.

## Baseline instrumentation — measured on the device, run 34934836916

`UsabilityBaselineInstrumentedTest` drives the shipped UI on the emulator and counts every tap and typing
session it performs, writing `docs/evidence/usability-baseline.json`. It measures three things separately:
setting up the first account, which is one-time setup rather than an everyday task; recording an expense
from scratch; and recording the same expense again from a repeat tile.

It asserts only the claims this pass actually makes — repeating needs no typing, repeating costs no more
taps than entering from scratch, and repeating still ends at a Save the user presses — and sets no target
tap count, because a target before a measurement is the thing this file exists to prevent.

### The measured figures

Run [34934836916](https://github.com/macdarenz-droid/kairos-money/actions/runs/34934836916), Android 34
emulator, reported through instrumentation status so the numbers are readable on a passing run rather than
only inside an artifact:

| Task | Taps | Typing sessions |
|---|---|---|
| Record an expense from scratch | 2 | 2 |
| Record the same expense again, from its repeat tile | 2 | 0 |

`confirmation_retained: true`. Both paths still end at a Save the user presses.

**What this shows, stated exactly.** Repeating an entry removes the typing, not the taps. Both tasks cost
two taps; the difference is two typing sessions against none. The honest claim for this pass is therefore
"repeating an entry needs no typing", and not any claim about fewer taps — the tap counts are identical,
and saying otherwise would be reading an improvement into a number that does not show one.

The taps counted are, from scratch: Add transaction, then Save transaction. Repeating: the repeat tile,
then Save transaction. Unlocking is excluded deliberately, as it belongs to no task.

### Measured: the same repeat at 200% text, run 34956035910

A shortcut that only works at default text size is not a shortcut for the person who most needs one, and
200% text is where two real virtualization defects lived. The baseline now repeats the entry again with the
WebView at 200% text zoom and asserts what this pass claims there too: still no typing, and the same tap
count as at default text. The zoom is restored afterwards in a `finally`, because the classes that run next
share the install.

It also records `tile_on_screen_without_scrolling` — whether the repeat tile is inside the viewport at 200%
text, which is as much of "one-handed reach" as a program can honestly check.

| Task | Taps | Typing sessions | Tile on screen without scrolling |
|---|---|---|---|
| Record the same expense again, at 200% text | 2 | 0 | yes |

So the lazy path costs exactly the same at 200% text as at default: two taps, no typing, and the tile is
reachable without scrolling. That last figure was recorded rather than asserted until a run produced it,
because asserting a value before measuring it is the mistake this file exists to prevent. It has now been
measured once, on one emulator, at one screen size — enough to report, not yet enough to promise.

Getting this measurement cost four red runs, none of them the app's fault and none of them the text zoom I
first blamed. Two were real defects the measurement exposed (a repeat tile rebuilt out from under a tap, and
a list that misjudged its own height at large text); two were my own test reading the DOM without waiting
for it. The DOM capture at the tap now reads `{"dialogs":1,"open":[true],"tile":true,"save":true}` — one
sheet, open because the tap opened it — against `{"dialogs":2,...,"save":false}` on the runs that failed.

### Categorising at entry is deliberately not measured here

The category chips are built from the user's own filed history. No class before this one files a
categorised manual entry, so on the gate's device the chip row is absent and the only remaining route is a
select this harness cannot press as a tap. A number measured down that fallback route would not be the
number a real user with history sees, so none is reported. This is the same reasoning that keeps bulk
categorisation in the source UI test.

**What these numbers do not cover.** They are a floor, not a typical entry. The measured path takes every
default it is offered — the remembered account, today's date, and no category — so a user who sets a
category at entry, changes the account, or backdates the entry pays more taps than this. It is one
synthetic task on an emulator, at default text size, performed by a program that always knows exactly which
control to press. None of that is what a person does, and no target is derived from it.

### Bulk categorisation is measured in the source UI test, deliberately

Bulk categorisation is not measured on the device, and that is a decision rather than a gap. A device
measurement needs committed imported rows where one merchant has several uncategorised transactions and at
least one the user already filed. The gate runs its instrumented classes sequentially against a single
install, so a class cannot rely on that shape existing — the first version of the baseline test assumed a
pristine app and failed for exactly that reason. Worse, applying a bulk category mutates imported rows that
the acceptance and post-delete classes run against afterwards, so measuring it there would either
contaminate their state or require reverting ledger data to take a measurement, which is not a trade worth
making for a tap count.

It is measured instead in `tests/proposals-ui.test.tsx`, against the real component with a real repository
call: one click on one proposal calls `categories.set(['u1','u2','u3'],'Groceries')`. One interaction files
the whole group. The flow it replaces is still present and still reachable — open Change categories, filter,
select matching rows, choose a category, save — so the comparison is between one interaction and five, with
nothing removed.

What that test cannot show is how the proposal reads on a real screen at 200% text, which remains part of the
both-theme visual review that needs a human looking at the artifact.

### What the baseline test cost to write, and the rule it produced

It failed three times, each time the test rather than the app, and both causes generalise to any
instrumented class added later.

The gate installs the app once and runs its classes in sequence, so a class inherits whatever the earlier
ones left. The first version assumed a pristine app and tapped "Set up an account"; the captured page said
"Accounts set up 2". An instrumented class must therefore assume no starting state, use what it finds, and
skip a measurement it cannot take honestly rather than manufacturing the conditions for it.

The second version created two manual entries and deleted them by walking the DOM. That depends on where a
row renders and which button sits inside it, and the loop broke out silently when a lookup missed, leaving
entries for the acceptance and post-delete classes to inherit. Cleanup is not a place for best-effort: it
now deletes by batch id in SQL, runs `PRAGMA foreign_key_check`, and asserts on a returned count so a
failure names how many rows are left instead of reporting false.

The rule: a class that writes must remove exactly what it wrote, by identity rather than by position, and
say how much remains when it cannot.
