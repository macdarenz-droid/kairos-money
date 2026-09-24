# Home-screen quick add

The Android widget is a launch surface, not a financial dashboard. RemoteViews contains only the app name and an Add transaction action. An immutable explicit PendingIntent opens MainActivity; the native launch bridge consumes the action once. React handles it only when the existing secure session is ready. Cold launch therefore retains normal unlock, and asynchronous completion after locking cannot open the form.

The widget does not read the database, accept transaction fields, bypass confirmation, or display financial values on the launcher. It follows the stored appearance preference. Alternatives were a balance widget (unnecessary exposure) and an externally browsable transaction URL (unnecessary input surface).

Source tests cover locked cold launch, unlocked warm launch, lock during bridge completion and web exclusion. Actual launcher placement, native compilation, appearance and cold/warm locked interaction remain required in the consolidated Android gate. Native font parity also remains a visual-review item.

Android implementation reference: https://developer.android.com/develop/ui/views/appwidgets
