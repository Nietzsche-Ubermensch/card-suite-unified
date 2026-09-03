'use strict';

/**
 * Card image(s) -> structured sports-card identity.
 *
 * The vision call is injected (`chat`) rather than hard-wired, so the prompt
 * building, response parsing, validation and normalisation are all exercisable
 * without a network or an API key — which is most of what can actually be
 * wrong here.
 */
const { SPORTS_CARD_SCHEMA, validateCard } = require('./schema');
const { promptReference, SPORTS } = require('./parallels');
const { normalizeCard, toCardRecord } = require('./identity');
const { compsFor } = require('./comps');

const DEFAULT_MODEL = 'qwen3-vl-235b-a22b';

/**
 * System prompt. Three things separate a useful extraction from a useless one,
 * and all three are hard-won domain rules rather than model capability:
 *   1. the year lives in the copyright line, not the stat lines;
 *   2. a parallel is only searchable under its hobby name;
 *   3. the back of the card carries the number and the copyright.
 */
function buildSystemPrompt(scope = {}) {
  return `You identify SPORTS and WRESTLING trading cards for resale listings. You do not handle Pokemon, Magic, Yu-Gi-Oh or other non-sports TCGs — if the image is one of those, set playerName to what is printed and say so in notes.

Return ONLY data you can actually see. Use null for anything not visible or not legible. Never invent a set, parallel, year or serial.

YEAR — CRITICAL:
- Take the year from the COPYRIGHT LINE only (e.g. "© 2025 The Topps Company"), normally in the fine print on the back.
- Put that in copyrightYear.
- Stat lines are the PREVIOUS season: a card whose stats end in the 2024 season is a 2025 card.
- If you can read a stats year, put it in statsYear so the discrepancy is visible. Never put a stats year in copyrightYear.

PARALLELS — use the hobby name, not a description:
- A search only finds comparable sales if it uses the term sellers type. "checkered holographic pattern" finds nothing; "Checkerboard Refractor" finds the card.
- Match what you see against this reference and return the reference's exact name in parallelType, with a colour word in front when the foil is clearly coloured (e.g. "Blue Refractor").
- If the surface has no special treatment it is a base card: parallelType null.
- Put the raw surface terms you would search in visualKeywords (e.g. ["Checkerboard","Refractor","Holographic"]).

KNOWN PARALLELS:
${promptReference(scope)}

OTHER FIELDS:
- productSet is the product line WITHOUT the year or manufacturer: "Chrome", "Finest", "Prizm", "Bowman Chrome".
- cardNumber is as printed, no "#".
- serialNumber exactly as hand/machine numbered, e.g. "25/99" or "1/1"; null if the card is not numbered.
- insertSet is the subset/insert name printed on the card (e.g. "Star Entrances"), null for a base-set card.
- isRookie only for an actual RC/rookie marker; isAutograph only for a real signature; isMemorabilia only for a relic/patch window.
- Fill gradingCompany/grade/certNumber only if the card is in a graded slab.
- sport must be one of: ${SPORTS.join(', ')}. Use "wrestling" for WWE, AEW, NJPW, TNA and ROH.
- confidence is your honest 0-1 confidence in the whole identification.`;
}

/** OpenAI-compatible image part. Accepts raw base64 or a full data URL. */
function imagePart(image) {
  const url = String(image).startsWith('data:') ? image : `data:image/jpeg;base64,${image}`;
  return { type: 'image_url', image_url: { url } };
}

/**
 * Build the chat-completions request body.
 * Both sides go in one call: the front carries the player and the parallel's
 * appearance, the back carries the card number and the copyright year.
 */
function buildRequest({ front, back, model = DEFAULT_MODEL, scope = {} } = {}) {
  if (!front && !back) throw new Error('at least one of front or back is required');
  const content = [];
  if (front) {
    content.push({ type: 'text', text: 'FRONT OF CARD:' });
    content.push(imagePart(front));
  }
  if (back) {
    content.push({ type: 'text', text: 'BACK OF CARD (card number and copyright year live here):' });
    content.push(imagePart(back));
  }
  content.push({
    type: 'text',
    text: back
      ? 'Identify this card. Use the back for the card number and the copyright year.'
      : 'Identify this card. Only the front was provided, so the copyright year and card number may not be readable — return null rather than guessing.',
  });

  return {
    model,
    messages: [
      { role: 'system', content: buildSystemPrompt(scope) },
      { role: 'user', content },
    ],
    temperature: 0.1,
    max_tokens: 1200,
    response_format: {
      type: 'json_schema',
      json_schema: { name: 'sports_card', strict: true, schema: SPORTS_CARD_SCHEMA },
    },
  };
}

/**
 * Pull the JSON object out of a completion. A model that honours
 * `response_format` returns bare JSON; one that doesn't may fence it in
 * markdown or wrap it in prose, and either is still recoverable.
 */
function parseContent(content) {
  const text = String(content == null ? '' : content).trim();
  if (!text) throw new Error('empty response from the vision model');
  const candidates = [];
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) candidates.push(fenced[1]);
  candidates.push(text);
  const braced = text.match(/\{[\s\S]*\}/);
  if (braced) candidates.push(braced[0]);
  for (const c of candidates) {
    try { const v = JSON.parse(c.trim()); if (v && typeof v === 'object' && !Array.isArray(v)) return v; } catch { /* try the next shape */ }
  }
  throw new Error(`could not parse JSON from the vision response: ${text.slice(0, 200)}`);
}

/**
 * Validate + normalise a raw extraction and attach the comps ladder.
 * Pure: no network. This is the half of extraction that can be wrong in
 * interesting ways, so it is separated from the HTTP call on purpose.
 */
function finalizeExtraction(raw, { price = null, quantity = 1 } = {}) {
  const { ok, value, errors, warnings: schemaWarnings } = validateCard(raw);
  if (!ok) {
    const err = new Error(`extraction did not match the card schema: ${errors.join('; ')}`);
    err.code = 'SCHEMA_MISMATCH';
    err.details = { errors, raw };
    throw err;
  }
  const { card, warnings } = normalizeCard(value);
  return {
    card,
    record: toCardRecord(card, { price, quantity }),
    comps: compsFor(card),
    warnings: [...schemaWarnings, ...warnings],
  };
}

/**
 * Full extraction. `chat` is an async (requestBody) => completion function so
 * the caller owns the transport, the API key and the error mapping.
 */
async function extractCard({ front, back, model, scope, price, quantity, chat }) {
  if (typeof chat !== 'function') throw new Error('a chat(requestBody) function is required');
  const request = buildRequest({ front, back, model, scope });
  const completion = await chat(request);
  const content = completion?.choices?.[0]?.message?.content;
  const raw = parseContent(content);
  const result = finalizeExtraction(raw, { price, quantity });
  return { ...result, model: completion?.model || request.model, sides: [front ? 'front' : null, back ? 'back' : null].filter(Boolean) };
}

module.exports = {
  DEFAULT_MODEL,
  buildSystemPrompt,
  buildRequest,
  parseContent,
  finalizeExtraction,
  extractCard,
};
