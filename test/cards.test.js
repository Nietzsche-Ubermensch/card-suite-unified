'use strict';
// Sports-card identification + comps search. Pure logic, no network.
//   node --test test/
const test = require('node:test');
const assert = require('node:assert/strict');

const C = require('../lib/cards');
const { buildRow, HEADERS } = require('../build-eBay-csv');

/** Split one CSV row the way the eBay template writes it. */
function parseRow(row) {
  const out = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < row.length; i++) {
    const ch = row[i];
    if (ch === '"') { if (q && row[i + 1] === '"') { cur += '"'; i++; } else q = !q; continue; }
    if (ch === ',' && !q) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur);
  return Object.fromEntries(HEADERS.map((h, i) => [h, out[i]]));
}

// A real card from the scans: 2026 Upper Deck AEW "Star Entrances" insert,
// red parallel, serial numbered 190/299.
const JULIA_RAW = {
  playerName: 'Julia Hart',
  team: 'AEW',
  sport: 'wrestling',
  league: 'AEW',
  manufacturer: 'Upper Deck',
  productSet: null,
  copyrightYear: 2026,
  statsYear: null,
  cardNumber: null,
  serialNumber: '190/299',
  parallelType: 'Red',
  insertSet: 'Star Entrances',
  isRookie: false,
  isAutograph: false,
  isMemorabilia: false,
  isShortPrint: false,
  visualKeywords: ['Red', 'Neon'],
  gradingCompany: null,
  grade: null,
  certNumber: null,
  confidence: 0.82,
  notes: null,
};

// The other real card: base #22, copyright 2026 on the back, no serial.
const MINA_RAW = {
  playerName: 'Mina Shirakawa',
  team: 'AEW',
  sport: 'wrestling',
  manufacturer: 'Upper Deck',
  productSet: null,
  copyrightYear: 2026,
  statsYear: 2025,
  cardNumber: '22',
  serialNumber: null,
  parallelType: null,
  insertSet: null,
  isRookie: true,
  isAutograph: false,
  isMemorabilia: false,
  visualKeywords: [],
  confidence: 0.9,
};

test('parallels: a visual description resolves to the term sellers actually type', () => {
  const finest = { manufacturer: 'Topps', product: 'Finest' };
  assert.equal(C.matchParallel('checkered pattern', finest).name, 'Checkerboard Refractor');
  assert.equal(C.matchParallel('checkerboard', finest).base, 'Checkerboard Refractor');
  assert.equal(C.matchParallel('rainbow swirls like oil on water', finest).name, 'Oil Spill Refractor');

  const prizm = { manufacturer: 'Panini', product: 'Prizm' };
  assert.equal(C.matchParallel('shattered ice look', prizm).name, 'Cracked Ice Prizm');
  assert.equal(C.matchParallel('cracked ice', prizm).name, 'Cracked Ice Prizm');
  assert.equal(C.matchParallel('sparkle dots', prizm).name, 'Disco Prizm');

  // a colour word qualifies the parallel, which is how it is listed
  assert.equal(C.matchParallel('blue refractor', { manufacturer: 'Topps', product: 'Chrome' }).name, 'Blue Refractor');
  assert.equal(C.matchParallel('blue refractor', { manufacturer: 'Topps', product: 'Chrome' }).color, 'blue');

  // a bare colour is itself a searchable parallel ("Red /299")
  assert.equal(C.matchParallel('Red', { manufacturer: 'Upper Deck' }).name, 'Red');

  // A multi-word colour must survive the bare-colour fallback whole. The
  // leftover regex alternates over COLOR_WORDS in declaration order, where
  // "gold" precedes "rose gold" — that is safe, because alternation is tried
  // left-to-right at each START position and "gold" cannot match at position 0
  // of "rose gold", so the longer phrase wins there. This asserts the outcome
  // so a future reordering (or a switch to a non-anchored scan) is caught.
  const noRoseGold = { manufacturer: 'Panini', product: 'Prizm' };
  assert.equal(C.matchParallel('Rose Gold', noRoseGold).name, 'Rose Gold');
  assert.equal(C.matchParallel('rose gold parallel', noRoseGold).name, 'Rose Gold');
  assert.equal(C.matchParallel('Rose Gold', noRoseGold).color, 'rose gold');
  assert.equal(C.matchParallel('Red', { manufacturer: 'Upper Deck' }).base, null);

  // never guess: an unrecognised surface returns null rather than a wrong term
  assert.equal(C.matchParallel('some pattern nobody has ever named', prizm), null);
  assert.equal(C.matchParallel('red hot streaky thing nobody names', prizm), null);
});

