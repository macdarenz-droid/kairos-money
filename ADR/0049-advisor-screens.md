# 0049 — Advisor screens

Accepted 24 September 2026. Builds on ADR 0045 (advisor core) and 0047 (category storage).
## Decision
- Settings › Claude advisor: off by default. The key lives under `secret:anthropic-key`, never in exports or backups.
- Insights shows Money review and Ask Kairos only when the advisor is on and a key is saved. Claude's text
  is tagged "AI wording"; figures stay the brain's. On any failure the local advice stands.
- "See exactly what is sent" shows the payload before any call. Every call, including failures, is logged
  with model, tokens and cost, and listed in the privacy log.
- Sorting needs its own switch. It sends only merchants the owner has not decided. Confident answers
  apply as one undoable run; unsure ones wait under "Check these".
- "All from this merchant" writes an owner rule, so it beats Claude and survives rebuilds.
- An optional switch sorts only new, uncategorised merchants after each import.

Consequence: no screen calls the network unless the owner has turned the advisor on and saved a key.
