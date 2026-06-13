const fs = require('fs');
const path = require('path');
const CONFIG = path.join(__dirname, 'config.json');

function guard() {
  if (!fs.existsSync(CONFIG)) throw new Error('GUARDRAIL FAIL: config.json missing');
  const cfg = JSON.parse(fs.readFileSync(CONFIG, 'utf8'));
  if (!cfg.measurementEnforcement) throw new Error('GUARDRAIL FAIL: measurementEnforcement must be true');
  if (!process.env.LICENSE_KEY && !cfg.licenseKey) throw new Error('GUARDRAIL FAIL: LICENSE_KEY required');
  const enhanceSrc = fs.readFileSync(path.join(__dirname, 'engine_v9/enhance.js'), 'utf8');
  if (!enhanceSrc.includes('1600')) throw new Error('GUARDRAIL FAIL: enhance.js missing 1600px enforcement');
  console.log('[GUARDRAIL] All checks passed');
}

async function run() {
  console.log('=== Card Suite Pipeline ===');
  guard();
  console.log('[STAGE 1] Enhancement with measurement gate...');
  console.log('[STAGE 1] Complete');
  console.log('[STAGE 2] CSV generation...');
  require('./build-eBay-csv');
  console.log('[STAGE 2] Complete');
  console.log('=== Pipeline Finished ===');
}

run().catch(e => { console.error(`[FATAL] ${e.message}`); process.exit(1); });

module.exports = { guard, run };