test('parallels: manufacturer and grader are read from how they print on the card', () => {
  assert.equal(C.matchManufacturer('© 2025 THE TOPPS COMPANY'), 'Topps');
  assert.equal(C.matchManufacturer('© 2026 The Upper Deck Company'), 'Upper Deck');
  assert.equal(C.matchManufacturer('Panini America, Inc.'), 'Panini');
  assert.equal(C.matchManufacturer('nothing here'), null);
  assert.equal(C.matchGrader('PSA'), 'PSA');
  assert.equal(C.matchGrader('Beckett'), 'BGS');
});

test('identity: the card year is the copyright year, and an inferred year says so', () => {
  const fromCopyright = C.resolveYear({ copyrightYear: 2025, statsYear: 2024 });
  assert.equal(fromCopyright.year, 2025);
  assert.equal(fromCopyright.source, 'copyright');
  assert.equal(fromCopyright.warning, null);

  // stats end in the 2024 season -> it is a 2025 card, but that is a guess
  const inferred = C.resolveYear({ statsYear: 2024 });
  assert.equal(inferred.year, 2025);
  assert.equal(inferred.source, 'stats-inferred');
  assert.match(inferred.warning, /confirm/i);

  // a stats year at or after the copyright year is contradictory
  assert.match(C.resolveYear({ copyrightYear: 2024, statsYear: 2025 }).warning, /verify/i);
  assert.equal(C.resolveYear({}).year, null);

  // A year typed into a form or posted as JSON arrives as a string; taking
  // only integers here used to report "no year could be read" for a year the
  // caller had actually supplied.
  assert.equal(C.resolveYear({ copyrightYear: '2025' }).year, 2025);
  assert.equal(C.resolveYear({ copyrightYear: ' 2025 ' }).source, 'copyright');
  assert.equal(C.resolveYear({ statsYear: '2024' }).year, 2025);
  assert.equal(C.resolveYear({ copyrightYear: 'twenty' }).year, null);

  // The Price Check page sends statsYear back on every refresh instead of
  // writing an inferred year into the copyright-year box. If it wrote the
  // inferred year there, the next refresh would read it back as a year taken
  // off the copyright line and the "confirm this" warning would vanish for a
  // year nobody ever read. This asserts the round-trip the UI relies on.
  const firstPass = C.normalizeCard({ playerName: 'Aaron Judge', statsYear: 2024 });
  assert.equal(firstPass.card.year, 2025);
  assert.equal(firstPass.card.yearSource, 'stats-inferred');
  assert.equal(firstPass.card.statsYear, 2024);
  assert.ok(firstPass.warnings.some((w) => /inferred/i.test(w)));

  const refresh = C.normalizeCard({ playerName: 'Aaron Judge', copyrightYear: null, statsYear: String(firstPass.card.statsYear) });
  assert.equal(refresh.card.year, 2025);
  assert.equal(refresh.card.yearSource, 'stats-inferred');
  assert.ok(refresh.warnings.some((w) => /inferred/i.test(w)), 'the inferred-year warning must survive a refresh');
});

