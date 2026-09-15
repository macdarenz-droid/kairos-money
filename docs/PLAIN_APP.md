# The app is honest and unreadable. This is how it becomes both honest and readable.

Accepted 15 September 2026, from the owner's own words after using it: *"I open the app. I need to create an
account. And then, once I create the account, I don't know what to do. I see a lot of data… it's too hard
for me to understand what's inside the app."*

That is not a bug report and it is not a preference. It is the product failing at its one job.

## What the Today screen said when this was written

Read from a real device capture on 15 September 2026, not from the source. This table is the diagnosis, not
the app: it is kept as the record of what was wrong. What the screen says now is further down. Every line a
first-time user met, in order:

| Line on screen | What it really is |
|---|---|
| A clearer view starts with your data. | a slogan |
| Add transaction | **an action** |
| Recorded today · repeat tiles | **useful** |
| Spent USD 15.00 / Received USD 0.00 / Spent $30.00 / Received $0.00 | **useful**, but unlabelled and repeated per currency |
| Recorded transactions only. Transfers are excluded. | caveat |
| See spending patterns | navigation |
| Some inputs are Tier C: balance unverified. Confidence is reduced. | private vocabulary |
| Cashflow outlook | a feature name |
| A current balance, 60 covered days, and at least three payslips per income source are needed. | a list of things the user does not have |
| Try a scenario | a name that says nothing |
| Goals and buffer | half a name that says nothing |
| Your data needs an update | an alarm |
| Synthetic everyday · As of 2026-09-06 · 9 days old | useful |
| Synthetic intelligence · No imported coverage yet | private vocabulary |
| Amounts from these imports do not describe today's available money. | caveat |
| Update accounts | an action |
| Accounts set up · 2 | an internal metric |
| Statement coverage · 8 covered days | an internal metric, in private vocabulary |
| You stay in control. Every statement stays in staging until you confirm its review. | process description |

Three of nineteen blocks told the user about their money or what to do next. The rest was the app talking
about itself.

## Why it ended up like this

Every one of those lines was added for a good reason, and most of them are defensible in isolation. The
integrity tiers exist so a number is never presented as verified when it is not. The requirement list
exists so a forecast never appears from nothing. The staging note exists because the user really does stay
in control. None of it is padding.

But they were each added by someone who already knew what the words meant, onto a screen nobody was
measuring as a whole. The result optimises for **never being wrong** and forgets to optimise for **being
understood**. An app that is completely honest and completely opaque has not kept its promise; it has moved
the cost from the author to the reader.

## The four rules

**1. One screen, one question.** Today answers "what have I spent, and is there anything I need to do?"
Anything that answers a different question belongs on a different screen.

**2. Complexity has to be earned.** A feature that cannot work yet does not advertise its requirements on
the home screen. It is absent until it works, and then it appears. A user should never meet a list of
things they do not have.

**3. No private vocabulary in the open.** Tier C, coverage, staging, buffer, scenario, residual, archetype
— these are how the system thinks, not how a person thinks. Each either gets a name that says what it does,
or lives behind a screen that explains it at the point of use.

**4. A caveat attaches to a number, not to a screen.** "Balance unverified" belongs beside the figure it
qualifies, ideally behind a "why?", never as a standalone paragraph addressed to nobody.

## What Today says now

Read from `src/ui/App.tsx` and the components it mounts, in render order. Nineteen blocks became six, and
three of them draw themselves out of existence when they have nothing to say.

| Block | What it is | When it appears |
|---|---|---|
| Today · "What you have spent today." | the screen's question | always |
| Recorded today — repeat tiles, **Spent today** as the one large figure, then Received, then "Spent, waiting on your statement" | the answer | always |
| "What is counted here" | the caveat, folded into a disclosure under the figures it qualifies | always, closed |
| Add transaction | the action | always |
| A seven-day strip, then "Money you can spend" | the picture, then the forecast | the strip always; the forecast only once it can be computed |
| "Your statements are out of date" | the one "is there anything I need to do?" line | **only when they are** |
| See where my money goes | navigation | always |

The three rules that had been broken are each enforced by a piece of code rather than by care:

