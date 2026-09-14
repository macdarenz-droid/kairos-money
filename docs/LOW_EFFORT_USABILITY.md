## Revision 2 sequencing accepted 14 September 2026

Immediate: explicit receipt-attachment label and visible save confirmation; Quick without automatic search focus. Implemented in the current continuation, pending native validation. Deferred to final pass: receipt OCR to an editable Tier C draft committed only on confirmation; visible disclosure affordances/counts; primary-action prominence; sheet back paths; shorter non-evidence copy; manual-history search/pagination. Preserve all features and current visual design. Validate keyboard behavior on Android rather than inferring from jsdom.

# Final usability pass: fewer taps, less typing, all features retained

Status: accepted future work; preliminary source scan only. No UI implementation or device usability acceptance is claimed.

## User intent and timing

Make Kairos easy for someone who wants to track money with minimal effort. Audit every function from the user's starting screen through completion: finding it, opening it, choosing an account, entering dates and amounts, saving, correcting and returning. Aim for a few clear actions, not a literal one-tap promise for tasks that require new information. Keep every existing and planned capability.

Implement this pass after Session 4, all 36 Money Analysis capabilities, the six quiet-coaching concepts and every other accepted addition have been reconciled with the roadmap and implemented. Rescan the finished feature set then, including features not yet present. Preliminary inspection is allowed now while CI runs; do not restart or poll the current gate for this planning work.

The quiet-coaching presentation remains declarative: observations and concepts, without questions or acceptance/action buttons. Input shortcuts elsewhere must not introduce coaching response buttons.

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