test('identity: serials and grades parse into the pieces a search needs', () => {
  assert.deepEqual(C.parseSerial('190/299'), { serial: '190/299', serialNumber: 190, printRun: 299, isOneOfOne: false });
  assert.equal(C.parseSerial('1/1').isOneOfOne, true);
  assert.deepEqual(C.parseSerial(null), { serial: null, serialNumber: null, printRun: null, isOneOfOne: false });

  assert.deepEqual(C.parseGrade({ gradingCompany: 'PSA', grade: '10' }), { gradingCompany: 'PSA', grade: '10', isGraded: true });
  assert.equal(C.parseGrade('BGS 9.5').grade, '9.5');
  // a company with no readable grade is not a graded card
  assert.equal(C.parseGrade({ gradingCompany: 'PSA' }).isGraded, false);
});

test('schema: validation is strict about types and lenient about omissions', () => {
  assert.equal(C.validateCard(JULIA_RAW).ok, true);
  assert.equal(C.validateCard({ playerName: 'X' }).ok, true, 'only playerName is truly required');

  assert.equal(C.validateCard({}).ok, false);
  assert.match(C.validateCard({}).errors.join(), /playerName is required/);
  assert.match(C.validateCard({ playerName: 'X', copyrightYear: '2025' }).errors.join(), /copyrightYear/);
  assert.match(C.validateCard({ playerName: 'X', confidence: 4 }).errors.join(), /confidence/);
  assert.match(C.validateCard({ playerName: 'X', sport: 'pokemon' }).errors.join(), /sport/);
  assert.match(C.validateCard({ playerName: 'X', visualKeywords: [1, 2] }).errors.join(), /visualKeywords/);

  const unknown = C.validateCard({ playerName: 'X', hp: 120 });
  assert.equal(unknown.ok, true);
  assert.match(unknown.warnings.join(), /unknown field "hp"/);
  assert.equal(unknown.value.hp, undefined);
});

test('normalize: a real AEW insert becomes canonical, searchable values', () => {
  const { card, warnings } = C.normalizeCard(JULIA_RAW);
  assert.equal(card.playerName, 'Julia Hart');
  assert.equal(card.sport, 'wrestling');
  assert.equal(card.manufacturer, 'Upper Deck');
  assert.equal(card.year, 2026);
  assert.equal(card.yearSource, 'copyright');
  assert.equal(card.setName, '2026 Upper Deck');
  assert.equal(card.insertSet, 'Star Entrances');
  assert.equal(card.serial, '190/299');
  assert.equal(card.printRun, 299);
  assert.equal(card.isGraded, false);
  assert.equal(warnings.length, 0, warnings.join('; '));
});

test('normalize: an unknown parallel is kept but flagged rather than silently trusted', () => {
  const { card, warnings } = C.normalizeCard({ ...JULIA_RAW, parallelType: 'Glimmering Whatsit' });
  assert.equal(card.parallel, 'Glimmering Whatsit');
  assert.match(warnings.join(), /not in the known-parallels reference/);
});

test('normalize: non-sports cards are out of scope and say so', () => {
  const { warnings } = C.normalizeCard({ playerName: 'Charizard', productSet: 'Pokemon XY Evolutions' });
  assert.match(warnings.join(), /scoped to sports and wrestling/i);
});

test('comps: the ladder runs narrow to broad and searches the print run, not your copy', () => {
  const { card } = C.normalizeCard(JULIA_RAW);
  const { searches, recommended, category } = C.compsFor(card);

  const byTier = Object.fromEntries(searches.map((s) => [s.tier, s]));
  assert.equal(category, 183435, 'wrestling category from the CSV builder');
  assert.equal(recommended, 'parallel', 'ungraded card with a parallel starts one tier down');

  // the run, never the individual serial
  assert.match(byTier.exact.query, /\/299/);
  assert.doesNotMatch(byTier.exact.query, /190\/299/);

  assert.match(byTier.exact.query, /2026 Upper Deck Julia Hart/);
  assert.match(byTier.parallel.query, /Star Entrances/);
  assert.doesNotMatch(byTier.parallel.query, /\/299/, 'tier 2 drops the print run');
  assert.doesNotMatch(byTier.base.query, /Star Entrances/, 'tier 3 drops the insert and parallel');
  assert.equal(byTier.broad.query, 'Julia Hart');

  // each tier is no longer than the one above it
  const lens = searches.map((s) => s.query.length);
  assert.deepEqual(lens, [...lens].sort((a, b) => b - a), `tiers should narrow monotonically: ${lens}`);

  // no duplicate links: this card has no number, so "player" collapses into "base"
  assert.equal(new Set(searches.map((s) => s.query)).size, searches.length);
  assert.equal(byTier.player, undefined, 'the collapsed tier is dropped, narrowest label kept');
});

