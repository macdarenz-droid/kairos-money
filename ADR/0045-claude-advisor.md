# 0045 — Claude advisor

Accepted 24 September 2026 (owner decision; see `docs/ARCHITECTURE.md` › Claude advisor).
## Decision
- `src/core/net/claude.ts` is the second and last module allowed on the network. It imports only
  `@capacitor/core`, `@anthropic-ai/sdk` (0.128.0, pinned, loaded lazily) and brain types; a test enforces it.
- It sends a `BrainSummary` or a masked merchant list, never the ledger, with the owner's own key, non-streaming,
  over native HTTP with timeouts. `review`, `ask` and `categorise` (150 merchants per request) return a result
  or a typed failure: `key | busy | offline | refused | invalid`.
- Models: `claude-opus-5` by default (adaptive thinking, effort medium, `fallbacks: 'default'`);
  `claude-sonnet-5` (adaptive); `claude-haiku-4-5` (no thinking or effort). The stop reason is read first.
- Structured JSON output, then a local check: a point citing a fact id the summary lacks is dropped;
  unknown merchant ids and categories are dropped. Cost is bigint micro-dollars.

Consequence: no figure comes from Claude; the UI labels its text "AI wording" and falls back to local advice (S2b).
