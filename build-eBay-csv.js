const fs = require('fs');
const path = require('path');

const INPUT = path.join(__dirname, 'enhanced');
const OUTPUT = path.join(__dirname, 'listings/eBay_bulk_upload.csv');
const HEADERS = ['Item Title','Start Price','Buy It Now','Category','Quantity','Description','Format','Condition','Item Type','Location','Country'];

/**
 * Build a CSV row for a single card.
 * Evolved by darwinian-evolver v3 (score: 1.000) against REAL rbeachgebay inventory.
 * 
 * Handles: WWE wrestling, AEW wrestling, Soccer, Baseball, Football, Basketball, Hockey
 * 
 * Title includes: name + set + insert + parallel + serial + grade + RC + Auto
 * Category mapping: Wrestling, Soccer, Baseball, Football, Basketball, Hockey
 * Condition: PSA/BGS/CGC/SGC grade mapping
 * CSV escaping for commas, quotes, newlines
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

  // Build title components: name, set, insert, parallel, serial, grade
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
  if (isRookie && !/\brc\b/i.test(title) && !/\brookie\b/i.test(title)) {
    title += ' RC';
  }
  if (isAuto && !/\bauto\b/i.test(title) && !/\bautograph\b/i.test(title)) {
    title += ' Auto';
  }
  if (title.length > 80) {
    title = title.substring(0, 80).trim();
  }

  // Category mapping: wrestling, soccer, baseball, football, basketball, hockey
  const sportStr = String(card.sport || '').toLowerCase();
  const combinedText = `${card.name} ${card.set} ${sportStr}`.toLowerCase();
  let category;
  if (sportStr === 'wrestling' || /wwe|aew|wrestling|roh|njpw|tna|impact\s*wrestling/.test(combinedText)) {
    category = 'Sports Mem, Cards & Fan Shop > Wrestling Cards';
  } else if (sportStr === 'soccer' || /soccer|\bfc\b|fifa|uefa|premier\s*league|la\s*liga|serie\s*a|bundesliga|ligue\s*1|mls|champions\s*league|world\s*cup|psg|barcelona|real\s*madrid|liverpool|manchester|arsenal|chelsea|tottenham|juventus|bayern|dortmund/.test(combinedText)) {
    category = 'Sports Mem, Cards & Fan Shop > Sports Trading Cards > Soccer > Trading Card Singles';
  } else if (sportStr === 'baseball' || /baseball|mlb|\bbowman\b|\btopps\b|\bchrom\b|\brefractor\b/.test(combinedText)) {
    category = 'Sports Mem, Cards & Fan Shop > Sports Trading Cards > Baseball > Trading Card Singles';
  } else if (sportStr === 'football' || /football|nfl|\bpanini\b|\bprizm\b|\bselect\b|\bcontenders\b|\bmosaic\b/.test(combinedText)) {
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
  } else if (/^(psa|bgs|cgc|sgc)\s*9$/.test(gradeLower) || /\bmint\b/.test(gradeLower)) {
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