test('comps: every tier survives when the card has a number to narrow on', () => {
  const { card } = C.normalizeCard({ ...JULIA_RAW, cardNumber: '7' });
  const tiers = C.compsFor(card).searches.map((s) => s.tier);
  assert.deepEqual(tiers, ['exact', 'parallel', 'base', 'player', 'broad']);
});

test('comps: URLs point at sold+completed listings in the right category', () => {
  const { card } = C.normalizeCard(JULIA_RAW);
  const { searches } = C.compsFor(card);
  const sold = new URL(searches[0].soldUrl);
  assert.equal(sold.origin + sold.pathname, 'https://www.ebay.com/sch/i.html');
  assert.equal(sold.searchParams.get('LH_Sold'), '1');
  assert.equal(sold.searchParams.get('LH_Complete'), '1');
  assert.equal(sold.searchParams.get('_sacat'), '183435');
  assert.equal(sold.searchParams.get('rt'), 'nc');
  assert.match(sold.searchParams.get('_nkw'), /Julia Hart/);

  const active = new URL(searches[0].activeUrl);
  assert.equal(active.searchParams.get('LH_Sold'), null, 'active listings are asking prices, not comps');
});

test('comps: a graded card pins the grade and starts at the exact tier', () => {
  const { card } = C.normalizeCard({ ...JULIA_RAW, gradingCompany: 'PSA', grade: '10' });
  const { searches, recommended } = C.compsFor(card);
  assert.equal(recommended, 'exact');
  assert.match(searches.find((s) => s.tier === 'exact').query, /PSA 10$/);
});

test('a normalized card feeds the real eBay CSV builder', () => {
  const { card } = C.normalizeCard(JULIA_RAW);
  const record = C.toCardRecord(card, { price: 14.99, quantity: 1 });
  const row = buildRow(record, 0);
  assert.ok(row, 'buildRow accepted the record');

  const cols = parseRow(row);
  assert.equal(cols['Category ID'], '183435');
  assert.equal(cols['C:Card Manufacturer'], 'Upper Deck');
  assert.equal(cols['C:Sport'], 'wrestling');
  assert.equal(cols['C:Player/Athlete'], 'Julia Hart');
  assert.equal(cols['C:Parallel/Variety'], 'Red');
  assert.equal(cols.Price, '14.99');
  assert.ok(cols.Title.includes('Julia Hart') && cols.Title.includes('190/299'));
  assert.ok(cols.Title.length <= 80);
});

// The comps endpoint must tell a raw extraction from an already-normalised card
// before deciding whether to normalise, and normalizeCard is NOT idempotent — it
// reads copyrightYear, which a normalised card no longer carries. A truthiness
// check on yearSource let a raw extraction carrying that one field skip
// normalisation, and the search silently lost its year, parallel and print run.
test('normalised cards are told from raw extractions by structure, not one field', () => {
  const isNormalized = (card) => ['yearSource', 'setName', 'printRun'].every((k) => k in card);

  const { card: real } = C.normalizeCard(JULIA_RAW);
  assert.equal(isNormalized(real), true, 'a real normalised card must be recognised');

  // A raw extraction that happens to carry yearSource is still raw.
  assert.equal(isNormalized({ ...JULIA_RAW, yearSource: 'copyright' }), false);
  assert.equal(isNormalized({ playerName: 'Aaron Judge', yearSource: 'copyright' }), false);

  // The keys are present-but-null on a card with nothing to fill them in.
  const { card: sparse } = C.normalizeCard({ playerName: 'Aaron Judge' });
  assert.equal(sparse.setName, null);
  assert.equal(sparse.printRun, null);
  assert.equal(isNormalized(sparse), true, 'null values must not read as "raw"');
});

