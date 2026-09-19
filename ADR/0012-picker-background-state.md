# Preserve hidden review state during Android file selection

Decision: keep the app component tree mounted during the transient `background` session state, hidden with `display:none` and excluded from accessibility with `aria-hidden`. Existing native secure-window protection and immediate session obscuring remain active. Database access still closes on pause and resumes through the authenticated session path.

Reason: Android's document picker backgrounds the activity. Replacing the app with LockScreen at that moment destroyed the backup review and its pending error handler. A wrong-code result consequently returned to settings without an actionable message.

Alternatives: persisting recovery inputs to disk would create unnecessary sensitive storage; suppressing pause handling would weaken locking; reopening a blank sheet would lose the pending operation and entered code.

Limits: a true lock, expired session, failed authentication, reset or other non-ready state unmounts the app tree. This does not extend the 60-second deadline or authorize database access while backgrounded. The retained input exists only in the current in-memory view. Both-theme regressions verify concealment, brief-resume retention and expiry disposal; real picker execution remains part of the Android gate.