- **Rule 2** is `!r.distress && (f.status === 'ok' || mode === 'insights')` in `Intelligence.tsx`. On Today,
  a forecast that cannot be computed renders nothing at all — no heading, and above all no list of the
  things the owner does not have. That list still exists, on Insights, where someone has gone looking for
  it.
- **Rule 1** is `if (!stale) return null` in `Freshness`. A status report nobody asked for is what made this
  screen unreadable, so when there is nothing to do it says nothing.
- **Rule 4** is the `<details>` in `ManualHistory`. "Transfers are excluded" is attached to the total it
  qualifies, one press away, instead of addressed to nobody.

Rule 3 is the one that has to be re-won line by line rather than enforced once. Today's version of the
forecast heading is "Money you can spend"; Insights keeps "Cashflow outlook", because a reader who has
opened that screen is asking a different question. The same applies to the word *pending*: an approved bank
notification is a real, unconfirmed amount, and the line for it says "Spent, waiting on your statement"
rather than naming the database status.

## The third complaint: thirty-six measures, read one at a time

From the owner, on the Insights tab: *"I don't want to see this in my app sitting as text… not one by one
data. And this is a long scroll which I don't want… what I want was the logic, or maybe visualisation, how
would the app tell me those features without reading, scrolling too much."*

The 36 capabilities and the 12 signals had each been rendered as a row with a title, a subtitle and a
value. When the evidence was thin — which is the normal state of a new ledger — every one of those rows
printed the *same sentence*, twice: once as the subtitle and once as the value. A screen with nothing to
say said it seventy-two times and took a long scroll to do it.

The measures were never meant to be read. They are the engine; what a person wants from them is *how much
of this can the app tell me yet*, and *what closes the gap*. So both walls open with `MeasureReadiness`: a
count, a grid of one square per measure that fills in as statements arrive, and each distinct blocking
reason said **once** with how many measures are waiting on it. The full roll-call is unchanged, one
disclosure down, for the case where someone wants a specific number.

The same reasoning produced `AxisPositions`. Four descriptive axes had been four rows of bare numbers, with
"Unknown" reading as a failure rather than as a gap. They are now marks on a track — deliberately *not*
bars filled from the left, because a filled bar reads as a score out of a hundred and these describe a
pattern, which is what the sentence beside them already says. An axis with no value draws its track and no
dot, so a missing input looks like a gap instead of a zero.

Nothing was removed to achieve any of this, and no number became unreachable. The rule it follows is the
owner's: *"visuals > info of visuals from data > deep backend, intelligent > not text text text."*

## What does not change

No feature is removed and nothing becomes unreachable. This is about where things live and what they are
called. Exact money, evidence for every number, integrity tiers, coverage gaps, confirm-before-commit and
the offline guarantee are all untouched — the honesty stays, it just stops being the first thing shouted at
someone who only wants to record a coffee.

## The second complaint: "I gave it three months of statements and it says it has nothing"

From the owner, the same day: *"what's the purpose of putting my statement three months ago or six months
ago if the app could not put a feedback about that… when I input a new data and when I input an old data,
it's the same thing how I spend my money."*

He is right, and this one was not a wording problem.

`windows(asOf)` anchored every analysis window to **today**: the trailing-90 window ran from today minus 89
days to today. Statements that end three months ago fall entirely outside it, `covered()` then filters out
every transaction, and all 36 capabilities return `insufficient_data`. The app held three months of real
spending and analysed an empty range.

### The distinction the code was missing

Two different questions were being held to one standard:

| Question | Needs recent data? |
|---|---|
| What can I safely spend today? | **Yes.** A claim about money available now requires a current balance. |
| How do I spend money? | **No.** Three months of statements describe three months of behaviour whenever they were imported. |

A pattern does not expire. A balance does. Treating them the same meant the honest requirement belonging to
the forecast was applied to everything, so the app refused to describe data it already had.

`describeWindows(snapshot, asOf)` anchors the describing windows to the last day the ledger covers, and
carries that date in the label so a reader can always tell whether they are looking at March or at last
week. Forecasting still uses `windows(asOf)`, deliberately: stretching old data to cover today would be the
dishonest way to answer this complaint, and it would put a stale number where a current one is promised.

`tests/old-statements-still-describe.test.ts` holds both halves — the same ledger yields no usable metric
when anchored to today and usable metrics when anchored to its own data, and a current ledger still
produces exactly the window it did before.
