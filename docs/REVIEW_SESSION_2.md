# Session 2 self-review

Status: source review complete; current Android screenshot and OCR review pending. The gate report remains authoritative.

## Integrity findings fixed

- A repeated fingerprint must not contribute twice to the statement sum after reconciliation collapses it. The balance check now uses unique contributions, and commit validates every affected committed statement against the proposed ledger. The regression test rejects a superficially balanced duplicated file.
- Corrections and merchant rules stay staged until confirmation. A deliberately interrupted SQL commit leaves no partial ledger or rule. Rolling back a middle statement rebuilds the independently supported state.
- Merchant aliases are explicitly configured inputs. Imported merchant names do not become order-dependent learned aliases during reconciliation.
- Debit/credit exports reject contradictory or empty amount pairs. OFX/QIF signed directions remain authoritative on credit accounts. Low-confidence category suggestions require review.

## Device evidence findings

- The first native import run assumed the selected CSV appeared in Android's Recent view. The test now navigates to Downloads and records the accessibility hierarchy and screenshot on failure.
- The first synthetic scan renderer substituted a font with visibly incorrect glyph spacing. Fixtures now embed DejaVu Sans; their real PDF parser golden tests pass. Native OCR JSON is retained to check actual recognition instead of inferring success from the scan's text layer.
- Current-run screenshots use a separate directory so old Session 1 images cannot be mistaken for new Session 2 evidence.
- The second native run recognized all four scans, but feeding its actual coordinates into the positional parser exposed a real alignment defect. OCR now retains line height, groups small vertical differences relative to glyph size, and orders each line by horizontal position. The native gate verifies all scanned dates/amounts and payslip fields through the production parsers, not just text recognition.
- The second picker screenshot showed the file was present. Android's grid did not expose a clickable ancestor within the test's four-level search. The helper now taps the visible, accessibility-located label using its actual screen bounds.

## Design review

Import details, review, row correction and rollback use the existing Sheet, Input, Button, Row and Amount primitives. Transactions use hairline rows, right-aligned amounts and tabular numerals. Coverage has an explicit patterned gap and a text explanation; it does not represent missing days as zero spending. No decorative shadows, celebration animation or additional accent palette was introduced.

The native gate captures details, quarantine, correction, review, ledger, coverage and rollback in dark and light themes. These images still require inspection before the gate can pass. Dense in-place mapping, the Update accounts sheet and muted freshness are the accepted Session 2.5 revision; they are not claimed as shipped here.
