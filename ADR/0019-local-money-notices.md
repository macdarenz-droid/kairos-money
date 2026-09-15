# Local money notices

Decision: independently opt-in bill, transaction-review, recurring-price and monthly-review notices are derived from covered, settled imported records. They do not observe other applications or fetch bank data. Preferences use encrypted app_settings and therefore participate in existing export, backup, restore and deletion.

The native alarm queue holds only notice kinds, opaque event hashes and delivery times. Lock-screen text contains no amounts, merchants or account names. Inexact alarms avoid requiring exact-alarm access; Android may delay delivery. Android 13 notification permission is requested only when the user enables a type. Denial leaves the preference unchanged.

At most four events are queued, with one chosen per date. Native delivery enforces at least 24 hours between money notices and remembers delivered event hashes. The existing separately opted-in weekly export reminder remains distinct. Schedules refresh on opening/import changes; these are not a promise of live monitoring. Device restart requires reopening the app to refresh alarms.

Alternatives rejected: a background financial-data service would require keeping storage unlocked; remote notifications violate the local-first model; notification listening belongs to the deferred bank-notification addendum.

References: [Android notification permission](https://developer.android.com/develop/ui/views/notifications/notification-permission), [Android alarms](https://developer.android.com/develop/background-work/services/alarms/schedule).

Acceptance remains open until Android permission denial, actual delivery, cancellation, deletion, and both themes are verified. Source assertions do not establish native delivery.
