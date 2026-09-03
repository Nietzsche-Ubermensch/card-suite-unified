'use strict';

/**
 * Card identity normalisation: turn a raw extraction into canonical,
 * searchable, CSV-ready values — and say out loud when a value was inferred
 * rather than read off the card.
 */
const { matchManufacturer, matchGrader, matchParallel, titleCase, SPORTS } = require('./parallels');

/**
 * A year off a JSON request body or an HTML input arrives as a string; the
 * schema-constrained extraction gives an integer. Take either rather than
 * silently reporting "no year could be read" for a year that was supplied.
 */
function asYear(v) {
  if (Number.isInteger(v)) return v;
  const m = /^\s*(\d{4})\s*$/.exec(String(v ?? ''));
  return m ? Number(m[1]) : null;
}

/**
 * The card year is the COPYRIGHT year, never the stats year: a card whose
 * stat line ends in the 2024 season is a 2025 product. When only stats are
 * legible we infer statsYear + 1 and flag it — an inferred year is a guess a
 * human should confirm, not a fact.
 */
function resolveYear({ copyrightYear, statsYear } = {}) {
  const cy = asYear(copyrightYear);
  const sy = asYear(statsYear);
  if (cy) {
    const warning = sy && sy >= cy
      ? `Stats year ${sy} is not earlier than the copyright year ${cy}; verify the year on the card back.`
      : null;
    return { year: cy, source: 'copyright', warning };
  }
  if (sy) {
    return {
      year: sy + 1,
      source: 'stats-inferred',
      warning: `No copyright line was read. Year inferred as ${sy + 1} from a ${sy} stat line (cards ship the season after their stats) — confirm against the card back.`,
    };
  }
  return { year: null, source: 'none', warning: 'No year could be read from the copyright line or the stats.' };
}

