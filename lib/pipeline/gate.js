'use strict';

/**
 * Measurement gate for listing images.
 *
 * eBay recommends at least 1600px on the LONGEST side of a listing photo.
 * The old engine_v9 rule required both dimensions >= 1600, which rejected
 * every standard landscape card scan (~2090x1500). The rule is now long-edge.
 *
 * Never a fake success: this throws with the actual vs required dimensions.
 */
const MIN_LONG_EDGE = 1600;

class MeasurementError extends Error {
  constructor(message, details) {
    super(message);
    this.name = 'MeasurementError';
    this.code = 'MEASUREMENT_VIOLATION';
    this.details = details;
  }
}

function longEdge({ width, height }) {
  return Math.max(width || 0, height || 0);
}

function assertMinimumSize({ width, height, name = 'image' }, min = MIN_LONG_EDGE) {
  const edge = longEdge({ width, height });
  if (!(edge >= min)) {
    throw new MeasurementError(
      `Measurement violation: ${name} = ${width}x${height}px (long edge ${edge}px). ` +
        `Minimum required: ${min}px on the longest side. Halting batch.`,
      { width, height, longEdge: edge, required: min, name },
    );
  }
  return { width, height, longEdge: edge, required: min };
}

module.exports = { MIN_LONG_EDGE, MeasurementError, assertMinimumSize, longEdge };
