#!/usr/bin/env bash
# eBay CSV Builder Evolver — Run from card-suite-unified root
# Evolves the buildRow function against real eBay template + real card data
#
# Usage: ./evolver/run.sh [num_iterations] [output_dir]

set -euo pipefail

ITERATIONS="${1:-5}"
OUTPUT_DIR="${2:-./evolver/results}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"

# Get API key from .env
ENV_FILE="${HOME}/.hermes/.env"
if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: $ENV_FILE not found"
  exit 1
fi

OPENROUTER_API_KEY=$(grep '^OPENROUTER_API_KEY=' "$ENV_FILE" | cut -d= -f2-)
if [ -z "$OPENROUTER_API_KEY" ]; then
  echo "ERROR: OPENROUTER_API_KEY not found in $ENV_FILE"
  exit 1
fi

export OPENROUTER_API_KEY
export EVOLVER_MODEL="${EVOLVER_MODEL:-z-ai/glm-5.2}"

echo "=== eBay CSV Builder Evolver ==="
echo "Model: $EVOLVER_MODEL"
echo "Iterations: $ITERATIONS"
echo "Output: $OUTPUT_DIR"
echo ""

cd "$SCRIPT_DIR"

uv run --with openai --with numpy --with pydantic python evolve_csv_builder.py \
  --num_iterations "$ITERATIONS" \
  --num_parents_per_iteration 2 \
  --mutator_concurrency 2 \
  --evaluator_concurrency 2 \
  --output_dir "$OUTPUT_DIR"

echo ""
echo "=== Evolution Complete ==="
echo "Best score: $(cat "$OUTPUT_DIR/best_score.txt" 2>/dev/null || echo 'N/A')"
echo "Results: $OUTPUT_DIR"
