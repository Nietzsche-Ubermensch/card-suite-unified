'use strict';

/**
 * Sports-card parallel knowledge base.
 *
 * The whole point: a search only finds comps if it uses the term the hobby
 * (and therefore the seller) actually types. "checkered holographic pattern"
 * finds nothing; "Checkerboard Refractor" finds the card.
 *
 * Print runs are deliberately NOT stored here. They move year to year
 * ("Gold /50" is not stable across products), and the real print run is on
 * the card itself in the serial ("25/99") — we read it from the card rather
 * than asserting it from memory.
 *
 * Scope is sports + wrestling only (see SPORTS). Pokemon/Magic/other TCGs are
 * intentionally out of scope.
 */

/** Sports this pipeline handles, aligned with build-eBay-csv.js CATEGORY_IDS. */
const SPORTS = ['baseball', 'basketball', 'football', 'hockey', 'soccer', 'wrestling', 'racing', 'other'];

/** Manufacturer canonical names and the spellings seen on cards/backs. */
const MANUFACTURERS = [
  { name: 'Topps', aliases: ['topps', 'the topps company', 'topps company', 'bowman'] },
  { name: 'Panini', aliases: ['panini', 'panini america', 'donruss', 'prizm', 'select', 'optic', 'mosaic'] },
  { name: 'Upper Deck', aliases: ['upper deck', 'ud', 'the upper deck company', 'upperdeck'] },
  { name: 'Leaf', aliases: ['leaf', 'leaf trading cards'] },
  { name: 'Fleer', aliases: ['fleer'] },
  { name: 'Score', aliases: ['score'] },
  { name: 'Sage', aliases: ['sage'] },
  { name: 'Wild Card', aliases: ['wild card'] },
];

/**
 * Product lines and their parallels.
 *
 * Each parallel: `name` is the searchable hobby term (what goes in the query),
 * `look` is how a vision model would describe the surface, and `aliases` are
 * loose phrasings that should resolve to `name`.
 */
