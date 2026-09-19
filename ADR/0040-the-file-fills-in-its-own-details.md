# 0040 — The file fills in its own details

Accepted 19 September 2026. Arises from a Westpac transactions report that was quarantined after its
owner typed its period and balances by hand.

## Context

The confirm sheet asked for a statement period, a stated opening balance and a stated closing balance,
and read them off the file only for two statement layouts whose wording was known. Every other file —
every CSV export, every PDF the general table reader handled — had them typed. A PDF with nothing typed
was refused outright.

The balance chain that distinguishes two identical purchases was consulted only for those same two
layouts, and only walked oldest-first. A transactions report prints newest-first, so a file whose every
row and balance was read correctly still had its repeated purchases collapsed, and was quarantined for
the sum of them.

## Decision

**What a file states about itself is read before anyone is asked for it, and the chain is the guard,
not the parser.**

- Statement details are read from every layout whose wording is known, now including the transactions
  report. Where no layout is known, the period is the span of the rows' own dates, and the balances are
  left unstated. A date that could be more than one day is not guessed.
- The balance chain is tried in both directions, whatever parser read the rows. It marks rows distinct
  only where it holds from the stated opening to the stated closing.
- A PDF with no stated balances is treated as the export it is: tier B when its running balances chain,
  tier C when only continuity can be checked. Stated balances keep tier A.
- The sheet asks for the account and an optional description in the owner's words. The fields remain,
  folded, pre-filled, never overwritten once touched.

## Consequences

- The Session 2 statement path is unchanged for anyone who types or corrects the figures; the baseline
  tests that drive those fields pass untouched.
- The integrity tier stays honest: nothing derived from the file is ever presented as a stated balance.
- The description lives in encrypted settings beside the batch, never in the document payload.
