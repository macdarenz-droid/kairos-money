# Acknowledge widget navigation after display

## Evidence

Run 34836848079 on 794811a reached Android's QUICK_ADD launch at 11:26:56.302. At 11:26:56.376 ActivityScenario explicitly ignored RESUMED because MainActivity replaced its original MAIN/LAUNCHER intent with QUICK_ADD. Subsequent cleanup remained unrecognized even after consume changed the action to MAIN, because the LAUNCHER category was still absent. Touch injection did not resolve the missing entry dialog.

A local regression separately reproduced the destructive-read race: consume cleared the native request, the session paused before the promise completed, and the hook discarded the result. Unlock then had nothing left to deliver. The failed device log establishes successful launch dispatch and the lifecycle identity mismatch; it does not establish the exact ordering of the JavaScript race.

## Decision

Keep the activity's original intent unchanged. Store a nonfinancial pending request ID separately in MainActivity, restoring it through saved instance state. BridgeActivity's initial forwarding of the original intent must not create a second request. Repeated taps before display coalesce to the latest request; they do not create ledger entries.

Replace consume with peek and ID-matched acknowledge. The hook reads only while the session is ready, ignores stale/out-of-order responses, and leaves the request pending across interruption. App acknowledges after the actual unlocked transaction form (or required account setup form) is committed with account data available. A stale acknowledgement cannot clear a newer request. Reading, unlocking and acknowledging never write financial records.

## Verification and alternatives

Retain Android touchscreen injection and require the named open transaction dialog. Restore ordinary ActivityScenario teardown and assert the original intent and RESUMED state. Extend the same native journey with a light-theme locked tap, recreation before unlock, pending-ID restoration, post-display acknowledgement and no replay on another resume. Existing security and full-gate assertions remain binding.

Hook regressions cover interrupted reads, display acknowledgement, repeated taps, out-of-order results, failures and web exclusion. Product UI tests verify both themes, delayed accounts, empty-account routing and interruption/recovery. Local Android compilation and execution require an SDK unavailable in this runtime; the replacement full gate must establish native proof.

Rejected: changing tap method alone, forced task finishing to hide tracking failure, restoring test intents only during cleanup, or consuming navigation before the destination appears.
