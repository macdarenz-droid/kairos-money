# Contrast verification

WCAG 2.x sRGB relative luminance ratios, evaluated against every surface. All body text uses accessible aliases. Raw tertiary tokens are retained from the brief but never used for text. Decorative dividers are exempt; input boundaries use border-control. Ratios below are minima across surfaces 0–3.

| Theme | Pair | Minimum ratio | Required | Result |
|---|---|---:|---:|---|
| dark | text-primary / surfaces | 13.65 | 4.5 | PASS |
| dark | text-secondary / surfaces | 6.07 | 4.5 | PASS |
| dark | text-meta / surfaces | 5.77 | 4.5 | PASS |
| dark | accent-text / surfaces | 7.29 | 4.5 | PASS |
| dark | positive-text / surfaces | 7.84 | 4.5 | PASS |
| dark | negative-text / surfaces | 7.56 | 4.5 | PASS |
| dark | warning-text / surfaces | 8.66 | 4.5 | PASS |
| dark | border-control / surfaces | 3.57 | 3 | PASS |
| dark | on-accent / accent-solid | 5.88 | 4.5 | PASS |
| dark | Requested raw tertiary / surface-0 (unused for text) | 3.58 | 4.5 | N/A — replaced by text-meta |
| light | text-primary / surfaces | 15.19 | 4.5 | PASS |
| light | text-secondary / surfaces | 5.09 | 4.5 | PASS |
| light | text-meta / surfaces | 4.79 | 4.5 | PASS |
| light | accent-text / surfaces | 6.08 | 4.5 | PASS |
| light | positive-text / surfaces | 5.44 | 4.5 | PASS |
| light | negative-text / surfaces | 5.25 | 4.5 | PASS |
| light | warning-text / surfaces | 5.84 | 4.5 | PASS |
| light | border-control / surfaces | 3.21 | 3 | PASS |
| light | on-accent / accent-solid | 5.67 | 4.5 | PASS |
| light | Requested raw tertiary / surface-0 (unused for text) | 3.08 | 4.5 | N/A — replaced by text-meta |
| black | text-primary / surfaces | 14.27 | 4.5 | PASS |
| black | text-secondary / surfaces | 6.35 | 4.5 | PASS |
| black | text-meta / surfaces | 6.04 | 4.5 | PASS |
| black | accent-text / surfaces | 7.62 | 4.5 | PASS |
| black | positive-text / surfaces | 8.20 | 4.5 | PASS |
| black | negative-text / surfaces | 7.91 | 4.5 | PASS |
| black | warning-text / surfaces | 9.05 | 4.5 | PASS |
| black | border-control / surfaces | 3.74 | 3 | PASS |
| black | on-accent / accent-solid | 5.88 | 4.5 | PASS |
| black | Requested raw tertiary / surface-0 (unused for text) | 3.78 | 4.5 | N/A — replaced by text-meta |
| paper | text-primary / surfaces | 11.68 | 4.5 | PASS |
| paper | text-secondary / surfaces | 5.86 | 4.5 | PASS |
| paper | text-meta / surfaces | 5.95 | 4.5 | PASS |
| paper | accent-text / surfaces | 5.93 | 4.5 | PASS |
| paper | positive-text / surfaces | 5.50 | 4.5 | PASS |
| paper | negative-text / surfaces | 5.54 | 4.5 | PASS |
| paper | warning-text / surfaces | 6.35 | 4.5 | PASS |
| paper | border-control / surfaces | 3.54 | 3 | PASS |
| paper | on-accent / accent-solid | 6.91 | 4.5 | PASS |
| paper | Requested raw tertiary / surface-0 (unused for text) | 3.26 | 4.5 | N/A — replaced by text-meta |
| contrast | text-primary / surfaces | 16.94 | 7 | PASS |
| contrast | text-secondary / surfaces | 10.74 | 7 | PASS |
| contrast | text-meta / surfaces | 9.87 | 7 | PASS |
| contrast | accent-text / surfaces | 7.18 | 7 | PASS |
| contrast | positive-text / surfaces | 7.75 | 7 | PASS |
| contrast | negative-text / surfaces | 7.85 | 7 | PASS |
| contrast | warning-text / surfaces | 7.82 | 7 | PASS |
| contrast | border-control / surfaces | 5.48 | 3 | PASS |
| contrast | on-accent / accent-solid | 8.90 | 7 | PASS |
| contrast | Requested raw tertiary / surface-0 (unused for text) | 10.49 | 4.5 | N/A — replaced by text-meta |

## Charts and graphics

Ink on chart fills meets the theme's text minimum; accent and flow marks meet 3:1 as graphics; flow pairs differ by ΔE 8 or more (OKLab ×100, as in CHART_PALETTE.md) under normal vision and simulated protan, deutan and tritan vision (Machado 2009, full severity); each ramp moves steadily one way in lightness.

