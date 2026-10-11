# Camera-photo test fixtures

Original, unmodified PNGs downloaded for local qualification on 2026-10-10 from the ImageIO image corpus. These are photographs, not generated raster drawings. Binary fixtures are test inputs only; application runtime never downloads them.

Primary provenance and terms: scikit-image v0.25.2 `skimage/data/_fetchers.py` (https://github.com/scikit-image/scikit-image/blob/v0.25.2/skimage/data/_fetchers.py). The terminology below is the upstream attribution, not a new license assertion.

| File | Upstream attribution | Download | SHA-256 |
| --- | --- | --- | --- |
| `coffee.png` | Rachel Michetti, courtesy of Pikolo Espresso Bar; CC0 according to upstream | https://raw.githubusercontent.com/imageio/imageio-binaries/master/images/coffee.png | `51564e1c293b9a32de7364dca129d63b005ceaa9ed7ea1357e55cf2f5da8d22d` |
| `chelsea.png` | Stefan van der Walt; CC0 according to upstream | https://raw.githubusercontent.com/imageio/imageio-binaries/master/images/chelsea.png | `97403c9c171d1aedd2026c7515e20208ef865eaab56d462c3c2eefade9b7d779` |
| `coins.png` | Greek coins from Pompeii, Brooklyn Museum Collection, no known copyright restrictions according to upstream | https://raw.githubusercontent.com/imageio/imageio-binaries/master/images/coins.png | `c039b77334a92460b65f2e0ed8f1aa0b3521ec77a84386b33a11ad7774ca5702` |

The older ImageIO `camera.png` was not included: scikit-image documents replacement of a restricted earlier image, so its licensing must not be inferred from the name alone.

The two current `coin-photo-auto.svg` and `coin-photo-threshold-140.svg` files are actual browser-produced derivatives of `coins.png`, not hand-drawn replacements. Explicit crop left/top33.3%, width14.1%, height17.8%; light foreground; hole filling enabled and minimum component area9px². `auto` uses automatic threshold and `threshold-140` uses manual140. Both contain only the intended black contour, never a white background path.

`coin-photo-pre-fix-frame.svg` is the actual earlier threshold140 output. Its incorrect white background would produce an unwanted frame. It is retained solely as the collinear-cap regression input; never as a supported/expected modern photo output. Fixtures after the background fix were copied from actual Chromium exports, not obtained by manually deleting SVG shapes.

`decodePhotoFixture.ts` is a test-only, bounded decoder for these pinned noninterlaced 8-bit gray/RGB/RGBA PNGs; no new runtime image decoder/dependency is introduced.

## Qualification scope

Coins provide a photographed textured object on a simpler background; crop and polarity are user decisions, not hidden object recognition. Coffee and Chelsea exercise textured/ambiguous backgrounds and should never be used as evidence of universal automatic segmentation. Expected contours and quality gates are defined in tests or browser reports independently of any marketing label.
