# 0004 — Accessible aliases preserve the specified palette

Decision: retain all supplied raw colours, convert to OKLCH, and add explicit body-text and control-boundary aliases where the raw values fail AA. Text uses these aliases on all four surfaces. Exact ratios are generated into docs/CONTRAST.md. Dark raw tertiary is 3.58:1 on surface-0; light raw tertiary is 3.08:1, below the required 4.5:1. They are not used as readable text.

Alternatives: keep failing text colours; silently replace the brief's palette; increase all text sizes. Explicit aliases preserve the visual direction while making the AA decision auditable. Decorative hairlines remain subtle; form controls and focus rings use contrast-qualified edges.

Theme is applied before React using a CSP-hashed inline script. The system setting is the default; explicit selections are persisted in both WebView and native appearance preferences. The kitchen sink is compiled out of the normal production bundle. Motion is limited to sheet/press responses and disabled for reduced-motion preferences.
