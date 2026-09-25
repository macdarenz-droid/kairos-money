# 0050 — One unlock: the PIN or biometrics each open the database key

Accepted 25 September 2026. Replaces the "the app PIN only verifies the app gate" part of ADR 0011.

## Problem
The SQLCipher key was wrapped only by a Keystore key that needs the phone's screen lock or a biometric
(ADR 0011). The Kairos PIN only opened the app's own gate, so every PIN unlock was followed by Android's
prompt. The owner wants one unlock: the PIN alone, or "Use biometrics" alone.

## Decision
The random 256-bit database key is unchanged. It is wrapped three times, and each wrap opens it alone:
- **PIN wrap** (`pinDbSecret`): AES-GCM under PBKDF2-HMAC-SHA256(PIN, own 32-byte salt, 210,000
  iterations), then AES-GCM again under a non-exportable Keystore key (`kairos.money.pin-wrap.v1`) that
  needs no prompt. Neither layer alone opens it: the file needs this phone's Keystore, and the Keystore
  needs the PIN. PIN attempts keep the existing persisted back-off.
- **Biometric wrap** (`biometricDbSecret`): AES-GCM under a Keystore key that needs a strong biometric for
  every use and is invalidated when a biometric is enrolled. Unlock passes the cipher through the
  prompt's CryptoObject. Turning biometrics on takes one biometric check; a changed enrolment turns it off.
- **Screen-lock wrap** (`authenticatedDbSecret`, ADR 0011, unchanged): used only by Forgot PIN, which
  unwraps the key right after Android authentication and rewraps it under the new PIN.

The key is held in native memory while unlocked and cleared on lock, as before. Nothing crosses the
WebView bridge. Export, backup and restore are unaffected.

## Migration
An install without a PIN wrap still opens the old way once: the PIN is checked, Android's prompt opens
the screen-lock wrap, and the PIN wrap is saved and verified before use. From then on the PIN alone opens
Kairos. Biometrics turned on before this change keep working until that first PIN unlock; after it they
need turning on again, with one biometric check. A new install asks for the screen lock once at setup,
to create the recovery wrap.

## Trade-off
The PIN path is now as strong as the PIN plus this phone's Keystore, where before it also needed the
screen lock. Someone with the phone, root and the PIN could open the ledger; before they also needed the
screen lock. The owner chose one unlock; the key is still never derivable off the phone.

## Tests
JVM unit tests cover the PIN layer (right PIN, wrong PIN or salt, damage, fresh nonces). The Key
protection device test now proves the PIN alone opens the real database while the recovery key still
needs Android; the reset test proves the new keys are deleted.
