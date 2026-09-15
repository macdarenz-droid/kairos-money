# Session 5 architecture — offline Money Analysis and quiet coaching

Status: phases 5.0-5.5 implemented — all 36 capabilities, the six observation concepts, and `src/ui/screens/Analysis.tsx` reachable from Insights. Phases 5.6 (performance pass) and 5.7 (consolidated native gate) remain; nothing in this layer has device evidence yet. Session 4's gate is green (run 34912806907) and its automated acceptance is complete; two closure criteria remain open pending human artifact review, see `GATE_SESSION_4_REPORT.md`. Phase 5.5 delivers the Analysis screen using existing primitives only, with 6 tests covering both themes, evidence in two taps, insufficient_data shown as a reason rather than a zero, modelled amounts kept visibly separate from what happened, and a screen-wide assertion that nothing asks or instructs. It reads the trailing-90 window rather than the calendar month: a month-to-date window sits below the 20-covered-day threshold for the first three weeks of every month, which the screen test exposed. Phase 5.4 delivers the six concepts in `src/analysis/observations/index.ts` and the guard in `tests/observations.test.ts`: no statement or template carries a question mark, an imperative, a motive verb, or a shaming or urgent tone, and the Observation type is checked to have no action affordance. Distress arrives as a caller-supplied flag rather than being recomputed, because `distress()` needs the intelligence Signal set this layer does not hold. Phase 5.3 delivers capabilities 27-36 in `metrics/{position,reports,planning}.ts` with 13 behaviour tests, including one asserting all 36 keys are produced from a single snapshot. Balance work is reconstructed backwards from a verified Tier A anchor rather than accumulated from zero, and `changedMetrics` implements capability 36 as a diff of two retained metric sets. Recorded goals now reach the snapshot so a budget is measured against what the user set. Phase 5.2 delivers capabilities 14-26 in `metrics/{timing,recurrence,instruments}.ts` with 14 behaviour tests, one of which proves the exit condition directly: emptying the shared recurrence grouping silences every capability that depends on it, so none regroups the transactions itself. It also carries stored original-currency evidence into the snapshot, because the FX capability had no input otherwise. Phase 5.1 delivers capabilities 1-13 in `src/analysis/metrics/{ledger,income,classify,shape}.ts`, a shared `src/analysis/metric.ts` that applies the coverage, confidence and evidence invariants in one place, and `tests/analysis-metrics.test.ts` (17 behaviour tests). Capabilities 14-36 are not implemented. Phase 5.0 delivers `src/analysis/model.ts`, `src/analysis/index.ts` and `tests/analysis-contract.test.ts`: the 36-key union, the Metric and Observation contracts, `buildIndex`, and nine contract and property tests that pass with zero metrics implemented and bind every capability as it lands. No capability is implemented yet and none is claimed.

Scope is fixed by the roadmap: all 36 Money Analysis capabilities and the six quiet-coaching concepts land together as one milestone, followed by the complete low-effort usability pass in `LOW_EFFORT_USABILITY.md`. Nothing here removes a feature, weakens an acceptance assertion or regenerates accepted fixtures.

## Placement: a sibling of intelligence, not an extension of it

Session 3's twelve signals, archetypes, insights and forecasts carry frozen acceptance assertions. This layer therefore lives in a new `src/analysis/`, importing the shared kernel from `src/intelligence/model.ts` rather than reimplementing or amending it:

- `Snapshot`, `Transaction`, `Coverage`, `Pay`, `Window`, `Kind`
- `covered()`, `historical()`, `windows()`, `day/iso/shift/dates`
- `sum/abs/median/ratio/cv/sqrt` — the bigint arithmetic, reused verbatim so money stays exact

