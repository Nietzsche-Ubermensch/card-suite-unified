const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { buildRow, HEADERS } = require('./build-eBay-csv');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const PORT = 3999;
const ENHANCED_DIR = path.join(__dirname, 'enhanced');
const LISTINGS_DIR = path.join(__dirname, 'listings');

// Ensure dirs exist
fs.mkdirSync(ENHANCED_DIR, { recursive: true });
fs.mkdirSync(LISTINGS_DIR, { recursive: true });

// GET /api/cards — return all cards from enhanced/*.json
app.get('/api/cards', (req, res) => {
  try {
    const files = fs.readdirSync(ENHANCED_DIR).filter(f => f.endsWith('.json'));
    const allCards = [];
    files.forEach(f => {
      const data = JSON.parse(fs.readFileSync(path.join(ENHANCED_DIR, f), 'utf8'));
      (Array.isArray(data) ? data : [data]).forEach(c => allCards.push(c));
    });
    res.json({ cards: allCards });
  } catch (e) {
    res.json({ cards: [] });
  }
});

// POST /api/cards — save cards to enhanced/sample.json
app.post('/api/cards', (req, res) => {
  const cards = req.body.cards;
  if (!Array.isArray(cards)) return res.status(400).json({ error: 'cards array required' });
  fs.writeFileSync(path.join(ENHANCED_DIR, 'sample.json'), JSON.stringify(cards, null, 2));
  res.json({ saved: cards.length });
});

// POST /api/preview — preview a single card's CSV row without saving
app.post('/api/preview', (req, res) => {
  const card = req.body.card;
  if (!card) return res.status(400).json({ error: 'card required' });
  const row = buildRow(card, 0);
  if (!row) return res.json({ error: 'Invalid card: missing required fields' });
  res.json({ row, headers: HEADERS });
});

// POST /api/generate-csv — run the full pipeline and return CSV
app.post('/api/generate-csv', (req, res) => {
  try {
    const cards = req.body.cards;
    if (Array.isArray(cards) && cards.length > 0) {
      fs.writeFileSync(path.join(ENHANCED_DIR, 'sample.json'), JSON.stringify(cards, null, 2));
    }
    // Run the CSV builder
    const files = fs.readdirSync(ENHANCED_DIR).filter(f => f.endsWith('.json'));
    const lines = [HEADERS.map(h => `"${h}"`).join(',')];
    let written = 0, skipped = 0;
    files.forEach((f, i) => {
      const data = JSON.parse(fs.readFileSync(path.join(ENHANCED_DIR, f), 'utf8'));
      (Array.isArray(data) ? data : [data]).forEach((c, j) => {
        const row = buildRow(c, `${i}-${j}`);
        if (row) { lines.push(row); written++; } else skipped++;
      });
    });
    const csv = lines.join('\n');
    const csvPath = path.join(LISTINGS_DIR, 'eBay_bulk_upload.csv');
    fs.writeFileSync(csvPath, csv);
    res.json({ csv, written, skipped, path: csvPath });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/csv — get the current CSV
app.get('/api/csv', (req, res) => {
  const csvPath = path.join(LISTINGS_DIR, 'eBay_bulk_upload.csv');
  if (!fs.existsSync(csvPath)) return res.json({ csv: '' });
  const csv = fs.readFileSync(csvPath, 'utf8');
  res.json({ csv });
});

// GET /api/download-csv — download the CSV file
app.get('/api/download-csv', (req, res) => {
  const csvPath = path.join(LISTINGS_DIR, 'eBay_bulk_upload.csv');
  if (!fs.existsSync(csvPath)) return res.status(404).send('No CSV generated yet');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="eBay_bulk_upload.csv"');
  res.sendFile(csvPath);
});

app.listen(PORT, () => {
  console.log(`Card Suite API running on http://localhost:${PORT}`);
});
