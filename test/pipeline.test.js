'use strict';
// Real-image tests for lib/pipeline (no mocks — AGENTS.md). Synthetic inputs
// are genuine images rendered with sharp; fixtures are real scanner output.
//   node --test test/
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const sharp = require('sharp');

const P = require('../lib/pipeline');

const FIXTURES = path.join(__dirname, 'fixtures');
const LOLA = path.join(FIXTURES, 'lola-vice-sideways.jpg'); // portrait card, EXIF orientation 8
const JULIA = path.join(FIXTURES, 'julia-hart-upright.jpg'); // landscape card, no EXIF

const CARD = { width: 1750, height: 2450 }; // 2.5" x 3.5" at 700 dpi
const BG = { r: 215, g: 200, b: 190 }; // warm scanner background

/** A real card-on-scanner image: coloured card with a design, tilted by `deg`, on a warm border. */
async function syntheticScan(deg, opts = {}) {
  const inner = await sharp({ create: { width: 1400, height: 1900, channels: 3, background: { r: 240, g: 230, b: 80 } } }).png().toBuffer();
  const text = await sharp({ create: { width: 600, height: 200, channels: 3, background: { r: 20, g: 20, b: 20 } } }).png().toBuffer();
  const card = await sharp({ create: { width: CARD.width, height: CARD.height, channels: 3, background: { r: 30, g: 60, b: 120 } } })
    .composite([{ input: inner, left: 175, top: 275 }, { input: text, left: 575, top: 400 }])
    .png()
    .toBuffer();
  const rotated = await sharp(card).rotate(deg, { background: BG }).png().toBuffer();
  const rm = await sharp(rotated).metadata();
  const border = opts.border ?? 200;
  return sharp({ create: { width: rm.width + 2 * border, height: rm.height + 2 * border, channels: 3, background: BG } })
    .composite([{ input: rotated, left: border, top: border }])
    .jpeg({ quality: 95 })
    .toBuffer();
}

test('geometry: finds the border, the card box and the skew of a tilted scan', async () => {
  for (const deg of [3, -2, 0.6]) {
    const scan = await syntheticScan(deg);
    const oriented = await sharp(scan).autoOrient().png().toBuffer();
    const g = await P.detectCard(oriented);
    assert.equal(g.hasBorder, true, `border detected at ${deg}deg`);
    // detected skew is counter-clockwise-positive; sharp rotate() is clockwise-positive
    assert.ok(Math.abs(g.skewDeg + deg) <= 0.3, `skew ${g.skewDeg} ~ ${-deg} (injected ${deg})`);
    assert.ok(g.box.left > 150 && g.box.top > 150, 'box excludes the border');
    assert.ok(g.confidence >= 0.8, `confidence ${g.confidence}`);
  }
});

test('geometry: a square-on scan reports zero skew', async () => {
  const g = await P.detectCard(await syntheticScan(0));
  assert.equal(g.skewDeg, 0);
  assert.equal(g.hasBorder, true);
  assert.ok(Math.abs(g.box.width - CARD.width) <= 6 && Math.abs(g.box.height - CARD.height) <= 6, JSON.stringify(g.box));
});

test('enhance: deskews in the right direction and crops to the card', async () => {
  for (const deg of [3, -2]) {
    const out = await P.enhanceImage(await syntheticScan(deg), { strength: 0.6, name: `skew${deg}` });
    const steps = out.steps.map((s) => s.step);
    assert.ok(steps.includes('deskew') && steps.includes('crop'), steps.join('>'));
    // A correctly deskewed card re-detects at its true size; a wrongly rotated
    // (doubled) tilt would come out ~13% larger on each side.
    assert.ok(Math.abs(out.width - CARD.width) / CARD.width < 0.02, `width ${out.width} vs ${CARD.width}`);
    assert.ok(Math.abs(out.height - CARD.height) / CARD.height < 0.02, `height ${out.height} vs ${CARD.height}`);
  }
});

test('enhance: white balance uses the scanner border and pulls it toward neutral', async () => {
  const out = await P.enhanceImage(await syntheticScan(0), { strength: 1, name: 'wb' });
  const wb = out.steps.find((s) => s.step === 'white-balance');
  assert.equal(wb.skipped, undefined, 'white balance ran');
  const [gr, gg, gb] = wb.gains;
  assert.ok(gr < 1 && gb > 1, `gains ${wb.gains} should reduce red and boost blue for a warm border`);
  // Apply the same gains to the measured border colour: it must land near grey.
  const balanced = [BG.r * gr, BG.g * gg, BG.b * gb];
  assert.ok(Math.max(...balanced) - Math.min(...balanced) < 6, `balanced border ${balanced}`);
});

test('analyze: reports a warm cast against the border, and never on the card itself', async () => {
  const a = await P.analyzeImage(await syntheticScan(0));
  assert.match(a.colorCast, /yellow|warm/);
  assert.ok(a.artifactTypes.some((t) => /Colour cast/.test(t)));
  assert.equal(a.cardConditionIntact, true);
  assert.ok(a.confidence > 0 && a.confidence <= 1);
});

