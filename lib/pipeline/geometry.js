'use strict';

/**
 * Card geometry: find the card inside a scan and estimate its skew.
 *
 * sharp/libvips has no edge or line detection, so this is a small raw-pixel
 * scan on a downscaled greyscale copy:
 *   1. estimate the scanner background from the four corner patches
 *   2. decide whether a background border exists at all (many scanner drivers
 *      already crop edge-to-edge — then the whole frame IS the card)
 *   3. walk inward from each side to find the card's bounding box
 *   4. fit a straight line to the top and left edges to estimate the skew angle
 *
 * Everything is reported in full-resolution pixel coordinates.
 */
const sharp = require('sharp');

const ANALYSIS_LONG_EDGE = 600; // downscale target for the scan
const EDGE_THRESHOLD = 30; // |lum - background| that counts as "card"
const MIN_SKEW_DEG = 0.15; // below this we don't bother rotating
const MAX_SKEW_DEG = 10; // above this the fit is almost certainly wrong

function median(values) {
  const v = [...values].sort((a, b) => a - b);
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

/** Least-squares slope of y on x with one outlier-rejection pass. */
function fitSlope(points) {
  const fit = (pts) => {
    const n = pts.length;
    const mx = pts.reduce((s, p) => s + p.x, 0) / n;
    const my = pts.reduce((s, p) => s + p.y, 0) / n;
    let num = 0;
    let den = 0;
    for (const p of pts) {
      num += (p.x - mx) * (p.y - my);
      den += (p.x - mx) ** 2;
    }
    const slope = den ? num / den : 0;
    const intercept = my - slope * mx;
    const residuals = pts.map((p) => Math.abs(p.y - (slope * p.x + intercept)));
    const rms = Math.sqrt(residuals.reduce((s, r) => s + r * r, 0) / n);
    return { slope, intercept, residuals, rms };
  };
  if (points.length < 4) return { slope: 0, rms: Infinity, n: points.length };
  let f = fit(points);
  const keep = points.filter((_, i) => f.residuals[i] <= Math.max(1.5, 2 * f.rms));
  if (keep.length >= 4 && keep.length < points.length) f = fit(keep);
  return { slope: f.slope, rms: f.rms, n: keep.length };
}

/**
 * @param {Buffer} input  an already-oriented image (call sharp(...).autoOrient() first)
 */
async function detectCard(input) {
  const meta = await sharp(input).metadata();
  const fullW = meta.width;
  const fullH = meta.height;
  const scale = Math.min(1, ANALYSIS_LONG_EDGE / Math.max(fullW, fullH));
  const { data, info } = await sharp(input)
    .resize({ width: Math.round(fullW * scale), height: Math.round(fullH * scale), fit: 'fill' })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const W = info.width;
  const H = info.height;
  const px = (x, y) => data[y * W + x];

  // 1. background from corner patches
  const patch = Math.max(4, Math.round(Math.min(W, H) * 0.02));
  const patchMean = (x0, y0) => {
    let s = 0;
    for (let y = y0; y < y0 + patch; y++) for (let x = x0; x < x0 + patch; x++) s += px(x, y);
    return s / (patch * patch);
  };
  const corners = [
    patchMean(0, 0),
    patchMean(W - patch, 0),
    patchMean(0, H - patch),
    patchMean(W - patch, H - patch),
  ];
  const background = median(corners);
  const cornerSpread = Math.max(...corners) - Math.min(...corners);

  // 2. is there a border at all? The outer ring must be uniform and match the corners.
  const ring = Math.max(2, Math.round(Math.min(W, H) * 0.015));
  let ringN = 0;
  let ringBg = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (x < ring || x >= W - ring || y < ring || y >= H - ring) {
        ringN++;
        if (Math.abs(px(x, y) - background) < EDGE_THRESHOLD) ringBg++;
      }
    }
  }
  const ringUniformity = ringN ? ringBg / ringN : 0;
  const hasBorder = cornerSpread <= 40 && ringUniformity >= 0.85;

  const toFull = (v) => Math.round(v / scale);

  if (!hasBorder) {
    return {
      hasBorder: false,
      background: Math.round(background),
      cornerSpread: Math.round(cornerSpread),
      ringUniformity: +ringUniformity.toFixed(3),
      skewDeg: 0,
      skewFit: null,
      box: { left: 0, top: 0, width: fullW, height: fullH },
      touchesEdge: true,
      borderPx: { left: 0, top: 0, right: 0, bottom: 0 },
      confidence: 0.55,
      note: 'No scanner background detected: the scan is edge-to-edge, so the whole frame is treated as the card and skew cannot be measured.',
    };
  }

  // 3. bounding box: first "card" pixel walking inward from each side, per line,
  //    using the 2nd/98th percentile of the per-line hits to ignore dust.
  const isCard = (x, y) => Math.abs(px(x, y) - background) >= EDGE_THRESHOLD;
  const firstFromTop = (x) => { for (let y = 0; y < H; y++) if (isCard(x, y)) return y; return -1; };
  const firstFromBottom = (x) => { for (let y = H - 1; y >= 0; y--) if (isCard(x, y)) return y; return -1; };
  const firstFromLeft = (y) => { for (let x = 0; x < W; x++) if (isCard(x, y)) return x; return -1; };
  const firstFromRight = (y) => { for (let x = W - 1; x >= 0; x--) if (isCard(x, y)) return x; return -1; };
  const pct = (arr, p) => {
    const v = arr.filter((n) => n >= 0).sort((a, b) => a - b);
    if (!v.length) return -1;
    return v[Math.min(v.length - 1, Math.max(0, Math.floor(p * (v.length - 1))))];
  };
  const tops = [];
  const bottoms = [];
  for (let x = 0; x < W; x++) { tops.push(firstFromTop(x)); bottoms.push(firstFromBottom(x)); }
  const lefts = [];
  const rights = [];
  for (let y = 0; y < H; y++) { lefts.push(firstFromLeft(y)); rights.push(firstFromRight(y)); }
  const top = pct(tops, 0.02);
  const bottom = pct(bottoms, 0.98);
  const left = pct(lefts, 0.02);
  const right = pct(rights, 0.98);
  if (top < 0 || bottom < 0 || left < 0 || right < 0 || right - left < W * 0.2 || bottom - top < H * 0.2) {
    return {
      hasBorder: true,
      background: Math.round(background),
      cornerSpread: Math.round(cornerSpread),
      ringUniformity: +ringUniformity.toFixed(3),
      skewDeg: 0,
      skewFit: null,
      box: { left: 0, top: 0, width: fullW, height: fullH },
      touchesEdge: true,
      borderPx: { left: 0, top: 0, right: 0, bottom: 0 },
      confidence: 0.3,
      note: 'A scanner background was detected but no card-sized object could be isolated; the whole frame is used.',
    };
  }

  // 4. skew: fit the top edge (y as a function of x) and the left edge (x as a
  //    function of y) over the middle 70% of each side, take the better fit.
  const span = (a, b, n) => Array.from({ length: n }, (_, i) => Math.round(a + ((b - a) * i) / (n - 1)));
  const topPts = span(left + (right - left) * 0.15, right - (right - left) * 0.15, 40)
    .map((x) => ({ x, y: firstFromTop(x) }))
    .filter((p) => p.y >= 0);
  const leftPts = span(top + (bottom - top) * 0.15, bottom - (bottom - top) * 0.15, 40)
    .map((y) => ({ x: y, y: firstFromLeft(y) })) // x<-y, y<-x so fitSlope gives dx/dy
    .filter((p) => p.y >= 0);
  const fTop = fitSlope(topPts);
  const fLeft = fitSlope(leftPts);
  // A card rotated by theta (counter-clockwise, screen coords) has top-edge slope
  // dy/dx = -tan(theta) and left-edge slope dx/dy = +tan(theta).
  const angleTop = -Math.atan(fTop.slope) * (180 / Math.PI);
  const angleLeft = Math.atan(fLeft.slope) * (180 / Math.PI);
  const best = fTop.rms <= fLeft.rms ? { angle: angleTop, fit: fTop, edge: 'top' } : { angle: angleLeft, fit: fLeft, edge: 'left' };
  let skewDeg = +best.angle.toFixed(2);
  let confidence = 0.85;
  let note = null;
  if (Math.abs(skewDeg) > MAX_SKEW_DEG) {
    note = `Skew estimate ${skewDeg}deg exceeds ${MAX_SKEW_DEG}deg and was ignored (edge fit unreliable).`;
    skewDeg = 0;
    confidence = 0.4;
  } else if (Math.abs(skewDeg) < MIN_SKEW_DEG) {
    skewDeg = 0;
  }
  if (best.fit.rms > 3) confidence = Math.min(confidence, 0.6);

  const box = {
    left: toFull(left),
    top: toFull(top),
    width: Math.min(fullW, toFull(right - left + 1)),
    height: Math.min(fullH, toFull(bottom - top + 1)),
  };
  const borderPx = {
    left: box.left,
    top: box.top,
    right: Math.max(0, fullW - (box.left + box.width)),
    bottom: Math.max(0, fullH - (box.top + box.height)),
  };
  const touchesEdge = Object.values(borderPx).some((v) => v <= 1);

  return {
    hasBorder: true,
    background: Math.round(background),
    cornerSpread: Math.round(cornerSpread),
    ringUniformity: +ringUniformity.toFixed(3),
    skewDeg,
    skewFit: { edge: best.edge, rms: +best.fit.rms.toFixed(2), points: best.fit.n, angleTop: +angleTop.toFixed(2), angleLeft: +angleLeft.toFixed(2) },
    box,
    touchesEdge,
    borderPx,
    confidence,
    note,
  };
}

module.exports = { detectCard, EDGE_THRESHOLD, MIN_SKEW_DEG, MAX_SKEW_DEG };
