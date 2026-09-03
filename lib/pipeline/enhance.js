'use strict';

/**
 * Deterministic, non-generative listing-image preparation.
 *
 * Nothing here invents pixels: every step is a classical, reversible-in-spirit
 * operation (orientation, rotation, crop, per-channel gain, contrast,
 * saturation, median, unsharp mask, resampling). It never repaints flaws —
 * a listing photo must show the card's real condition.
 */
const sharp = require('sharp');
const { detectCard } = require('./geometry');
const { orient, regionMeans, DEFAULT_PARAMS } = require('./analyze');
const { assertMinimumSize, MIN_LONG_EDGE } = require('./gate');

const MAX_LONG_EDGE = 3000; // don't ship 20MB scans to eBay
const FOIL = new Set(['chrome', 'refractor']);

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

async function ringMeans(buffer, width, height, geometry) {
  if (!geometry.hasBorder) return null;
  const { borderPx } = geometry;
  const bands = [];
  if (borderPx.top > 4) bands.push({ left: 0, top: 0, width, height: borderPx.top });
  if (borderPx.bottom > 4) bands.push({ left: 0, top: height - borderPx.bottom, width, height: borderPx.bottom });
  if (borderPx.left > 4) bands.push({ left: 0, top: 0, width: borderPx.left, height });
  if (borderPx.right > 4) bands.push({ left: width - borderPx.right, top: 0, width: borderPx.right, height });
  if (!bands.length) return null;
  const sums = [0, 0, 0];
  let n = 0;
  for (const b of bands) {
    const m = await regionMeans(buffer, b);
    const px = b.width * b.height;
    for (let c = 0; c < 3; c++) sums[c] += m[c] * px;
    n += px;
  }
  return sums.map((s) => s / n);
}

/**
 * @param {Buffer} input
 * @param {object} opts
 * @param {number} [opts.strength=0.45]   0..1 overall intensity (UI slider)
 * @param {string} [opts.material]        cardboard|chrome|refractor|unknown
 * @param {string} [opts.orientation]     vertical|horizontal|unknown — a forced
 *                                        final orientation; unknown = as scanned
 * @param {object} [opts.params]          {denoiseStrength, glareThreshold, upscaleFactor, contrast, saturation}
 * @param {string} [opts.name]            for error messages
 */
