'use strict';

/**
 * Local, measured scan analysis. Returns the exact top-level shape the
 * frontend already renders (see frontend/src/schemas/scan-analysis.ts):
 *   material, orientation, artifactTypes[], artifactLocations[], colorCast,
 *   lightingIssues[], cardConditionIntact, recommendedApproach, confidence (0..1)
 * plus a `measurements` object with the raw numbers behind every claim.
 *
 * Severity words ("High" / "Moderate") are embedded in artifactTypes strings
 * because ScanCleanup.tsx derives its badge colour by substring match.
 */
const sharp = require('sharp');
const { detectCard } = require('./geometry');

const DEFAULT_PARAMS = { denoiseStrength: 0.5, glareThreshold: 0.7, upscaleFactor: 2, contrast: 1, saturation: 1 };

/**
 * Per-channel means of a region, from raw pixels. NOTE: sharp's stats() is
 * computed on the INPUT image and ignores extract()/resize() in the chain,
 * which silently turns a border-band measurement into a whole-image one.
 */
async function regionMeans(buffer, box) {
  const { data, info } = await sharp(buffer).extract(box).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const ch = info.channels;
  const sums = new Array(ch).fill(0);
  for (let i = 0; i < data.length; i += ch) for (let c = 0; c < ch; c++) sums[c] += data[i + c];
  const n = data.length / ch;
  return sums.slice(0, 3).map((v) => v / n);
}

const GRID = ['top-left', 'top', 'top-right', 'left', 'center', 'right', 'bottom-left', 'bottom', 'bottom-right'];

async function orient(input) {
  // One lossless pass that applies EXIF orientation; everything downstream
  // works on this buffer so dimensions are the "as viewed" ones.
  const meta = await sharp(input).metadata();
  const oriented = await sharp(input).autoOrient().png({ compressionLevel: 1 }).toBuffer();
  const om = await sharp(oriented).metadata();
  return { oriented, width: om.width, height: om.height, exifOrientation: meta.orientation ?? null, format: meta.format };
}

/** Raw-pixel measurements on a downscaled copy of the card region. */
async function measureRegion(oriented, box) {
  const region = sharp(oriented).extract(box);
  const scale = Math.min(1, 700 / Math.max(box.width, box.height));
  const small = region.clone().resize({ width: Math.max(8, Math.round(box.width * scale)), height: Math.max(8, Math.round(box.height * scale)), fit: 'fill' });
  const { data, info } = await small.clone().removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { data: grey, info: gi } = await small.clone().greyscale().raw().toBuffer({ resolveWithObject: true });
  const { data: med } = await small.clone().greyscale().median(3).raw().toBuffer({ resolveWithObject: true });
  const W = info.width;
  const H = info.height;
  const ch = info.channels;
  const N = W * H;

  // clipping (glare / blown highlights) per 3x3 cell
  const cellClip = new Array(9).fill(0);
  const cellN = new Array(9).fill(0);
  let clipped = 0;
  const sums = new Array(ch).fill(0);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * ch;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      for (let c = 0; c < ch; c++) sums[c] += data[i + c];
      const cell = Math.min(2, Math.floor((y * 3) / H)) * 3 + Math.min(2, Math.floor((x * 3) / W));
      cellN[cell]++;
      if (r >= 252 && g >= 252 && b >= 252) { clipped++; cellClip[cell]++; }
    }
  }
  // noise: mean |grey - median3(grey)|
  let noise = 0;
  for (let i = 0; i < gi.width * gi.height; i++) noise += Math.abs(grey[i] - med[i]);
  noise /= gi.width * gi.height;
  // sharpness: variance of a 3x3 laplacian on the grey copy
  let lapSum = 0;
  let lapSq = 0;
  let lapN = 0;
  const gw = gi.width;
  for (let y = 1; y < gi.height - 1; y++) {
    for (let x = 1; x < gw - 1; x++) {
      const i = y * gw + x;
      const l = 4 * grey[i] - grey[i - 1] - grey[i + 1] - grey[i - gw] - grey[i + gw];
      lapSum += l;
      lapSq += l * l;
      lapN++;
    }
  }
  const lapMean = lapSum / lapN;
  const laplacianVariance = lapSq / lapN - lapMean * lapMean;
  // exposure + entropy from the grey raw copy (no stats(): see regionMeans)
  let minLum = 255;
  let maxLum = 0;
  const hist = new Array(256).fill(0);
  const gN = gi.width * gi.height;
  for (let i = 0; i < gN; i++) { const v = grey[i]; if (v < minLum) minLum = v; if (v > maxLum) maxLum = v; hist[v]++; }
  let entropy = 0;
  for (const c of hist) if (c) { const p = c / gN; entropy -= p * Math.log2(p); }
  return {
    channelMeans: sums.slice(0, 3).map((s) => +(s / N).toFixed(1)),
    clipFraction: +(clipped / N).toFixed(5),
    clipCells: cellClip.map((c, i) => +(c / Math.max(1, cellN[i])).toFixed(4)),
    noise: +noise.toFixed(2),
    laplacianVariance: +laplacianVariance.toFixed(1),
    entropy: +entropy.toFixed(3),
    minLum,
    maxLum,
  };
}

