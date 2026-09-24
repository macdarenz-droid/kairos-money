# 0043 — Five themes

Accepted 24 September 2026. Amends ADR 0004 (accessible tokens).

## Decision
- Themes: `dark` and `light` (byte-identical to before), `black` (True black, OLED), `paper` (warm, low
  glare) and `contrast` (High contrast, every text and ink pair at 7:1). Preference is `system | <id>`;
  `system` resolves only to dark or light. Unknown stored values mean system, so no migration.
- `scripts/tokens.mjs` holds one `themes` list and generates `tokens.css`, `docs/CONTRAST.md`,
  `theme-registry.ts` and `kairos_theme_colors.xml`. It gates text, chart ink, accent and flow marks
  (3:1) and colour-blind flow separation (ΔE 8); any FAIL stops the build.
- Android reads one `Appearance.java`; night mode and the quick-add sheet follow each theme's scheme.

## Consequences
Paper and High contrast get the Light quick-add sheet, True black the Dark one. The owner reviews the new screenshots.
The Android 12+ start-up splash stays light or dark by scheme; the launch theme cannot switch by theme id.
