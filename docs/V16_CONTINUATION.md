# Scheduled continuation re-enabled — 14 September 2026

The user explicitly asked for a self-re-arming gate-to-task loop, which is the new explicit request the older "do not recreate or re-enable scheduled continuation" wording requires. One hourly Routine, `Kairos gate → task loop` (`trig_012YZ9183BjCCPyuc3towZDU`), is bound to this session as the durable safety net; short one-shot check-ins remain the fast path while a gate is mid-flight. Exactly one recurring Routine exists, consistent with the single-worker rule below.

Each tick: establish state, then act. A running gate means do not push code — the workflow sets `concurrency: cancel-in-progress` per ref, so a push without `[skip ci]` kills the run in flight. A red gate is diagnosed from its failing job log once, repaired, validated against the full local gate and pushed. A green gate is recorded, then the queue advances: Session 4 remaining acceptance, then the 36 Money Analysis capabilities with the six quiet-coaching concepts per `SESSION_5_ARCHITECTURE.md`, then the low-effort usability pass. Delete the Routine once that queue is complete rather than looping on nothing.

Acceptance thresholds, frozen tests and the permanent constraints below are unchanged by this loop.

# Current authorization — 14 September 2026

The user explicitly re-enabled autonomous Kairos Money continuation. This overrides older worker-disabled/manual-only and stop-on-active-CI wording below. Use the existing hourly Money worker only. Continue Session 4 as one integrated milestone, then the accepted 36-capability Money Analysis and six quiet-coaching concepts, then the complete low-effort usability pass. Notification capture remains deferred; no trading/job automation changes.

Check an outstanding gate once per invocation. No in-turn polling or waiting: continue independent local work if it is running, preserving its candidate. Consolidate changes; do not launch competing gates or per-feature releases. Android compilation/lint/device evidence may run through authorized GitHub Actions when local Gradle is unavailable. Keep acceptance thresholds and frozen tests intact. Read the current HANDOFF before stale historical entries. Maintain one bounded owner/expiry lease and checkpoint, compare the remote head and never force-push. Stop and report a genuine user-only blocker. Disable this worker after the agreed scope is complete.

Receipt attachment labeling/save confirmation and Quick keyboard focus are authorized now. Receipt-to-draft and the remaining revision-2 navigation brief belong in the final usability pass. Keep every feature, visual design, and confirm-before-financial-commit behavior.

## Historical contract (superseded where stated above)

# Kairos Money continuation contract

Latest user instruction: suspend V16 orchestration rules during manual repair and session continuity. GitHub Actions is explicitly authorized for Android compilation, lint and device testing instead of unavailable local tooling. Keep the worker disabled. The original product requirements, privacy guarantees and session acceptance criteria remain binding.

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
