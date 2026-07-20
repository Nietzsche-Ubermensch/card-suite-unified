const fs = require('fs');
const path = require('path');

const INPUT = path.join(__dirname, 'enhanced');
const OUTPUT = path.join(__dirname, 'listings/eBay_bulk_upload.csv');
const HEADERS = ['Item Title','Start Price','Buy It Now','Category','Quantity','Description','Format','Condition','Item Type','Location','Country'];

/**
 * Build a CSV row for a single card.
 * Evolved by darwinian-evolver v2 (score: 1.000) for SPORTS + WRESTLING cards.
 * 
 * Features:
 * - Sport-specific eBay category mapping (baseball/football/basketball/hockey/wrestling)
 * - Wrestling cards (WWE/AEW/ROH/NJPW/TNA) get dedicated wrestling category
 * - Rookie card detection: appends 'RC' to title for eBay SEO
 * - Autograph detection: appends 'Auto' to title for eBay SEO
 * - Grade-based condition mapping (PSA/BGS/CGC/SGC)
 * - CSV escaping for commas, quotes, newlines
 * - Rich description with condition notes and shipping info
 * - Missing grade defaults to 'Raw'
 */
function buildRow(card, idx) {
  const errs = [];
  if (!card.name) errs.push('name');
  if (!card.set) errs.push('set');
  if (typeof card.price !== 'number' || card.price <= 0) errs.push('price');
  if (!card.quantity || card.quantity < 1) errs.push('quantity');
  if (errs.length) {
    console.warn(`[ROW ${idx}] Skipped: missing ${errs.join(', ')}`);
    return null;
  }

  const grade = (card.grade && String(card.grade).trim()) || 'Raw';
  const gradeLower = grade.toLowerCase().replace(/\s+/g, ' ').trim();

  function csvField(val) {
    const str = String(val == null ? '' : val);
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  }

  // Title: name + set + grade, with RC and Auto detection
  let title = `${card.name} ${card.set} ${grade}`.replace(/\s+/g, ' ').trim();
  const nameSetStr = `${card.name} ${card.set}`.toLowerCase();
  if ((card.rc || /\brookie\b|\brc\b/i.test(nameSetStr)) && !/\brc\b/i.test(title)) {
    title += ' RC';
  }
  if ((card.auto || /\bauto\b|\bautograph\b/i.test(nameSetStr)) && !/\bauto\b/i.test(title)) {
    title += ' Auto';
  }
  if (title.length > 80) {
    title = title.substring(0, 80).trim();
  }

  // Category: sport-specific mapping, wrestling gets its own category
  const sportStr = String(card.sport || '').toLowerCase();
  const combinedText = `${card.name} ${card.set} ${sportStr}`.toLowerCase();
  
  let category;
  if (sportStr === 'wrestling' || /wwe|aew|wrestling|roh|njpw|tna/.test(combinedText)) {
    category = 'Sports Mem, Cards & Fan Shop > Wrestling Cards';
  } else if (sportStr === 'baseball' || /baseball|mlb/.test(combinedText)) {
    category = 'Sports Mem, Cards & Fan Shop > Sports Trading Cards > Baseball > Trading Card Singles';
  } else if (sportStr === 'football' || /football|nfl/.test(combinedText)) {
    category = 'Sports Mem, Cards & Fan Shop > Sports Trading Cards > Football > Trading Card Singles';
  } else if (sportStr === 'basketball' || /basketball|nba/.test(combinedText)) {
    category = 'Sports Mem, Cards & Fan Shop > Sports Trading Cards > Basketball > Trading Card Singles';
  } else if (sportStr === 'hockey' || /hockey|nhl/.test(combinedText)) {
    category = 'Sports Mem, Cards & Fan Shop > Sports Trading Cards > Hockey > Trading Card Singles';
  } else {
    category = 'Sports Mem, Cards & Fan Shop > Sports Trading Cards > Trading Card Singles';
  }

  // Condition: grade-based mapping
  const isRaw = /raw|ungraded|not\s*graded/.test(gradeLower);
  let condition;
  if (isRaw) {
    condition = 'Used';
  } else if (/^(psa|bgs|cgc|sgc)\s*10$/.test(gradeLower) || /gem\s*mint/.test(gradeLower)) {
    condition = 'Used - Mint';
  } else if (/^(psa|bgs|cgc|sgc)\s*9$/.test(gradeLower) || /mint/.test(gradeLower)) {
    condition = 'Used - Excellent';
  } else if (/^(psa|bgs|cgc|sgc)\s*8$/.test(gradeLower) || /very\s*good/.test(gradeLower)) {
    condition = 'Used - Very Good';
  } else {
    condition = 'Used';
  }

  // Rich description
  const graderPrefix = grade.split(/\s+/)[0];
  const conditionNote = isRaw
    ? `This card is ungraded and offered in raw condition. Please review the provided details and ask any questions before purchase.`
    : `This card has been professionally graded as ${grade}${/^(PSA|BGS|CGC|SGC)$/i.test(graderPrefix) ? ` by ${graderPrefix}` : ''}.`;

  const description = (
    `Up for sale is a ${grade} ${card.name} from the ${card.set} set. ` +
    `${conditionNote} ` +
    `A great addition to any sports or wrestling card collection. ` +
    `Shipping: securely packaged with tracking. ` +
    `Details — Card: ${card.name} | Set: ${card.set} | Grade: ${grade} | Quantity: ${card.quantity}.`
  );

  const fields = [
    title,
    card.price,
    card.price,
    category,
    card.quantity,
    description,
    'FixedPrice',
    condition,
    'Store Inventory',
    'United States',
    'US'
  ];

  return fields.map(f => csvField(f)).join(',');
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

module.exports = { run, buildRow, HEADERS };
