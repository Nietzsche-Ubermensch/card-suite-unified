const fs = require('fs');
const path = require('path');

const INPUT = path.join(__dirname, 'enhanced');
const OUTPUT = path.join(__dirname, 'listings/eBay_bulk_upload.csv');

/**
 * REAL eBay Seller Hub Reports CSV headers for "Create new listings" — Sports Trading Cards.
 * Based on the official eBay Seller Hub Reports template format.
 * Item specifics use the "C:" prefix convention.
 */
const HEADERS = [
  'Action',
  'Custom label (SKU)',
  'Category ID',
  'Title',
  'UPC',
  'Price',
  'Quantity',
  'Condition ID',
  'Condition Description',
  'Description',
  'Format',
  'Duration',
  'Item photo URL',
  'C:Card Manufacturer',
  'C:Professionally Graded',
  'C:Professional Grader',
  'C:Grade',
  'C:Certification Number',
  'C:Card Condition',
  'C:Sport',
  'C:Player/Athlete',
  'C:Team',
  'C:Card Name',
  'C:Type',
  'C:Parallel/Variety',
  'C:Features',
  'C:League',
  'C:Autographed',
  'C:Card Number',
  'C:Season',
  'C:Single',
  'C:Original/Reprint',
  'C:Year',
];

/**
 * eBay numeric Category IDs for Sports Trading Cards.
 * Source: eBay Category Changes: Sports Mem, Cards & Fan Shop
 */
const CATEGORY_IDS = {
  baseball: 213,
  basketball: 214,
  football: 215,
  hockey: 216,
  soccer: 183444,
  wrestling: 183435,
  racing: 666,
  other: 217,
};

/**
 * eBay Condition IDs for trading cards.
 * 4000 = Very Good (also used for ungraded cards)
 * 1000 = New, 3000 = Used - Good, 5000 = Used - Good, 6000 = Used - Acceptable
 * For graded cards, eBay uses condition descriptors (not just Condition ID).
 */
const CONDITION_IDS = {
  raw: 4000,        // Ungraded → Very Good
  psa10: 1000,      // Graded gem mint → New
  psa9: 3000,       // Graded mint → Used - Good
  bgs10: 1000,
  bgs9: 3000,
  cgc10: 1000,
  cgc9: 3000,
  sgc10: 1000,
  sgc9: 3000,
};

/**
 * Professional Grader IDs (eBay condition descriptor values).
 */
const GRADER_IDS = {
  PSA: '275010',
  BCCG: '275011',
  BVG: '275012',
  BGS: '275013',
  CSG: '275014',
  CGC: '275015',
  SGC: '275016',
  KSA: '275017',
  GMA: '275018',
  HGA: '275019',
  ISA: '2750110',
};

/**
 * Grade IDs (eBay condition descriptor values for the numeric grade).
 */
const GRADE_IDS = {
  10: '275020', '9.5': '275021', 9: '275022', '8.5': '275023', 8: '275024',
  '7.5': '275025', 7: '275026', '6.5': '275027', 6: '275028', '5.5': '275029',
  5: '2750210', '4.5': '2750211', 4: '2750212', '3.5': '2750213', 3: '2750214',
};

/**
 * Ungraded Card Condition Descriptor IDs.
 */
const UNGRADED_CONDITION_IDS = {
  'near mint': '400010',
  'excellent': '400011',
  'very good': '400012',
  'poor': '400013',
};

/**
 * Build a CSV row for a single card using the REAL eBay Seller Hub Reports format.
 * Evolved by darwinian-evolver v4 against REAL rbeachgebay inventory + REAL eBay template.
 */
