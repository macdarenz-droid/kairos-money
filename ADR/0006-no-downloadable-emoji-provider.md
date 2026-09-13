# ADR 0006 — Keep font rendering independent of downloadable native emoji

Status: accepted. Date: 2026-09-13.

## Decision

Remove only EmojiCompatInitializer metadata from AndroidX Startup through the manifest merger. Keep the initialization provider and its other components. Kairos renders its interface in WebView with packaged Inter fonts; native emoji enhancement is unused. No manual EmojiCompat initializer is added.

## Evidence

CI run 34744611430 on ac43e1f1 installed the app and reached WebView startup. Android recorded Kairos exit reason 12, DEPENDENCY DIED: it depended on Google Play Services FontsProvider when that provider was killed after a background ANR. The merged manifest showed EmojiCompatInitializer added transitively by AndroidX. This was an operating-system dependency kill, not a captured Java exception in Kairos.

## Alternatives

Waiting for Google Play Services startup or retrying after its crash would retain an unnecessary service dependency. Disabling Google Play Services on the test device would change the test environment without fixing the production dependency. Removing the entire AndroidX Startup provider could break unrelated initialization. Downloadable native emoji is therefore disabled at its documented metadata entry.

## Validation

The native app-flow test asserts EmojiCompat is not configured after launch. The existing real lock, database, appearance, export and deletion checks remain required. No permission, authentication, encryption or network restriction is relaxed. System-provided emoji remains available; the WebView interface and its bundled font assets are unchanged.

Source: [Android EmojiCompat documentation](https://developer.android.com/reference/androidx/emoji2/text/EmojiCompat), including default deferred font loading and the supported manifest removal.