/** "25/99" -> {serial:'25/99', serialNumber:25, printRun:99, isOneOfOne:false} */
function parseSerial(raw) {
  const s = String(raw == null ? '' : raw).trim();
  if (!s) return { serial: null, serialNumber: null, printRun: null, isOneOfOne: false };
  const m = s.match(/(\d{1,5})\s*\/\s*(\d{1,5})/);
  if (!m) {
    const only = s.match(/^#?\s*(\d{1,5})$/);
    return { serial: only ? only[1] : s, serialNumber: only ? Number(only[1]) : null, printRun: null, isOneOfOne: false };
  }
  const serialNumber = Number(m[1]);
  const printRun = Number(m[2]);
  return {
    serial: `${serialNumber}/${printRun}`,
    serialNumber,
    printRun,
    isOneOfOne: printRun === 1,
  };
}

/** "PSA 10" / {gradingCompany:'psa', grade:'10'} -> {gradingCompany:'PSA', grade:'10', isGraded:true} */
function parseGrade(input) {
  const obj = typeof input === 'string' ? { text: input } : (input || {});
  const text = [obj.text, obj.gradingCompany, obj.grade].filter(Boolean).join(' ');
  const company = matchGrader(obj.gradingCompany || text);
  let grade = obj.grade != null ? String(obj.grade).trim() : null;
  if (!grade) {
    const m = String(text).match(/\b(10|9\.5|9|8\.5|8|7\.5|7|6\.5|6|5\.5|5|4\.5|4|3\.5|3|2\.5|2|1\.5|1)\b/);
    grade = m ? m[1] : null;
  }
  if (grade && !/^\d+(\.\d)?$/.test(grade)) grade = grade.replace(/[^\d.]/g, '') || null;
  const isGraded = Boolean(company && grade);
  return { gradingCompany: isGraded ? company : null, grade: isGraded ? grade : null, isGraded };
}

/** "2025 Topps Finest" — the `set` string the CSV builder and eBay searches expect. */
function buildSetName({ year, manufacturer, productSet } = {}) {
  return [year, manufacturer, productSet].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim() || null;
}

/** Cheap sport inference from team/league/product text, used only when the model gives none. */
function inferSport({ sport, team, league, productSet, insertSet } = {}) {
  if (sport && SPORTS.includes(sport)) return sport;
  const t = `${team || ''} ${league || ''} ${productSet || ''} ${insertSet || ''}`.toLowerCase();
  if (/\bwwe\b|\baew\b|njpw|\btna\b|\broh\b|wrestl/.test(t)) return 'wrestling';
  if (/\bmlb\b|baseball|bowman/.test(t)) return 'baseball';
  if (/\bnfl\b|football/.test(t)) return 'football';
  if (/\bnba\b|basketball/.test(t)) return 'basketball';
  if (/\bnhl\b|hockey|young guns/.test(t)) return 'hockey';
  if (/soccer|fifa|uefa|premier league|la liga|serie a|bundesliga|mls/.test(t)) return 'soccer';
  if (/nascar|formula|racing/.test(t)) return 'racing';
  return null;
}

/** Non-sports products this pipeline deliberately does not handle. */
const NON_SPORTS_MARKERS = /pok[eé]mon|magic:? the gathering|\bmtg\b|yu-?gi-?oh|digimon|one piece card|lorcana|garbage pail|marvel|star wars/i;

/**
 * Normalise a validated extraction into canonical values.
 * @returns {{card: object, warnings: string[]}}
 */
function normalizeCard(extracted = {}) {
  const warnings = [];
  const blob = [extracted.playerName, extracted.team, extracted.productSet, extracted.insertSet, extracted.notes]
    .filter(Boolean).join(' ');
  if (NON_SPORTS_MARKERS.test(blob)) {
    warnings.push('This looks like a non-sports card. This pipeline is scoped to sports and wrestling cards only; the identification is unlikely to be right.');
  }

  const manufacturer = matchManufacturer(extracted.manufacturer) || (extracted.manufacturer ? titleCase(String(extracted.manufacturer).trim()) : null);
  const { year, source: yearSource, warning: yearWarning } = resolveYear(extracted);
  if (yearWarning) warnings.push(yearWarning);

  const serial = parseSerial(extracted.serialNumber);
  const grade = parseGrade({ gradingCompany: extracted.gradingCompany, grade: extracted.grade });
  if (extracted.gradingCompany && !grade.isGraded) {
    warnings.push(`Grading company "${extracted.gradingCompany}" was read without a usable grade; treating the card as raw.`);
  }

  const productSet = extracted.productSet ? String(extracted.productSet).trim() : null;
  const scope = { manufacturer, product: productSet };
  let parallel = null;
  if (extracted.parallelType) {
    const hit = matchParallel(extracted.parallelType, scope);
    parallel = hit ? hit.name : String(extracted.parallelType).trim();
    if (!hit) warnings.push(`Parallel "${extracted.parallelType}" is not in the known-parallels reference; the search may not match how sellers list it.`);
  } else if (Array.isArray(extracted.visualKeywords) && extracted.visualKeywords.length) {
    const hit = matchParallel(extracted.visualKeywords.join(' '), scope);
    if (hit) {
      parallel = hit.name;
      warnings.push(`Parallel "${hit.name}" was resolved from the visual keywords, not read off the card.`);
    }
  }

  const sport = inferSport({ ...extracted, productSet });
  if (!sport) warnings.push('Sport could not be determined; the eBay category will fall back to "other".');

  const cardNumber = extracted.cardNumber ? String(extracted.cardNumber).replace(/^#/, '').trim() : null;

  return {
    card: {
      playerName: extracted.playerName ? String(extracted.playerName).trim() : null,
      team: extracted.team || null,
      sport,
      league: extracted.league || null,
      manufacturer,
      productSet,
      year,
      yearSource,
      statsYear: asYear(extracted.statsYear),
      setName: buildSetName({ year, manufacturer, productSet }),
      cardNumber,
      serial: serial.serial,
      printRun: serial.printRun,
      isOneOfOne: serial.isOneOfOne,
      parallel,
      insertSet: extracted.insertSet || null,
      isRookie: extracted.isRookie === true,
      isAutograph: extracted.isAutograph === true,
      isMemorabilia: extracted.isMemorabilia === true,
      isShortPrint: extracted.isShortPrint === true,
      visualKeywords: Array.isArray(extracted.visualKeywords) ? extracted.visualKeywords.filter((k) => typeof k === 'string' && k.trim()) : [],
      gradingCompany: grade.gradingCompany,
      grade: grade.grade,
      isGraded: grade.isGraded,
      certNumber: extracted.certNumber || null,
      confidence: typeof extracted.confidence === 'number' ? Math.max(0, Math.min(1, extracted.confidence)) : null,
      notes: extracted.notes || null,
    },
    warnings,
  };
}

/**
 * Shape a normalised card for build-eBay-csv.js `buildRow`.
 * Price and quantity are the seller's decision, never the extractor's.
 */
function toCardRecord(card, { price = null, quantity = 1, sku = null, photoUrl = null } = {}) {
  return {
    name: card.playerName || '',
    set: card.setName || '',
    sport: card.sport || '',
    league: card.league || '',
    team: card.team || '',
    manufacturer: card.manufacturer || '',
    season: card.year ? String(card.year) : '',
    cardNumber: card.cardNumber || '',
    cardName: card.insertSet || '',
    insert: card.insertSet || '',
    parallel: card.parallel || '',
    serial: card.serial || '',
    rookie: card.isRookie,
    auto: card.isAutograph,
    memorabilia: card.isMemorabilia,
    shortPrint: card.isShortPrint,
    grade: card.isGraded ? `${card.gradingCompany} ${card.grade}` : 'Raw',
    certNumber: card.certNumber || '',
    cardCondition: card.isGraded ? '' : 'Near Mint or Better',
    price,
    quantity,
    ...(sku ? { sku } : {}),
    ...(photoUrl ? { photoUrl } : {}),
  };
}

module.exports = {
  resolveYear,
  parseSerial,
  parseGrade,
  buildSetName,
  inferSport,
  normalizeCard,
  toCardRecord,
  NON_SPORTS_MARKERS,
};
