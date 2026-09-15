# 0025 — Show observed spending before advanced profiles

## Problem

A private two-bank PDF reproduction passed both balance chains and import review, but the current-month view contained no transactions. Shared-account coverage filtering also hid one account's later statement activity. Uncategorised purchases and missing payslips left advanced profile signals unknown. None of these conditions should suppress observable statement facts.

## Decision

Add Your spending patterns to Insights and a Today shortcut. Default to all imported dates; offer account, currency and recorded-month filters. Read settled, non-future transactions for the selected accounts without requiring a common coverage window. Describe totals as recorded activity, and mark monthly account coverage explicitly. Preserve strict coverage and evidence gates for profiles, forecasts and savings claims.

Separate identifiable purchases/fees from matched transfers and uncertain outflows. Transfer/remittance/cash and recognised repayment-service wording stays in other debits to review. Repayment-service totals are explicitly a subset. Credits are not called income. Retain raw descriptions in the in-memory snapshot for this presentation logic; no database schema or ingestion identity changes.

Group readable merchant labels for this view only, removing bank purchase prefixes, card/value-date suffixes and Australian country/state suffixes. Do not fuzzy-merge businesses or change stored merchants. Expose exact source transactions for every amount. Show monthly totals, repeat merchants, small payments (20 units of the selected currency) and posting-day totals with explicit limitations. No inferred fuel category from a service-station name, personality, intent, diagnosis, salary or debt balance.

Anchor the existing historical chart month selector to the latest recorded transaction date rather than always opening an empty current month. Keep its strict coverage rules intact.

## Evidence

Supplied PDFs were inspected and run through production extraction, staging, review, commit and snapshot locally. Their content and private result files are not committed. Synthetic tests cover unequal statement dates, missing categories/payslips/coverage, transfers, repayment services, exact sums/source ids, pending/future/currency/account exclusions and both-theme filtering/evidence sheets. The native gate retains earlier profile screenshots and adds both-theme observed-spending captures. Device execution and visual acceptance remain open.
