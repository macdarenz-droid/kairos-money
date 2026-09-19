# The money audit: five chatbot prompts, answered by the ledger

His brief: five prompt cards — *Money Audit*, *Wealth Plan*, *Cash Flow Optimisation*, *Money Leaks*,
*Debt Destroyer* — and *"could we implement this in the app? use my files, statement, txns as reference.
but, i want a generalized context for diff user. so make atleast the brain and feature in the app,
architect properly"*.

## The design decision first

Those prompts assume a person pastes their income, debts and statements into a chatbot. This app is
built so that never happens: statements are processed on the device, the ledger is encrypted, and the
one network call the app makes is for exchange rates (`src/core/net/rates.ts`, enforced by
`tests/no-network.test.ts`). Sending merchant lines and balances to a model would undo the thing the
app is for.

So the audit is **a deterministic engine that reads the ledger**, not a prompt. It produces the same five
outputs as figures and lengths, every threshold is a published rule of thumb or a ratio of the ledger's
own numbers, and it works for anyone's ledger — his statements were used only to check the *shapes* a
real household produces, and nothing from them is in the repository (`tests/no-private-data.test.ts`).

## Where it lives

```
src/intelligence/audit/index.ts   audit(snapshot, {debts, spendableMinor}) → Audit     the brain
src/ui/screens/MoneyAudit.tsx     the card on Insights                                  the feature
tests/money-audit.test.ts         a synthetic household, every claim pinned
tests/money-audit-ui.test.tsx     the card draws figures, not sentences
```

`audit()` is pure: it reads the snapshot the rest of Insights already builds (one query key, no second
pass over the ledger), the open debts the Ledger already lists, and what is held to spend. It never
writes. Like the money band and the savings advice it has **no coverage gate** — a hand-typed ledger or
one built from approved notifications must still get an answer — and asks instead for four weeks of
history, so a normalised month means something. Everything is exact money or a basis-point ratio;
nothing is a float and nothing is a sentence.

## The five outputs and the rules behind them

**Window.** The last 90 days up to today, or since the first record if that is shorter; at least 28
days. Every total is stated as a month of thirty days (`total × 30 / days`).

**Income.** Payslips in the window when there are any; otherwise what landed as income in the ledger.

**Money leaks** (`leaks`, ranked by cost per year, each with the effort changing it takes):

| kind | what it is | effort |
|---|---|---|
| subscription | a discretionary payment recurring every 6–32 days (the forecast's own detector), per month = amount × 30 ÷ interval | low |
| small-purchases | lifestyle purchases under 15 whole units, the same line `small_leak_index` uses; five or more | medium |
| bank-fees | anything filed under Bank fees | low |
| cash-out | anything filed under Cash withdrawal: money that left the record | medium |
| lifestyle-creep | last 30 days' lifestyle spend per day at least a fifth above the 60 days before; needs 90 days | high |

Fees and cash withdrawals are their own leaks, so they are never also counted as small purchases or as
lifestyle.

**Money audit** (`findings`): the leaks, plus the two mistakes that are not leaks but cost money every
year — *Debt interest* (Σ balance × rate) and *Fixed costs* (essentials + minimums above 60% of income,
the same line the home screen's fixed-burden surface uses). Ranked by the year.

**Cash flow** (`cashFlow`): every unit of income given a purpose.

```
keep  = essentials + debt minimums
free  = income − keep
save  = min(free, max(what is already saved, 20% of income))       50/30/20
spend = free − save
cut   = small purchases + fees + creep                             the leaks that need no cancelling
```

`saveTo` is decided by the roadmap's current step, and `automate` is pay-yourself-first: the month's
`save`, scaled to the days until the next pay date the ledger can find, to move on that date.

**Debt** (`debt`): both orderings the existing planner already computes — avalanche (highest rate
first, costs least) and snowball (smallest first, clears one soonest) — on minimums plus the kept amount
when the roadmap says debt comes first. The cheaper one is kept; what the other costs is stated. One
debt: the two are the same, and the app says so by showing no difference.

**Wealth roadmap** (`roadmap`), the standard order, each step with where this ledger stands:

1. One month buffer — spendable balance against a month of essentials
2. High-interest debt — anything at 10% a year or more, with months to clear on the plan
3. Three month buffer
4. Save a fifth — what is set aside each month against 20% of income
5. Invest a tenth — the Investing category each month against 10% of income

The first step not yet done is *now*; it is where kept money goes. `income` says whether pay has risen,
held, or cannot be told (from `payRise`), stated rather than advised.

**Pay off by** (`targets`): a date the person puts on a debt, in the Ledger. *"I want to pay my debt in
full amount, So im going to set the amount how much. Then the app will analyse my transaction, all of
them ... tell me something like: try to keep ($) amount of money."* For each dated debt:

- the payment is the smallest that clears the balance by the date at its rate (`paymentFor`, a search
  over the exact `payoff`), never below the lender's minimum;
- it is stated per pay, when the pay cycle is known, and per day;
- it **fits** when the part above the minimum sits inside the month's free money (income less
  essentials less minimums). A target that fits outranks the roadmap: kept money goes to the debt, and
  at least that much is kept;
- when it does not fit, the soonest date the free money would clear it is stated instead of a payment
  nobody can make.

The debt form takes the date; the audit card shows the row; the Today card repeats the per-day figure
beside what is kept today, for the targets that fit.

## Sources for the rules of thumb

- 50/30/20 and the 20% savings share, three to six months of expenses as the buffer:
  <https://www.forbes.com/advisor/banking/guide-to-50-30-20-budget/>,
  <https://bankrate.com/banking/savings/how-much-money-should-i-save-each-month>
- Avalanche versus snowball, and why the app computes both: `src/intelligence/debt/index.ts`
- Small purchases and payday sprinting: `docs/SAVINGS_ADVICE.md`, `src/intelligence/method.ts`

## What it deliberately does not do

- It does not write a plan in prose. *"financial advisor app, but doesnt explain instead show me in
  charts"* — the card is four tiles, one bar, two rows of debt figures and five tracks.
- It does not guess what a payment to a person was for, or whether a subscription is unused. It ranks
  and states; the person decides.
- It does not send anything anywhere.
