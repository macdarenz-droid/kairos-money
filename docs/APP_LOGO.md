# Approved app logo

The user supplied the mint K on a dark square on 13 September 2026 and requested it as the app logo.

`public/branding/kairos-money-logo.jpg` and `android/app/src/main/res/drawable-nodpi/kairos_logo.jpg` preserve the original attachment bytes. The attachment was named PNG but contains JPEG data; these copies use the correct extension.

The shared Brand component displays it on the app header and PIN/setup screen. The HTML favicon references the same artwork. Both Android adaptive launcher icons use `kairos_launcher.xml`, with 12 dp of inset to protect the artwork under round masks. The existing launch theme uses that launcher resource for the splash icon.

The production web build, full Android app/test build, lint and signature verification pass. Android 34 AAPT2 also independently compiled and linked the adaptive icons. Both original asset copies have SHA-256 `ba02b34ca354afa19361f94153fdbf5a0a85b326fa1e825390dc07af52417ae0`. The logo is visible in the reviewed light and dark native screenshots from passing workflow 34754456134. See `GATE_SESSION_2_5.md` for accepted APK provenance.
