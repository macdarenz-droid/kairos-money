# 0038 — A proposal must be able to say why, and must never propose an amount

Accepted 15 September 2026. Extends [0037](0037-proposals-turn-entry-into-selection.md).

## Context

0037 introduced `Proposal<T>`: a typing-free prefill offered from what the user already entered, carrying
`evidence`, a `source` and an optional `metric` so the user can always ask why something is offered and get
an answer out of their own ledger. Two kinds were derived — `repeat_entry` and `bulk_category`. Four more
were declared in `ProposalKind` and never implemented: `value_update`, `match_candidate`, `split_fill` and
`date_shortcut`.

Working through the remaining four made it clear they are not four of a kind.

## Decision

**A kind belongs in `ProposalKind` only if it is derived from the user's own data and can cite it.**

`match_candidate` and `value_update` qualify and are now implemented. `split_fill` and `date_shortcut` do
not and have been removed from the union.

Splitting a total evenly and jumping to yesterday are constant shortcuts. They cite nothing, because there
is nothing to cite — the arithmetic is the same whoever the user is and whatever is in their ledger. Forced
into the `Proposal` shape they would carry an empty `evidence` array and a `source` chosen only to satisfy
the type, and the guarantee that a proposal can explain itself would quietly become a guarantee that it has
a field where an explanation would go. A union that names kinds nothing produces is worse than a smaller
one: it reads as capability that exists.

The split arithmetic therefore lives in `src/ui/proposals/allocate.ts` as plain functions. The date chips
stay plain buttons.

**A proposal never prefills an amount that the user has not already committed to.**

`value_update` carries the holding, its name, its kind, its currency and today's date, and deliberately not
its value. A holding's previous valuation is not evidence for its next one; offering it prefilled would be
inventing a financial fact, which is the line 0037 drew and the reason `repeat_entry` is allowed to carry an
amount — there, the amount is one the user already recorded for that exact recurring entry, not a guess at a
new one. What `value_update` removes is the selecting and the currency-checking, not the user's judgement
about what something is worth.

**Ranking is evidence, not a verdict.**

`match_candidate` orders the refund candidates the repository already deemed eligible: same merchant and
same amount first, then same amount, then same merchant, then most recent. Ordering by date alone, which is
what the screen did, hides an exact same-merchant match behind anything newer — the case the feature exists
for is the case it handled worst.

Each proposal carries the reason it ranked where it did, and that reason is shown. None of it is proof: a
coincidental same-amount purchase from the same merchant ranks first and can still be the wrong one. So
selecting a proposal only fills the choice, confirmation remains a separate explicit step, and the warning
that a matching amount is not proof of a refund stays exactly where it was.

## Consequences

Extracting the split arithmetic out of its click handlers made it testable at its boundaries, and the first
thing that surfaced was a latent error: bigint division truncates toward zero, so the inline version summed
short for a negative total. Splits are expenses, so a negative total cannot occur today and no user could
have hit it. `splitEvenly` is correct for either sign now, and `tests/allocate.test.ts` checks that the
parts sum to the total exactly across every remainder for both signs, at a magnitude no float could hold.
Arithmetic that must be exactly right does not belong inside an event handler, where the only way to reach
it is to render a screen.

The money lint rejected `amounts.length-1` inside the extracted function, matching the identifier by name.
That was the rule working, not a false positive: the parameter holds the raw text the user typed into each
field, so naming it `amounts` invited exactly the arithmetic that must never happen on money. It is named
`entered`, and nothing was suppressed.

No feature was narrowed to add a shortcut. The refund search and its full hundred-purchase select are
unchanged; every net-worth holding still gets a quick button, uncapped and not filtered to the displayed
currency, because each one states its own currency and a narrower list would remove a one-tap route that
exists today.
