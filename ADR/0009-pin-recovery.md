# ADR 0009: Offline PIN replacement

Status: implemented; native gate pending. This is the PIN-recovery portion of Patch S1, not completion of its key-wrapping or encrypted-backup requirements.

Android device authentication authorizes a short-lived, native-only PIN replacement grant. It does not unlock the ledger. Successful authentication also persists a replacement-required flag so interruption cannot fall back to the old PIN or ordinary biometric unlock. Saving the replacement verifier clears that flag atomically and leaves the independently random SQLCipher secret unchanged. Grants expire after five minutes and do not survive process recreation; the user can verify the device again. Existing exponential PIN backoff remains persisted and does not trigger automatic deletion.

Use AndroidX BiometricPrompt with strong biometrics or device credentials on Android 11+. Android 10 and earlier use the system credential confirmation activity because that authenticator combination is unsupported there. Cancellation leaves storage locked. Recovery is available independently of the optional ordinary biometric-unlock preference. No network, SMS, account recovery or recovery-code unlocking is introduced.

The alternative is explicit permanent reset, requiring the exact text DELETE KAIROS in both UI and native validation. Android clears application data and key material through its existing clearApplicationUserData path. Previously exported files remain user-owned.

The current EncryptedSharedPreferences master key is not yet authentication-bound. This change must not be described as completing hardware-bound key protection. Patch S1 still needs auth-bound wrapping/migration, the backup-only recovery code, encrypted backup/restore and their device acceptance checks.

Reference: https://developer.android.com/identity/sign-in/biometric-auth
