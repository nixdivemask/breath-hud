# Contributing

This is an assistive overlay, not a clinical product. Please keep that framing in UI copy and docs.

1. `npm test` and `npm run build` should pass.
2. Do not add cloud analytics, account systems, or uploads of captured frames.
3. Status thresholds (7 /min floor, 50% amplitude drop, fast band) should stay user-visible in Settings when you change defaults.
4. Color defaults should remain usable for common color-vision deficiency (Cividis / Okabe–Ito / IBM). New palettes are welcome if they are sequential bad→good and documented.