const PRODUCTS = [
  {
    manufacturer: 'Topps',
    product: 'Chrome',
    aliases: ['topps chrome', 'chrome'],
    sports: ['baseball', 'football', 'basketball', 'soccer', 'wrestling'],
    parallels: [
      { name: 'Refractor', look: 'even rainbow shimmer across the whole card', aliases: ['refractor', 'shimmer', 'rainbow sheen'] },
      { name: 'X-Fractor', look: 'grid of small X shapes in the foil', aliases: ['xfractor', 'x fractor', 'x pattern', 'grid of x'] },
      { name: 'Prism Refractor', look: 'vertical prism bars', aliases: ['prism', 'prism refractor'] },
      { name: 'Atomic Refractor', look: 'large irregular chrome blobs', aliases: ['atomic'] },
      { name: 'Wave Refractor', look: 'flowing horizontal wave lines', aliases: ['wave', 'wavy lines', 'ray wave', 'raywave'] },
      { name: 'Speckle Refractor', look: 'fine speckled dots across the foil', aliases: ['speckle', 'speckled'] },
      { name: 'Mojo Refractor', look: 'stretched vertical streaks', aliases: ['mojo'] },
      { name: 'Shimmer Refractor', look: 'dense glitter-like sparkle', aliases: ['shimmer refractor', 'glitter'] },
      { name: 'Lava Refractor', look: 'molten blotches', aliases: ['lava'] },
      { name: 'Mini-Diamond Refractor', look: 'tiny repeating diamond facets', aliases: ['mini diamond', 'diamond pattern'] },
      { name: 'SuperFractor', look: 'heavy warped gold foil, one-of-one', aliases: ['superfractor', 'super fractor'] },
      { name: 'Negative Refractor', look: 'inverted/dark colour negative treatment', aliases: ['negative'] },
      { name: 'Padparadscha Refractor', look: 'peach-orange gemstone tone', aliases: ['padparadscha'] },
      { name: 'Rose Gold Refractor', look: 'pink-gold metallic', aliases: ['rose gold'] },
    ],
  },
  {
    manufacturer: 'Topps',
    product: 'Finest',
    aliases: ['topps finest', 'finest'],
    sports: ['baseball', 'football', 'basketball', 'soccer'],
    parallels: [
      { name: 'Refractor', look: 'even rainbow shimmer', aliases: ['refractor'] },
      { name: 'X-Fractor', look: 'X pattern in the foil', aliases: ['xfractor', 'x fractor'] },
      { name: 'Checkerboard Refractor', look: 'checkered squares across the foil', aliases: ['checkerboard', 'checkered', 'checker board', 'checkered pattern', 'chequered'] },
      { name: 'Oil Spill Refractor', look: 'rainbow swirls like oil on water', aliases: ['oil spill', 'oil slick', 'rainbow swirl'] },
      { name: 'Moon Refractor', look: 'cratered lunar texture', aliases: ['moon'] },
      { name: 'SuperFractor', look: 'warped gold foil, one-of-one', aliases: ['superfractor'] },
    ],
  },
  {
    manufacturer: 'Topps',
    product: 'Bowman Chrome',
    aliases: ['bowman chrome', 'bowman', '1st bowman', 'bowman 1st'],
    sports: ['baseball'],
    parallels: [
      { name: 'Refractor', look: 'even rainbow shimmer', aliases: ['refractor'] },
      { name: 'Atomic Refractor', look: 'large chrome blobs', aliases: ['atomic'] },
      { name: 'Mojo Refractor', look: 'vertical streaks', aliases: ['mojo'] },
      { name: 'Shimmer Refractor', look: 'dense sparkle', aliases: ['shimmer'] },
      { name: 'Speckle Refractor', look: 'speckled dots', aliases: ['speckle'] },
      { name: 'SuperFractor', look: 'warped gold foil, one-of-one', aliases: ['superfractor'] },
    ],
  },
  {
    manufacturer: 'Panini',
    product: 'Prizm',
    aliases: ['panini prizm', 'prizm'],
    sports: ['basketball', 'football', 'baseball', 'soccer', 'racing'],
    parallels: [
      { name: 'Silver Prizm', look: 'plain silver foil, no colour', aliases: ['silver', 'silver prizm', 'base prizm'] },
      { name: 'Cracked Ice Prizm', look: 'shattered ice / broken glass facets', aliases: ['cracked ice', 'shattered ice', 'broken glass', 'ice cracks'] },
      { name: 'Wave Prizm', look: 'flowing wave lines', aliases: ['wave'] },
      { name: 'Disco Prizm', look: 'grid of sparkle dots like a disco ball', aliases: ['disco', 'sparkle dots'] },
      { name: 'Hyper Prizm', look: 'diagonal streak bands', aliases: ['hyper'] },
      { name: 'Mojo Prizm', look: 'long vertical streaks', aliases: ['mojo'] },
      { name: 'Shimmer Prizm', look: 'fine dense glitter', aliases: ['shimmer'] },
      { name: 'Pulsar Prizm', look: 'starburst rays from the centre', aliases: ['pulsar', 'starburst'] },
      { name: 'Fast Break Prizm', look: 'irregular puzzle-piece shards', aliases: ['fast break'] },
      { name: 'Tiger Stripe Prizm', look: 'animal stripe bands', aliases: ['tiger stripe', 'tiger'] },
      { name: 'Zebra Prizm', look: 'black and white zebra stripes', aliases: ['zebra'] },
      { name: 'Snakeskin Prizm', look: 'reptile scale texture', aliases: ['snakeskin', 'snake skin'] },
      { name: 'Dragon Scale Prizm', look: 'overlapping scale pattern', aliases: ['dragon scale'] },
      { name: 'White Sparkle Prizm', look: 'white base with heavy sparkle', aliases: ['white sparkle'] },
      { name: 'Nebula Prizm', look: 'cloudy galaxy swirl, one-of-one', aliases: ['nebula'] },
    ],
  },
  {
    manufacturer: 'Panini',
    product: 'Select',
    aliases: ['panini select', 'select'],
    sports: ['basketball', 'football', 'soccer', 'baseball'],
    parallels: [
      { name: 'Tie-Dye Prizm', look: 'tie-dye colour bleed', aliases: ['tie dye', 'tiedye'] },
      { name: 'Zebra Prizm', look: 'zebra stripes', aliases: ['zebra'] },
      { name: 'Disco Prizm', look: 'sparkle dot grid', aliases: ['disco'] },
      { name: 'Scope Prizm', look: 'concentric scope rings', aliases: ['scope'] },
      { name: 'Snakeskin Prizm', look: 'reptile scales', aliases: ['snakeskin'] },
      { name: 'Dragon Scale Prizm', look: 'overlapping scales', aliases: ['dragon scale'] },
      { name: 'White Sparkle Prizm', look: 'white sparkle finish', aliases: ['white sparkle'] },
    ],
  },
  {
    manufacturer: 'Panini',
    product: 'Donruss Optic',
    aliases: ['optic', 'donruss optic'],
    sports: ['basketball', 'football', 'baseball'],
    parallels: [
      { name: 'Holo', look: 'plain holographic foil', aliases: ['holo', 'holographic'] },
      { name: 'Shock', look: 'jagged lightning-bolt streaks', aliases: ['shock'] },
      { name: 'Pandora', look: 'dense small sparkle flecks', aliases: ['pandora'] },
      { name: 'Velocity', look: 'speed-blur streaks', aliases: ['velocity'] },
      { name: 'Checkerboard', look: 'checkered squares', aliases: ['checkerboard', 'checkered'] },
      { name: 'Gold Vinyl', look: 'gold vinyl finish, one-of-one', aliases: ['gold vinyl'] },
    ],
  },
  {
    manufacturer: 'Panini',
    product: 'Mosaic',
    aliases: ['mosaic', 'panini mosaic'],
    sports: ['basketball', 'football', 'soccer'],
    parallels: [
      { name: 'Mosaic Prizm', look: 'mosaic tile pattern in the foil', aliases: ['mosaic prizm', 'base mosaic'] },
      { name: 'Reactive', look: 'colour-reactive foil', aliases: ['reactive'] },
      { name: 'Genesis', look: 'swirling cloud texture', aliases: ['genesis'] },
      { name: 'Camo', look: 'camouflage blotches', aliases: ['camo', 'camouflage'] },
      { name: 'Peacock', look: 'peacock feather eyes', aliases: ['peacock'] },
      { name: 'Fast Break', look: 'shard pattern', aliases: ['fast break'] },
      { name: 'Choice Fusion', look: 'two-tone fused colour', aliases: ['choice', 'fusion'] },
    ],
  },
  {
    manufacturer: 'Panini',
    product: 'Donruss',
    aliases: ['donruss'],
    sports: ['baseball', 'football', 'basketball', 'soccer'],
    parallels: [
      { name: 'Press Proof', look: 'foil stamp with press proof mark', aliases: ['press proof'] },
      { name: 'Rated Rookie', look: 'Rated Rookie logo (subset, not a parallel)', aliases: ['rated rookie'] },
      { name: 'Diamond Kings', look: 'painted-art Diamond Kings subset', aliases: ['diamond kings'] },
    ],
  },
  {
    manufacturer: 'Upper Deck',
    product: 'Upper Deck',
    aliases: ['upper deck', 'ud'],
    sports: ['hockey', 'basketball', 'football', 'wrestling'],
    parallels: [
      { name: 'Young Guns', look: 'Young Guns rookie subset (hockey)', aliases: ['young guns'] },
      { name: 'Exclusives', look: 'Exclusives stamp, serial numbered', aliases: ['exclusives'] },
      { name: 'High Gloss', look: 'heavy gloss coating', aliases: ['high gloss'] },
      { name: 'Clear Cut', look: 'transparent acetate stock', aliases: ['clear cut', 'acetate'] },
      { name: 'Canvas', look: 'canvas-texture art treatment', aliases: ['canvas', 'ud canvas'] },
      { name: 'Speckled Rainbow Foil', look: 'speckled rainbow foil', aliases: ['speckled rainbow', 'speckled foil'] },
    ],
  },
];