function buildRow(card, idx) {
  const errs = [];
  if (!card.name) errs.push('name');
  if (!card.set) errs.push('set');
  if (typeof card.price !== 'number' || card.price < 0) errs.push('price');
  if (!card.quantity || card.quantity < 1) errs.push('quantity');
  if (errs.length) {
    console.warn(`[ROW ${idx}] Skipped: missing ${errs.join(', ')}`);
    return null;
  }

  function csvField(val) {
    const str = String(val == null ? '' : val);
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  }

  // --- Action ---
  const action = 'Add';

  // --- SKU ---
  const sku = card.sku || `CARD-${idx + 1}`;

  // --- Category ID (numeric) ---
  const sportStr = String(card.sport || '').toLowerCase();
  const combinedText = `${card.name} ${card.set} ${sportStr}`.toLowerCase();
  let categoryId;
  if (sportStr === 'wrestling' || /wwe|aew|wrestling|roh|njpw|tna/.test(combinedText)) {
    categoryId = CATEGORY_IDS.wrestling;
  } else if (sportStr === 'soccer' || /soccer|fifa|uefa|premier\s*league|la\s*liga|serie\s*a|bundesliga/.test(combinedText)) {
    categoryId = CATEGORY_IDS.soccer;
  } else if (sportStr === 'baseball' || /baseball|mlb|bowman|topps/.test(combinedText)) {
    categoryId = CATEGORY_IDS.baseball;
  } else if (sportStr === 'football' || /football|nfl/.test(combinedText)) {
    categoryId = CATEGORY_IDS.football;
  } else if (sportStr === 'basketball' || /basketball|nba/.test(combinedText)) {
    categoryId = CATEGORY_IDS.basketball;
  } else if (sportStr === 'hockey' || /hockey|nhl/.test(combinedText)) {
    categoryId = CATEGORY_IDS.hockey;
  } else {
    categoryId = CATEGORY_IDS.other;
  }

  // --- Title (max 80 chars) ---
  const grade = (card.grade && String(card.grade).trim()) || 'Raw';
  const parts = [card.name, card.set];
  if (card.insert && String(card.insert).trim()) parts.push(String(card.insert).trim());
  if (card.parallel && String(card.parallel).trim()) parts.push(String(card.parallel).trim());
  if (card.serial && String(card.serial).trim()) parts.push(String(card.serial).trim());
  parts.push(grade);
  let title = parts.join(' ').replace(/\s+/g, ' ').trim();

  // Rookie and Auto detection
  const nameSetStr = `${card.name} ${card.set} ${card.insert || ''} ${card.parallel || ''}`.toLowerCase();
  const isRookie = card.rookie === true || card.rc === true ||
    /\brookie\b|\brc\b|\b1st\s*bowman\b|\bbowman\s*1st\b|\bfirst\s*bowman\b/.test(nameSetStr);
  const isAuto = card.auto === true ||
    /\bauto\b|\bautograph\b|\bsignature\b|\bsigned\b/.test(nameSetStr);
  if (isRookie && !/\brc\b/i.test(title) && !/\brookie\b/i.test(title)) title += ' RC';
  if (isAuto && !/\bauto\b/i.test(title) && !/\bautograph\b/i.test(title)) title += ' Auto';
  if (title.length > 80) title = title.substring(0, 80).trim();

  // --- UPC ---
  const upc = 'Does not apply';

  // --- Condition ID ---
  const gradeLower = grade.toLowerCase().replace(/\s+/g, ' ').trim();
  const isRaw = /raw|ungraded|not\s*graded/.test(gradeLower);
  let conditionId;
  let conditionDesc = '';

  if (isRaw) {
    conditionId = CONDITION_IDS.raw;
    // Determine ungraded card condition
    const cardCond = (card.cardCondition || 'Near Mint or Better').toLowerCase();
    if (/near\s*mint/.test(cardCond)) conditionDesc = 'Near Mint or Better';
    else if (/excellent/.test(cardCond)) conditionDesc = 'Excellent';
    else if (/very\s*good/.test(cardCond)) conditionDesc = 'Very Good';
    else if (/poor/.test(cardCond)) conditionDesc = 'Poor';
    else conditionDesc = 'Near Mint or Better';
  } else {
    // Graded card
    const graderMatch = gradeLower.match(/^(psa|bgs|cgc|sgc|bccg|bvg|csg|ksa|gma|hga|isa)/);
    const gradeNumMatch = gradeLower.match(/(\d+\.?\d*)/);
    if (gradeNumMatch) {
      const numGrade = parseFloat(gradeNumMatch[1]);
      if (numGrade >= 10) conditionId = CONDITION_IDS.psa10;
      else if (numGrade >= 9) conditionId = CONDITION_IDS.psa9;
      else conditionId = 3000;
    } else {
      conditionId = 3000;
    }
    conditionDesc = '';
  }

  // --- Description (HTML) ---
  const conditionNote = isRaw
    ? `This card is ungraded and offered in raw condition. Please review the photos and ask any questions before purchase.`
    : `This card has been professionally graded as ${grade}.`;
  const description = (
    `<p>Up for sale is a ${grade} ${card.name} from the ${card.set} set.</p>` +
    `<p>${conditionNote}</p>` +
    `<p>A great addition to any sports or wrestling card collection.</p>` +
    `<p>Shipping: securely packaged with tracking. Combined shipping available.</p>` +
    `<p>Details — Card: ${card.name} | Set: ${card.set} | Grade: ${grade} | Quantity: ${card.quantity}.</p>`
  );

  // --- Format & Duration ---
  const format = 'FixedPrice';
  const duration = 'GTC';

  // --- Photo URL ---
  const photoUrl = card.photoUrl || card.imageUrl || '';

  // --- Item Specifics (C: prefixed columns) ---
  // Card Manufacturer
  const manufacturer = card.manufacturer || extractManufacturer(card.set) || '';

  // Professionally Graded
  const profGraded = isRaw ? 'No' : 'Yes';

  // Professional Grader
  let profGrader = '';
  if (!isRaw) {
    const graderMatch = gradeLower.match(/^(psa|bgs|cgc|sgc|bccg|bvg|csg|ksa|gma|hga|isa)/);
    if (graderMatch) {
      const graderKey = graderMatch[1].toUpperCase();
      profGrader = graderKey;
    }
  }

  // Grade (numeric value for graded cards)
  let gradeValue = '';
  if (!isRaw) {
    const gradeNumMatch = gradeLower.match(/(\d+\.?\d*)/);
    if (gradeNumMatch) gradeValue = gradeNumMatch[1];
  }

  // Certification Number
  const certNumber = card.certNumber || '';

  // Card Condition (for ungraded)
  let cardCondition = '';
  if (isRaw) cardCondition = conditionDesc;

  // Sport
  const sport = card.sport || detectSport(combinedText) || '';

  // Player/Athlete
  const player = card.name || '';

  // Team
  const team = card.team || '';

  // Card Name (e.g., "base", "Downtown")
  const cardName = card.cardName || card.insert || '';

  // Type
  const type = 'Sports Trading Card';

  // Parallel/Variety
  const parallelVariety = card.parallel || '';

  // Features (rookie, autograph, short print, memorabilia)
  const featuresList = [];
  if (isRookie) featuresList.push('Rookie');
  if (isAuto) featuresList.push('Autograph');
  if (card.shortPrint) featuresList.push('Short Print');
  if (card.memorabilia || card.relic) featuresList.push('Memorabilia');
  if (card.serial) featuresList.push('Serial Numbered');
  const features = featuresList.join(', ');

  // League
  const league = card.league || detectLeague(combinedText) || '';

  // Autographed
  const autographed = isAuto ? 'Yes' : 'No';

  // Card Number (in set, NOT serial number)
  const cardNumber = card.cardNumber || '';

  // Season
  const season = card.season || extractYear(card.set) || '';

  // Single
  const single = 'Yes';

  // Original/Reprint
  const originalReprint = 'Original';

  // Year
  const year = extractYear(card.set) || '';

  // --- Build row ---
  const fields = [
    action,
    sku,
    categoryId,
    title,
    upc,
    card.price,
    card.quantity,
    conditionId,
    conditionDesc,
    description,
    format,
    duration,
    photoUrl,
    manufacturer,
    profGraded,
    profGrader,
    gradeValue,
    certNumber,
    cardCondition,
    sport,
    player,
    team,
    cardName,
    type,
    parallelVariety,
    features,
    league,
    autographed,
    cardNumber,
    season,
    single,
    originalReprint,
    year,
  ];

  return fields.map(f => csvField(f)).join(',');
}

