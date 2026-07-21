"""
eBay CSV Builder Evolver — Integrated into card-suite-unified.

Tests buildRow() against the REAL eBay Seller Hub Reports CSV template format
with REAL card data from rbeachgebay inventory.

Run:
    cd card-suite-unified/evolver
    OPENROUTER_API_KEY=... uv run --with openai python evolve_csv_builder.py \
        --num_iterations 5 --output_dir ./results
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

# Ensure the repo root is importable
REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT))

# darwinian_evolver imports
DE_DIR = Path.home() / ".hermes/cache/darwinian-evolver/darwinian_evolver"
sys.path.insert(0, str(DE_DIR))

from darwinian_evolver.cli_common import (
    build_hyperparameter_config_from_args,
    parse_learning_log_view_type,
    register_hyperparameter_args,
)
from darwinian_evolver.evolve_problem_loop import EvolveProblemLoop
from darwinian_evolver.learning_log import LearningLogEntry
from darwinian_evolver.problem import (
    EvaluationFailureCase,
    EvaluationResult,
    Evaluator,
    Mutator,
    Organism,
    Problem,
)

from openai import OpenAI

DEFAULT_MODEL = os.environ.get("EVOLVER_MODEL", "z-ai/glm-5.2")


def _client() -> OpenAI:
    key = os.environ.get("OPENROUTER_API_KEY")
    if not key:
        sys.exit("OPENROUTER_API_KEY is not set")
    return OpenAI(api_key=key, base_url="https://openrouter.ai/api/v1")


def _prompt_llm(prompt: str, max_tokens: int = 4096) -> str:
    try:
        r = _client().chat.completions.create(
            model=DEFAULT_MODEL,
            max_tokens=max_tokens,
            messages=[{"role": "user", "content": prompt}],
        )
        return r.choices[0].message.content or ""
    except Exception as e:
        return f"<LLM_ERROR: {type(e).__name__}: {e}>"


# ---- Organism: a JS buildRow function ----

class CsvBuilderOrganism(Organism):
    code: str

    def run(self, card: dict) -> str:
        """Execute the buildRow function via Node.js."""
        wrapper = f"""
