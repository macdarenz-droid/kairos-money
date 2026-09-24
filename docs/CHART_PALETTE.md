# Chart colour rules

Measured values for every theme live in `docs/CONTRAST.md`, generated and gated by `scripts/tokens.mjs`.

- Money in is copper (`--flow-in`), money out is blue (`--flow-out`). Green and red fall to ΔE ≈ 4 for
  red-green colour-blind readers, so `--positive`/`--negative` are status colours only, never chart series.
- Blue means spending everywhere: the heat ramp, the tile ramp and the outflow mark share one hue.
- Area decides the step: full-chroma `--flow-*` for small marks, `--flow-*-fill` for large areas. Never swap.
- `--heat-*` is for small cells, with its own ink per step; `--tile-*` is for large blocks, one `--tile-ink`.
- A ramp may invert between themes, so no caption says "darker means more"; say "stronger colour".
- ΔE (OKLab ×100) of 8 is the floor for a pair that carries identity. Sequential ramps are checked for
  steady lightness and ink contrast instead.
- Colour is never the only signal: every series is named, and every chart has a table alternative.
- One scale per chart; sequential is one hue; polarity is two hues with a neutral middle; never a rainbow.
- Add a colour only through `tokens.mjs`; the build fails on any FAIL row.
