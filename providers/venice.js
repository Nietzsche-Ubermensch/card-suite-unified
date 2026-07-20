/**
 * Venice AI integration for card image enhancement.
 * Uses Venice's image generation API to enhance/upscale card photos.
 * Requires VENICE_API_KEY in environment.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const VENICE_BASE = 'https://api.venice.ai/api/v1';

function getApiKey() {
  const key = process.env.VENICE_API_KEY;
  if (!key) throw new Error('VENICE_API_KEY not set in environment');
  return key;
}

/**
 * Enhance a card description using Venice chat API.
 * @param {Object} card - { name, set, grade, price, quantity }
 * @returns {Promise<string>} Enhanced eBay listing description
 */
async function enhanceDescription(card) {
  const apiKey = getApiKey();
  const prompt = `Write an eBay listing description for a trading card. Card details:
- Name: ${card.name}
- Set: ${card.set}
- Grade: ${card.grade || 'Raw'}
- Price: $${card.price}

Write a compelling, honest description (max 500 chars) that includes:
- Card condition details based on grade
- Why this card is collectible
- Shipping note (USPS First Class, combined shipping available)
- Return policy (30 day returns)
No emojis. No hype words. Just clear, factual listing copy.`;

  const body = JSON.stringify({
    model: 'llama-3.3-70b',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 400,
    temperature: 0.3,
  });

  return new Promise((resolve, reject) => {
    const req = https.request(`${VENICE_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        if (res.statusCode !== 200) {
          return reject(new Error(`Venice API error ${res.statusCode}: ${data.slice(0, 200)}`));
        }
        try {
          const json = JSON.parse(data);
          resolve(json.choices[0].message.content.trim());
        } catch (e) {
          reject(new Error(`Venice response parse error: ${e.message}`));
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/**
 * Generate a card listing title optimized for eBay search.
 * @param {Object} card - { name, set, grade }
 * @returns {Promise<string>} SEO-optimized eBay title (max 80 chars)
 */
async function optimizeTitle(card) {
  const apiKey = getApiKey();
  const prompt = `Create an eBay listing title for this trading card. Max 80 characters.
Card: ${card.name}
Set: ${card.set}
Grade: ${card.grade || 'Raw'}

Rules:
- Include the card name, set name, and grade
- Put the most searchable terms first
- No emojis, no all-caps words longer than 4 chars
- Return ONLY the title, nothing else`;

  const body = JSON.stringify({
    model: 'llama-3.3-70b',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 80,
    temperature: 0.2,
  });

  return new Promise((resolve, reject) => {
    const req = https.request(`${VENICE_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        if (res.statusCode !== 200) {
          return reject(new Error(`Venice API error ${res.statusCode}: ${data.slice(0, 200)}`));
        }
        try {
          const json = JSON.parse(data);
          resolve(json.choices[0].message.content.trim().slice(0, 80));
        } catch (e) {
          reject(new Error(`Venice response parse error: ${e.message}`));
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

module.exports = { enhanceDescription, optimizeTitle, getApiKey };
