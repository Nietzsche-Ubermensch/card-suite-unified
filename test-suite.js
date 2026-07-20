/**
 * Full integration test for card-suite-unified providers.
 * Hits real Venice and Gemini APIs — no mocks.
 */
require('dotenv').config();
const venice = require('./providers/venice');
const gemini = require('./providers/gemini');

const testCards = [
  { name: 'Charizard Holo', set: 'Base Set', grade: 'PSA 9', price: 250, quantity: 1 },
  { name: 'Pikachu Illustrator', set: 'Promo', grade: 'PSA 10', price: 1500, quantity: 1 },
  { name: 'Blastoise', set: 'Base Set Shadowless', grade: 'PSA 8', price: 85, quantity: 1 },
];

async function run() {
  let pass = 0, fail = 0;

  // === Venice ===
  console.log('=== Venice Listing Generation ===');
  try {
    const [description, title] = await Promise.all([
      venice.enhanceDescription(testCards[0]),
      venice.optimizeTitle(testCards[0]),
    ]);
    console.log('  Description:', description.slice(0, 150) + '...');
    console.log('  Title:', title);
    if (description.length > 50 && title.length > 0 && title.length <= 80) {
      console.log('  [PASS] Venice listing generation');
      pass++;
    } else {
      console.log('  [FAIL] Venice output too short or title too long');
      fail++;
    }
  } catch (e) {
    console.log('  [FAIL] Venice error:', e.message);
    fail++;
  }
  console.log();

  // === Gemini Price Analysis ===
  console.log('=== Gemini Price Analysis (structured output) ===');
  try {
    const analysis = await gemini.analyzePrice(testCards[0]);
    console.log('  Suggested Price:', analysis.suggestedPrice);
    console.log('  Confidence:', analysis.confidence);
    console.log('  Reasoning:', (analysis.reasoning || '').slice(0, 150));
    console.log('  Market Trend:', analysis.marketTrend);
    console.log('  Comparable Sales:', (analysis.comparableSales || '').slice(0, 80));
    if (typeof analysis.suggestedPrice === 'number' && analysis.suggestedPrice > 0) {
      console.log('  [PASS] Gemini price analysis');
      pass++;
    } else {
      console.log('  [FAIL] Invalid suggestedPrice');
      fail++;
    }
  } catch (e) {
    console.log('  [FAIL] Gemini error:', e.message);
    fail++;
  }
  console.log();

  // === Gemini Category ===
  console.log('=== Gemini Category Suggestion ===');
  try {
    const cat = await gemini.suggestCategory(testCards[0]);
    console.log('  Category:', cat);
    if (cat.length > 5) {
      console.log('  [PASS] Gemini category suggestion');
      pass++;
    } else {
      console.log('  [FAIL] Category too short');
      fail++;
    }
  } catch (e) {
    console.log('  [FAIL] Gemini category error:', e.message);
    fail++;
  }
  console.log();

  // === Batch Analysis ===
  console.log('=== Batch Analysis (3 cards) ===');
  try {
    const results = await gemini.batchAnalyze(testCards);
    for (const r of results) {
      if (r.status === 'analyzed') {
        console.log();
        console.log('  [OK] ' + r.card + ' (' + r.set + ')');
        console.log('    Original: $' + r.originalPrice + ' -> Suggested: $' + r.suggestedPrice + ' (' + r.confidence + ' confidence)');
        console.log('    Trend: ' + r.marketTrend);
        console.log('    Category: ' + r.category);
        console.log('    Reasoning: ' + (r.reasoning || '').slice(0, 120));
      } else {
        console.log('  [FAIL] ' + r.card + ': ' + r.error);
      }
    }
    const analyzed = results.filter(r => r.status === 'analyzed').length;
    if (analyzed === 3) {
      console.log();
      console.log('  [PASS] Batch analysis (' + analyzed + '/3 analyzed)');
      pass++;
    } else {
      console.log();
      console.log('  [PARTIAL] Batch analysis (' + analyzed + '/3 analyzed)');
      fail++;
    }
  } catch (e) {
    console.log('  [FAIL] Batch error:', e.message);
    fail++;
  }

  // === Summary ===
  console.log();
  console.log('========================================');
  console.log('RESULTS: ' + pass + ' passed, ' + fail + ' failed');
  if (fail === 0) {
    console.log('=== ALL TESTS PASSED ===');
  } else {
    console.log('=== SOME TESTS FAILED ===');
  }
  console.log('========================================');
  process.exit(fail > 0 ? 1 : 0);
}

run().catch(e => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
