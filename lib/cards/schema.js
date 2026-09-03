'use strict';

/**
 * Structured-output schema for sports-card extraction.
 *
 * Written as strict JSON Schema so it can be handed straight to an
 * OpenAI-compatible `response_format: {type:'json_schema', strict:true}`
 * (Venice's /chat/completions is OpenAI-compatible). Strict mode requires
 * every property to be listed in `required` and optionality expressed as a
 * nullable type union, hence `["string","null"]` rather than omitted keys.
 *
 * Field names map onto what build-eBay-csv.js `buildRow` consumes, so an
 * extraction can flow straight into the eBay CSV.
 */
const { SPORTS } = require('./parallels');

const str = { type: ['string', 'null'] };
const int = { type: ['integer', 'null'] };
const bool = { type: ['boolean', 'null'] };

const SPORTS_CARD_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'playerName', 'team', 'sport', 'league',
    'manufacturer', 'productSet', 'copyrightYear', 'statsYear', 'cardNumber',
    'serialNumber', 'parallelType', 'insertSet',
    'isRookie', 'isAutograph', 'isMemorabilia', 'isShortPrint',
    'visualKeywords', 'gradingCompany', 'grade', 'certNumber',
    'confidence', 'notes',
  ],
  properties: {
    playerName: { type: 'string', description: 'Athlete or wrestler on the card, as printed. Required.' },
    team: { ...str, description: 'Team/promotion, e.g. "New York Yankees", "WWE", "AEW".' },
    sport: { type: ['string', 'null'], enum: [...SPORTS, null], description: 'One of the listed sports. Use "wrestling" for WWE/AEW/NJPW/TNA/ROH.' },
    league: { ...str, description: 'League if printed, e.g. MLB, NFL, NBA, NHL, WWE.' },

    manufacturer: { ...str, description: 'Topps, Panini, Upper Deck, Leaf, Fleer... from the copyright line or logo.' },
    productSet: { ...str, description: 'Product line only, without the year or manufacturer: "Chrome", "Finest", "Prizm", "Bowman Chrome".' },
    copyrightYear: { ...int, description: 'Year from the COPYRIGHT LINE on the back only (e.g. "© 2025 Topps"). Null if not visible.' },
    statsYear: { ...int, description: 'Most recent season shown in the stat lines, if any. Used only to sanity-check; never as the card year.' },
    cardNumber: { ...str, description: 'Card number as printed, without the # sign.' },

    serialNumber: { ...str, description: 'Hand/machine serial exactly as printed, e.g. "25/99" or "1/1". Null if unnumbered.' },
    parallelType: { ...str, description: 'The searchable hobby name of the parallel, e.g. "Checkerboard Refractor", "Cracked Ice Prizm", "Blue Refractor". Null for a base card.' },
    insertSet: { ...str, description: 'Insert/subset name printed on the card, e.g. "Star Entrances", "Young Guns". Null if base set.' },

    isRookie: { ...bool, description: 'True only if an RC/Rookie logo or "Rated Rookie"/"Young Guns" style marker is present.' },
    isAutograph: { ...bool, description: 'True only for an actual signature on the card (on-card or sticker).' },
    isMemorabilia: { ...bool, description: 'True only if a relic/patch/swatch window is present.' },
    isShortPrint: { ...bool, description: 'True if marked SP/SSP/variation.' },

    visualKeywords: {
      type: 'array',
      items: { type: 'string' },
      description: 'Searchable surface terms a seller would type, e.g. ["Checkerboard","Refractor","Holographic"]. Empty array if none.',
    },

    gradingCompany: { ...str, description: 'PSA, BGS, SGC, CGC... only if the card is in a graded slab.' },
    grade: { ...str, description: 'Numeric grade as printed, e.g. "10", "9.5". Only if slabbed.' },
    certNumber: { ...str, description: 'Slab certification number, if legible.' },

    confidence: { type: 'number', minimum: 0, maximum: 1, description: 'Overall confidence 0-1 that this identification is correct.' },
    notes: { ...str, description: 'Anything ambiguous or unreadable that a human should check.' },
  },
};

/** Keys whose absence still yields a usable record. playerName is the only hard requirement. */
const REQUIRED_FOR_USE = ['playerName'];

function typeOf(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (Number.isInteger(v)) return 'integer';
  return typeof v;
}

/**
 * Validate a parsed extraction against the schema. Deliberately lenient about
 * missing keys (a model may omit nulls) and strict about wrong types, unknown
 * keys and out-of-range values — those indicate a real misunderstanding.
 *
 * @returns {{ok: boolean, value: object, errors: string[], warnings: string[]}}
 */
function validateCard(input) {
  const errors = [];
  const warnings = [];
  const value = {};
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, value: {}, errors: ['extraction is not an object'], warnings };
  }

  const props = SPORTS_CARD_SCHEMA.properties;
  for (const key of Object.keys(input)) {
    if (!props[key]) { warnings.push(`unknown field "${key}" ignored`); continue; }
    const spec = props[key];
    const v = input[key];
    const allowed = Array.isArray(spec.type) ? spec.type : [spec.type];
    const t = typeOf(v);
    // integers arrive as numbers; accept a whole number for an integer field
    const ok = allowed.includes(t)
      || (allowed.includes('integer') && t === 'number' && Number.isInteger(v))
      || (allowed.includes('number') && t === 'integer');
    if (!ok) { errors.push(`${key}: expected ${allowed.join('|')}, got ${t}`); continue; }
    if (spec.enum && v !== null && !spec.enum.includes(v)) { errors.push(`${key}: "${v}" is not one of ${spec.enum.filter(Boolean).join(', ')}`); continue; }
    if (typeof v === 'number' && spec.minimum != null && v < spec.minimum) { errors.push(`${key}: ${v} < ${spec.minimum}`); continue; }
    if (typeof v === 'number' && spec.maximum != null && v > spec.maximum) { errors.push(`${key}: ${v} > ${spec.maximum}`); continue; }
    if (spec.type === 'array' && Array.isArray(v) && v.some((x) => typeof x !== 'string')) { errors.push(`${key}: expected string[]`); continue; }
    value[key] = v;
  }

  for (const key of REQUIRED_FOR_USE) {
    if (!value[key] || !String(value[key]).trim()) errors.push(`${key} is required`);
  }
  return { ok: errors.length === 0, value, errors, warnings };
}

module.exports = { SPORTS_CARD_SCHEMA, REQUIRED_FOR_USE, validateCard };