/** Channel means of the scanner border ring (neutral reference), if there is one. */
async function measureRing(oriented, width, height, geometry) {
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
    const m = await regionMeans(oriented, b);
    const px = b.width * b.height;
    for (let c = 0; c < 3; c++) sums[c] += m[c] * px;
    n += px;
  }
  return sums.map((s) => +(s / n).toFixed(1));
}

function describeCast(means) {
  const [r, g, b] = means;
  const avg = (r + g + b) / 3;
  const dev = { r: r - avg, g: g - avg, b: b - avg };
  const strongest = Object.entries(dev).sort((a, b2) => Math.abs(b2[1]) - Math.abs(a[1]))[0];
  const mag = Math.abs(strongest[1]);
  if (mag < 4) return { text: 'Neutral', magnitude: +mag.toFixed(1) };
  const name = strongest[1] > 0
    ? { r: 'warm (red)', g: 'green', b: 'cool (blue)' }[strongest[0]]
    : { r: 'cyan', g: 'magenta', b: 'yellow' }[strongest[0]];
  const sev = mag > 12 ? 'strong' : mag > 7 ? 'moderate' : 'slight';
  return { text: `${sev} ${name} cast (${Math.round(mag)} levels)`, magnitude: +mag.toFixed(1) };
}

async function analyzeImage(input, opts = {}) {
  const params = { ...DEFAULT_PARAMS, ...(opts.params || {}) };
  const { oriented, width, height, exifOrientation, format } = await orient(input);
  const geometry = await detectCard(oriented);
  const region = await measureRegion(oriented, geometry.box);
  const ring = await measureRing(oriented, width, height, geometry);

  const artifactTypes = [];
  const artifactLocations = [];
  const lightingIssues = [];
  let confidence = geometry.confidence;

  // Glare / blown highlights. glareThreshold (0..1) is a sensitivity knob:
  // higher = flag smaller clipped areas.
  const g = Math.min(1, Math.max(0.1, params.glareThreshold));
  const moderateCut = 0.005 * (0.7 / g);
  const highCut = 0.02 * (0.7 / g);
  // Glare is a small, concentrated clipped region. A large clipped fraction is
  // white card stock (e.g. a card back), not a lighting artifact.
  const MAX_GLARE_FRACTION = 0.12;
  if (region.clipFraction >= moderateCut && region.clipFraction <= MAX_GLARE_FRACTION) {
    const sev = region.clipFraction >= highCut ? 'High' : 'Moderate';
    artifactTypes.push(`Glare / blown highlights — ${sev} (${(region.clipFraction * 100).toFixed(2)}% of card clipped)`);
    const worst = region.clipCells.map((v, i) => ({ v, i })).sort((a, b) => b.v - a.v).slice(0, 2).filter((c) => c.v > 0);
    for (const c of worst) artifactLocations.push(GRID[c.i]);
    lightingIssues.push(`Specular highlights concentrated at ${worst.map((c) => GRID[c.i]).join(' and ') || 'unknown'}`);
  }
  // Focus
  if (region.laplacianVariance < 60) artifactTypes.push(`Soft focus — ${region.laplacianVariance < 25 ? 'High' : 'Moderate'} (edge variance ${region.laplacianVariance})`);
  // Noise / dust
  if (region.noise >= 2) artifactTypes.push(`Fine texture / scanner noise — ${region.noise >= 4 ? 'Moderate' : 'Slight'} (${region.noise} levels; foil and halftone patterns count too)`);
  // Skew
  if (geometry.skewDeg !== 0) artifactTypes.push(`Skew — ${Math.abs(geometry.skewDeg) >= 1.5 ? 'Moderate' : 'Slight'} (${geometry.skewDeg}°)`);
  // Colour cast: only measurable against the neutral scanner border.
  let colorCast;
  let castInfo = null;
  if (ring) {
    castInfo = describeCast(ring);
    colorCast = castInfo.magnitude >= 4 ? castInfo.text : 'Neutral (measured on scanner border)';
    if (castInfo.magnitude >= 4) artifactTypes.push(`Colour cast — ${castInfo.magnitude > 12 ? 'Moderate' : 'Slight'}`);
  } else {
    colorCast = null; // not measurable: no neutral reference in an edge-to-edge scan
  }
  // Exposure
  if (region.maxLum < 200) lightingIssues.push(`Underexposed: brightest card pixel ${region.maxLum}/255`);
  if (region.minLum > 60) lightingIssues.push(`Low contrast: darkest card pixel ${region.minLum}/255`);

  const orientation = width > height ? 'horizontal' : 'vertical';
  const cardConditionIntact = geometry.hasBorder ? !geometry.touchesEdge : true;

  const steps = [];
  if (exifOrientation && exifOrientation !== 1) steps.push(`apply EXIF orientation ${exifOrientation}`);
  if (geometry.skewDeg !== 0) steps.push(`deskew ${geometry.skewDeg}°`);
  if (geometry.hasBorder && !geometry.touchesEdge) steps.push('crop to card edges');
  if (ring && castInfo && castInfo.magnitude >= 4) steps.push('neutralise cast using scanner border');
  if (region.noise >= 4 && params.denoiseStrength >= 0.5) steps.push('light median denoise at strength >= 0.7 (skipped for chrome/refractor)');
  steps.push('mild sharpen', `output JPEG >= 1600px long edge`);
  const caveats = [];
  if (!geometry.hasBorder) caveats.push('edge-to-edge scan: no crop/deskew possible and colour cast not measurable (no neutral reference)');
  caveats.push('card material cannot be identified locally — set it manually to protect foil texture');
  if (orientation === 'horizontal') caveats.push('scan is landscape; if this is a portrait card scanned sideways, set Orientation to Vertical');
  const recommendedApproach = `Deterministic: ${steps.join(', ')}. ${caveats.join('. ')}.`;

  confidence = +Math.max(0.1, Math.min(0.95, confidence)).toFixed(2);

  return {
    material: 'unknown',
    orientation,
    artifactTypes,
    artifactLocations,
    colorCast,
    lightingIssues,
    cardConditionIntact,
    recommendedApproach,
    confidence,
    engine: 'local-sharp',
    measurements: {
      width,
      height,
      format,
      exifOrientation,
      geometry,
      ringRGB: ring,
      ...region,
    },
  };
}

module.exports = { analyzeImage, orient, regionMeans, DEFAULT_PARAMS };
