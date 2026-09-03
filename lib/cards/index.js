'use strict';

/**
 * Sports-card identification and comparable-sales search.
 *
 * Card images -> structured, validated card identity -> eBay sold-listing
 * searches, and a record shaped for build-eBay-csv.js.
 *
 * Scope is sports and wrestling only. Nothing here fetches listing data; see
 * comps.js for why.
 */
const parallels = require('./parallels');
const schema = require('./schema');
const identity = require('./identity');
const comps = require('./comps');
const extract = require('./extract');

module.exports = {
  // extraction
  extractCard: extract.extractCard,
  finalizeExtraction: extract.finalizeExtraction,
  buildRequest: extract.buildRequest,
  buildSystemPrompt: extract.buildSystemPrompt,
  parseContent: extract.parseContent,
  DEFAULT_MODEL: extract.DEFAULT_MODEL,

  // identity
  normalizeCard: identity.normalizeCard,
  toCardRecord: identity.toCardRecord,
  resolveYear: identity.resolveYear,
  parseSerial: identity.parseSerial,
  parseGrade: identity.parseGrade,
  buildSetName: identity.buildSetName,
  inferSport: identity.inferSport,

  // comps
  compsFor: comps.compsFor,
  buildQuery: comps.buildQuery,
  categoryFor: comps.categoryFor,
  TIERS: comps.TIERS,

  // schema + domain knowledge
  SPORTS_CARD_SCHEMA: schema.SPORTS_CARD_SCHEMA,
  validateCard: schema.validateCard,
  SPORTS: parallels.SPORTS,
  PRODUCTS: parallels.PRODUCTS,
  parallelsFor: parallels.parallelsFor,
  matchParallel: parallels.matchParallel,
  matchManufacturer: parallels.matchManufacturer,
  matchGrader: parallels.matchGrader,
};
