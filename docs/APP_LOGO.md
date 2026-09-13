# Approved app logo

The user supplied the mint K on a dark square on 13 September 2026 and requested it as the app logo.

`public/branding/kairos-money-logo.jpg` and `android/app/src/main/res/drawable-nodpi/kairos_logo.jpg` preserve the original attachment bytes. The attachment was named PNG but contains JPEG data; these copies use the correct extension.

The shared Brand component displays it on the app header and PIN/setup screen. The HTML favicon references the same artwork. Both Android adaptive launcher icons use `kairos_launcher.xml`, with 12 dp of inset to protect the artwork under round masks. The existing launch theme uses that launcher resource for the splash icon.

The production web build passes. Android 34 AAPT2 independently compiles and links both adaptive icons and their referenced artwork successfully. SHA-256 matches the upload for both asset copies: `ba02b34ca354afa19361f94153fdbf5a0a85b326fa1e825390dc07af52417ae0`. Full local Gradle verification was blocked by the absent offline ML Kit dependency; browser screenshots were blocked by the unavailable Chromium binary/download timeout. Native screenshots and full APK acceptance remain open; this does not close Session 2.5.
