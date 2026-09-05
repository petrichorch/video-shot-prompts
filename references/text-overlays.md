# Storyboard text overlays

Use this guide after the 8-15 generated storyboard images have passed visual
inspection and before rendering the slideshow video.

## Copy sequence

- First frame: a concrete curiosity hook tied to the visible pet or craft state.
- Early frames: establish the starting material and problem without explaining
  the whole result.
- Middle frames: alternate observable process changes with short human
  reactions. Describe what the viewer can actually see.
- Penultimate frame: build anticipation for the finished likeness.
- Final frame: deliver the reveal and optionally use a restrained CTA.

Avoid generic labels such as `Making the ears` when a more natural line such as
`The ears changed everything` fits the visible moment. Do not claim a real pet,
owner reaction, price, duration, or result that is not supported by the source
and generated sequence.

## Text file

Create JSON with exactly one string per `shot-*` image:

```json
[
  "It started with\na little loose wool",
  "Then the tiny muzzle\nbegan to appear",
  "The markings had to\nmatch just right",
  "One last trim before\nthe final reveal"
]
```

Keep manual lines near 4-6 English words and usually no more than three lines.
The script also wraps long lines as a safety net. It strips emoji because color
emoji rendering is inconsistent across local and cloud FFmpeg builds.

## Rendering and review

The default text block is centered around 28% from the top, outside the common
top and bottom interface zones. It uses dynamic font sizing, white fill, and a
thick black outline. Use `--y-percent 0.20` through `0.65` to move it when the
default covers a hand, needle contact point, pet face, or important material
transition. Inspect all outputs; automated safe zones do not understand the
actual subject location.
