const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const sharp = require('sharp');
const { buildRow, HEADERS } = require('./build-eBay-csv');
const { Readable } = require('stream');

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

[ENHANCED_DIR, LISTINGS_DIR, UPLOADS_DIR, CROPPED_DIR].forEach(d => fs.mkdirSync(d, { recursive: true }));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `upload_${Date.now()}_${Math.round(Math.random()*1e6)}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^image\/(jpeg|jpg|png|webp|gif|bmp)$/i.test(file.mimetype)) cb(null, true);
    else cb(new Error('Only image files allowed'));
  }
});

// ─── Venice API Helpers ───

const VENICE_BASE = 'https://api.venice.ai/api/v1';

function getVeniceKey() {
  if (process.env.VENICE_API_KEY) return process.env.VENICE_API_KEY;
  try {
    const envPath = path.join(process.env.HOME || '/home/peter', '.hermes/.env');
    const env = fs.readFileSync(envPath, 'utf8');
    const match = env.match(/^VENICE_API_KEY=(.+)$/m);
    return match ? match[1].trim() : null;
  } catch { return null; }
}

function veniceHeaders(extra = {}) {
  const key = getVeniceKey();
  if (!key) throw new Error('VENICE_API_KEY not found');
  return {
    'Authorization': `Bearer ${key}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

// ─── Cards Database ───

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
  const db = loadDB();
  if (db.cards.length > 0) return db;
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

function syncCardsToFile(db) {
  fs.writeFileSync(path.join(ENHANCED_DIR, 'sample.json'), JSON.stringify(db.cards, null, 2));
}

// ─── Health & Cards CRUD ───

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    cards: loadEnhancedCards().cards.length,
    timestamp: new Date().toISOString(),
    port: PORT,
    venice: !!getVeniceKey(),
  });
});

app.get('/api/cards', (req, res) => {
  res.json({ cards: loadEnhancedCards().cards });
});

app.post('/api/cards', (req, res) => {
  const cards = req.body.cards;
  if (!Array.isArray(cards)) return res.status(400).json({ error: 'cards array required' });
  const db = loadDB();
  db.cards = cards;
  db.nextId = Math.max(...cards.map(c => c.id || 0), 0) + 1;
  saveDB(db);
  syncCardsToFile(db);
  res.json({ saved: cards.length });
});

app.post('/api/cards/add', (req, res) => {
  const db = loadDB();
  const card = { ...req.body.card, id: db.nextId++ };
  db.cards.push(card);
  saveDB(db);
  syncCardsToFile(db);
  res.json({ card, total: db.cards.length });
});

app.put('/api/cards/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const db = loadDB();
  const idx = db.cards.findIndex(c => c.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Card not found' });
  db.cards[idx] = { ...db.cards[idx], ...req.body.card, id };
  saveDB(db);
  syncCardsToFile(db);
  res.json({ card: db.cards[idx] });
});

app.delete('/api/cards/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const db = loadDB();
  db.cards = db.cards.filter(c => c.id !== id);
  saveDB(db);
  syncCardsToFile(db);
  res.json({ deleted: id, remaining: db.cards.length });
});

app.post('/api/preview', (req, res) => {
  const card = req.body.card;
  if (!card) return res.status(400).json({ error: 'card required' });
  const row = buildRow(card, 0);
  if (!row) return res.json({ error: 'Invalid card: missing required fields' });
  res.json({ row, headers: HEADERS });
});

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

app.get('/api/csv', (req, res) => {
  const csvPath = path.join(LISTINGS_DIR, 'eBay_bulk_upload.csv');
  if (!fs.existsSync(csvPath)) return res.json({ csv: '' });
  res.json({ csv: fs.readFileSync(csvPath, 'utf8') });
});

app.get('/api/download-csv', (req, res) => {
  const csvPath = path.join(LISTINGS_DIR, 'eBay_bulk_upload.csv');
  if (!fs.existsSync(csvPath)) return res.status(404).send('No CSV generated yet');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="eBay_bulk_upload.csv"');
  res.sendFile(csvPath);
});

// ─── Image Upload & Cropping ───

app.post('/api/upload', upload.array('images', 24), (req, res) => {
  const files = req.files.map(f => ({
    filename: f.filename,
    path: `/uploads/${f.filename}`,
    size: f.size,
    originalName: f.originalname,
  }));
  res.json({ files, count: files.length });
});

