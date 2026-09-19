# Savings, and an app that gives advice without giving a lecture

His brief, in his words: *"savings money doesnt mix in overall balance. its a separate money"*, *"keep or
save 20$ today cause you have enough for your bills, groceries etc"*, *"you can safely spend today $$$"*,
*"i want like a financial advisor app, but doesnt explain instead show me in charts"*, *"careful putting
these features, i dont want any explaination. make text simple"*, *"logic, deep. intelligent"*.

## What the research actually supports

- **Safe-to-spend is arithmetic, not a model.** Income minus what is already committed — bills, debt,
  subscriptions, goal contributions — minus what has been spent this period; recalculated continuously
  against real pay dates rather than a calendar month.
  <https://pocketguard.com/> · <https://getmoneyflow.app/safe-to-spend>
- **The savings share is 20%, and less when money is tight.** 50/30/20 puts 20% of income to savings;
  the advice for a tight budget is 5–10% rather than nothing, and an emergency fund of three to six
  months of expenses is the first target.
  <https://www.forbes.com/advisor/banking/guide-to-50-30-20-budget/> · <https://bankrate.com/banking/savings/how-much-money-should-i-save-each-month>
- **Consistency beats size, and streaks backfire.** Micro-saving research rewards the act, not the
  amount — a small deposit counts the same as a large one — and a losable streak demotivates once it
  breaks. So this app draws a path and never a score, and a missed day erases nothing.
  <https://trophy.so/blog/gamify-a-savings-app>

## The model

**Savings is a fact in the ledger, never a setting.**

```
pot = balances of accounts typed savings or investment          (money in a pot)
    + settled, non-transfer amounts whose kind is savings       (money set aside without a pot)
```

The second term cannot double-count the first: money moved into a tracked savings account is an internal
transfer, and transfers are excluded. Every amount converts at the rate for its own date; a balance
converts at today's, because a balance is what is held now.

**Spendable excludes the pot.** "Balance now" counts what can be spent; the savings tile counts what is
being kept. The forecast's liquid anchor drops savings accounts too — an app that offers your savings as
today's spending money is not advising you, it is spending you.

**Keep today** is what is left after everything that is already owed, divided by the days until it has to
last:

```
spendable   = balance(non-savings) − pending − bills due before the horizon − buffer
typicalDay  = median daily outgoing over covered days        (median, so one bad Friday is not a pattern)
headroom    = spendable − typicalDay × days
keep        = clamp(headroom ÷ days, 0, 20% of median daily net pay)   rounded DOWN to a doable step
```

Median, not mean, because one large day should not move advice. Rounded down, so the figure is never
more than the arithmetic supports. Capped at the research's savings share, so a windfall month does not
suggest something that cannot hold. Zero is a valid answer and is shown as zero, not hidden.

**Tiers, because his ledger is hand-entered.** The horizon is the days to next pay when payslips say
when that is (`payday`), otherwise the days left in the month (`month`). A tier is a tag, never a
paragraph.

## What appears on Today

| | |
|---|---|
| Money out | Money in |
| **Savings** | Balance now |

Under the tiles: **Spend today** and **Keep today**, two figures. Then one chart — the savings path:
what has been kept over the last 30 days behind today, and where it reaches in the next 30 if the
suggested amount is kept each day. The line ahead is dashed because it has not happened yet. The gap
between where the line is and where it was heading is the whole message, and nothing explains it.

## Four ways people spend, and the method each one gets

"the app should able to tell exactly how the user spends. then assign the appropriate method."

The research is unusually consistent on one point: **automation beats intention.** People who move money
on a schedule save more, and more reliably, than people who plan to each month; 48% of households save
only what is left after bills, which is why "left over" is not a method.
<https://srfs.upenn.edu/financial-wellness/browse-topics/budgeting/popular-budgeting-strategies> ·
<https://www.thepennyhoarder.com/budgeting/pay-yourself-first/>

The second finding is that the right method depends on how the money actually moves. Spending surges
about 33% on payday and stays up a day, but only among the present-biased; a fixed transfer helps the
steady earner and does nothing for the sprinter who has spent it by the third day. Small frequent
purchases leak in a way a monthly percentage never sees. And an irregular income breaks every method that
assumes a payday, which is why the advice for freelancers is a baseline month and a share of each payment
as it lands.
<https://phys.org/news/2010-08-payday-proximity-consumer-behavior.html> ·
<https://www.sciencedirect.com/science/article/abs/pii/S1043951X24001950> ·
<https://www.clevergirlfinance.com/irregular-income/>

`src/intelligence/method.ts` reads the pattern off the ledger — no coverage gate, so it works on a
hand-typed ledger from the first week — and `keepToday` shapes the suggestion to it:

| Pattern | Read from | Method | What Today shows |
|---|---|---|---|
| **Steady** | pay dates regular, daily spend CV under 150% | Pay yourself first | *Keep on payday* — one lump, the daily headroom × days |
| **Payday sprinter** | per-day spend in days 0–2 after pay ≥ 2× the rest | Daily allowance | *Keep today* — the daily figure |
| **Small leaks** | ≥ 25% of discretionary money in purchases under 15 units, ten or more of them | Round up | *Keep today* — the week's round-ups to the next hundred, per day |
| **Irregular pay** | pay gaps or sizes with CV over 30%, or the pay cycle itself flagged irregular | Keep a share when paid | *Keep when paid* — a tenth of what landed this week |

Most specific first: irregular pay outranks leaks, leaks outrank the sprint, and steady is earned by
regularity rather than assumed. The method changes the **shape** of the suggestion, never its ceiling —
nothing is ever suggested beyond the headroom the arithmetic found. The screen says two labels about it
(`Steady · Pay yourself first`) and nothing more.
