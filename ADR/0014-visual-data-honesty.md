# 0014 — Honest chart and fingerprint inputs

Decision: derive chart data using integer minor units and explicit covered/gap/stale/future day states. Unknown values are null, not zero. Fingerprint axes preserve original signal/evidence and expose bounded display radii; display ceilings are geometry scales, not researched behavioural thresholds. Missing signals cannot generate a complete shape. Incomplete calendar months stay provisional and Tier C uncertainty remains visible.

Alternative rejected: interpolate missing dates or normalise absent signals to zero, which would suggest activity or certainty not present in the ledger.

Validation: tests distinguish a historical gap from the stale edge and future, preserve amounts beyond floating-point exact arithmetic boundaries, exclude pending/transfers, and require deterministic order-independent monthly axes with partial-month disclosure. Schema unchanged. UI integration and visual acceptance remain Session 4 work.
