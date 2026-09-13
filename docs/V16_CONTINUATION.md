# Kairos Money continuation contract

Current user override (2026-09-13): the Money worker is disabled at the user's request. Continue manually; do not recreate or re-enable scheduled continuation without a new explicit request. The lease is released. The milestones and acceptance gates below still apply.

User authorization: continue while the user sleeps, applying V16 orchestration safeguards to Kairos Money only. The scheduler supports hourly invocations. Use exactly one recurring Money worker; do not create sub-hourly successor chains or modify trading/job workers.

Scope: macdarenz-droid/kairos-money, branch codex/session3-design-research. Read HANDOFF.md, docs/ROADMAP.md and the latest relevant gate report. The current consolidated milestone is S1 plus Session 3, including the statement-import repair. After its complete acceptance gate passes, proceed through Session 4 to private sideloaded v1. Stop at shipped v1; notification Addendum A remains later.

Each invocation:

1. Reconstruct current source, candidate SHA/run, completed acceptance evidence and next unfinished requirement. Preserve local unpushed work and compare remote head before mutations. Acquire one bounded execution lease with owner/expiry in the durable worker state using a non-forced, expected-head Git update; a valid other-owner lease means yield. Metadata-only lease commits use [skip ci] and do not become application candidates.
2. If a candidate is running, check it once and end. Never poll or launch a competing candidate. On failure, read only the failing job's log once, classify the defect, and perform a targeted repair. After two equivalent failed approaches, preserve evidence and materially change the approach using source/official documentation.
3. Continue useful implementation or acceptance work within the current milestone. Keep original features and assertions. Run local source regressions, production build, Android compilation/lint before publishing a coherent candidate. Do not make a release per component or weaken an acceptance condition to obtain green.
4. A successful workflow is evidence only for the checks it actually ran. Close S1/Session 3 only after authentication-bound migration, actual backup-reset-restore, all required native regressions and both-theme visual review pass for the candidate. Retrieve the required APK/theme artifacts once at milestone closure, the accepted exception to the routine green-artifact ban. Then update gate report/HANDOFF and start Session 4 without asking the sleeping user.
5. Record before/after source, candidate/run, actions, tests, failures, unresolved criteria and exact next action. Release the lease. Retain one enabled hourly worker; do not multiply tasks. Notify only after meaningful progress, milestone closure or a genuine user-only blocker.

No private statement, extracted transactions, recovery codes, signing keys or credentials may enter Git. Use synthetic fixtures. Keep non-exportable wrapping-key claims distinct from SQLCipher's necessary in-memory data key. Preserve integer money, order independence, provenance, reversible imports, integrity tiers, pending exclusion, research mapping and design tokens.

Stop safely for unavailable authorization/tools or a genuinely user-only prerequisite; checkpoint the exact blocker and pause the worker instead of repeating. Do not claim work ran while no automation invocation was active. On final private v1 closure, disable this worker and report the tested APK and handoff.