const card = {json.dumps(card)};
try {{
{self.code}
const row = buildRow(card, 0);
console.log(row);
}} catch(e) {{
console.log('ERROR:' + e.message);
}}
"""
        with tempfile.NamedTemporaryFile(mode='w', suffix='.js', delete=False, dir='/tmp') as f:
            f.write(wrapper)
            f.flush()
            fname = f.name
        try:
            result = subprocess.run(['node', fname], capture_output=True, text=True, timeout=5)
            output = result.stdout.strip()
            if result.returncode != 0 and not output:
                return f"EXEC_ERROR: {result.stderr.strip()[:200]}"
            return output
        except subprocess.TimeoutExpired:
            return "TIMEOUT"
        except Exception as e:
            return f"EXEC_ERROR: {e}"
        finally:
            os.unlink(fname)


# ---- Seed: current v4 buildRow (from build-eBay-csv.js) ----

SEED_CODE = """function buildRow(card, idx) {
  const errs = [];
  if (!card.name) errs.push('name');
  if (!card.set) errs.push('set');
  if (typeof card.price !== 'number' || card.price <= 0) errs.push('price');
  if (!card.quantity || card.quantity < 1) errs.push('quantity');
  if (errs.length) { console.warn('Skip: ' + errs.join(',')); return null; }

  function csvField(val) {
    const str = String(val == null ? '' : val);
    if (str.includes(',') || str.includes('"') || str.includes('\\n') || str.includes('\\r'))
      return '"' + str.replace(/"/g, '""') + '"';
    return str;
  }

  const action = 'Add';
  const sku = card.sku || 'CARD-' + (idx + 1);
  const sportStr = String(card.sport || '').toLowerCase();
  const combined = (card.name + ' ' + card.set + ' ' + sportStr).toLowerCase();

  const CATS = { wrestling: 183435, soccer: 183444, baseball: 213, basketball: 214, football: 215, hockey: 216, other: 217 };
  let categoryId;
  if (sportStr === 'wrestling' || /wwe|aew|wrestling|roh|njpw|tna/.test(combined)) categoryId = CATS.wrestling;
  else if (sportStr === 'soccer' || /soccer|fifa|uefa|premier/.test(combined)) categoryId = CATS.soccer;
  else if (sportStr === 'baseball' || /baseball|mlb|bowman|topps/.test(combined)) categoryId = CATS.baseball;
  else if (sportStr === 'football' || /football|nfl/.test(combined)) categoryId = CATS.football;
  else if (sportStr === 'basketball' || /basketball|nba/.test(combined)) categoryId = CATS.basketball;
  else if (sportStr === 'hockey' || /hockey|nhl/.test(combined)) categoryId = CATS.hockey;
  else categoryId = CATS.other;

  const grade = (card.grade && String(card.grade).trim()) || 'Raw';
  const gradeLower = grade.toLowerCase();
  const isRaw = /raw|ungraded/.test(gradeLower);
  const parts = [card.name, card.set];
  if (card.insert) parts.push(card.insert);
  if (card.parallel) parts.push(card.parallel);
  if (card.serial) parts.push(card.serial);
  parts.push(grade);
  let title = parts.join(' ').replace(/\\s+/g, ' ').trim();
  const nameSet = (card.name + ' ' + card.set).toLowerCase();
  const isRookie = card.rookie || /rookie|\\brc\\b|1st bowman/.test(nameSet);
  const isAuto = card.auto || /auto|autograph|signature/.test(nameSet);
  if (isRookie && !/\\brc\\b/i.test(title)) title += ' RC';
  if (isAuto && !/auto/i.test(title)) title += ' Auto';
  if (title.length > 80) title = title.substring(0, 80).trim();

  const upc = 'Does not apply';
  let conditionId = 4000;
  if (!isRaw) { const g = parseFloat(gradeLower.match(/\\d+\\.?\\d*/)?.[0] || 0); conditionId = g >= 10 ? 1000 : g >= 9 ? 3000 : 4000; }

  const condDesc = isRaw ? 'Near Mint or Better' : '';
  const desc = '<p>Up for sale is a ' + grade + ' ' + card.name + ' from ' + card.set + '.</p><p>' + (isRaw ? 'Ungraded raw condition.' : 'Graded ' + grade) + '</p>';
  const fmt = 'FixedPrice', dur = 'GTC';

  function mfr(s) { const l = s.toLowerCase(); if (/topps/.test(l)) return 'Topps'; if (/panini/.test(l)) return 'Panini'; if (/upper deck|metal universe|ud canvas/.test(l)) return 'Upper Deck'; if (/bowman/.test(l)) return 'Bowman'; if (/leaf/.test(l)) return 'Leaf'; if (/donruss/.test(l)) return 'Donruss'; return ''; }
  const manufacturer = card.manufacturer || mfr(card.set);
  const profGraded = isRaw ? 'No' : 'Yes';
  let profGrader = ''; let gradeVal = '';
  if (!isRaw) { const m = gradeLower.match(/^(psa|bgs|cgc|sgc)/); if (m) profGrader = m[1].toUpperCase(); const g = gradeLower.match(/(\\d+\\.?\\d*)/); if (g) gradeVal = g[1]; }
  const sport = card.sport || '';
  const player = card.name;
  const type = 'Sports Trading Card';
  const parallelV = card.parallel || '';
  const feats = []; if (isRookie) feats.push('Rookie'); if (isAuto) feats.push('Autograph'); if (card.serial) feats.push('Serial Numbered');
  const features = feats.join(', ');
  const league = card.league || (/wwe/.test(combined) ? 'WWE' : /aew/.test(combined) ? 'AEW' : /mlb/.test(combined) ? 'MLB' : /nfl/.test(combined) ? 'NFL' : /nba/.test(combined) ? 'NBA' : /fifa/.test(combined) ? 'FIFA' : /uefa/.test(combined) ? 'UEFA' : '');
  const yr = (card.set.match(/(\\d{4})/) || [])[1] || '';
  const fields = [action, sku, categoryId, title, upc, card.price, card.quantity, conditionId, condDesc, desc, fmt, dur, '', manufacturer, profGraded, profGrader, gradeVal, '', condDesc, sport, player, '', '', type, parallelV, features, league, isAuto ? 'Yes' : 'No', '', yr, 'Yes', 'Original', yr];
  return fields.map(f => csvField(f)).join(',');
}"""


# ---- CSV Parser ----

def parse_csv_row(row: str) -> list:
    if not row or row == 'null' or row.startswith('ERROR') or row.startswith('EXEC'):
        return []
    fields = []
    current = ''
    in_quotes = False
    i = 0
    while i < len(row):
        c = row[i]
        if c == '"' and (i == 0 or row[i-1] == ','):
            in_quotes = True
        elif c == '"' and in_quotes:
            if i + 1 < len(row) and row[i+1] == '"':
                current += '"'
                i += 1
            else:
                in_quotes = False
        elif c == ',' and not in_quotes:
            fields.append(current)
            current = ''
        else:
            current += c
        i += 1
    fields.append(current)
    return fields


# eBay Seller Hub Reports column headers (33 columns)
HEADERS = [
    'Action', 'Custom label (SKU)', 'Category ID', 'Title', 'UPC', 'Price', 'Quantity',
    'Condition ID', 'Condition Description', 'Description', 'Format', 'Duration',
    'Item photo URL', 'C:Card Manufacturer', 'C:Professionally Graded', 'C:Professional Grader',
    'C:Grade', 'C:Certification Number', 'C:Card Condition', 'C:Sport', 'C:Player/Athlete',
    'C:Team', 'C:Card Name', 'C:Type', 'C:Parallel/Variety', 'C:Features', 'C:League',
    'C:Autographed', 'C:Card Number', 'C:Season', 'C:Single', 'C:Original/Reprint', 'C:Year',
]

CATEGORY_IDS = {
    'wrestling': 183435, 'soccer': 183444, 'baseball': 213,
    'basketball': 214, 'football': 215, 'hockey': 216, 'other': 217,
}


# ---- REAL Card Scenarios from rbeachgebay inventory ----

TRAINABLE_SCENARIOS = [
    # WWE Wrestling
    {"id": "wwe_topps_chrome_serial", "card": {"name": "Arianna Grace", "set": "2022 Topps Chrome WWE", "grade": "Raw", "price": 25, "quantity": 1, "sport": "wrestling", "serial": "080/25"}, "check": "wrestling_cat"},
    {"id": "wwe_green_refractor", "card": {"name": "Dominik Mysterio", "set": "2022 Topps Chrome WWE", "grade": "Raw", "price": 45, "quantity": 1, "sport": "wrestling", "serial": "117/275", "parallel": "Green Refractor"}, "check": "serial_and_parallel_in_title"},
    {"id": "wwe_panini_prizm", "card": {"name": "Natalya", "set": "2022 Panini Prizm WWE", "grade": "Raw", "price": 15, "quantity": 1, "sport": "wrestling", "serial": "80/99"}, "check": "wrestling_cat"},
    # AEW Wrestling
    {"id": "aew_metal_universe", "card": {"name": "Mercedes Moné", "set": "2025 AEW Metal Universe Ring Heroes", "grade": "Raw", "price": 75, "quantity": 1, "sport": "wrestling", "serial": "RH 15/25"}, "check": "wrestling_cat"},
    {"id": "aew_blast_furnace", "card": {"name": "Anna Jay", "set": "2023 AEW Metal Universe", "grade": "Raw", "price": 30, "quantity": 1, "sport": "wrestling", "serial": "BF 19/30", "insert": "Blast Furnace"}, "check": "insert_in_title"},
    {"id": "aew_ud_canvas", "card": {"name": "Saraya", "set": "2025 Upper Deck AEW UD Canvas", "grade": "Raw", "price": 20, "quantity": 1, "sport": "wrestling"}, "check": "wrestling_cat"},
    {"id": "aew_long_name", "card": {"name": "Dr. Britt Baker D.M.D.", "set": "2025 AEW Metal Universe", "grade": "Raw", "price": 35, "quantity": 1, "sport": "wrestling"}, "check": "title_max80"},
    # Soccer
    {"id": "soccer_messi", "card": {"name": "Lionel Messi", "set": "2024-25 Panini Donruss Soccer Pitch Kings", "grade": "Raw", "price": 50, "quantity": 1, "sport": "soccer"}, "check": "soccer_cat"},
    {"id": "soccer_kane", "card": {"name": "Harry Kane", "set": "2025 Topps Merlin Collections UEFA", "grade": "Raw", "price": 20, "quantity": 1, "sport": "soccer"}, "check": "soccer_cat"},
    {"id": "soccer_guler_prizm", "card": {"name": "Arda Güler", "set": "2025 Panini Prizm FIFA Club World Cup", "grade": "Raw", "price": 40, "quantity": 1, "sport": "soccer", "parallel": "Pink Wave"}, "check": "soccer_cat"},
    # Baseball
    {"id": "baseball_rookie", "card": {"name": "James Wood", "set": "2023 Bowman Chrome", "grade": "Raw", "price": 80, "quantity": 1, "sport": "baseball", "rookie": True}, "check": "rookie_in_features"},
    {"id": "baseball_graded_psa10", "card": {"name": "Mike Trout", "set": "2011 Topps Update", "grade": "PSA 10", "price": 5000, "quantity": 1, "sport": "baseball", "rookie": True, "certNumber": "12345678"}, "check": "graded_psa10"},
    # Football
    {"id": "football_rookie", "card": {"name": "Patrick Mahomes", "set": "2017 Panini Contenders", "grade": "PSA 9", "price": 1200, "quantity": 1, "sport": "football", "rookie": True}, "check": "football_cat"},
    # Basketball
    {"id": "basketball_auto", "card": {"name": "LeBron James", "set": "2023 Panini Prizm", "grade": "Raw", "price": 200, "quantity": 1, "sport": "basketball", "auto": True}, "check": "auto_in_title"},
    # Hockey
    {"id": "hockey_raw", "card": {"name": "Connor McDavid", "set": "2022 Upper Deck Young Guns", "grade": "Raw", "price": 150, "quantity": 1, "sport": "hockey", "rookie": True}, "check": "hockey_cat"},
    # Edge cases
    {"id": "missing_grade", "card": {"name": "Test Player", "set": "2024 Topps Chrome", "price": 10, "quantity": 1, "sport": "baseball"}, "check": "no_undefined"},
    {"id": "title_truncation", "card": {"name": "Very Long Card Name Player", "set": "2025 Panini Prizm FIFA Club World Cup Pink Wave Mega Box", "grade": "Raw", "price": 30, "quantity": 1, "sport": "soccer", "serial": "001/299"}, "check": "title_max80"},
    {"id": "manufacturer_detection", "card": {"name": "Test", "set": "2025 AEW Metal Universe", "grade": "Raw", "price": 10, "quantity": 1, "sport": "wrestling"}, "check": "manufacturer_upper_deck"},
    {"id": "condition_id_raw", "card": {"name": "Test", "set": "2022 Topps Chrome WWE", "grade": "Raw", "price": 10, "quantity": 1, "sport": "wrestling"}, "check": "condition_id_4000"},
    {"id": "upc_field", "card": {"name": "Test", "set": "2022 Topps Chrome WWE", "grade": "Raw", "price": 10, "quantity": 1, "sport": "wrestling"}, "check": "upc_does_not_apply"},
]

HOLDOUT_SCENARIOS = [
    {"id": "holdout_aew_copper", "card": {"name": "Saraya", "set": "2023 AEW Metal Universe Copper FX", "grade": "Raw", "price": 18, "quantity": 1, "sport": "wrestling"}, "check": "wrestling_cat"},
    {"id": "holdout_soccer_graded", "card": {"name": "Harry Kane", "set": "2025 Topps Merlin UEFA Champions League", "grade": "PSA 9", "price": 100, "quantity": 1, "sport": "soccer"}, "check": "soccer_cat"},
    {"id": "holdout_football_auto", "card": {"name": "Tom Brady", "set": "2000 Leaf Certified", "grade": "BGS 9.5", "price": 3000, "quantity": 1, "sport": "football", "auto": True, "rookie": True}, "check": "graded_bgs"},
]


# ---- Checker ----

def check_scenario(row_str: str, scenario: dict) -> tuple[bool, str]:
    fields = parse_csv_row(row_str)
    if not fields:
        return False, f"Could not parse row: {row_str[:100]}"
    if len(fields) < 33:
        return False, f"Row has {len(fields)} fields, expected 33"

    # Map fields to headers
    fm = {}
    for i, h in enumerate(HEADERS):
        fm[h] = fields[i].strip('"') if i < len(fields) else ''

    check = scenario["check"]
    card = scenario["card"]
    title = fm.get('Title', '')
    cat_id = fm.get('Category ID', '')
    cond_id = fm.get('Condition ID', '')
    prof_graded = fm.get('C:Professionally Graded', '')
    prof_grader = fm.get('C:Professional Grader', '')
    grade_val = fm.get('C:Grade', '')
    mfr = fm.get('C:Card Manufacturer', '')
    sport = fm.get('C:Sport', '')
    features = fm.get('C:Features', '')
    league = fm.get('C:League', '')
    autographed = fm.get('C:Autographed', '')
    upc = fm.get('UPC', '')

    if check == "wrestling_cat":
        if cat_id != str(CATEGORY_IDS['wrestling']):
            return False, f"Wrestling cat={cat_id} expected={CATEGORY_IDS['wrestling']}"
        return True, ""

    elif check == "soccer_cat":
        if cat_id != str(CATEGORY_IDS['soccer']):
            return False, f"Soccer cat={cat_id} expected={CATEGORY_IDS['soccer']}"
        return True, ""

    elif check == "football_cat":
        if cat_id != str(CATEGORY_IDS['football']):
            return False, f"Football cat={cat_id} expected={CATEGORY_IDS['football']}"
        return True, ""

    elif check == "hockey_cat":
        if cat_id != str(CATEGORY_IDS['hockey']):
            return False, f"Hockey cat={cat_id} expected={CATEGORY_IDS['hockey']}"
        return True, ""

    elif check == "serial_and_parallel_in_title":
        serial = card.get("serial", "")
        parallel = card.get("parallel", "")
        title_lower = title.lower()
        issues = []
        if serial:
            serial_clean = serial.replace(" ", "")
            if serial_clean not in title and serial not in title:
                num_part = re.findall(r'\d+/\d+', serial)
                if not num_part or num_part[0] not in title:
                    issues.append(f"serial '{serial}' not in title")
        if parallel and parallel.lower() not in title_lower:
            issues.append(f"parallel '{parallel}' not in title")
        if issues:
            return False, "; ".join(issues)
        return True, ""

    elif check == "insert_in_title":
        insert = card.get("insert", "")
        if not insert:
            return True, ""
        if insert.lower() not in title.lower():
            return False, f"Insert '{insert}' not in title: '{title}'"
        return True, ""

    elif check == "title_max80":
        if len(title) > 80:
            return False, f"Title {len(title)} chars (max 80): '{title}'"
        return True, ""

    elif check == "rookie_in_features":
        if "Rookie" not in features and "rookie" not in features.lower():
            return False, f"Rookie not in features: '{features}'"
        if "rc" not in title.lower() and "rookie" not in title.lower():
            return False, f"RC not in title: '{title}'"
        return True, ""

    elif check == "auto_in_title":
        if "auto" not in title.lower() and "autograph" not in title.lower():
            return False, f"Auto not in title: '{title}'"
        if autographed != "Yes":
            return False, f"C:Autographed={autographed} expected=Yes"
        return True, ""

    elif check == "graded_psa10":
        if prof_graded != "Yes":
            return False, f"Professionally Graded={prof_graded} expected=Yes"
        if prof_grader != "PSA":
            return False, f"Professional Grader={prof_grader} expected=PSA"
        if grade_val != "10":
            return False, f"Grade={grade_val} expected=10"
        if cond_id != "1000":
            return False, f"Condition ID={cond_id} expected=1000"
        return True, ""

    elif check == "graded_bgs":
        if prof_graded != "Yes":
            return False, f"Professionally Graded={prof_graded} expected=Yes"
        if prof_grader != "BGS":
            return False, f"Professional Grader={prof_grader} expected=BGS"
        if grade_val != "9.5":
            return False, f"Grade={grade_val} expected=9.5"
        return True, ""

    elif check == "no_undefined":
        for h, v in fm.items():
            if "undefined" in str(v).lower() or "null" in str(v).lower():
                return False, f"Field '{h}' has undefined/null: '{v}'"
        return True, ""

    elif check == "manufacturer_upper_deck":
        if mfr != "Upper Deck":
            return False, f"Manufacturer={mfr} expected=Upper Deck (AEW Metal Universe)"
        return True, ""

    elif check == "condition_id_4000":
        if cond_id != "4000":
            return False, f"Condition ID={cond_id} expected=4000 (raw/ungraded)"
        return True, ""

    elif check == "upc_does_not_apply":
        if upc != "Does not apply":
            return False, f"UPC={upc} expected='Does not apply'"
        return True, ""

    return True, ""


# ---- Evaluator ----

class EbayCsvFailureCase(EvaluationFailureCase):
    scenario_id: str
    card: dict
    check: str
    actual_output: str
    failure_reason: str


class EbayCsvEvaluator(Evaluator[CsvBuilderOrganism, EvaluationResult, EbayCsvFailureCase]):

    def evaluate(self, organism: CsvBuilderOrganism) -> EvaluationResult:
        train_fails = []
        hold_fails = []

        for i, sc in enumerate(TRAINABLE_SCENARIOS):
            out = organism.run(sc["card"])
            ok, reason = check_scenario(out, sc)
            if not ok:
                train_fails.append(EbayCsvFailureCase(
                    scenario_id=sc["id"], card=sc["card"], check=sc["check"],
                    actual_output=out[:300], failure_reason=reason,
                    data_point_id=f"train_{i}",
                ))

        for i, sc in enumerate(HOLDOUT_SCENARIOS):
            out = organism.run(sc["card"])
            ok, reason = check_scenario(out, sc)
            if not ok:
                hold_fails.append(EbayCsvFailureCase(
                    scenario_id=sc["id"], card=sc["card"], check=sc["check"],
                    actual_output=out[:300], failure_reason=reason,
                    data_point_id=f"hold_{i}",
                ))

        total = len(TRAINABLE_SCENARIOS) + len(HOLDOUT_SCENARIOS)
        ok_count = total - len(train_fails) - len(hold_fails)
        score = ok_count / total if total else 0.0

        return EvaluationResult(
            score=score,
            trainable_failure_cases=train_fails,
            holdout_failure_cases=hold_fails,
            is_viable=True,
        )


# ---- Mutator ----

class EbayCsvMutator(Mutator[CsvBuilderOrganism, EbayCsvFailureCase]):
    MUTATION_PROMPT = """
You are optimizing a JavaScript buildRow function that generates eBay Seller Hub Reports CSV rows for sports trading cards and wrestling cards.

The current function:
```javascript
{code}
```

It failed on:
- Scenario: {scenario_id}
- Card: {card_json}
- Check: {check}
- Failure: {failure_reason}
- Output: {actual_output}

The function must output 33 CSV fields matching these eBay Seller Hub headers:
Action, Custom label (SKU), Category ID, Title, UPC, Price, Quantity,
Condition ID, Condition Description, Description, Format, Duration,
Item photo URL, C:Card Manufacturer, C:Professionally Graded, C:Professional Grader,
C:Grade, C:Certification Number, C:Card Condition, C:Sport, C:Player/Athlete,
C:Team, C:Card Name, C:Type, C:Parallel/Variety, C:Features, C:League,
C:Autographed, C:Card Number, C:Season, C:Single, C:Original/Reprint, C:Year

Rules:
1. Category IDs: Wrestling=183435, Soccer=183444, Baseball=213, Basketball=214, Football=215, Hockey=216
2. Condition IDs: Raw=4000, PSA/BGS/CGC/SGC 10=1000, 9-9.5=3000
3. Title max 80 chars: name + set + insert + parallel + serial + grade + RC + Auto
4. Serial numbers (080/25, 117/275, BF 19/30) MUST be in the title
5. Insert names (Blast Furnace, Ring Heroes) MUST be in the title
6. Parallel names (Green Refractor, Pink Wave) MUST be in the title
7. RC for rookies (including 1st Bowman), Auto for autographs
8. Manufacturer auto-detect: Topps, Panini, Upper Deck (Metal Universe/UD Canvas), Bowman, Leaf, Donruss
9. Graded cards: Professionally Graded=Yes, Professional Grader=PSA/BGS/CGC/SGC, Grade=numeric
10. Raw cards: Professionally Graded=No, Card Condition=Near Mint or Better
11. UPC="Does not apply", Format="FixedPrice", Duration="GTC"
12. HTML description with <p> tags
13. No undefined/null values anywhere
14. C:Features: comma-separated (Rookie, Autograph, Serial Numbered, Short Print, Memorabilia)

Return ONLY the complete buildRow function in a single JavaScript code block.
""".strip()

    def mutate(self, organism, failure_cases, learning_log_entries):
        fc = failure_cases[0]
        prompt = self.MUTATION_PROMPT.format(
            code=organism.code,
            scenario_id=fc.scenario_id,
            card_json=json.dumps(fc.card),
            check=fc.check,
            failure_reason=fc.failure_reason,
            actual_output=fc.actual_output,
        )
        resp = _prompt_llm(prompt, max_tokens=4096)
        parts = resp.split("```")
        if len(parts) < 3:
            return []
        code_block = parts[-2].strip()
        if "\n" in code_block:
            first, rest = code_block.split("\n", 1)
            if first.strip() in ("javascript", "js", "node", ""):
                code_block = rest.strip()
        if "function buildRow" not in code_block:
            return []
        return [CsvBuilderOrganism(code=code_block)]


def make_problem() -> Problem:
    return Problem[CsvBuilderOrganism, EvaluationResult, EbayCsvFailureCase](
        evaluator=EbayCsvEvaluator(),
        mutators=[EbayCsvMutator()],
        initial_organism=CsvBuilderOrganism(code=SEED_CODE),
    )


def main():
    import argparse
    ap = argparse.ArgumentParser(description="Evolve eBay CSV builder against real template + real cards")
    register_hyperparameter_args(ap.add_argument_group("hyperparameters"))
    ap.add_argument("--num_iterations", type=int, default=5)
    ap.add_argument("--mutator_concurrency", type=int, default=2)
    ap.add_argument("--evaluator_concurrency", type=int, default=2)
    ap.add_argument("--output_dir", type=str, required=True)
    args = ap.parse_args()

    out = Path(args.output_dir)
    out.mkdir(parents=True, exist_ok=True)
    (out / "snapshots").mkdir(exist_ok=True)

    hp = build_hyperparameter_config_from_args(args)
    loop = EvolveProblemLoop(
        problem=make_problem(),
        learning_log_view_type=parse_learning_log_view_type(hp.learning_log_view_type),
        num_parents_per_iteration=hp.num_parents_per_iteration,
        mutator_concurrency=args.mutator_concurrency,
        evaluator_concurrency=args.evaluator_concurrency,
        fixed_midpoint_score=hp.fixed_midpoint_score,
        midpoint_score_percentile=hp.midpoint_score_percentile,
        sharpness=hp.sharpness,
        novelty_weight=hp.novelty_weight,
        batch_size=hp.batch_size,
        should_verify_mutations=hp.verify_mutations,
    )

    log_path = out / "results.jsonl"
    print(f"eBay CSV Evolver — {len(TRAINABLE_SCENARIOS)} train + {len(HOLDOUT_SCENARIOS)} holdout scenarios")
    print(f"Model: {DEFAULT_MODEL}")
    best_score = 0.0

    for snap in loop.run(num_iterations=args.num_iterations):
        (out / "snapshots" / f"iteration_{snap.iteration}.pkl").write_bytes(snap.snapshot)
        _, best_eval = snap.best_organism_result
        score = best_eval.score
        print(f"iter={snap.iteration} pop={snap.population_size} best={score:.3f}")

        with log_path.open("a") as f:
            f.write(json.dumps({
                "iteration": snap.iteration,
                "best_score": score,
                "pop_size": snap.population_size,
            }) + "\n")

        if score >= best_score:
            best_score = score

    (out / "best_score.txt").write_text(f"{best_score:.3f}")
    print(f"\nDone. Best score: {best_score:.3f}")
    print(f"Results: {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