`intelligenceRepository.snapshot()` already assembles the snapshot from the whole ledger (imported, manual and other screens' records, with refunds and splits applied). Analysis reads that same snapshot. It does not re-query `transactions` itself, and it never writes to the ledger — the Session 3 rule holds unchanged.

Note the distinction the recent `materializedLedger` repair made explicit: the *importer's* ledger is scoped to batches holding a staged source document, while the *intelligence snapshot* deliberately covers every account record. Analysis follows the snapshot, not the importer scope.

```
src/analysis/
  model.ts        Metric + Observation contracts, MetricKey union
  index.ts        buildIndex(snapshot) -> AnalysisIndex; analyse(snapshot) -> Metric[]
  metrics/        the 36 capabilities, grouped by family (one file per family)
  observations/   the six quiet-coaching concepts, template-only
```

## One shared pre-pass, not 36 scans

The 20,000-row ledger is the binding constraint; it is why the materialized read exists at all. Computing 36 metrics with 36 passes over the snapshot would undo that work.

`buildIndex(snapshot)` makes a single ordered pass and returns reusable indices: by month, by weekday, by merchant, by category, by account, by instrument, settled-non-transfer, recurrence groups keyed on normalized merchant plus amount band, and a covered-day bitmap per account. Every metric reads the index and never rescans raw transactions. Recurrence grouping is computed once and shared by capabilities 18–20 and 33–35.

Budget: `analyse()` over the existing 20,000-row fixture must stay under **1,500 ms** locally, asserted in `tests/performance.test.ts` alongside the current materialized-workspace assertion. The current workspace load is ~700 ms against a 5-second ceiling, so the combined figure stays inside the 10-second Android budget with margin.

## Metric contract

Every capability returns the same shape, mirroring `Signal` so one table-driven contract test covers all 36:

```ts
export type Metric = {
  key: MetricKey; version: 1; period: string;
  status: 'ok' | 'insufficient_data';
  value: string | null;            // bigint minor units or integer count, as a string
  unit: string; reason: string;    // reason is required when insufficient_data
  confidence: number;              // reduced for predominantly Tier C inputs
  unverified: boolean;
  coverage: { coveredDays: number; gaps: Window[]; tierC: boolean };
  evidence: string[];              // transaction ids, always resolvable to a source row
  details: Record<string, string>;
};
```

Invariants enforced for all 36 by one shared property test:

- Pending transactions are excluded from every historical figure.
- Internal transfers count as neither income nor spend.
- Money is bigint minor units end to end; no float ever touches a stored or displayed amount.
- A window lacking coverage returns `insufficient_data` with a reason, never a zero or a guess.
- Predominantly Tier C inputs reduce confidence and set `unverified`.
- Every non-empty `evidence` id resolves to a transaction with a source row, reachable in two taps.
- Recomputation is deterministic: identical snapshot bytes produce identical metric bytes.

## The 36 capabilities

Grouped by family; the numbering is the roadmap's enumeration.

**Ledger and reconciliation (1–5)** — `metrics/ledger.ts`
1 combined ledger across accounts · 2 reconciliation against stated statement balances · 3 cashflow in/out by period · 4 transfers identified and excluded · 5 credit-account type handling with correct sign rules.

**Income and classification (6–8)** — `metrics/income.ts`, `metrics/classify.ts`
6 salary patterns from payslips and net-pay links · 7 categories · 8 merchants.

**Shape of spending (9–13)** — `metrics/shape.ts`
9 repeated purchases · 10 small payments · 11 frequency versus size · 12 anomalies against a usual range · 13 period comparisons.

**Costs and timing (14–17)** — `metrics/timing.ts`
14 regular versus occasional costs · 15 payday effects · 16 day-of-week distribution · 17 clusters.

**Recurrence (18–20)** — `metrics/recurrence.ts`
18 recurrence detection · 19 price changes on recurring commitments · 20 BNPL commitments and schedules.

**Instruments and adjustments (21–26)** — `metrics/instruments.ts`
21 remittances · 22 FX with exact stored rates · 23 fees · 24 refunds and chargebacks · 25 cash entries · 26 account balances.

**Position (27–30)** — `metrics/position.ts`
27 low-balance episodes · 28 account use · 29 surplus · 30 balance trajectory.

**Reporting and planning (31–36)** — `metrics/reports.ts`, `metrics/planning.ts`
31 evidence-linked reports · 32 context questions (import-review only; never coaching prompts) · 33 budgets · 34 what-ifs · 35 conditional forecasts · 36 exports, plus recomputation after new imports.

Capability 36's "changes after new imports" is a diff over two stored metric sets, not a recompute-and-forget: the prior set is retained so the change itself is evidence-linked.

## The six quiet-coaching concepts

Presentation is declarative and is enforced by the type, not by convention. `Observation` deliberately has **no** action, prompt, question or acceptance field, so no UI can render Try it / Adjust / Not now controls or an experiment workflow:

```ts
export type Concept = 'understand' | 'goal_obstacle' | 'alternatives' | 'contribution' | 'progress' | 'dignity';
export type Observation = {
  id: string; metric: MetricKey; concept: Concept;
  statement: string;                                   // short, declarative, no question mark
  figure: { minor: string; currency: Currency } | { count: number } | null;
  visual: 'none' | 'sparkline' | 'bar' | 'range';      // one compact visual at most
  evidence: string[];
  conditional: { premise: string; perWeekMinor: string } | null;  // explicitly hypothetical
  progress: { actualMinor: string; scenarioMinor: string } | null; // actual kept separate
};
```

1. **understand** — explain frequency versus price, accumulation, usual ranges and pace.
2. **goal_obstacle** — connect a pattern to a goal the user already recorded and a realistic obstacle drawn from their own data. Never invents a goal.
3. **alternatives** — practical alternatives stated as options, not instructions.
4. **contribution** — translate a change into an affordable contribution, always as conditional arithmetic: "two fewer $15 purchases would free $30 per week" carries its premise in `conditional.premise`.
5. **progress** — `progress.actualMinor` is what actually happened; `scenarioMinor` is hypothetical. They are separate fields and must render distinctly. No claim that a hypothetical reduction was saved.
6. **dignity** — no shame, diagnosis, urgency or punishment. No statement may assert motive, intent or enjoyment that a statement cannot evidence.

Current-week observations require current coverage, or they are withheld rather than shown stale. Distress state continues to reduce output to calm triage, reusing `profile.distress()`.

A lint-style guard test asserts no observation template contains a question mark, an imperative call to action, or a motive verb from a rejected list — the same mechanical approach as `scripts/test-money-lint.mjs` takes to numeric safety.

## UI surface

One new `src/ui/screens/Analysis.tsx` reachable from Insights, reusing existing primitives and design tokens. No new chart library, no generic metric-card grid, no decorative gradients — the `ROADMAP.md` visual constraints apply unchanged. Money Fingerprint stays the sole expressive visual; analysis visuals stay compact (sparkline, bar, range). Amounts render right-aligned and tabular with screen-reader labels, AA in both themes at 200% text with 44px targets.

## Sequencing

Each phase ends with the full local gate green — `npm run check`, money lint, native-gate unit tests, generated-file diff — before the next begins. One consolidated candidate goes to CI at the end; no per-phase gates, no competing runs.

| Phase | Content | Exit condition |
|---|---|---|
| 5.0 | `src/analysis/model.ts`, `buildIndex`, contract and property tests over a stub metric set | Contract test green with zero metrics implemented |
| 5.1 | Capabilities 1–13 (ledger, income, classification, shape) | All 13 honour the shared invariants |
| 5.2 | Capabilities 14–26 (timing, recurrence, instruments) | Recurrence groups shared, not recomputed |
| 5.3 | Capabilities 27–36 (position, reporting, planning, exports, import diff) | 36/36 with evidence resolvable in two taps |
| 5.4 | The six observation concepts and the declarative-template guard | Guard test green; no action affordances exist in the type |
| 5.5 | `Analysis.tsx`, both themes, 200% text, screen reader, reduced motion | Accessibility checks per screen |
| 5.6 | Performance pass against the 20,000-row fixture | `analyse()` under 1,500 ms locally |
| 5.7 | Consolidated candidate, native gate, both-theme visual review | Gate PASS with device evidence |

Then, and only then, the low-effort usability pass: rescan the finished feature set per `LOW_EFFORT_USABILITY.md`, baseline each task on device before setting targets, and deliver one combined regression and acceptance gate for the whole usability pass.

## Constraints carried forward

Offline and local only: no server, no API, no bank connection, no analytics, no cloud sync. Assisted parsing stays off by default. Synthetic fixtures only; no private statement, transaction, recovery code or key material enters Git. Integrity tiers, coverage gaps, pending exclusion, provenance, reversible imports, order independence and exact bigint money are preserved. Intelligence and analysis read the ledger and never write it. Notification capture remains deferred to Addendum A. Automation stays disabled.