test('real fixture: sideways portrait card is fixed by EXIF orientation, edge-to-edge is honoured', async () => {
  const buf = fs.readFileSync(LOLA);
  const a = await P.analyzeImage(buf);
  assert.equal(a.orientation, 'vertical', 'EXIF 8 applied -> portrait');
  assert.equal(a.measurements.exifOrientation, 8);
  assert.equal(a.measurements.geometry.hasBorder, false, 'scanner already cropped edge-to-edge');
  assert.equal(a.colorCast, null, 'no neutral reference -> cast not claimed');
  assert.equal(a.material, 'unknown', 'material is not measurable locally');
  const out = await P.enhanceImage(buf, { strength: 0.45, name: 'lola' });
  assert.ok(out.height > out.width, `portrait output ${out.width}x${out.height}`);
  const skipped = out.steps.filter((s) => s.skipped).map((s) => s.step);
  assert.deepEqual(skipped.sort(), ['crop', 'white-balance'].sort());
  assert.equal(out.format, 'jpeg');
  assert.ok(out.gate.longEdge >= P.MIN_LONG_EDGE);
});

test('real fixture: a landscape card is left landscape unless an orientation is requested', async () => {
  const buf = fs.readFileSync(JULIA);
  const asIs = await P.enhanceImage(buf, { strength: 0.45, name: 'julia' });
  assert.ok(asIs.width > asIs.height);
  assert.ok(!asIs.steps.some((s) => s.step === 'rotate-90'));
  const forced = await P.enhanceImage(buf, { strength: 0.45, orientation: 'vertical', name: 'julia' });
  assert.ok(forced.height > forced.width);
  assert.ok(forced.steps.some((s) => s.step === 'rotate-90'));
});

test('enhance: foil materials never get median denoise; cardboard does at high strength', async () => {
  const buf = fs.readFileSync(JULIA);
  const foil = await P.enhanceImage(buf, { strength: 1, material: 'refractor', params: { denoiseStrength: 1 }, name: 'j' });
  assert.ok(foil.steps.find((s) => s.step === 'denoise')?.skipped, 'refractor skips denoise');
  const paper = await P.enhanceImage(buf, { strength: 1, material: 'cardboard', params: { denoiseStrength: 1 }, name: 'j' });
  assert.equal(paper.steps.find((s) => s.step === 'denoise')?.method, 'median3');
});

test('gate: refuses small output unless upscaling within upscaleFactor reaches 1600px', async () => {
  const tiny = await sharp({ create: { width: 800, height: 600, channels: 3, background: '#888' } }).jpeg().toBuffer();
  await assert.rejects(
    () => P.enhanceImage(tiny, { name: 'tiny', params: { upscaleFactor: 1 } }),
    (e) => e instanceof P.MeasurementError && /800x600px/.test(e.message) && e.details.required === 1600,
  );
  const up = await P.enhanceImage(tiny, { name: 'tiny', params: { upscaleFactor: 2 } });
  assert.equal(up.width, 1600);
  assert.equal(up.steps.find((s) => s.step === 'upscale').method, 'lanczos3');
  assert.throws(() => P.assertMinimumSize({ width: 1599, height: 1000 }), P.MeasurementError);
  assert.equal(P.assertMinimumSize({ width: 1000, height: 1600 }).longEdge, 1600);
});

test('worker: processes a job to completion, halts the batch on the first bad file', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-worker-'));
  const inDir = path.join(dir, 'in');
  const outDir = path.join(dir, 'out');
  fs.mkdirSync(inDir);
  fs.copyFileSync(JULIA, path.join(inDir, 'julia.jpg'));
  const tiny = await sharp({ create: { width: 500, height: 400, channels: 3, background: '#999' } }).jpeg().toBuffer();
  fs.writeFileSync(path.join(inDir, 'tiny.jpg'), tiny);
  const registry = new Map();
  const events = [];
  const worker = P.createWorker({
    registry,
    inputDir: inDir,
    outDir,
    broadcast: (m) => events.push(m.type),
    processFile: (p) => P.enhanceImage(fs.readFileSync(p), { strength: 0.3, name: path.basename(p), params: { upscaleFactor: 1 } }),
  });
  const good = { id: 'good', status: 'pending', filenames: ['julia.jpg'], progress: 0, error: null, resultPaths: [] };
  const bad = { id: 'bad', status: 'pending', filenames: ['julia.jpg', 'tiny.jpg', 'julia.jpg'], progress: 0, error: null, resultPaths: [] };
  registry.set('good', good);
  registry.set('bad', bad);
  worker.enqueue(good);
  worker.enqueue(bad);
  await worker.idle();
  assert.equal(good.status, 'complete');
  assert.equal(good.progress, 100);
  assert.equal(good.resultPaths.length, 1);
  assert.ok(fs.existsSync(path.join(outDir, path.basename(good.resultPaths[0]))));
  assert.equal(bad.status, 'failed');
  assert.match(bad.error, /tiny\.jpg: Measurement violation/);
  assert.equal(bad.resultPaths.length, 1, 'result before the failure is kept, later files are not processed');
  assert.deepEqual(events.filter((e) => e === 'job:complete').length, 1);
  assert.deepEqual(events.filter((e) => e === 'job:failed').length, 1);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('capabilities are measured, not assumed', () => {
  const c = P.capabilities({ outDir: path.join(os.tmpdir(), 'cs-cap') });
  assert.equal(c.engine, 'local-sharp');
  assert.equal(c.generative, false);
  assert.equal(c.available, true);
  assert.deepEqual(c.missing, []);
  assert.equal(c.formats.jpeg, true);
  assert.equal(c.minLongEdge, 1600);
});
