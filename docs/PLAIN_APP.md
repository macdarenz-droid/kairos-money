# The app is honest and unreadable. This is how it becomes both honest and readable.

Accepted 15 September 2026, from the owner's own words after using it: *"I open the app. I need to create an
account. And then, once I create the account, I don't know what to do. I see a lot of data… it's too hard
for me to understand what's inside the app."*

That is not a bug report and it is not a preference. It is the product failing at its one job.

## What the Today screen actually says

Read from a real device capture, not from the source. Every line a first-time user meets, in order:

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

Three of nineteen blocks tell the user about their money or what to do next. The rest is the app talking
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