async function enhanceImage(input, opts = {}) {
  const strength = clamp(Number.isFinite(opts.strength) ? opts.strength : 0.45, 0, 1);
  const params = { ...DEFAULT_PARAMS, ...(opts.params || {}) };
  const material = opts.material || 'unknown';
  const wantOrientation = opts.orientation && opts.orientation !== 'unknown' ? opts.orientation : null;
  const name = opts.name || 'image';
  const steps = [];

  // 1. EXIF orientation (lossless PNG intermediate)
  let { oriented: buf, width, height, exifOrientation } = await orient(input);
  if (exifOrientation && exifOrientation !== 1) steps.push({ step: 'exif-orient', from: exifOrientation, width, height });

  // 2. geometry
  let geometry = await detectCard(buf);

  // 3. deskew (its own sharp instance: only one rotate() per pipeline)
  if (geometry.hasBorder && geometry.skewDeg !== 0) {
    const bg = geometry.background;
    buf = await sharp(buf)
      // skewDeg is counter-clockwise-positive; sharp's rotate() is clockwise-positive,
      // so rotating by +skewDeg undoes the tilt (calibrated in test/pipeline.test.js).
      .rotate(geometry.skewDeg, { background: { r: bg, g: bg, b: bg } })
      .png({ compressionLevel: 1 })
      .toBuffer();
    const m = await sharp(buf).metadata();
    width = m.width;
    height = m.height;
    steps.push({ step: 'deskew', degrees: geometry.skewDeg, fit: geometry.skewFit });
    geometry = await detectCard(buf); // re-detect the now axis-aligned box
  }

  // 4. white balance reference must be taken BEFORE cropping the border away
  const ring = await ringMeans(buf, width, height, geometry);

  // 5. crop to the card
  if (geometry.hasBorder && !geometry.touchesEdge) {
    const { box } = geometry;
    buf = await sharp(buf).extract(box).png({ compressionLevel: 1 }).toBuffer();
    width = box.width;
    height = box.height;
    steps.push({ step: 'crop', box, borderPx: geometry.borderPx });
  } else {
    steps.push({ step: 'crop', skipped: true, reason: geometry.note || 'card fills the frame' });
  }

  // 6. forced 90° orientation (a 2.5x3.5 rectangle can't tell us the design's
  //    orientation, so this only happens on request)
  if (wantOrientation) {
    const isLandscape = width > height;
    if ((wantOrientation === 'vertical' && isLandscape) || (wantOrientation === 'horizontal' && !isLandscape)) {
      buf = await sharp(buf).rotate(90).png({ compressionLevel: 1 }).toBuffer();
      [width, height] = [height, width];
      steps.push({ step: 'rotate-90', to: wantOrientation });
    }
  }

  // 7. colour + detail, one chain
  let img = sharp(buf);
  if (ring) {
    const avg = (ring[0] + ring[1] + ring[2]) / 3;
    const gains = ring.map((m) => clamp(1 + (avg / Math.max(1, m) - 1) * strength, 0.8, 1.25));
    if (gains.some((g) => Math.abs(g - 1) > 0.01)) {
      img = img.linear(gains, [0, 0, 0]);
      steps.push({ step: 'white-balance', reference: 'scanner border', ringRGB: ring.map((v) => +v.toFixed(1)), gains: gains.map((g) => +g.toFixed(3)) });
    } else {
      steps.push({ step: 'white-balance', skipped: true, reason: 'border already neutral' });
    }
  } else {
    steps.push({ step: 'white-balance', skipped: true, reason: 'no neutral scanner border to reference (edge-to-edge scan)' });
  }
  const contrast = clamp(Number(params.contrast) || 1, 0.5, 2);
  const saturation = clamp(Number(params.saturation) || 1, 0, 2);
  if (Math.abs(contrast - 1) > 0.005) {
    // y = a*x + b about mid-grey so contrast pivots on 128
    img = img.linear(contrast, 128 * (1 - contrast));
    steps.push({ step: 'contrast', factor: contrast });
  }
  if (Math.abs(saturation - 1) > 0.005) {
    img = img.modulate({ saturation });
    steps.push({ step: 'saturation', factor: saturation });
  }
  const denoise = clamp(Number(params.denoiseStrength) || 0, 0, 1) * strength;
  if (denoise >= 0.35 && !FOIL.has(material)) {
    img = img.median(3);
    steps.push({ step: 'denoise', method: 'median3', amount: +denoise.toFixed(2) });
  } else if (denoise >= 0.35) {
    steps.push({ step: 'denoise', skipped: true, reason: `${material} foil texture preserved` });
  }
  if (strength >= 0.1) {
    const sigma = +(0.5 + 0.7 * strength).toFixed(2);
    img = img.sharpen({ sigma, m1: 0.5, m2: 1.2 });
    steps.push({ step: 'sharpen', sigma });
  }

  // 8. size policy: keep native pixels; cap very large scans; upscale only to reach the minimum
  const longEdge = Math.max(width, height);
  let outW = width;
  let outH = height;
  if (longEdge > MAX_LONG_EDGE) {
    const f = MAX_LONG_EDGE / longEdge;
    outW = Math.round(width * f);
    outH = Math.round(height * f);
    img = img.resize({ width: outW, height: outH, fit: 'fill', kernel: 'lanczos3' });
    steps.push({ step: 'downscale', from: [width, height], to: [outW, outH] });
  } else if (longEdge < MIN_LONG_EDGE) {
    const maxFactor = clamp(Number(params.upscaleFactor) || 1, 1, 4);
    const need = MIN_LONG_EDGE / longEdge;
    if (need <= maxFactor) {
      outW = Math.round(width * need);
      outH = Math.round(height * need);
      img = img.resize({ width: outW, height: outH, fit: 'fill', kernel: 'lanczos3', withoutEnlargement: false });
      steps.push({ step: 'upscale', factor: +need.toFixed(3), method: 'lanczos3', note: 'interpolation only, no generated detail' });
    } else {
      steps.push({ step: 'upscale', skipped: true, reason: `would need x${need.toFixed(2)} > upscaleFactor ${maxFactor}` });
    }
  }

  // 9. encode
  const { data, info } = await img
    .jpeg({ quality: 92, chromaSubsampling: '4:4:4', mozjpeg: false })
    .toBuffer({ resolveWithObject: true });
  steps.push({ step: 'encode', format: 'jpeg', quality: 92, bytes: data.length });

  // 10. measurement gate — throws, never a fake success
  const gate = assertMinimumSize({ width: info.width, height: info.height, name });

  return {
    buffer: data,
    width: info.width,
    height: info.height,
    format: 'jpeg',
    steps,
    gate,
    geometry,
    settings: { strength, material, orientation: wantOrientation || 'as-scanned', params },
  };
}

module.exports = { enhanceImage, MAX_LONG_EDGE };
