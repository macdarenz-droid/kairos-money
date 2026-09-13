# 0009 — Offline extraction and bounded file handling

## Decision

Use Capacitor 6-compatible file-picker 6.2.0 and Filesystem to read only user-selected files. Stage up to six files, each at most 20 MB, encrypted before extraction. Process one file's account/period/sign/balance details at a time; every file receives mandatory review. App backgrounding can finish encrypted staging, but it cannot commit an import. A recreated UI discovers queued files and staged documents from SQLite.

Use pdf.js 4.10.38 positional text extraction with its bundled worker. Short/empty text pages render locally for OCR. A small Capacitor native bridge uses bundled ML Kit Latin recognition 16.0.1; no Capacitor-6 text-recognition package exists in the checked registry. The model ships in the APK and needs no download. Images are decoded in memory and recycled. The manifest removes INTERNET and ACCESS_NETWORK_STATE permissions from transitive dependencies. No assisted parsing or telemetry endpoint is configured.

Generic CSV honors quoted fields and infers labelled columns; unknown columns expose explicit mapping. OFX/QIF direction is authoritative and is never credit-card-inverted again. XLSX reads XML strings directly, preserving exact monetary text instead of converting amounts through Number; formulas are rejected rather than trusting cached values. Limit expanded XLSX data to 32 MB and PDFs to 100 pages. Actionable failures name the unsupported structure and offer a CSV/export/correction path.

## Alternatives and scope

Do not use server OCR, bank credentials, native downloaded font providers or floating-point spreadsheet values. PDF rendering and table normalization still require some WebView work; the dedicated 40-page worker/performance gate belongs to Session 4. Headerless export inference, balance-free integrity tiers and remembered issuer mappings belong to the accepted Session 2.5 revision, not this Session 2 balance-authoritative gate.

References: [pdf.js examples](https://mozilla.github.io/pdf.js/examples/), [file picker compatibility](https://capawesome.io/docs/plugins/file-picker/), [bundled ML Kit text recognition](https://developers.google.com/ml-kit/vision/text-recognition/v2/android).
