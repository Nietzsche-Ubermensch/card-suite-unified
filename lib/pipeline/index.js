'use strict';

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { analyzeImage, DEFAULT_PARAMS } = require('./analyze');
const { enhanceImage, MAX_LONG_EDGE } = require('./enhance');
const { detectCard } = require('./geometry');
const { assertMinimumSize, MeasurementError, MIN_LONG_EDGE } = require('./gate');
const { createWorker } = require('./worker');

/**
 * Measured (not assumed) capabilities of the local pipeline, in the
 * `{ available, missing[] }` shape the old v2 routes promised but never shipped.
 */
function capabilities({ outDir } = {}) {
  const missing = [];
  const versions = sharp.versions || {};
  const fmt = sharp.format || {};
  const can = (f) => !!(fmt[f] && fmt[f].output && fmt[f].output.buffer);
  if (!can('jpeg')) missing.push('sharp:jpeg-output');
  if (!can('png')) missing.push('sharp:png-output');
  let outDirWritable = null;
  if (outDir) {
    try {
      fs.mkdirSync(outDir, { recursive: true });
      fs.accessSync(outDir, fs.constants.W_OK);
      outDirWritable = true;
    } catch {
      outDirWritable = false;
      missing.push(`outDir-not-writable:${path.basename(outDir)}`);
    }
  }
  return {
    engine: 'local-sharp',
    generative: false,
    available: missing.length === 0,
    missing,
    sharp: versions.sharp || require('sharp/package.json').version,
    libvips: versions.vips || null,
    formats: { jpeg: can('jpeg'), png: can('png'), webp: can('webp'), tiff: can('tiff') },
    concurrency: sharp.concurrency(),
    minLongEdge: MIN_LONG_EDGE,
    maxLongEdge: MAX_LONG_EDGE,
    outDir: outDir || null,
    outDirWritable,
    defaultParams: DEFAULT_PARAMS,
  };
}

module.exports = {
  analyzeImage,
  enhanceImage,
  detectCard,
  assertMinimumSize,
  MeasurementError,
  MIN_LONG_EDGE,
  MAX_LONG_EDGE,
  DEFAULT_PARAMS,
  createWorker,
  capabilities,
};