app.post('/api/crop', async (req, res) => {
  try {
    const { filename, x, y, width, height, cardId } = req.body;
    if (!filename) return res.status(400).json({ error: 'filename required' });
    const inputPath = path.join(UPLOADS_DIR, filename);
    if (!fs.existsSync(inputPath)) return res.status(404).json({ error: 'File not found' });
    const cropName = `cropped_${Date.now()}_${filename}`;
    const outputPath = path.join(CROPPED_DIR, cropName);
    await sharp(inputPath).extract({ left: Math.round(x), top: Math.round(y), width: Math.round(width), height: Math.round(height) }).jpeg({ quality: 90 }).toFile(outputPath);
    if (cardId) {
      const db = loadDB();
      const idx = db.cards.findIndex(c => c.id === parseInt(cardId));
      if (idx !== -1) {
        if (!db.cards[idx].images) db.cards[idx].images = [];
        db.cards[idx].images.push(`/cropped/${cropName}`);
        saveDB(db); syncCardsToFile(db);
      }
    }
    res.json({ croppedPath: `/cropped/${cropName}`, filename: cropName, dimensions: { x, y, width, height } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/auto-crop', async (req, res) => {
  try {
    const { filename, cardId } = req.body;
    if (!filename) return res.status(400).json({ error: 'filename required' });
    const inputPath = path.join(UPLOADS_DIR, filename);
    if (!fs.existsSync(inputPath)) return res.status(404).json({ error: 'File not found' });
    const meta = await sharp(inputPath).metadata();
    const w = meta.width, h = meta.height;
    const trimmedName = `autocrop_${Date.now()}_${filename}`;
    const outputPath = path.join(CROPPED_DIR, trimmedName);
    await sharp(inputPath).trim({ threshold: 30 }).resize({ width: 1000, height: 1400, fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } }).jpeg({ quality: 95 }).toFile(outputPath);
    const result = await sharp(outputPath).metadata();
    if (cardId) {
      const db = loadDB();
      const idx = db.cards.findIndex(c => c.id === parseInt(cardId));
      if (idx !== -1) {
        if (!db.cards[idx].images) db.cards[idx].images = [];
        db.cards[idx].images.push(`/cropped/${trimmedName}`);
        db.cards[idx].photoUrl = `/cropped/${trimmedName}`;
        saveDB(db); syncCardsToFile(db);
      }
    }
    res.json({ croppedPath: `/cropped/${trimmedName}`, filename: trimmedName, originalSize: { width: w, height: h }, croppedSize: { width: result.width, height: result.height } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/resize', async (req, res) => {
  try {
    const { filename, width, height } = req.body;
    if (!filename) return res.status(400).json({ error: 'filename required' });
    const inputPath = path.join(UPLOADS_DIR, filename);
    if (!fs.existsSync(inputPath)) return res.status(404).json({ error: 'File not found' });
    const w = width || 1000, h = height || 1400;
    const resizedName = `resized_${Date.now()}_${filename}`;
    const outputPath = path.join(CROPPED_DIR, resizedName);
    await sharp(inputPath).resize({ width: w, height: h, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 95 }).toFile(outputPath);
    res.json({ resizedPath: `/cropped/${resizedName}`, filename: resizedName, width: w, height: h });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.use('/uploads', express.static(UPLOADS_DIR));
app.use('/cropped', express.static(CROPPED_DIR));

// ─── Venice AI Enhancement ───

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
    const resp = await fetch(`${VENICE_BASE}/chat/completions`, {
      method: 'POST',
      headers: veniceHeaders(),
      body: JSON.stringify({ model: 'llama-3.3-70b', messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }], temperature: 0.3, max_tokens: 2000 }),
    });
    if (!resp.ok) { const t = await resp.text(); return res.status(resp.status).json({ error: `Venice API ${resp.status}: ${t.substring(0, 200)}` }); }
    const data = await resp.json();
    const content = data.choices?.[0]?.message?.content || '';
    let enhanced;
    try { const m = content.match(/\{[\s\S]*\}/); enhanced = JSON.parse(m ? m[0] : content); }
    catch { enhanced = { title: card.name || 'Untitled', description: '<p>See photos for condition.</p>' }; }
    if (card.id) {
      const db = loadDB();
      const idx = db.cards.findIndex(c => c.id === card.id);
      if (idx !== -1) { db.cards[idx].enhancedTitle = enhanced.title; db.cards[idx].enhancedDescription = enhanced.description; saveDB(db); }
    }
    res.json({ enhanced, original: card });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/enhance-batch', async (req, res) => {
  try {
    const { cards } = req.body;
    if (!Array.isArray(cards)) return res.status(400).json({ error: 'cards array required' });
    const systemPrompt = `You are an eBay listing optimizer for sports and wrestling trading cards. Generate SEO-optimized titles (max 80 chars) and HTML descriptions. Return JSON array only.`;
    const cardsData = cards.map(c => ({ id: c.id, player: c.name, set: c.set, grade: c.grade || 'Raw', sport: c.sport, serial: c.serial, parallel: c.parallel, insert: c.insert, rookie: c.rookie, auto: c.auto, price: c.price }));
    const userPrompt = `Generate optimized eBay listings for these ${cards.length} trading cards. Return ONLY a JSON array with objects containing "id", "title" (max 80 chars), and "description" (HTML with <p> tags).

Cards:
${JSON.stringify(cardsData, null, 2)}

Rules:
1. Title max 80 chars: player, set, grade, serial, parallel, RC, Auto
2. Description: HTML <p> tags, 2-3 paragraphs
3. Include shipping note
4. No price in title/description

Return: [{"id": 1, "title": "...", "description": "..."}, ...]`;
    const resp = await fetch(`${VENICE_BASE}/chat/completions`, {
      method: 'POST',
      headers: veniceHeaders(),
      body: JSON.stringify({ model: 'llama-3.3-70b', messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }], temperature: 0.3, max_tokens: 4000 }),
    });
    if (!resp.ok) { const t = await resp.text(); return res.status(resp.status).json({ error: `Venice API ${resp.status}: ${t.substring(0, 200)}` }); }
    const data = await resp.json();
    const content = data.choices?.[0]?.message?.content || '';
    let enhanced;
    try { const m = content.match(/\[[\s\S]*\]/); enhanced = JSON.parse(m ? m[0] : content); }
    catch { return res.status(500).json({ error: 'Failed to parse Venice response', raw: content.substring(0, 500) }); }
    const db = loadDB();
    enhanced.forEach(e => { const idx = db.cards.findIndex(c => c.id === e.id); if (idx !== -1) { db.cards[idx].enhancedTitle = e.title; db.cards[idx].enhancedDescription = e.description; } });
    saveDB(db); syncCardsToFile(db);
    res.json({ enhanced: enhanced.length, total: cards.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Bulk Edit ───

app.post('/api/bulk-edit', (req, res) => {
  try {
    const { ids, changes } = req.body;
    if (!Array.isArray(ids) || !changes) return res.status(400).json({ error: 'ids array and changes object required' });
    const db = loadDB();
    let updated = 0;
    db.cards.forEach(card => { if (ids.includes(card.id)) { Object.keys(changes).forEach(key => { card[key] = changes[key]; }); updated++; } });
    saveDB(db); syncCardsToFile(db);
    res.json({ updated, total: db.cards.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/bulk-price', (req, res) => {
  try {
    const { ids, operation, value } = req.body;
    if (!Array.isArray(ids)) return res.status(400).json({ error: 'ids array required' });
    const db = loadDB();
    let updated = 0;
    db.cards.forEach(card => {
      if (ids.includes(card.id) && typeof card.price === 'number') {
        if (operation === 'percent') card.price = Math.round(card.price * (1 + value / 100) * 100) / 100;
        else if (operation === 'fixed') card.price = Math.round((card.price + value) * 100) / 100;
        else if (operation === 'set') card.price = value;
        if (card.price < 0) card.price = 0;
        updated++;
      }
    });
    saveDB(db); syncCardsToFile(db);
    res.json({ updated, operation, value });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/bulk-sport', (req, res) => {
  try {
    const { ids, sport } = req.body;
    if (!Array.isArray(ids) || !sport) return res.status(400).json({ error: 'ids and sport required' });
    const db = loadDB();
    let updated = 0;
    db.cards.forEach(card => { if (ids.includes(card.id)) { card.sport = sport; updated++; } });
    saveDB(db); syncCardsToFile(db);
    res.json({ updated, sport });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/bulk-grade', (req, res) => {
  try {
    const { ids, grade } = req.body;
    if (!Array.isArray(ids) || !grade) return res.status(400).json({ error: 'ids and grade required' });
    const db = loadDB();
    let updated = 0;
    db.cards.forEach(card => { if (ids.includes(card.id)) { card.grade = grade; updated++; } });
    saveDB(db); syncCardsToFile(db);
    res.json({ updated, grade });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/bulk-delete', (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids)) return res.status(400).json({ error: 'ids array required' });
    const db = loadDB();
    const before = db.cards.length;
    db.cards = db.cards.filter(c => !ids.includes(c.id));
    saveDB(db); syncCardsToFile(db);
    res.json({ deleted: before - db.cards.length, remaining: db.cards.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/import-inventory', (req, res) => {
  try {
    const folder = req.body.folder || '/mnt/c/Users/peter/Desktop/rbeachgebay';
    if (!fs.existsSync(folder)) return res.status(404).json({ error: `Folder not found: ${folder}` });
    const files = fs.readdirSync(folder).filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f));
    const db = loadDB();
    let imported = 0;
    files.forEach(f => {
      const exists = db.cards.some(c => c.sourceImage === f);
      if (exists) return;
      const card = { id: db.nextId++, name: '', set: '', grade: 'Raw', price: 0, quantity: 1, sport: 'wrestling', sourceImage: f, imagePath: `${folder}/${f}`, importedAt: new Date().toISOString() };
      db.cards.push(card);
      imported++;
    });
    saveDB(db); syncCardsToFile(db);
    res.json({ imported, totalImages: files.length, totalCards: db.cards.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/inventory-images', (req, res) => {
  try {
    const folder = req.query.folder || '/mnt/c/Users/peter/Desktop/rbeachgebay';
    if (!fs.existsSync(folder)) return res.json({ images: [], error: 'Folder not found' });
    const files = fs.readdirSync(folder).filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f));
    res.json({ images: files, count: files.length, folder });
  } catch (e) { res.json({ images: [], error: e.message }); }
});

// ─── Venice API Proxy Endpoints (for Kimi blueprint frontend) ───

// GET /api/status — Venice balance and rate limits
app.get('/api/status', async (req, res) => {
  try {
    const key = getVeniceKey();
    if (!key) return res.json({ ok: false, updatedAt: new Date().toISOString(), balanceUsd: null, balanceDiem: null, remainingRequests: null, limitRequests: null, remainingTokens: null, resetRequests: null, deprecationWarning: null, deprecationDate: null, modelId: null, modelName: null });
    const resp = await fetch(`${VENICE_BASE}/models`, { headers: { 'Authorization': `Bearer ${key}` } });
    const balanceRemaining = resp.headers.get('x-balance-remaining');
    const rateLimitRemaining = resp.headers.get('x-ratelimit-remaining-requests');
    const rateLimitLimit = resp.headers.get('x-ratelimit-limit-requests');
    const rateLimitTokens = resp.headers.get('x-ratelimit-remaining-tokens');
    const resetRequests = resp.headers.get('x-ratelimit-reset-requests');
    res.json({
      ok: resp.ok,
      updatedAt: new Date().toISOString(),
      balanceUsd: balanceRemaining,
      balanceDiem: null,
      remainingRequests: rateLimitRemaining,
      limitRequests: rateLimitLimit,
      remainingTokens: rateLimitTokens,
      resetRequests: resetRequests,
      deprecationWarning: null,
      deprecationDate: null,
      modelId: null,
      modelName: null,
    });
  } catch (e) {
    res.json({ ok: false, updatedAt: new Date().toISOString(), balanceUsd: null, balanceDiem: null, remainingRequests: null, limitRequests: null, remainingTokens: null, resetRequests: null, deprecationWarning: null, deprecationDate: null, modelId: null, modelName: null, error: e.message });
  }
});

// GET /api/models — Venice model catalog (proxy)
app.get('/api/models', async (req, res) => {
  try {
    const resp = await fetch(`${VENICE_BASE}/models`, { headers: veniceHeaders() });
    if (!resp.ok) { const t = await resp.text(); return res.status(resp.status).json({ error: t.substring(0, 500) }); }
    const data = await resp.json();
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/chat — SSE streaming chat via Venice
app.post('/api/chat', async (req, res) => {
  try {
    const { messages, model, stream } = req.body;
    const chatModel = model || 'llama-3.3-70b';
    const body = { model: chatModel, messages, stream: true, max_tokens: 2000, temperature: 0.7 };
    const resp = await fetch(`${VENICE_BASE}/chat/completions`, {
      method: 'POST',
      headers: veniceHeaders({ 'Accept': 'text/event-stream' }),
      body: JSON.stringify(body),
    });
    if (!resp.ok) { const t = await resp.text(); return res.status(resp.status).json({ error: t.substring(0, 500) }); }
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      res.write(chunk);
    }
    res.end();
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/ai/analyze — Vision analysis of card scans via Venice chat with vision
app.post('/api/ai/analyze', async (req, res) => {
  try {
    const { image, model } = req.body;
    if (!image) return res.status(400).json({ error: 'image (base64 or URL) required' });
    const analysisModel = model || 'llama-3.2-90b-vision';
    const prompt = `Analyze this trading card scan. Identify:
1. Material type (cardboard, chrome, refractor)
2. Orientation (horizontal, vertical)
3. Artifact types (scratches, dust, fingerprints, color cast, lighting issues)
4. Artifact locations (top, bottom, left, right, center, edges)
5. Color cast (if any)
6. Lighting issues (if any)
7. Card condition (intact or damaged)
8. Recommended cleanup approach
9. Confidence score (0-1)

Return as JSON: {"material":"...","orientation":"...","artifactTypes":[...],"artifactLocations":[...],"colorCast":"...","lightingIssues":[...],"cardConditionIntact":true,"recommendedApproach":"...","confidence":0.8}`;

    const messages = [{
      role: 'user',
      content: [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: image.startsWith('data:') ? image : `data:image/jpeg;base64,${image}` } },
      ],
    }];

    const resp = await fetch(`${VENICE_BASE}/chat/completions`, {
      method: 'POST',
      headers: veniceHeaders(),
      body: JSON.stringify({ model: analysisModel, messages, max_tokens: 1000, temperature: 0.2 }),
    });
    if (!resp.ok) { const t = await resp.text(); return res.status(resp.status).json({ error: t.substring(0, 500) }); }
    const data = await resp.json();
    const content = data.choices?.[0]?.message?.content || '{}';
    let result;
    try { const m = content.match(/\{[\s\S]*\}/); result = JSON.parse(m ? m[0] : content); }
    catch { result = { material: 'unknown', orientation: 'unknown', confidence: 0.5, recommendedApproach: content.substring(0, 200) }; }
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/ai/restore — Image restoration via Venice image edit
app.post('/api/ai/restore', async (req, res) => {
  try {
    const { image, prompt, model, strength } = req.body;
    if (!image) return res.status(400).json({ error: 'image required' });
    const restoreModel = model || 'flux-dev';
    const resp = await fetch(`${VENICE_BASE}/image/edit`, {
      method: 'POST',
      headers: veniceHeaders(),
      body: JSON.stringify({
        model: restoreModel,
        image,
        prompt: prompt || 'Clean up this trading card scan. Remove dust, scratches, fingerprints, and color cast. Preserve the card image and text.',
        strength: strength || 0.4,
        return_base64: true,
      }),
    });
    if (!resp.ok) { const t = await resp.text(); return res.status(resp.status).json({ error: t.substring(0, 500) }); }
    const data = await resp.json();
    res.json({ image: data.images?.[0] || data.data?.[0] || null, result: data });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/ai/scan-cleanup — Full scan cleanup pipeline (analyze + restore)
app.post('/api/ai/scan-cleanup', async (req, res) => {
  try {
    const { image, model, strength } = req.body;
    if (!image) return res.status(400).json({ error: 'image required' });

    // Step 1: Analyze
    const analysisResp = await fetch(`${VENICE_BASE}/chat/completions`, {
      method: 'POST',
      headers: veniceHeaders(),
      body: JSON.stringify({
        model: model || 'llama-3.2-90b-vision',
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: 'Analyze this trading card scan briefly. Return JSON: {"material":"cardboard|chrome|refractor","artifactTypes":[],"recommendedApproach":"...","confidence":0.8}' },
            { type: 'image_url', image_url: { url: image.startsWith('data:') ? image : `data:image/jpeg;base64,${image}` } },
          ],
        }],
        max_tokens: 500,
        temperature: 0.2,
      }),
    });
    let analysis = {};
    if (analysisResp.ok) {
      const aData = await analysisResp.json();
      const content = aData.choices?.[0]?.message?.content || '{}';
      try { const m = content.match(/\{[\s\S]*\}/); analysis = JSON.parse(m ? m[0] : content); } catch { analysis = { confidence: 0.5 }; }
    }

    // Step 2: Restore via image edit
    const restoreResp = await fetch(`${VENICE_BASE}/image/edit`, {
      method: 'POST',
      headers: veniceHeaders(),
      body: JSON.stringify({
        model: 'flux-dev',
        image,
        prompt: `Clean up this trading card scan. ${analysis.recommendedApproach || 'Remove dust, scratches, and color cast.'} Preserve the card image, text, and serial numbers.`,
        strength: strength || 0.35,
        return_base64: true,
      }),
    });

    let cleanedImage = null;
    if (restoreResp.ok) {
      const rData = await restoreResp.json();
      cleanedImage = rData.images?.[0] || rData.data?.[0] || null;
    }

    res.json({
      analysis,
      cleanedImage,
      success: !!cleanedImage,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/images/generate — Venice image generation
app.post('/api/images/generate', async (req, res) => {
  try {
    const { prompt, model, width, height, numImages } = req.body;
    const resp = await fetch(`${VENICE_BASE}/image/generate`, {
      method: 'POST',
      headers: veniceHeaders(),
      body: JSON.stringify({
        model: model || 'flux-dev',
        prompt: prompt || 'A clean trading card photo on white background',
        width: width || 1000,
        height: height || 1400,
        num_images: numImages || 1,
        return_base64: true,
      }),
    });
    if (!resp.ok) { const t = await resp.text(); return res.status(resp.status).json({ error: t.substring(0, 500) }); }
    const data = await resp.json();
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/image/styles — Venice image styles
app.get('/api/image/styles', async (req, res) => {
  try {
    const resp = await fetch(`${VENICE_BASE}/image/styles`, { headers: veniceHeaders() });
    if (!resp.ok) { const t = await resp.text(); return res.status(resp.status).json({ error: t.substring(0, 500) }); }
    const data = await resp.json();
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/augment/search — Venice web search
app.post('/api/augment/search', async (req, res) => {
  try {
    const { query, limit, search_provider } = req.body;
    if (!query) return res.status(400).json({ error: 'query required' });
    const resp = await fetch(`${VENICE_BASE}/augment/search`, {
      method: 'POST',
      headers: veniceHeaders(),
      body: JSON.stringify({ query, limit: limit || 10, search_provider: search_provider || 'brave' }),
    });
    if (!resp.ok) { const t = await resp.text(); return res.status(resp.status).json({ error: t.substring(0, 500) }); }
    const data = await resp.json();
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/augment/scrape — Venice URL scraper
app.post('/api/augment/scrape', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'url required' });
    const resp = await fetch(`${VENICE_BASE}/augment/scrape`, {
      method: 'POST',
      headers: veniceHeaders(),
      body: JSON.stringify({ url }),
    });
    if (!resp.ok) { const t = await resp.text(); return res.status(resp.status).json({ error: t.substring(0, 500) }); }
    const data = await resp.json();
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Serve Frontend (production build) ───

const frontendDist = path.join(ROOT, 'frontend', 'dist');
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/uploads/') || req.path.startsWith('/cropped/')) return next();
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

// ─── Crash-Proof Server ───

app.use((err, req, res, next) => {
  console.error(`[ERROR] ${req.method} ${req.path}:`, err.message);
  if (err instanceof multer.MulterError) return res.status(400).json({ error: `Upload error: ${err.message}` });
  res.status(500).json({ error: err.message || 'Internal server error' });
});

app.use((req, res) => {
  res.status(404).json({ error: `Not found: ${req.method} ${req.path}` });
});

const server = app.listen(PORT, () => {
  console.log(`\n╔══════════════════════════════════════════════╗`);
  console.log(`║  Card Suite Backend — Port ${PORT}               ║`);
  console.log(`║  Health: http://localhost:${PORT}/api/health     ║`);
  console.log(`║  Venice: ${!!getVeniceKey() ? 'Connected' : 'NO KEY SET'}              ║`);
  console.log(`║  Frontend: ${fs.existsSync(frontendDist) ? 'Served from dist/' : 'Dev mode (npm run dev)'}       ║`);
  console.log(`╚══════════════════════════════════════════════╝\n`);
});

process.on('unhandledRejection', (reason) => { console.error('[UNHANDLED REJECTION] Server staying alive:', reason); });
process.on('uncaughtException', (err) => { console.error('[UNCAUGHT EXCEPTION] Server staying alive:', err.message); });
process.on('SIGTERM', () => { console.log('[SIGTERM] Shutting down...'); server.close(() => process.exit(0)); });
process.on('SIGINT', () => { console.log('\n[SIGINT] Shutting down...'); server.close(() => process.exit(0)); });

module.exports = app;