/** Grading companies, canonical + how they appear on slab labels. */
const GRADERS = [
  { name: 'PSA', aliases: ['psa', 'professional sports authenticator'] },
  { name: 'BGS', aliases: ['bgs', 'beckett', 'beckett grading'] },
  { name: 'SGC', aliases: ['sgc'] },
  { name: 'CGC', aliases: ['cgc'] },
  { name: 'HGA', aliases: ['hga'] },
  { name: 'CSG', aliases: ['csg'] },
];

/** Colour words that qualify a parallel ("Blue Refractor", "Gold Prizm"). */
const COLOR_WORDS = [
  'black', 'blue', 'aqua', 'teal', 'green', 'gold', 'orange', 'red', 'purple', 'pink',
  'magenta', 'yellow', 'bronze', 'copper', 'silver', 'white', 'sepia', 'camo', 'rose gold',
];

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

/** All parallels for a manufacturer/product, or every parallel when unscoped. */
function parallelsFor({ manufacturer, product } = {}) {
  const m = norm(manufacturer);
  const p = norm(product);
  const hit = PRODUCTS.filter((entry) => {
    const mOk = !m || norm(entry.manufacturer) === m || entry.aliases.some((a) => norm(a).includes(m) || m.includes(norm(a)));
    const pOk = !p || norm(entry.product) === p || entry.aliases.some((a) => p.includes(norm(a)) || norm(a).includes(p));
    return mOk && pOk;
  });
  return (hit.length ? hit : PRODUCTS).flatMap((e) =>
    e.parallels.map((par) => ({ ...par, manufacturer: e.manufacturer, product: e.product })),
  );
}

