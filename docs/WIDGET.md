# The home-screen widget

His brief, with a screenshot of the old one: *"Its ugly and too big... Once i click add txn, it opens the
app. That should not be the case, When i add txn it had very few options and buttons and u can input a
data."* He chose option A with the keypad sheet from the rendered designs, and asked for animation.

## The one thing Android decides

A widget is a `RemoteViews`: a layout drawn by the launcher from a fixed list of views. There is no text
field on that list, so no Android app can take an amount on the widget itself. What the premium apps do
instead is what this does: the widget is a set of taps, and a tap opens a sheet **over the home screen**.

## The five widgets (`Widgets.java`, `WidgetStore.java`)

| Widget | Provider | Size | Shows |
|---|---|---|---|
| W1 | `AddWidget` | 2×1 | Logo and Add |
| W2 | `QuickAddWidget` | 4×1 | 3 category chips and add (the old widget's class, so placed widgets keep working) |
| W3 | `TodayWidget` | 2×2 | Left for today, spent today, add |
| W4 | `WeekWidget` | 4×2 | Left for today, 7-day bars, 6 icon-only categories, add |
| W5 | `CategoryWidget` | 2×2 | 4 category icons |

A category opens `QuickAddActivity` with that category; Add opens it plain. Nothing opens the app. Every
tap is at least 44dp. Styles are Dark glass (default), Paper and Indigo, set in You › Appearance.

Amounts are the last unlock's: two formatted figures and seven whole-percent bar heights in a private
store, nothing else. "Show amounts on widgets" off removes them from the phone and stops new ones.

## What a tap opens (`QuickAddActivity`, `res/layout/quick_add_sheet.xml`)

A bottom sheet, Android's, with a see-through window so the home screen stays behind it: the amount
large, Spent or Received, the six category chips, a keypad of its own so it is the same height on every
phone, Save. The keypad's rules are pure (`QuickAddActivity.press`) and pinned on the device: one point,
two decimals, nine whole digits, no leading zeros.

The sheet's own task, never in recents, so recording a purchase never brings the app forward and never
leaves the app on the recents screen afterwards.

## Where it goes (`QuickAddStore`, `KairosQuickAddPlugin`, `src/ingest/quick-add`)

The ledger's key exists only while Kairos is unlocked, so the sheet cannot write a transaction. It writes
the outbox: a private store on the phone, the same kind the bank-notification reader uses, holding the
amount **exactly as typed**, the direction, the category, the currency and the account the sheet was set
to. When the app is next unlocked, and each time it comes back to the front, `useQuickAddOutbox` turns
each entry into a hand-recorded transaction (`manualFromQuickAdd`: minor units in the account's own
currency, the one place that arithmetic happens), clears it, and says once how many were recorded. An
entry in a currency no open account holds stays in the outbox rather than landing in the wrong money.

The same pass writes the sheet's settings — the main account by name and currency, and the chips — so
the widget always knows where its money goes. None of that is a balance or a transaction.

## Animation, within what a widget allows

No code runs inside a widget, so nothing in it can be animated by hand. Two things still move:

- every chip and the plus carry a ripple, so a tap answers under the finger;
- W2's chip row is a `ViewFlipper`, the one view a widget can switch with an animation: after a save it
  rises in as *Saved $4.50 · Coffee*, and six seconds later the chips rise back. With animations off in
  Android, the flip is skipped. The amount shown
  is the one typed seconds earlier on the same screen, and it is gone before the phone changes hands.

The sheet, being a real activity, moves freely: it rises from below the screen as the scrim fades in,
each key shrinks a touch under the finger and springs back, the figure ticks as a digit lands, and on Save
the sheet sinks away and the window fades.

## Pinned by

- `QuickAddInstrumentedTest` (device): the keypad rules, the outbox round trip, the chips' labels and icons,
  every widget in every style, and hidden amounts leaving the store
- `tests/quick-add-outbox.test.tsx`: the outbox as ledger transactions, account choice, draining once
- `tests/widget-figures.test.ts`, `tests/widget-settings-ui.test.tsx`: what the widgets are given, and the settings
- `tests/device-test-counts.test.ts`: the gate demands the four device tests
