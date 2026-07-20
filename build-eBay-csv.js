const fs = require('fs');
const path = require('path');

const INPUT = path.join(__dirname, 'enhanced');
const OUTPUT = path.join(__dirname, 'listings/eBay_bulk_upload.csv');
const HEADERS = ['Item Title','Start Price','Buy It Now','Category','Quantity','Description','Format','Condition','Item Type','Location','Country'];

/**
 * Build a CSV row for a single card.
 * Evolved by darwinian-evolver (score: 1.000) against 11 eBay business scenarios:
 * - Title optimization (max 80 chars, name + set + grade)
 * - Category mapping (TCG vs sports cards)
 * - Condition mapping (PSA/BGS/CGC/SGC grade -> eBay condition)
 * - CSV escaping (quotes, commas, newlines)
 * - Rich description generation
 * - Missing field handling (grade defaults to "Raw")
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

  // CSV field escaping: quote fields containing commas, quotes, or newlines;
  // double internal quotes.
  function csvField(val) {
    const str = String(val == null ? '' : val);
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  }

  // Title: name + set + grade, collapsed spaces, max 80 chars.
  let title = `${card.name} ${card.set} ${grade}`.replace(/\s+/g, ' ').trim();
  if (title.length > 80) title = title.substring(0, 80).trim();

  // Category: map by card type (TCG vs. sports).
  // Check type field, then fall back to name/set keywords for TCG detection.
  const cardType = String(card.type || card.category || card.game || '').toLowerCase();
  const nameSet = `${card.name} ${card.set}`.toLowerCase();
  const isTCG = /pokemon|pkmn|magic|mtg|yu-?gi-?oh|yugioh|tcg|ccg|flesh and blood|lorcana/.test(cardType)
    || /pokemon|pikachu|charizard|blastoise|venusaur|magic: the gathering|mtg|black lotus|blue-?eyes|dark magician|exodia|lorcana/.test(nameSet);
  const category = isTCG
    ? 'Collectibles > Trading Card Games > Individual Cards'
    : 'Sports Mem, Cards & Fan Shop > Sports Trading Cards > Trading Card Singles';

  // Condition: map by grade.
  let condition;
  if (/^(psa|bgs|cgc|sgc)\s*10$/.test(gradeLower) || /gem\s*mint/.test(gradeLower)) {
    condition = 'Used - Mint';
  } else if (/^(psa|bgs|cgc|sgc)\s*9$/.test(gradeLower) || /mint/.test(gradeLower)) {
    condition = 'Used - Excellent';
  } else if (/^(psa|bgs|cgc|sgc)\s*8$/.test(gradeLower) || /very\s*good/.test(gradeLower)) {
    condition = 'Used - Very Good';
  } else {
    // Raw / ungraded / anything else.
    condition = 'Used';
  }

  // Rich, informative description.
  const isRaw = /raw|ungraded|not\s*graded/.test(gradeLower);
  const graderPrefix = grade.split(/\s+/)[0];
  const conditionNote = isRaw
    ? `This card is ungraded and offered in raw condition, making it a great candidate for personal collection or professional grading submission. Please review the provided details and ask any questions before purchase.`
    : `This card has been professionally graded as ${grade}${/^(PSA|BGS|CGC|SGC)$/i.test(graderPrefix) ? ` by ${graderPrefix}` : ''}, offering collectors a verified and encapsulated piece with strong long-term collectibility.`;
  const description = (
    `Up for sale is a ${grade} ${card.name} from the ${card.set} set. ` +
    `${conditionNote} ` +
    `This is a sought-after collectible with enduring demand among enthusiasts and a solid addition to any serious collection. ` +
    `The item pictured is the exact item you will receive (where applicable). ` +
    `Shipping: securely packaged in a sleeve and toploader (or graded slab), with tracking provided to the United States. ` +
    `International shipping available where supported. Payment expected within 3 days of listing close. ` +
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
