const fs = require('fs');
const path = require('path');

const INPUT = path.join(__dirname, 'enhanced');
const OUTPUT = path.join(__dirname, 'listings/eBay_bulk_upload.csv');
const HEADERS = ['Item Title','Start Price','Buy It Now','Category','Quantity','Description','Format','Condition','Item Type','Location','Country'];

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
  const title = `${card.name} ${card.set} ${card.grade || ''}`.trim();
  return [
    `"${title}"`, card.price, card.price, '"Sports Cards"', card.quantity,
    `"Card: ${card.name} | Set: ${card.set} | Grade: ${card.grade || 'Raw'}"`,
    '"FixedPrice"','"Used - Very Good"','"Store Inventory"','"United States"','"US"'
  ].join(',');
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
