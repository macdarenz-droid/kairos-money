# 0035 — Settle obsolete vault calls during activity recreation

Status: accepted for implementation; native verification pending.

Run 34851477214 showed an obsolete WebView calling `KairosVault.status` as Android recreated `MainActivity`. The old plugin’s single-thread executor was already shutting down, so `execute` threw `RejectedExecutionException` from the reflected plugin method and killed the app process. This occurred during the existing 40-page recreation journey after earlier native checks passed.

Each plugin instance now has an atomic destroyed state set before executor shutdown. `perform` checks it before submission and again when queued work begins. A submission that races shutdown catches executor rejection. Each path rejects the obsolete Capacitor call with an activity-change message. It does not run, retry, or transfer the secure operation to the new activity.

Graceful `shutdown` remains: operations already running are not interrupted midway through keystore or preference changes. A queued operation that has not started observes destroyed state and rejects. The activity’s existing destroy path still closes the database, locks the vault and wipes held export bytes. A replacement activity gets a new plugin and executor through Capacitor’s class registration.

The existing 40-page `ActivityScenario.recreate` journey is the end-to-end regression for the reported race. Java syntax and source checks cannot establish Android lifecycle behavior; the combined native gate must pass it.