| Theme | Pair | Value | Required | Result |
|---|---|---:|---:|---|
| dark | heat-ink-1 / heat-1 | 13.15 | 4.5 | PASS |
| dark | heat-ink-2 / heat-2 | 11.27 | 4.5 | PASS |
| dark | heat-ink-3 / heat-3 | 7.28 | 4.5 | PASS |
| dark | heat-ink-4 / heat-4 | 4.80 | 4.5 | PASS |
| dark | heat-ink-5 / heat-5 | 7.45 | 4.5 | PASS |
| dark | tile-ink / tiles 1–5 | 4.96 | 4.5 | PASS |
| dark | accent / surfaces | 4.31 | 3 | PASS |
| dark | flow-in / surface-1 | 5.95 | 3 | PASS |
| dark | flow-out / surface-1 | 5.19 | 3 | PASS |
| dark | flow-in vs flow-out ΔE (normal, protan, deutan, tritan) | 23.64 | 8 | PASS |
| dark | flow-in-fill vs flow-out-fill ΔE (normal, protan, deutan, tritan) | 16.90 | 8 | PASS |
| dark | heat ramp 1→5 | lighter | steady | PASS |
| dark | tile ramp 1→5 | lighter | steady | PASS |
| light | heat-ink-1 / heat-1 | 13.15 | 4.5 | PASS |
| light | heat-ink-2 / heat-2 | 11.27 | 4.5 | PASS |
| light | heat-ink-3 / heat-3 | 7.41 | 4.5 | PASS |
| light | heat-ink-4 / heat-4 | 4.79 | 4.5 | PASS |
| light | heat-ink-5 / heat-5 | 7.94 | 4.5 | PASS |
| light | tile-ink / tiles 1–5 | 5.02 | 4.5 | PASS |
| light | accent / surfaces | 4.79 | 3 | PASS |
| light | flow-in / surface-1 | 6.08 | 3 | PASS |
| light | flow-out / surface-1 | 5.67 | 3 | PASS |
| light | flow-in vs flow-out ΔE (normal, protan, deutan, tritan) | 22.88 | 8 | PASS |
| light | flow-in-fill vs flow-out-fill ΔE (normal, protan, deutan, tritan) | 12.87 | 8 | PASS |
| light | heat ramp 1→5 | darker | steady | PASS |
| light | tile ramp 1→5 | darker | steady | PASS |
| black | heat-ink-1 / heat-1 | 13.15 | 4.5 | PASS |
| black | heat-ink-2 / heat-2 | 11.27 | 4.5 | PASS |
| black | heat-ink-3 / heat-3 | 7.28 | 4.5 | PASS |
| black | heat-ink-4 / heat-4 | 4.80 | 4.5 | PASS |
| black | heat-ink-5 / heat-5 | 7.85 | 4.5 | PASS |
| black | tile-ink / tiles 1–5 | 4.96 | 4.5 | PASS |
| black | accent / surfaces | 4.50 | 3 | PASS |
| black | flow-in / surface-1 | 6.15 | 3 | PASS |
| black | flow-out / surface-1 | 5.35 | 3 | PASS |
| black | flow-in vs flow-out ΔE (normal, protan, deutan, tritan) | 23.64 | 8 | PASS |
| black | flow-in-fill vs flow-out-fill ΔE (normal, protan, deutan, tritan) | 16.90 | 8 | PASS |
| black | heat ramp 1→5 | lighter | steady | PASS |
| black | tile ramp 1→5 | lighter | steady | PASS |
| paper | heat-ink-1 / heat-1 | 13.15 | 4.5 | PASS |
| paper | heat-ink-2 / heat-2 | 11.27 | 4.5 | PASS |
| paper | heat-ink-3 / heat-3 | 7.41 | 4.5 | PASS |
| paper | heat-ink-4 / heat-4 | 4.79 | 4.5 | PASS |
| paper | heat-ink-5 / heat-5 | 7.94 | 4.5 | PASS |
| paper | tile-ink / tiles 1–5 | 5.02 | 4.5 | PASS |
| paper | accent / surfaces | 4.88 | 3 | PASS |
| paper | flow-in / surface-1 | 5.45 | 3 | PASS |
| paper | flow-out / surface-1 | 5.08 | 3 | PASS |
| paper | flow-in vs flow-out ΔE (normal, protan, deutan, tritan) | 22.88 | 8 | PASS |
| paper | flow-in-fill vs flow-out-fill ΔE (normal, protan, deutan, tritan) | 13.32 | 8 | PASS |
| paper | heat ramp 1→5 | darker | steady | PASS |
| paper | tile ramp 1→5 | darker | steady | PASS |
| contrast | heat-ink-1 / heat-1 | 14.65 | 7 | PASS |
| contrast | heat-ink-2 / heat-2 | 11.40 | 7 | PASS |
| contrast | heat-ink-3 / heat-3 | 8.43 | 7 | PASS |
| contrast | heat-ink-4 / heat-4 | 7.27 | 7 | PASS |
| contrast | heat-ink-5 / heat-5 | 11.56 | 7 | PASS |
| contrast | tile-ink / tiles 1–5 | 8.52 | 7 | PASS |
| contrast | accent / surfaces | 7.18 | 3 | PASS |
| contrast | flow-in / surface-1 | 7.03 | 3 | PASS |
| contrast | flow-out / surface-1 | 8.90 | 3 | PASS |
| contrast | flow-in vs flow-out ΔE (normal, protan, deutan, tritan) | 20.99 | 8 | PASS |
| contrast | flow-in-fill vs flow-out-fill ΔE (normal, protan, deutan, tritan) | 17.57 | 8 | PASS |
| contrast | heat ramp 1→5 | darker | steady | PASS |
| contrast | tile ramp 1→5 | darker | steady | PASS |
