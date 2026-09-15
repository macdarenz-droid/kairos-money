# Chart colour: why money in is copper, not green

Money in and money out are the two ends of nearly every picture in this app. The obvious choice is green
and red. It was tested and rejected on measurement, not taste.

## What was measured

Adjacent-pair separation in OKLab (×100), against the surface each pair is drawn on:

| Pair | Theme | Normal vision | Worst colour-vision deficiency |
|---|---|---|---|
| `positive` / `negative` (green/red) | dark | ΔE 31.9 | **ΔE 4.6 (deuteranopia)** |
| `positive` / `negative` (green/red) | light | ΔE 25.9 | **ΔE 4.0 (deuteranopia)** |
| `flow-in` / `flow-out` (copper/blue) | dark | ΔE 30.4 | ΔE 28.9 (protanopia) |
| `flow-in` / `flow-out` (copper/blue) | light | ΔE 30.5 | ΔE 29.7 (protanopia) |

ΔE 8 is the target floor for a pair carrying identity; 6–8 is permissible only with a second encoding.
Green and red land near 4 — for a red-green colourblind reader the two are the same colour. About one man
in twelve reads charts that way. A chart that says "you overspent" only in red says nothing to them.

Copper and blue hold their separation under every simulated deficiency because they differ in warmth and
in lightness, not only in hue.

## The tokens

| Token | Dark | Light | Meaning |
|---|---|---|---|
| `--flow-in` | `#C4813C` | `#96500F` | money arriving |
| `--flow-out` | `#5B7CFA` | `#3B5BDB` | money leaving |
| `--heat-1` … `--heat-5` | blue ramp | blue ramp | how much was spent on one day |

Blue means spending everywhere: the heat ramp on the calendar and the outflow mark are the same hue, so
the colour carries one meaning across the whole app.

`--positive` and `--negative` keep their jobs as **status** colours — a figure that is up or down, an
error, a warning. They are never used as chart series. Status colours that double as identity stop being
readable as status.

## Ink on a heat tile: `--heat-ink-1` … `--heat-ink-5`

The ramp climbs toward light in the dark theme and toward dark in the light one. A single rule for which
text colour sits on which step therefore cannot serve both, and the first version of it did not: white on
dark-theme `heat-5` measured **2.67:1**, well under AA, because that step is the lightest one there.

Each step now carries its own ink, per theme. Measured contrast of every pairing:

| Step | Dark | Light |
|---|---|---|
| `heat-1` | 13.15 | 13.15 |
| `heat-2` | 11.27 | 11.27 |
| `heat-3` | 7.28 | 7.41 |
| `heat-4` | 4.80 | 4.79 |
| `heat-5` | 7.45 | 7.94 |

Light `heat-4` was re-stepped from `#5372DA` to `#4C6BD6` to clear 4.5:1 against white; both ramps remain
monotonic in OKLab lightness.

Because the ramp inverts, **no caption may say "darker means more"** — it is true in one theme and false
in the other. Chroma rises with the step in both, so "stronger colour" is the phrasing that stays true.

## Rules that hold for any chart added later

- Colour is never the only signal. Every series is named in a legend, in its own mark's label, or both,
  and every chart has a table alternative.
- One scale per chart. Two measures of different size get two charts, not two axes.
- Sequential magnitude is one hue, light to dark. Polarity is two hues with a neutral middle. Never a
  rainbow.
- Re-run the separation check before adding a colour, in both themes, against the real surface. It is a
  computation, not a judgement call.
