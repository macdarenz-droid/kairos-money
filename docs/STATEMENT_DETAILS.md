# The file fills in its own details

His brief, with a Westpac transactions report the app had quarantined: *"My app cant read this, and when
i import something, i dont want to fill up any dates, opening or closing. The app should do that for me.
If im going to fill up, only a description what kind of file was that or description."*

## What was actually wrong

The report's rows were read correctly — the general table reader got all 143 of them, every amount and
every running balance. Two other things went wrong around them.

1. **Nothing was auto-filled.** Statement details are read only from layouts whose wording is known,
   and this one says *This report covers transactions from … to …*, *Start Balance* and *End Balance*
   where a statement says *Statement Period*, *Opening Balance* and *Closing Balance*. So the confirm
   sheet came up empty and he typed the four figures himself.
2. **Repeated purchases collapsed.** Five identical stops at one servo in one day are one fingerprint.
   A statement's balance chain is what tells them apart, but the chain was consulted only for the two
   named statement layouts, and only oldest-first — a report prints newest-first. The chain was never
   applied, the five became one, and the balance came out short by exactly the purchases dropped:
   *Balance mismatch. This import is quarantined.*

## What changed

**Reading the file** (`src/ingest/sources/FileSource.ts`, `inspect()`), before the sheet asks anything:

| the file | period | balances | how |
|---|---|---|---|
| Westpac Choice statement, CommBank statement, Westpac transactions report | printed on it | printed on it | `statementDetails()` — known wording only |
| any export (CSV, XLS, XLSX, OFX, QIF) or a PDF of unknown layout | the first and last date in its rows | none stated, left blank | `rowSpan()` |
| a payslip (labelled Employer, Pay date, Gross, Net) | its own pay date and period | none | `payslipSpan()`; the payslip box ticks itself |

A date that could be more than one day (no year, no century) is not guessed: the sheet says the dates
could not be read and opens the fields. That is the only case left where they are typed.

The account is chosen the way a notification's is — by the last four digits the file prints against
*Account number*, when exactly one recorded account carries them.

**The balance chain** (`src/ingest/normalize/statement-evidence.ts`) is tried in both directions and is
applied whatever parser read the rows. The chain itself is the guard: where it does not hold from the
stated opening to the stated closing, nothing is marked.

**A PDF with no stated balances** (`FileSource.fetch()`) is no longer refused. It is what a transaction
export is — rows checked against each other — and gets the tier that says so: **B** when every row
carries a running balance and the chain verifies, **C** when there is only continuity to check. Stated
balances, typed or read, keep the statement path and tier A exactly as before.

**The sheet** (`src/ui/screens/ImportWorkspace.tsx`, `FileReview`) shows the account, an optional
*Description* in the owner's words, and one line stating what was read:

> Read from the file: 2026-08-20 – 2026-09-19 · opens $1,482.22 · closes $1,319.30

The date, balance and format fields still exist, folded under *Adjust what was read*, pre-filled and
never overwritten once touched. The disclosure opens itself only when something could not be read or
an extraction error needs a correction.

**The description** is stored as `import-note:<batch id>` in the encrypted settings, beside the batch
and never inside its document payload, which stays byte for byte what was extracted. It replaces the
file name wherever the batch is listed — Imports, the rollback sheet, a transaction's supporting
statements — and goes when a rolled-back batch is forgotten.

## Pinned by

- `tests/westpac-report.test.ts` — the report layout, its stated details, and two identical purchases
  surviving the chain read backwards
- `tests/import-autofill.test.ts` — every file kind inspected; PDF tiers without stated balances; the
  description's storage and removal
- `tests/import-autofill-ui.test.tsx` — an export imported with nothing typed but a description
- the Session 2 baseline tests, unchanged: a typed period and typed balances still win

## After this

The quarantined import from the report should be discarded and the file read again: the balances and
dates now come off its first page, and the chain reads back from its end balance to its start.
