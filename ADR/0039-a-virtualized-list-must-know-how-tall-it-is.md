# 0039 — A virtualized list has to know how tall it is, at the size it is drawn

Accepted 15 September 2026. Arises from two consecutive red gates, runs 34931811111 and 34933317701.

## Context

`WindowedList` mounts about sixteen rows of a twenty-thousand-row ledger. Everything else is geometry: a
spacer whose height stands in for the rows that are not there, and offsets that decide which rows to mount
for a given scroll position. That geometry is built from measured heights for the mounted rows and an
estimate for all the others — so the estimate, applied to 19,984 of 20,000 rows, effectively *is* the
list's reported height.

`LedgerPerformanceInstrumentedTest` asserts end-to-end reachability at 100% and 200% text zoom: scroll to
the bottom, and the last row must be there. It went red at 200% on two consecutive candidates.

## Decision

**Estimate unmeasured rows from the rows that have been measured, never from a constant.**

The estimate was 80px, about right at default text size and wrong by 43% at 200%, where a row is nearer
140. The list therefore reported 1,600,000px of content where there were 2,800,000, and setting `scrollTop`
to the scrollable maximum landed far short of the end. Measuring the tail then grew the total underneath a
viewport that was already as far down as it could go, pushing the end further away; `.windowed-list` sets
`overflow-anchor:none`, so nothing re-anchored and no further scroll event arrived to recompute the window.
The last row was left unmounted with nothing to trigger another pass.

**Discard measured heights when the basis they were measured against changes.**

Fixing the estimate alone changed nothing on the device, and the second red run proved it: the recorded
sample was byte-identical to the first, down to `scroll_top: 22577.904296875`. The mean was being computed
over a cache that still held heights measured at 100% zoom. The device test walks the whole list at 100%
before switching to 200%, so several hundred rows are cached small by then, and only the mounted handful
can re-measure afterwards. The mean stayed near 89 and the list went on describing itself at a size it was
no longer drawn at.

A row re-measuring to a materially different height means the basis changed for every row — the text size,
or a font that finished loading — not that one row's content grew. The cache is rebased to what the current
pass measured. Each key is compared only against its own previous value, which is what makes this safe: two
rows that merely differ from each other are never compared, so a list of genuinely uneven rows keeps every
height it has measured.

Neither half works alone. They are one decision.

## Consequences

This was a real defect, not only a gate condition. Android's text size can change while the app is running,
and the ledger would have kept its old geometry: a scrollbar lying about the list's length, both jump
buttons landing in the wrong place, and the last transaction unreachable by scrolling. Someone reading at
200% text is exactly the person least able to work around it.

It survived every previous gate because the one virtualization test scrolled to `19999*80` and jsdom
measures every row as 0 — the estimate was never wrong, so the tail was never exercised at a real row
height. `tests/windowed-tail.test.tsx` now measures rows at 24, 80, 140 and 220px, asserts the reported
height and the single jump to the end the device performs, and reproduces the device's own sequence: fill
the cache at one size, switch to another, jump to the end. That last case is the only one that fails
against the estimate-only fix, which is what makes it the case that matches the device.

A second test guards the opposite error — a fix that invalidates so eagerly it never keeps a measurement.
It passes before and after, so it is a guard, not evidence.

Two process notes worth keeping. A local gate that passes while the device gate fails is a statement about
the test, not the device: the first test measured every row at a single height, so the cache was never
mixed and the bug could not appear. And an identical failure is information — the byte-identical
`scroll_top` across two runs is what ruled out variance and proved the first fix inert, which is the
opposite of what "it failed the same way again" usually gets read as.

The `end` loop still assumes a 560px viewport where the recorded scroll step implies about 564.45. That
gap is covered by the three-row overscan and is not what caused either failure, so it is recorded here
rather than changed under the cover of a fix for something else.