/**
 * Resolve a loose description to the searchable hobby term.
 * "checkered pattern" -> "Checkerboard Refractor"; "shattered ice" -> "Cracked Ice Prizm".
 * Returns null when nothing matches (better than guessing a wrong search term).
 */
function matchParallel(text, scope = {}) {
  const t = norm(text);
  if (!t) return null;
  const candidates = parallelsFor(scope);
  const color = COLOR_WORDS.filter((c) => new RegExp(`\\b${c}\\b`).test(t)).sort((a, b) => b.length - a.length)[0] || null;

  let best = null;
  for (const cand of candidates) {
    const keys = [cand.name, ...(cand.aliases || [])].map(norm);
    for (const k of keys) {
      if (!k) continue;
      let score = 0;
      if (t === k) score = 100;
      else if (new RegExp(`\\b${k.replace(/ /g, '\\s+')}\\b`).test(t)) score = 60 + k.length;
      else if (k.length > 6 && t.includes(k)) score = 40 + k.length;
      if (score && (!best || score > best.score)) best = { ...cand, score, matched: k };
    }
  }
  if (!best) {
    // A bare colour is itself a parallel name in the hobby ("Red /299",
    // "Gold /10"), so it is a real search term rather than a guess — but only
    // when the text is nothing but colour words.
    const leftover = t.replace(new RegExp(`\\b(${COLOR_WORDS.join('|')}|parallel|refractor|prizm|foil)\\b`, 'g'), '').trim();
    if (color && !leftover) {
      return { name: titleCase(color), base: null, color, look: 'solid colour parallel', manufacturer: scope.manufacturer || null, product: scope.product || null };
    }
    return null;
  }
  // "Blue Refractor" reads better than "Refractor" and is what sellers list.
  const name = color && !norm(best.name).includes(color) ? `${titleCase(color)} ${best.name}` : best.name;
  return { name, base: best.name, color: color || null, look: best.look, manufacturer: best.manufacturer, product: best.product };
}

function titleCase(s) {
  return String(s).replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

/** Canonical manufacturer name from any spelling found on a card. */
function matchManufacturer(text) {
  const t = norm(text);
  if (!t) return null;
  for (const m of MANUFACTURERS) {
    for (const a of m.aliases) if (new RegExp(`\\b${norm(a).replace(/ /g, '\\s+')}\\b`).test(t)) return m.name;
  }
  return null;
}

/** Canonical grading company from a slab label. */
function matchGrader(text) {
  const t = norm(text);
  if (!t) return null;
  for (const g of GRADERS) {
    for (const a of g.aliases) if (new RegExp(`\\b${norm(a).replace(/ /g, '\\s+')}\\b`).test(t)) return g.name;
  }
  return null;
}

/** Compact reference block for the vision prompt, scoped to a product when known. */
function promptReference(scope = {}) {
  const scoped = PRODUCTS.filter((e) => {
    if (!scope.manufacturer && !scope.product) return true;
    const m = norm(scope.manufacturer);
    const p = norm(scope.product);
    const mOk = !m || norm(e.manufacturer) === m;
    const pOk = !p || e.aliases.some((a) => p.includes(norm(a)) || norm(a).includes(p));
    return mOk && pOk;
  });
  return (scoped.length ? scoped : PRODUCTS)
    .map((e) => `${e.manufacturer.toUpperCase()} ${e.product.toUpperCase()}:\n` + e.parallels.map((p) => `- ${p.name} (${p.look})`).join('\n'))
    .join('\n\n');
}

module.exports = {
  SPORTS,
  MANUFACTURERS,
  PRODUCTS,
  GRADERS,
  COLOR_WORDS,
  parallelsFor,
  matchParallel,
  matchManufacturer,
  matchGrader,
  promptReference,
  titleCase,
};
