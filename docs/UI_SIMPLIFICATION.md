# Simplifying the app — architecture for the 17 Sept review

Sixteen annotated screenshots, read as one instruction rather than sixteen: **one place per job, money
instead of prose, one currency, one primary action.** Every line below names the file that actually
renders the thing, because a demand answered in the wrong file is a demand not answered.

## The four principles this pass encodes

1. **One primary action.** Adding a transaction is the thing this app is for. It appears twice: the
   top of Today, and Quick. Nowhere else.
2. **A section with no data renders nothing.** Headings that announce their own emptiness ("No
   recurring payments here.", "Two fully covered months are needed.") are what turned a screen of
   money into a wall of text. `Surfaces` already worked this way; the rule becomes general. This is
   also what makes "surprise me one day with a visualisation" possible: the section arrives with the
   data instead of waiting in front of him.
3. **One currency, set once.** Display currency is a property of the app, not of a card. Per-section
   pickers ("History currency", "Net worth currency") are removed and every figure reads the global one.
4. **Analysis lives in Insights. You is who you are and what you hold.** Settings sit behind a gear in
   the corner of You — the placement every phone user already knows from Instagram, the Washington Post
   app and the rest.

## What the research says, where it differs from instinct

- **Three-way type choice is buttons, not a dropdown.** Material 3: segmented buttons are for a single
  choice among two to five items; a menu is for when the options must collapse to save space. Three
  options that decide the shape of the form are not worth a tap to reveal.
  <https://m3.material.io/components/segmented-buttons/overview>
- **The add form stays a bottom sheet, with a fixed action bar.** M3 puts a complex multi-field task in
  a full-screen dialog, and the sheet he pointed at is the shape he wants; the resolution is the sheet
  he asked for with the ergonomics of the dialog — sticky header, sticky Cancel/Save, internal scroll.
  <https://m3.material.io/components/bottom-sheets/guidelines>
- **"Load more" beats Previous/Next on a phone.** Baymard's mobile testing, via LogRocket's summary of
  it, puts load-more ahead of classic pagination; it also disposes of 74 pages of five rows without a
  page-jump control nobody wants to use with a thumb.
  <https://blog.logrocket.com/guide-pagination-load-more-buttons-infinite-scroll/>
- **Instructional text before use reduces usability.** NN/g: onboarding instructions that must be read
  before starting cost attention and should be avoided; contextual help behind a mark is the answer.
  That is the "Two ways to start" card and the four-step import explainer, exactly.
  <https://www.nngroup.com/articles/mobile-app-onboarding/>
- **Settings behind a gear at the top right of the profile tab** is the convention, not an invention.
- **His rate suggestion cannot be built.** TradingView has no public REST quote API — widgets, the
  Charting Library and broker integrations only, and the third-party mirrors of it are a grey area that
  can vanish. The canonical free source stays Frankfurter, whose ECB set does include PHP; the fix for
  the failure he hit was the address, and a typed rate already covers being offline.
  <https://frankfurter.dev/> · <https://www.tradingviewapi.com/>

## Every annotation, the file that renders it, and what happens

| # | What he marked | Where it really lives | Decision |
|---|---|---|---|
| 1 | "History currency" picker | `screens/MoneyVisuals.tsx:40` | Delete; read the global display currency |
| 2 | "solid / dashed / Provisional…" caption | `screens/MoneyVisuals.tsx:42` | Delete the sentence; the chart keeps it in its label |
| 3 | "Two ways to start" card | `screens/FirstImport.tsx` (whole file) | Delete file and its test |
| 4 | "What happens when you import" | `screens/FirstImport.tsx` `<details>` | Goes with the file |
| 5 | "Statements out of date" | `screens/UpdateAccounts.tsx` `Freshness` | Delete with the feature |
| 6 | Add transaction: bigger, first, own sheet | `App.tsx` Today + `screens/Manual.tsx` | Primary action at the top of Today; sheet leads with the amount and a segmented type |
| 7 | Too many Add buttons | `App.tsx:115` (Ledger) | Delete the Ledger one |
| 8 | Count wedged between Previous and Next | `screens/ImportWorkspace.tsx:123` | Load more; the count moves to the History heading |
| 9 | Transfer opens the Add box again | `App.tsx:103` quick action | Opens the sheet on Transfer |
| 10 | "Update accounts" has no purpose | `screens/UpdateAccounts.tsx`, `screens/reminders.tsx` | Remove the feature; importing is the one path |
| 11 | "Show amounts in" belongs at the top of You | `screens/Rates.tsx` inside `Settings` | Currency moves to the top of You |
| 12 | Open today / ledger / insights | `App.tsx:103` | Delete; they are the tab bar |
| 13 | Text sections on You | `MoneyVisuals`, `TimingCharts`, `Cancellations` | Move the visual ones to Insights; each renders nothing until it has data |
| 14 | Upcoming bills, Merchant history | `MoneyVisuals.tsx:66-67` | Keep, as charts rather than rows |
| 15 | Combined position / Assets / Liabilities | `screens/NetWorth.tsx:28` | Delete the text block; keep the chart and recording a value |
| 16 | Appearance / ledger / notifications | `screens/Settings.tsx` | Behind a gear at the top right of You |

## Order of work

1. Add-transaction flow, and the two cards that stood in front of it.
2. History: load more.
3. Update accounts, removed.
4. Quick, cut back to actions.
5. One currency everywhere.
6. You → Insights, and the empty-section rule.
7. Settings behind the gear.
8. Bills and merchants as charts.

## What shipped, and the one thing that did not

Done, in this order: the add-transaction sheet and its place on Today; History's load-more; Update
accounts removed root and branch; Quick cut back to actions; one display currency, at the top of You;
the analysis moved to Insights under the rule that an empty section renders nothing; bills and merchants
drawn as lengths; the orphaned virtual list deleted.

**Settings behind a gear is blocked, and not by taste.** Two Session-2 acceptance files are frozen by
sha256 in `docs/SESSION_2_BASELINE.json`, and `tests/session25.test.ts` fails the build if either
changes:

- `tests/ui.test.tsx` taps **You → Light → Dark → Export all data → Delete all data** with nothing in
  between, and
- `android/app/src/androidTest/java/app/kairos/money/ImportInstrumentedTest.java` taps **You → Light**.

Putting Appearance, backup, export and delete behind a gear moves every one of those controls off the
You screen, so both files would have to be rewritten and both hashes re-frozen. That freeze is the
owner's, and re-cutting it to make my own change pass is exactly what a freeze exists to stop. The work
itself is an hour: a gear button in the You header, `Settings` inside a sheet, and about ten device-test
call sites that open it first.

**To unblock:** say the Session-2 freeze may be re-cut for these two files, and it goes in with the
baseline updated in the same commit.
