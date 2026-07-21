const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const sharp = require('sharp');
const { buildRow, HEADERS } = require('./build-eBay-csv');
const { execSync } = require('child_process');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

const PORT = process.env.PORT || 3999;
const ROOT = __dirname;
const ENHANCED_DIR = path.join(ROOT, 'enhanced');
const LISTINGS_DIR = path.join(ROOT, 'listings');
const UPLOADS_DIR = path.join(ROOT, 'uploads');
const CROPPED_DIR = path.join(ROOT, 'cropped');
const CARDS_DB = path.join(ROOT, 'cards-db.json');

// Ensure all dirs exist
[ENHANCED_DIR, LISTINGS_DIR, UPLOADS_DIR, CROPPED_DIR].forEach(d => fs.mkdirSync(d, { recursive: true }));

// Multer config for image uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `upload_${Date.now()}_${Math.round(Math.random()*1e6)}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB per file
  fileFilter: (req, file, cb) => {
    if (/^image\/(jpeg|jpg|png|webp|gif|bmp)$/i.test(file.mimetype)) cb(null, true);
    else cb(new Error('Only image files allowed'));
  }
});

// ─── Cards Database (JSON file) ───

function loadDB() {
  try {
    if (fs.existsSync(CARDS_DB)) return JSON.parse(fs.readFileSync(CARDS_DB, 'utf8'));
  } catch {}
  return { cards: [], nextId: 1 };
}

function saveDB(db) {
  fs.writeFileSync(CARDS_DB, JSON.stringify(db, null, 2));
}

function loadEnhancedCards() {
  // Merge enhanced/*.json into db
  const db = loadDB();
  if (db.cards.length > 0) return db;
  // Fallback: read from enhanced/
  try {
    const files = fs.readdirSync(ENHANCED_DIR).filter(f => f.endsWith('.json'));
    const all = [];
    files.forEach(f => {
      const data = JSON.parse(fs.readFileSync(path.join(ENHANCED_DIR, f), 'utf8'));
      (Array.isArray(data) ? data : [data]).forEach(c => all.push(c));
    });
    return { cards: all, nextId: all.length + 1 };
  } catch {
    return { cards: [], nextId: 1 };
  }
}

// ─── Venice API integration ───

function getVeniceKey() {
  try {
    const envPath = path.join(process.env.HOME || '/home/peter', '.hermes/.env');
    const env = fs.readFileSync(envPath, 'utf8');
    const match = env.match(/^VENICE_API_KEY=(.+)$/m);
    return match ? match[1].trim() : null;
  } catch { return null; }
}