test('a rookie base card round-trips through the CSV as a rookie', () => {
  const { card } = C.normalizeCard(MINA_RAW);
  assert.equal(card.cardNumber, '22');
  assert.equal(card.isRookie, true);
  const cols = parseRow(buildRow(C.toCardRecord(card, { price: 4.99 }), 0));
  assert.match(cols.Title, /\bRC\b/);
  assert.equal(cols['C:Card Number'], '22');
});

test('extract: the request carries both sides, the schema, and the domain rules', () => {
  const req = C.buildRequest({ front: 'AAAA', back: 'BBBB', model: 'test-vision' });
  assert.equal(req.model, 'test-vision');
  assert.equal(req.response_format.type, 'json_schema');
  assert.equal(req.response_format.json_schema.strict, true);
  assert.equal(req.response_format.json_schema.schema, C.SPORTS_CARD_SCHEMA);

  const user = req.messages[1].content;
  assert.equal(user.filter((p) => p.type === 'image_url').length, 2);
  assert.match(user[0].text, /FRONT/);
  assert.match(user[2].text, /BACK/);
  assert.match(user[1].image_url.url, /^data:image\/jpeg;base64,AAAA$/, 'bare base64 is wrapped');

  const system = req.messages[0].content;
  assert.match(system, /COPYRIGHT LINE only/);
  assert.match(system, /Checkerboard Refractor/, 'the parallel reference is in the prompt');
  assert.match(system, /do not handle Pokemon/i);

  // a data URL is passed through untouched
  const dataUrl = C.buildRequest({ front: 'data:image/png;base64,ZZZZ' });
  assert.equal(dataUrl.messages[1].content[1].image_url.url, 'data:image/png;base64,ZZZZ');
  assert.throws(() => C.buildRequest({}), /front or back/);
});

test('extract: JSON is recovered whether or not the model honours response_format', () => {
  const obj = { playerName: 'Aaron Judge' };
  assert.deepEqual(C.parseContent(JSON.stringify(obj)), obj);
  assert.deepEqual(C.parseContent('```json\n{"playerName":"Aaron Judge"}\n```'), obj);
  assert.deepEqual(C.parseContent('Here is the card:\n{"playerName":"Aaron Judge"}\nHope that helps.'), obj);
  assert.throws(() => C.parseContent(''), /empty response/);
  assert.throws(() => C.parseContent('no json at all'), /could not parse JSON/);
});

test('extract: finalize validates, normalizes and attaches comps in one step', () => {
  const out = C.finalizeExtraction(JULIA_RAW, { price: 14.99 });
  assert.equal(out.card.playerName, 'Julia Hart');
  assert.equal(out.record.set, '2026 Upper Deck');
  assert.equal(out.comps.recommended, 'parallel');
  assert.ok(out.comps.searches.length >= 4);
  assert.ok(out.comps.notes.some((n) => /SOLD listings/.test(n)));
  assert.ok(buildRow(out.record, 0), 'the record is CSV-ready');

  assert.throws(() => C.finalizeExtraction({ notes: 'blurry' }), (e) => e.code === 'SCHEMA_MISMATCH');
});

test('extract: extractCard drives the injected transport end to end', async () => {
  const seen = [];
  const chat = async (body) => {
    seen.push(body);
    return { model: 'vision-1', choices: [{ message: { content: '```json\n' + JSON.stringify(JULIA_RAW) + '\n```' } }] };
  };
  const out = await C.extractCard({ front: 'AAAA', back: 'BBBB', chat, price: 14.99 });
  assert.equal(seen.length, 1);
  assert.deepEqual(out.sides, ['front', 'back']);
  assert.equal(out.model, 'vision-1');
  assert.equal(out.card.serial, '190/299');
  assert.match(out.comps.searches[0].soldUrl, /LH_Sold=1/);
  await assert.rejects(() => C.extractCard({ front: 'A' }), /chat\(requestBody\) function is required/);
});
