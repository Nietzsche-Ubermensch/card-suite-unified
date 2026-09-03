# card-suite-unified
eBay Card Suite: measurement enforcement + batch AI enhancement + CSV pipeline

## Image pipeline (local, deterministic)

Listing images are prepared by `lib/pipeline/` with [sharp](https://sharp.pixelplumbing.com) — no API key, no generative model. It never repaints a card: a listing photo has to show the card's real condition.

Steps, in order (each one reported back in `steps[]`): EXIF orientation → card/border detection and deskew (raw-pixel edge fit; skipped when the scanner already cropped edge-to-edge) → crop to the card → white balance referenced to the scanner border only (never gray-world on the card itself) → contrast/saturation from the pipeline params → optional median denoise (never for chrome/refractor) → mild sharpen → size policy (native pixels kept, >3000px capped, upscale only to reach 1600px within `upscaleFactor`) → JPEG q92 4:4:4 → **measurement gate: long edge ≥ 1600px or the batch halts**.

| Endpoint | What |
|---|---|
| `POST /api/ai/analyze` | measured analysis: orientation, glare, focus, noise, skew, colour cast (only when a neutral border exists), confidence |
| `POST /api/ai/scan-cleanup` | analyze + enhance; returns `cleanedImage` (data URL), `cleanedPath` (`/enhanced/...`), `steps` |
| `POST /api/jobs/submit` → `GET /api/jobs/:id/status` / `result` | multipart batch through the in-process worker; results served from `/enhanced/` |
| `GET /api/pipeline/capabilities` | measured capabilities (`{available, missing[]}`) |
| `POST /api/ai/restore` | the old generative (Venice `flux-dev`) edit — kept only as an explicit opt-in |

Params (`GET/POST /api/config/params`): `denoiseStrength`, `glareThreshold`, `upscaleFactor`, `contrast`, `saturation`. The UI's strength slider (0–1) scales the whole pass.

`npm test` runs `test/pipeline.test.js` (`node --test`, real images only: synthetic scans rendered with sharp plus two real scanner fixtures). `npm run pipeline` (`launcher.js`) enhances everything in `uploads/` into `enhanced/` and then builds the eBay CSV.

Known limits: card material (chrome vs cardboard) is not measurable locally — set it in the UI to protect foil texture; a sideways portrait card can't be told apart from a landscape card design, so set Orientation to force a 90° turn; colour cast is only corrected when the scan includes some neutral scanner border.
