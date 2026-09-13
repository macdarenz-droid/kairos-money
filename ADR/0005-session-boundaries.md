# 0005 — Installable foundation without pretend import features

Decision: Session 1 includes functional account creation, query, lock, export and deletion. Import, behavioural claims, forecasts and Money Fingerprint are absent from actionable shipped paths until their session gates pass. Browser runtime is explicitly a design preview without financial storage; it never substitutes a mock or unencrypted database.

Synthetic fixtures are reachable only from developer scripts and tests. The kitchen-sink route exists only in the development build. Empty states explain the missing data and provide functioning navigation/account actions. Quick searches available actions; transaction/rule/month actions arrive with their actual features.

Debug builds use Android debug signing for development, with CI cache preserving the development certificate where available. These are not release credentials. A separately provisioned secret-backed release signing identity belongs to Session 4. No release readiness or Play Store compliance is implied by a debug APK.

The repository destination is exclusively macdarenz-droid/kairos-money. No trading-journal repository is used as a build or upload relay.
