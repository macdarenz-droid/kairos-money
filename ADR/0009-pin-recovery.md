# ADR 0009: Offline PIN replacement

Status: implemented; native gate pending. This is the PIN-recovery portion of Patch S1, not completion of its key-wrapping or encrypted-backup requirements.

Android device authentication authorizes a short-lived, native-only PIN replacement grant. It does not unlock the ledger. Successful authentication also persists a replacement-required flag so interruption cannot fall back to the old PIN or ordinary biometric unlock. Saving the replacement verifier clears that flag atomically and leaves the independently random SQLCipher secret unchanged. Grants expire after five minutes and do not survive process recreation; the user can verify the device again. Existing exponential PIN backoff remains persisted and does not trigger automatic deletion.

Use AndroidX BiometricPrompt with strong biometrics or device credentials on Android 11+. Android 10 and earlier use the system credential confirmation activity because that authenticator combination is unsupported there. Cancellation leaves storage locked. Recovery is available independently of the optional ordinary biometric-unlock preference. No network, SMS, account recovery or recovery-code unlocking is introduced.

The alternative is explicit permanent reset, requiring the exact text DELETE KAIROS in both UI and native validation. Android clears application data and key material through its existing clearApplicationUserData path. Previously exported files remain user-owned.

The current EncryptedSharedPreferences master key is not yet authentication-bound. This change must not be described as completing hardware-bound key protection. Patch S1 still needs auth-bound wrapping/migration, the backup-only recovery code, encrypted backup/restore and their device acceptance checks.

Reference: https://developer.android.com/identity/sign-in/biometric-auth

## Portable encrypted backup

Settings now creates and restores a versioned, authenticated snapshot of every application table, including staged source files stored inside SQLCipher. It excludes device PIN verifiers, SQLCipher secrets and the backup recovery code itself. Restore is allowed only into an empty ledger; table/column checks, exact-integer validation and foreign-key validation run with transactional inserts. A failed or interrupted transaction preserves the previous database. The current format supports database schema version 3; incompatible versions are rejected rather than partially imported.

A separate SecureRandom code uses 40 symbols from a 32-character alphabet without 0, 1, I or O: 200 bits of entropy, displayed as ten groups. It is retained in native encrypted preferences and readable only while unlocked. A written-code acknowledgement is required before saving a backup. It is not accepted by any PIN or device-unlock method. On a new installation, old backup codes decrypt old backups; future backups use the new installation's code.

Web Crypto HKDF-SHA-256 derives a non-exportable AES-256-GCM key from that high-entropy code and a fresh 32-byte salt. Each backup uses a fresh 12-byte nonce and a 128-bit authentication tag; the complete version/salt/nonce prefix is authenticated. Wrong codes, altered bytes and truncation fail before database writes. These are logical encrypted database snapshots, not copies of the device-bound SQLCipher file. No plaintext file is written. JavaScript strings cannot be reliably zeroed; temporary byte arrays are erased when practical.

The current backup limit is 64 MB to bound memory use. Large streaming backups, mandatory initial-setup code acknowledgement, the >50-transaction backup reminder, authentication-bound key migration, and real reset/restore device acceptance remain open. This slice does not close Patch S1.

References: https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/deriveKey and https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/encrypt
