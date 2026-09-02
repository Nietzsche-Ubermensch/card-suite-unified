'use strict';
// Compatibility shim. The real pipeline lives in lib/pipeline; this keeps the
// old engine_v9 import path working and preserves the 1600px measurement gate.
const fs = require('fs');
const path = require('path');
const { assertMinimumSize, MIN_LONG_EDGE } = require('../lib/pipeline/gate');
const { enhanceImage } = require('../lib/pipeline/enhance');
const sizeOf = require('image-size').default || require('image-size');

const MIN = MIN_LONG_EDGE; // 1600px on the longest side

function validateImageDimensions(filePath) {
  const dim = sizeOf(fs.readFileSync(filePath));
  assertMinimumSize({ width: dim.width, height: dim.height, name: path.basename(filePath) }, MIN);
  return { width: dim.width, height: dim.height, type: dim.type };
}

async function enhanceImageFile(inputPath, outputPath, opts = {}) {
  const out = await enhanceImage(fs.readFileSync(inputPath), { ...opts, name: path.basename(inputPath) });
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, out.buffer);
  console.log(`[ENHANCE] ${path.basename(inputPath)} — PASS (${out.width}x${out.height}, ${out.steps.length} steps)`);
  return { success: true, output: outputPath, width: out.width, height: out.height, steps: out.steps };
}

module.exports = { enhanceImage: enhanceImageFile, validateImageDimensions, MIN };
