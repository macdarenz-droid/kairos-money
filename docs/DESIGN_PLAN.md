# Session 1 design plan

Written before UI implementation. This foundation is a private financial ledger, with no fabricated balance, graph, transaction, or behavioural claim.

## Palette and contrast

Use the brief's four separately designed surface steps in each theme, a single blue accent, and hairline grouping. Source tokens are converted from the supplied sRGB values to OKLCH and emitted as CSS custom properties. Preserve the requested raw tokens. Where a supplied tertiary/semantic colour fails AA, use an explicit accessible text alias instead, documented by a generated contrast report. Inputs and focus indicators need a stronger boundary than decorative separators. Meaning always has text or a sign as well as colour.

## Type and rhythm

Bundle Inter locally; 400/500/600 only. Use the specified 11/16, 13/20, 15/22, 20/26, 28/34 and 40/44 scale, tabular numbers, and sentence case. Keep screen gutters at 20px, component padding at 16px and an 8px common rhythm. Text aligns left; amounts align right. Controls have at least 44px touch areas, even when their visible content is compact.

## Layout and interaction

A narrow reading column adapts to the phone, with a quiet identity line, clear screen title, one purpose-built empty section, and lined rows. Today explains why there is no safe-to-spend figure yet. Ledger offers the useful foundation action of creating an account. Insights explains that imported coverage is needed; You holds settings and security. A fixed five-slot navigation places Quick in the centre. Quick searches available destinations/actions; unavailable import and intelligence features remain absent from actionable menus. Settings offers theme preference, account creation, explicit export, and confirmed deletion. Kitchen sink is development-only.

Sheets use a native dialog, trapped focus, labelled dismissal, and a 160ms response animation. Theme is applied by a tiny pre-render script, following the system until explicitly changed. A native launch background is selected from the same preference. Reduced motion disables transitions. The lock replaces all financial UI and clears cached query data before presenting a PIN field or optional biometric authentication.

## Review against section 4

Avoided generic drift: no dashboard KPI card grid, decorative gradient, sample chart, stock welcome illustration, oversized marketing headline, all-caps label, or repeated floating cards. The foundation's signature is an honest empty ledger with account and coverage language. The Money Fingerprint belongs to Session 4 and is deliberately absent here. Surface, radius and border primitives support later dense data views without prescribing a SaaS template.

Permitted deviations: accessible text aliases override failing text usage of raw palette values; controls retain 44px hit targets; system-theme default takes priority over the phrase 'dark default' when the OS explicitly uses light. With no saved preference and no system signal, dark is the fallback.
