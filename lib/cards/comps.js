'use strict';

/**
 * Comparable-sales search building.
 *
 * This module only ever BUILDS URLs — it does not fetch or scrape anything.
 * eBay's terms don't permit scraping search results, so the honest options are
 * (a) hand the collector a ready-made sold-listings link, which is what this
 * does, or (b) go through the official eBay Browse / Marketplace Insights API
 * with a developer key. `MARKETPLACES` is the seam for (b).
 *
 * Two things matter for a card comp search and both are easy to get wrong:
 *
 *  - Comps are SOLD listings. Active asking prices are what sellers hope for,
 *    not what the card is worth, so every comps URL sets LH_Sold/LH_Complete.
 *  - Search the PRINT RUN, not your serial. "25/99" finds the single copy
 *    numbered 25; "/99" finds every sale from that run.
 */
const { CATEGORY_IDS } = require('../../build-eBay-csv');

const EBAY_BASE = 'https://www.ebay.com/sch/i.html';

/** Sport -> eBay category, reusing the CSV builder's ids so both agree. */
function categoryFor(sport) {
  const key = String(sport || '').toLowerCase();
  return CATEGORY_IDS[key] != null ? CATEGORY_IDS[key] : CATEGORY_IDS.other;
}

const clean = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();

/** Tokens shared by every tier: what the card IS. */
function identityTokens(card) {
  return [card.year, card.manufacturer, card.productSet, card.playerName].map(clean).filter(Boolean);
}

/**
 * Build the query for one tier of specificity.
 * @param {object} card normalised card (see identity.normalizeCard)
 * @param {'exact'|'parallel'|'base'|'player'|'broad'} tier
 */
function buildQuery(card, tier) {
  const t = [];
  if (tier === 'broad') {
    t.push(clean(card.playerName));
    if (card.productSet) t.push(clean(card.productSet));
    return t.filter(Boolean).join(' ');
  }

  t.push(...identityTokens(card));

  if (tier !== 'player') {
    if (card.cardNumber) t.push(`#${clean(card.cardNumber)}`);
  }
  if (tier === 'exact' || tier === 'parallel') {
    if (card.insertSet) t.push(clean(card.insertSet));
    if (card.parallel) t.push(clean(card.parallel));
  }
  if (tier === 'exact') {
    // the run, not the individual copy — "/99" matches every sale from the run
    if (card.printRun) t.push(card.printRun === 1 ? '1/1' : `/${card.printRun}`);
    if (card.isRookie) t.push('RC');
    if (card.isAutograph) t.push('Auto');
    if (card.isGraded) t.push(`${card.gradingCompany} ${card.grade}`);
  }
  return t.filter(Boolean).join(' ');
}

/**
 * @param {string} query
 * @param {object} opts
 * @param {boolean} [opts.sold=true] restrict to sold+completed listings
 * @param {string|number} [opts.category]
 */
function ebayUrl(query, { sold = true, category } = {}) {
  const p = new URLSearchParams();
  p.set('_nkw', query);
  if (category) p.set('_sacat', String(category));
  if (sold) { p.set('LH_Sold', '1'); p.set('LH_Complete', '1'); }
  p.set('_ipg', '60');
  p.set('rt', 'nc'); // don't let eBay silently "correct" a card term into something broader
  return `${EBAY_BASE}?${p.toString()}`;
}

const TIERS = [
  { tier: 'exact', description: 'This exact variant: parallel, print run, rookie/auto and grade included.' },
  { tier: 'parallel', description: 'Same parallel, any serial and any grade — usually the most useful comp set.' },
  { tier: 'base', description: 'Same card number, ignoring the parallel. Use as a floor for a coloured parallel.' },
  { tier: 'player', description: 'Any card of this player from this product and year.' },
  { tier: 'broad', description: 'Player plus product only. Last resort when nothing else returns sales.' },
];

/**
 * The full comps ladder, narrow to broad. An over-specific query returning
 * zero sales is the normal case for a numbered parallel, so callers should
 * walk down the ladder rather than treating tier 1 as the answer.
 */
function compsFor(card, { marketplace = 'ebay' } = {}) {
  const market = MARKETPLACES[marketplace];
  if (!market) throw new Error(`Unknown marketplace: ${marketplace}`);
  const category = categoryFor(card.sport);

  // Tiers collapse into each other when a field is missing (no card number
  // makes "base" and "player" the same search) — keep the narrowest label for
  // each distinct query rather than offering the collector duplicate links.
  const seen = new Set();
  const searches = TIERS.map(({ tier, description }) => {
    const query = buildQuery(card, tier);
    if (!query || seen.has(query)) return null;
    seen.add(query);
    return { tier, description, query, soldUrl: market.url(query, { sold: true, category }), activeUrl: market.url(query, { sold: false, category }) };
  }).filter(Boolean);

  // Start where the comp set is likely to be non-empty: a graded card's grade
  // moves the price enough to be worth pinning, otherwise ignore serial/grade.
  const recommended = card.isGraded ? 'exact' : (card.parallel ? 'parallel' : 'base');

  return {
    marketplace,
    category,
    recommended,
    searches,
    notes: [
      'Prices come from SOLD listings; active listings are asking prices, not comps.',
      card.printRun ? `Searched as /${card.printRun} (the print run), not ${card.serial} (your copy).` : null,
      card.isGraded ? null : 'Raw-card comps vary widely with condition — check the photos of each sale.',
      'Links only: no listing data is fetched. For automated pricing use the official eBay Browse / Marketplace Insights API.',
    ].filter(Boolean),
  };
}

/** Marketplace seam. Add an entry to support another site or an official API. */
const MARKETPLACES = {
  ebay: { name: 'eBay', url: ebayUrl },
};

module.exports = { compsFor, buildQuery, ebayUrl, categoryFor, TIERS, MARKETPLACES, EBAY_BASE };