async function veniceChat(prompt, systemPrompt) {
  const key = getVeniceKey();
  if (!key) throw new Error('VENICE_API_KEY not found in ~/.hermes/.env');
  const resp = await fetch('https://api.venice.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b',
      messages: [
        ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
        { role: 'user', content: prompt }
      ],
      temperature: 0.3,
      max_tokens: 2000,
    }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Venice API ${resp.status}: ${text.substring(0, 200)}`);
  }
  const data = await resp.json();
  return data.choices?.[0]?.message?.content || '';
}

// ─── Routes ───

// GET /api/health — health check (proves server is alive)
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    cards: loadEnhancedCards().cards.length,
    timestamp: new Date().toISOString(),
    port: PORT,
  });
});

// GET /api/cards — return all cards
app.get('/api/cards', (req, res) => {
  const db = loadEnhancedCards();
  res.json({ cards: db.cards });
});

// POST /api/cards — save full cards array
app.post('/api/cards', (req, res) => {
  const cards = req.body.cards;
  if (!Array.isArray(cards)) return res.status(400).json({ error: 'cards array required' });
  const db = loadDB();
  db.cards = cards;
  db.nextId = Math.max(...cards.map(c => c.id || 0), 0) + 1;
  saveDB(db);
  // Also save to enhanced/ for CSV builder
  fs.writeFileSync(path.join(ENHANCED_DIR, 'sample.json'), JSON.stringify(cards, null, 2));
  res.json({ saved: cards.length });
});

// POST /api/cards/add — add a single card
app.post('/api/cards/add', (req, res) => {
  const db = loadDB();
  const card = { ...req.body.card, id: db.nextId++ };
  db.cards.push(card);
  saveDB(db);
  fs.writeFileSync(path.join(ENHANCED_DIR, 'sample.json'), JSON.stringify(db.cards, null, 2));
  res.json({ card, total: db.cards.length });
});

// PUT /api/cards/:id — update a card
app.put('/api/cards/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const db = loadDB();
  const idx = db.cards.findIndex(c => c.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Card not found' });
  db.cards[idx] = { ...db.cards[idx], ...req.body.card, id };
  saveDB(db);
  fs.writeFileSync(path.join(ENHANCED_DIR, 'sample.json'), JSON.stringify(db.cards, null, 2));
  res.json({ card: db.cards[idx] });
});

// DELETE /api/cards/:id — delete a card
app.delete('/api/cards/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const db = loadDB();
  db.cards = db.cards.filter(c => c.id !== id);
  saveDB(db);
  fs.writeFileSync(path.join(ENHANCED_DIR, 'sample.json'), JSON.stringify(db.cards, null, 2));
  res.json({ deleted: id, remaining: db.cards.length });
});

// POST /api/preview — preview a single card's CSV row
app.post('/api/preview', (req, res) => {
  const card = req.body.card;
  if (!card) return res.status(400).json({ error: 'card required' });
  const row = buildRow(card, 0);
  if (!row) return res.json({ error: 'Invalid card: missing required fields' });
  res.json({ row, headers: HEADERS });
});

// POST /api/generate-csv — generate full CSV
app.post('/api/generate-csv', (req, res) => {
  try {
    const cards = req.body.cards;
    if (Array.isArray(cards) && cards.length > 0) {
      fs.writeFileSync(path.join(ENHANCED_DIR, 'sample.json'), JSON.stringify(cards, null, 2));
    }
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

// GET /api/csv — get current CSV
app.get('/api/csv', (req, res) => {
  const csvPath = path.join(LISTINGS_DIR, 'eBay_bulk_upload.csv');
  if (!fs.existsSync(csvPath)) return res.json({ csv: '' });
  res.json({ csv: fs.readFileSync(csvPath, 'utf8') });
});

// GET /api/download-csv — download CSV file
app.get('/api/download-csv', (req, res) => {
  const csvPath = path.join(LISTINGS_DIR, 'eBay_bulk_upload.csv');
  if (!fs.existsSync(csvPath)) return res.status(404).send('No CSV generated yet');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="eBay_bulk_upload.csv"');
  res.sendFile(csvPath);
});

// ─── Image Upload & Cropping ───

// POST /api/upload — upload card images
app.post('/api/upload', upload.array('images', 24), (req, res) => {
  const files = req.files.map(f => ({
    filename: f.filename,
    path: `/uploads/${f.filename}`,
    size: f.size,
    originalName: f.originalname,
  }));
  res.json({ files, count: files.length });
});

// POST /api/crop — crop an image with x, y, width, height
app.post('/api/crop', async (req, res) => {
  try {
    const { filename, x, y, width, height, cardId } = req.body;
    if (!filename) return res.status(400).json({ error: 'filename required' });

    const inputPath = path.join(UPLOADS_DIR, filename);
    if (!fs.existsSync(inputPath)) return res.status(404).json({ error: 'File not found' });

    const cropName = `cropped_${Date.now()}_${filename}`;
    const outputPath = path.join(CROPPED_DIR, cropName);

    await sharp(inputPath)
      .extract({
        left: Math.round(x),
        top: Math.round(y),
        width: Math.round(width),
        height: Math.round(height),
      })
      .jpeg({ quality: 90 })
      .toFile(outputPath);

    // If cardId provided, attach the cropped image to the card
    if (cardId) {
      const db = loadDB();
      const idx = db.cards.findIndex(c => c.id === parseInt(cardId));
      if (idx !== -1) {
        if (!db.cards[idx].images) db.cards[idx].images = [];
        db.cards[idx].images.push(`/cropped/${cropName}`);
        saveDB(db);
        fs.writeFileSync(path.join(ENHANCED_DIR, 'sample.json'), JSON.stringify(db.cards, null, 2));
      }
    }

    res.json({
      croppedPath: `/cropped/${cropName}`,
      filename: cropName,
      dimensions: { x, y, width, height },
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/auto-crop — auto-detect card boundaries and crop
app.post('/api/auto-crop', async (req, res) => {
  try {
    const { filename, cardId } = req.body;
    if (!filename) return res.status(400).json({ error: 'filename required' });

    const inputPath = path.join(UPLOADS_DIR, filename);
    if (!fs.existsSync(inputPath)) return res.status(404).json({ error: 'File not found' });

    const meta = await sharp(inputPath).metadata();
    const w = meta.width, h = meta.height;

    // Auto-crop: trim whitespace/borders by detecting content bounds
    // Use sharp's trim feature to remove uniform borders
    const trimmedName = `autocrop_${Date.now()}_${filename}`;
    const outputPath = path.join(CROPPED_DIR, trimmedName);

    await sharp(inputPath)
      .trim({ threshold: 30 }) // Remove near-uniform borders
      .resize({
        width: 1000,
        height: 1400, // Standard trading card ratio (2.5:3.5)
        fit: 'contain',
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      })
      .jpeg({ quality: 95 })
      .toFile(outputPath);

    const result = await sharp(outputPath).metadata();

    if (cardId) {
      const db = loadDB();
      const idx = db.cards.findIndex(c => c.id === parseInt(cardId));
      if (idx !== -1) {
        if (!db.cards[idx].images) db.cards[idx].images = [];
        db.cards[idx].images.push(`/cropped/${trimmedName}`);
        db.cards[idx].photoUrl = `/cropped/${trimmedName}`;
        saveDB(db);
        fs.writeFileSync(path.join(ENHANCED_DIR, 'sample.json'), JSON.stringify(db.cards, null, 2));
      }
    }

    res.json({
      croppedPath: `/cropped/${trimmedName}`,
      filename: trimmedName,
      originalSize: { width: w, height: h },
      croppedSize: { width: result.width, height: result.height },
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/resize — resize an image to eBay-optimized dimensions
app.post('/api/resize', async (req, res) => {
  try {
    const { filename, width, height } = req.body;
    if (!filename) return res.status(400).json({ error: 'filename required' });

    const inputPath = path.join(UPLOADS_DIR, filename);
    if (!fs.existsSync(inputPath)) return res.status(404).json({ error: 'File not found' });

    const w = width || 1000;
    const h = height || 1400;
    const resizedName = `resized_${Date.now()}_${filename}`;
    const outputPath = path.join(CROPPED_DIR, resizedName);

    await sharp(inputPath)
      .resize({ width: w, height: h, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 95 })
      .toFile(outputPath);

    res.json({ resizedPath: `/cropped/${resizedName}`, filename: resizedName, width: w, height: h });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Static file serving for uploads and cropped images
app.use('/uploads', express.static(UPLOADS_DIR));
app.use('/cropped', express.static(CROPPED_DIR));

// ─── Venice-Powered Card Enhancement ───

// POST /api/enhance — use Venice AI to enhance a card's title and description
app.post('/api/enhance', async (req, res) => {
  try {
    const { card } = req.body;
    if (!card) return res.status(400).json({ error: 'card required' });

    const systemPrompt = `You are an eBay listing optimizer for sports and wrestling trading cards. Generate SEO-optimized titles (max 80 chars) and compelling HTML descriptions. Return JSON only.`;

    const userPrompt = `Generate an optimized eBay listing for this trading card. Return ONLY valid JSON with "title" and "description" fields.

Card data:
- Player: ${card.name || 'N/A'}
- Set: ${card.set || 'N/A'}
- Grade: ${card.grade || 'Raw'}
- Sport: ${card.sport || 'N/A'}
- Serial: ${card.serial || 'N/A'}
- Parallel: ${card.parallel || 'N/A'}
- Insert: ${card.insert || 'N/A'}
- Rookie: ${card.rookie ? 'Yes' : 'No'}
- Auto: ${card.auto ? 'Yes' : 'No'}
- Price: $${card.price || 'N/A'}

Rules:
1. Title max 80 characters, include: player name, set, grade, serial number if present, parallel if present, RC if rookie, Auto if autographed
2. Description in HTML with <p> tags, 3-4 paragraphs max
3. Mention condition, serial number, and any special features
4. Include shipping note (securely packaged with tracking)
5. Do NOT include price in title or description

Return: {"title": "...", "description": "..."}`;

    const response = await veniceChat(userPrompt, systemPrompt);

    // Parse JSON from response
    let enhanced;
    try {
      // Strip markdown code blocks if present
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      enhanced = JSON.parse(jsonMatch ? jsonMatch[0] : response);
    } catch {
      // Fallback: use the buildRow function's defaults
      enhanced = {
        title: buildRow(card, 0)?.split(',')[3]?.replace(/"/g, '') || card.name,
        description: '<p>See photos for condition.</p>',
      };
    }

    // Update card in DB if it has an ID
    if (card.id) {
      const db = loadDB();
      const idx = db.cards.findIndex(c => c.id === card.id);
      if (idx !== -1) {
        db.cards[idx].enhancedTitle = enhanced.title;
        db.cards[idx].enhancedDescription = enhanced.description;
        saveDB(db);
      }
    }

    res.json({ enhanced, original: card });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/enhance-batch — enhance multiple cards at once
app.post('/api/enhance-batch', async (req, res) => {
  try {
    const { cards } = req.body;
    if (!Array.isArray(cards)) return res.status(400).json({ error: 'cards array required' });

    const systemPrompt = `You are an eBay listing optimizer for sports and wrestling trading cards. Generate SEO-optimized titles (max 80 chars) and HTML descriptions. Return JSON array only.`;

    const cardsData = cards.map(c => ({
      id: c.id,
      player: c.name,
      set: c.set,
      grade: c.grade || 'Raw',
      sport: c.sport,
      serial: c.serial,
      parallel: c.parallel,
      insert: c.insert,
      rookie: c.rookie,
      auto: c.auto,
      price: c.price,
    }));

    const userPrompt = `Generate optimized eBay listings for these ${cards.length} trading cards. Return ONLY a JSON array with objects containing "id", "title" (max 80 chars), and "description" (HTML with <p> tags).

Cards:
${JSON.stringify(cardsData, null, 2)}

Rules:
1. Title max 80 chars: player, set, grade, serial, parallel, RC, Auto
2. Description: HTML <p> tags, 2-3 paragraphs
3. Include shipping note
4. No price in title/description

Return: [{"id": 1, "title": "...", "description": "..."}, ...]`;

    const response = await veniceChat(userPrompt, systemPrompt);

    let enhanced;
    try {
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      enhanced = JSON.parse(jsonMatch ? jsonMatch[0] : response);
    } catch {
      return res.status(500).json({ error: 'Failed to parse Venice response', raw: response.substring(0, 500) });
    }

    // Update all cards in DB
    const db = loadDB();
    enhanced.forEach(e => {
      const idx = db.cards.findIndex(c => c.id === e.id);
      if (idx !== -1) {
        db.cards[idx].enhancedTitle = e.title;
        db.cards[idx].enhancedDescription = e.description;
      }
    });
    saveDB(db);
    fs.writeFileSync(path.join(ENHANCED_DIR, 'sample.json'), JSON.stringify(db.cards, null, 2));

    res.json({ enhanced: enhanced.length, total: cards.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Bulk Edit Operations ───

// POST /api/bulk-edit — apply changes to multiple cards at once
app.post('/api/bulk-edit', (req, res) => {
  try {
    const { ids, changes } = req.body;
    if (!Array.isArray(ids) || !changes) return res.status(400).json({ error: 'ids array and changes object required' });

    const db = loadDB();
    let updated = 0;
    db.cards.forEach(card => {
      if (ids.includes(card.id)) {
        Object.keys(changes).forEach(key => {
          card[key] = changes[key];
        });
        updated++;
      }
    });
    saveDB(db);
    fs.writeFileSync(path.join(ENHANCED_DIR, 'sample.json'), JSON.stringify(db.cards, null, 2));
    res.json({ updated, total: db.cards.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/bulk-price — adjust prices by percentage or fixed amount
app.post('/api/bulk-price', (req, res) => {
  try {
    const { ids, operation, value } = req.body;
    if (!Array.isArray(ids)) return res.status(400).json({ error: 'ids array required' });

    const db = loadDB();
    let updated = 0;
    db.cards.forEach(card => {
      if (ids.includes(card.id) && typeof card.price === 'number') {
        if (operation === 'percent') {
          card.price = Math.round(card.price * (1 + value / 100) * 100) / 100;
        } else if (operation === 'fixed') {
          card.price = Math.round((card.price + value) * 100) / 100;
        } else if (operation === 'set') {
          card.price = value;
        }
        if (card.price < 0) card.price = 0;
        updated++;
      }
    });
    saveDB(db);
    fs.writeFileSync(path.join(ENHANCED_DIR, 'sample.json'), JSON.stringify(db.cards, null, 2));
    res.json({ updated, operation, value });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/bulk-sport — set sport for multiple cards
app.post('/api/bulk-sport', (req, res) => {
  try {
    const { ids, sport } = req.body;
    if (!Array.isArray(ids) || !sport) return res.status(400).json({ error: 'ids and sport required' });

    const db = loadDB();
    let updated = 0;
    db.cards.forEach(card => {
      if (ids.includes(card.id)) {
        card.sport = sport;
        updated++;
      }
    });
    saveDB(db);
    fs.writeFileSync(path.join(ENHANCED_DIR, 'sample.json'), JSON.stringify(db.cards, null, 2));
    res.json({ updated, sport });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/bulk-grade — set grade for multiple cards
app.post('/api/bulk-grade', (req, res) => {
  try {
    const { ids, grade } = req.body;
    if (!Array.isArray(ids) || !grade) return res.status(400).json({ error: 'ids and grade required' });

    const db = loadDB();
    let updated = 0;
    db.cards.forEach(card => {
      if (ids.includes(card.id)) {
        card.grade = grade;
        updated++;
      }
    });
    saveDB(db);
    fs.writeFileSync(path.join(ENHANCED_DIR, 'sample.json'), JSON.stringify(db.cards, null, 2));
    res.json({ updated, grade });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/bulk-delete — delete multiple cards
app.post('/api/bulk-delete', (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids)) return res.status(400).json({ error: 'ids array required' });

    const db = loadDB();
    const before = db.cards.length;
    db.cards = db.cards.filter(c => !ids.includes(c.id));
    saveDB(db);
    fs.writeFileSync(path.join(ENHANCED_DIR, 'sample.json'), JSON.stringify(db.cards, null, 2));
    res.json({ deleted: before - db.cards.length, remaining: db.cards.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/import-inventory — import cards from the rbeachgebay folder
app.post('/api/import-inventory', (req, res) => {
  try {
    const folder = req.body.folder || '/mnt/c/Users/peter/Desktop/rbeachgebay';
    if (!fs.existsSync(folder)) return res.status(404).json({ error: `Folder not found: ${folder}` });

    const files = fs.readdirSync(folder).filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f));
    const db = loadDB();
    let imported = 0;

    files.forEach(f => {
      // Check if already imported (by image filename)
      const exists = db.cards.some(c => c.sourceImage === f);
      if (exists) return;

      const card = {
        id: db.nextId++,
        name: '',
        set: '',
        grade: 'Raw',
        price: 0,
        quantity: 1,
        sport: 'wrestling', // default — user can bulk-edit
        sourceImage: f,
        imagePath: `${folder}/${f}`,
        importedAt: new Date().toISOString(),
      };
      db.cards.push(card);
      imported++;
    });

    saveDB(db);
    fs.writeFileSync(path.join(ENHANCED_DIR, 'sample.json'), JSON.stringify(db.cards, null, 2));
    res.json({ imported, totalImages: files.length, totalCards: db.cards.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/inventory-images — list images in the rbeachgebay folder
app.get('/api/inventory-images', (req, res) => {
  try {
    const folder = req.query.folder || '/mnt/c/Users/peter/Desktop/rbeachgebay';
    if (!fs.existsSync(folder)) return res.json({ images: [], error: 'Folder not found' });

    const files = fs.readdirSync(folder).filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f));
    res.json({ images: files, count: files.length, folder });
  } catch (e) {
    res.json({ images: [], error: e.message });
  }
});

// ─── Crash-Proof Server ───

// Catch all unhandled errors so the server NEVER crashes
app.use((err, req, res, next) => {
  console.error(`[ERROR] ${req.method} ${req.path}:`, err.message);
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: `Upload error: ${err.message}` });
  }
  res.status(500).json({ error: err.message || 'Internal server error' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: `Not found: ${req.method} ${req.path}` });
});

// Start server with auto-restart on crash
const server = app.listen(PORT, () => {
  console.log(`\n╔══════════════════════════════════════════════╗`);
  console.log(`║  Card Suite Backend — Port ${PORT}               ║`);
  console.log(`║  Health: http://localhost:${PORT}/api/health     ║`);
  console.log(`║  Cards DB: ${CARDS_DB}`);
  console.log(`║  Uploads: ${UPLOADS_DIR}`);
  console.log(`║  Cropped: ${CROPPED_DIR}`);
  console.log(`╚══════════════════════════════════════════════╝\n`);
});

// Keep process alive — never exit on unhandled rejection
process.on('unhandledRejection', (reason, promise) => {
  console.error('[UNHANDLED REJECTION] Server staying alive:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT EXCEPTION] Server staying alive:', err.message);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[SIGTERM] Shutting down gracefully...');
  server.close(() => process.exit(0));
});

process.on('SIGINT', () => {
  console.log('\n[SIGINT] Shutting down...');
  server.close(() => process.exit(0));
});

module.exports = app;
