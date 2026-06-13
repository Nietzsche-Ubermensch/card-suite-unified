const fs = require('fs');
const path = require('path');
const sizeOf = require('image-size').default || require('image-size');
const MIN = 1600;

function validateImageDimensions(filePath) {
  const buffer = fs.readFileSync(filePath);
  const dim = sizeOf(buffer);
  if (dim.width < MIN || dim.height < MIN) {
    throw new Error(
      `Measurement violation: ${path.basename(filePath)} = ${dim.width}x${dim.height}px. ` +
      `Minimum required: ${MIN}x${MIN}px. Halting batch.`
    );
  }
  return { width: dim.width, height: dim.height, type: dim.type };
}

async function enhanceImage(inputPath, outputPath) {
  const dim = validateImageDimensions(inputPath);
  console.log(`[ENHANCE] ${path.basename(inputPath)} — PASS (${dim.width}x${dim.height})`);
  return { success: true, output: outputPath };
}

module.exports = { enhanceImage, validateImageDimensions, MIN };