/**
 * Extract manufacturer from set name.
 */
function extractManufacturer(setName) {
  const s = (setName || '').toLowerCase();
  if (/topps/.test(s)) return 'Topps';
  if (/panini/.test(s)) return 'Panini';
  if (/upper deck|udc|ud canvas|metal universe/.test(s)) return 'Upper Deck';
  if (/leaf/.test(s)) return 'Leaf';
  if (/skybox/.test(s)) return 'Skybox';
  if (/fleer/.test(s)) return 'Fleer';
  if (/bowman/.test(s)) return 'Bowman';
  if (/donruss/.test(s)) return 'Donruss';
  if (/score/.test(s)) return 'Score';
  return '';
}

/**
 * Extract year from set name (e.g., "2022 Topps Chrome WWE" → "2022").
 */
function extractYear(setName) {
  const match = (setName || '').match(/(\d{4})(?:[-](\d{2,4}))?/);
  if (match) {
    return match[2] ? `${match[1]}-${match[2]}` : match[1];
  }
  return '';
}

/**
 * Detect sport from text.
 */
function detectSport(text) {
  if (/wwe|aew|wrestling/.test(text)) return 'Wrestling';
  if (/soccer|fifa|uefa/.test(text)) return 'Soccer';
  if (/baseball|mlb/.test(text)) return 'Baseball';
  if (/football|nfl/.test(text)) return 'Football';
  if (/basketball|nba/.test(text)) return 'Basketball';
  if (/hockey|nhl/.test(text)) return 'Hockey';
  return '';
}

/**
 * Detect league from text.
 */
function detectLeague(text) {
  if (/wwe/.test(text)) return 'WWE';
  if (/aew/.test(text)) return 'AEW';
  if (/mlb/.test(text)) return 'MLB';
  if (/nfl/.test(text)) return 'NFL';
  if (/nba/.test(text)) return 'NBA';
  if (/nhl/.test(text)) return 'NHL';
  if (/fifa/.test(text)) return 'FIFA';
  if (/uefa/.test(text)) return 'UEFA';
  return '';
}

function run() {
  if (!fs.existsSync(INPUT)) throw new Error(`Input dir missing: ${INPUT}`);
  const files = fs.readdirSync(INPUT).filter(f => f.endsWith('.json'));
  if (!files.length) throw new Error('No JSON files in enhanced/');
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  let written = 0, skipped = 0;
  const lines = [HEADERS.map(h => `"${h}"`).join(',')];
  files.forEach((f, i) => {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(INPUT, f), 'utf8'));
      (Array.isArray(data) ? data : [data]).forEach((c, j) => {
        const row = buildRow(c, `${i}-${j}`);
        if (row) { lines.push(row); written++; } else skipped++;
      });
    } catch (e) { console.error(`[ERROR] ${f}: ${e.message}`); skipped++; }
  });
  fs.writeFileSync(OUTPUT, lines.join('\n'));
  console.log(`\n=== CSV Complete ===\nWritten: ${written}\nSkipped: ${skipped}\nOutput: ${OUTPUT}`);
}

module.exports = { run, buildRow, HEADERS, CATEGORY_IDS, CONDITION_IDS };
