/**
 * Gemini AI integration for card price analysis and market research.
 * Uses Google's Generative Language API (Gemini 2.5 Flash).
 * Requires GEMINI_API_KEY in environment.
 */

const https = require('https');

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_MAX_RETRIES = 3;
const GEMINI_RETRY_DELAY = 2000;

function getApiKey() {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY not set in environment');
  return key;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/**
 * Make a Gemini API request with retry logic for 503 (high demand) errors.
 */
async function geminiRequest(url, body, maxRetries = GEMINI_MAX_RETRIES) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await _singleRequest(url, body);
      return result;
    } catch (e) {
      if (e.message.includes('503') && attempt < maxRetries) {
        await sleep(GEMINI_RETRY_DELAY * (attempt + 1));
        continue;
      }
      throw e;
    }
  }
}

function _singleRequest(url, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        if (res.statusCode !== 200) {
          return reject(new Error(`Gemini API error ${res.statusCode}: ${data.slice(0, 200)}`));
        }
        try {
          const json = JSON.parse(data);
          resolve(json);
        } catch (e) {
          reject(new Error(`Gemini response parse error: ${e.message}`));
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/**
 * Analyze card market value and suggest pricing.
 * @param {Object} card - { name, set, grade, price, quantity }
 * @returns {Promise<Object>} { suggestedPrice, confidence, reasoning, comparableSales }
 */
async function analyzePrice(card) {
  const apiKey = getApiKey();
  const prompt = `Analyze the market value of this trading card for an eBay seller:

Card: ${card.name}
Set: ${card.set}
Grade: ${card.grade || 'Raw'}
Current asking price: $${card.price}
Quantity: ${card.quantity}

Be conservative. If you don't have solid data, say confidence is low.`;

  const url = `${GEMINI_BASE}/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
  const body = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 1000,
      thinkingConfig: { thinkingBudget: 0 },
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          suggestedPrice: { type: 'NUMBER' },
          confidence: { type: 'STRING', enum: ['low', 'medium', 'high'] },
          reasoning: { type: 'STRING' },
          marketTrend: { type: 'STRING', enum: ['rising', 'stable', 'declining', 'unknown'] },
          comparableSales: { type: 'STRING' },
        },
        required: ['suggestedPrice', 'confidence', 'reasoning', 'marketTrend', 'comparableSales'],
      },
    },
  });

  try {
    const json = await geminiRequest(url, body);
    const text = json.candidates[0].content.parts[0].text;
    const parsed = JSON.parse(text);
    if (typeof parsed.suggestedPrice !== 'number' || parsed.suggestedPrice <= 0) {
      parsed.suggestedPrice = card.price;
      parsed.confidence = 'low';
    }
    return parsed;
  } catch (e) {
    // Fallback: return original price with error info
    return {
      suggestedPrice: card.price,
      confidence: 'low',
      reasoning: `Analysis unavailable: ${e.message}`,
      marketTrend: 'unknown',
      comparableSales: 'unavailable',
    };
  }
}

/**
 * Suggest the best eBay category for a card.
 * @param {Object} card - { name, set, grade }
 * @returns {Promise<string>} eBay category name
 */
async function suggestCategory(card) {
  const apiKey = getApiKey();
  const prompt = `What eBay category should this trading card be listed under?

Card: ${card.name}
Set: ${card.set}
Grade: ${card.grade || 'Raw'}

Return ONLY the eBay category name, nothing else. Examples:
- "Sports Cards & Memorabilia > Cards"
- "Collectibles > Trading Card Games > Individual Cards"
- "Sports Mem, Cards & Fan Shop > Sports Trading Cards > Trading Card Singles"`;

  const url = `${GEMINI_BASE}/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
  const body = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.1, maxOutputTokens: 100, thinkingConfig: { thinkingBudget: 0 } },
  });

  try {
    const json = await geminiRequest(url, body);
    const text = json.candidates[0].content.parts[0].text.trim();
    return text.split('\n')[0].trim();
  } catch (e) {
    return 'Collectibles > Trading Card Games > Individual Cards';
  }
}

/**
 * Batch analyze multiple cards.
 * @param {Array} cards - Array of card objects
 * @returns {Promise<Array>} Array of analysis results
 */
async function batchAnalyze(cards) {
  const results = [];
  for (const card of cards) {
    try {
      const [priceAnalysis, category] = await Promise.all([
        analyzePrice(card),
        suggestCategory(card),
      ]);
      results.push({
        card: card.name,
        set: card.set,
        grade: card.grade || 'Raw',
        originalPrice: card.price,
        suggestedPrice: priceAnalysis.suggestedPrice,
        confidence: priceAnalysis.confidence,
        reasoning: priceAnalysis.reasoning,
        marketTrend: priceAnalysis.marketTrend,
        category,
        status: 'analyzed',
      });
    } catch (e) {
      results.push({
        card: card.name,
        set: card.set,
        grade: card.grade || 'Raw',
        originalPrice: card.price,
        error: e.message,
        status: 'failed',
      });
    }
  }
  return results;
}

module.exports = { analyzePrice, suggestCategory, batchAnalyze, getApiKey };
