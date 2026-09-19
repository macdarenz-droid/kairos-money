# 0041 — The widget opens a sheet, not the app

Accepted 19 September 2026. Arises from the owner's review of the first widget: *"Once i click add txn, it
opens the app. That should not be the case."*

## Context

The first widget was one button that launched the app into the manual-entry sheet. Recording a coffee
meant unlocking Kairos and watching the whole ledger load. Android widgets cannot hold a text field, so
the amount cannot be typed on the widget itself, on any app.

The ledger is encrypted and its key exists only while Kairos is unlocked, so nothing outside the app can
write a transaction.

## Decision

**A widget tap opens a native sheet over the home screen, and the sheet writes an outbox the app drains.**

- `QuickAddActivity` is a see-through, own-task, no-recents activity: amount, direction, category, Save.
- It writes `QuickAddStore`, a private on-device store holding the amount exactly as typed. It never
  reads or writes the ledger.
- On unlock and on each return to the front, the app turns each entry into a hand-recorded transaction
  through the existing manual-entry path, in the account's own currency, then clears it. An entry in a
  currency no open account holds stays in the outbox.
- The app writes the sheet's settings (main account by name and currency, the chips) to the same store.
  None of it is a balance or a transaction, and the widget shows no money.

## Consequences

- Recording a purchase never brings the app forward. The ledger is still only ever written by the app.
- The outbox is one more private store on the phone, alongside the notification reader's, with the same
  rule: short-lived, cleared as soon as applied, never a copy of the ledger.
- Animation on the widget is limited to what `RemoteViews` allows: ripples, and one `ViewFlipper` for
  the label. The sheet, a real activity, animates freely.
