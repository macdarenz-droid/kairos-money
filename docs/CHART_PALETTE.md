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

## Big areas and small marks are not the same job: `--flow-*-fill`

The owner, on the first version of the flow chart: *"is there a color that will sync to my app silent
theme, that not hurts my eyes when seeing."*

He is describing a real effect, not a preference. A chroma that reads as precise in an 8px mark reads as
loud when it fills a third of the screen, and this app's whole surface treatment is quiet. But dropping the
chroma of `--flow-in` and `--flow-out` themselves would have paid for the large areas by weakening the
small marks, where saturation is the only thing making an 8px dot findable.

So each flow colour has two steps, and which one you use is decided by **area, not by meaning**:

| Job | Token | Where |
|---|---|---|
| a small mark, a legend swatch, a dot on a track | `--flow-in` / `--flow-out` | `.flow-key-*`, `.strip-bar`, `.axis-mark` |
| a large filled region | `--flow-in-fill` / `--flow-out-fill` | `.flow-fill-*`, `.balance-bar-*` |

Measured chroma in OKLab, mark → fill:

| | Dark | Light |
|---|---|---|
| money in | 0.118 → 0.080 | 0.117 → 0.077 |
| money out | 0.191 → 0.119 | 0.199 → 0.089 |

Desaturating cost nothing that mattered. The pair still separates well past the ΔE 8 identity floor under
every simulated deficiency:

| Pair | Theme | Normal vision | Worst deficiency |
|---|---|---|---|
| `flow-in-fill` / `flow-out-fill` | dark | ΔE 20.3 | ΔE 16.9 (tritanopia) |
| `flow-in-fill` / `flow-out-fill` | light | ΔE 16.3 | ΔE 12.9 (tritanopia) |

Both fills also stay ΔE 35+ from their own surface, so a large block never dissolves into the page.

**The rule a future change is most likely to break:** never use a `-fill` token for a small mark, and never
use the full-chroma token for a large area. The two are the same colour doing different jobs, and swapping
them silently undoes both the legibility of the marks and the calm of the areas.

## `--tile-1` … `--tile-5` and `--tile-ink`: a sequential ramp for large areas

The same problem again, one ramp up. `--heat-1` … `--heat-5` are sized for calendar cells — small, bounded,
many of them — and the treemap needed a ramp for blocks that can each be a quarter of the screen.
`--tile-*` is that ramp: the same blue meaning, less chroma and a shorter lightness span.

| Step | Dark | Light | Dark ink contrast | Light ink contrast |
|---|---|---|---|---|
| `tile-1` | `#252D46` | `#DCE2F0` | 13.61 | 13.86 |
| `tile-2` | `#2E3859` | `#C7D0E7` | 11.50 | 11.66 |
| `tile-3` | `#3A4877` | `#ABB7D8` | 8.85 | 8.99 |
| `tile-4` | `#485895` | `#8998C3` | 6.76 | 6.29 |
| `tile-5` | `#5A6DAE` | `#7787AE` | 4.96 | 5.02 |

Unlike the heat ramp, one ink serves every step per theme — `--tile-ink` is `#FFFFFF` on dark and `#14171A`
on light — because the ramp's lightness span is deliberately short enough that it can. The worst pairing is
**4.96:1**, clear of AA. Both ramps are monotonic in OKLab lightness: dark climbs L\* 30.2 → 54.9, light
descends 91.2 → 62.5.

### The readiness grid keeps `--heat-4`, on purpose

One square per measure, twelve to a row — about 27px each at the emulator's width. That is a small mark, so
by the area rule above it takes the full-chroma token, not a tile step. Both themes were rendered and
looked at; the grid reads as a filling-in shape rather than as a block of colour, which is what it is for.

### Why adjacent tile steps are allowed to sit under ΔE 8

They measure ΔE 4.8–9.9 between neighbours, which would be a FAIL if these were categorical hues. They are
not. **ΔE 8 is the floor for a pair that carries identity** — where telling the two apart *is* the
information. In a sequential ramp, identity is carried by area and by the table underneath, and the colour
repeats what area already says; steps that were 8 apart would make a five-step ramp span so much lightness
that the light end would vanish into the surface and the dark end would need its own ink table, which is
exactly the problem the heat ramp has.

So the check that applies here is monotonicity plus ink contrast, not adjacent-pair separation. Applying
the categorical rule to a sequential ramp is the specific mistake this section exists to prevent.

## Rules that hold for any chart added later

- Colour is never the only signal. Every series is named in a legend, in its own mark's label, or both,
  and every chart has a table alternative.
- One scale per chart. Two measures of different size get two charts, not two axes.
- Sequential magnitude is one hue, light to dark. Polarity is two hues with a neutral middle. Never a
  rainbow.
- Re-run the separation check before adding a colour, in both themes, against the real surface. It is a
  computation, not a judgement call.
