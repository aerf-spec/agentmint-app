#!/usr/bin/env bash
# diagnose.sh — one-shot local diagnostic driver for AgentMint cost testing.
#
# What it does (free, local, no API spend):
#   1. Copies the six diagnostic files into the benchmark folder if missing.
#   2. Verifies LM Studio is up and the requested model is loaded.
#   3. Warms the model (first-call latency won't skew task 1).
#   4. Runs the multi-arm diagnostic for each model you list.
#   5. Renders a pretty terminal summary and writes RESULTS.md per model.
#
# What it deliberately does NOT do: anything that spends money. The $100 API
# phase is a separate, gated runner (see API-PHASE, printed at the end) so you
# never burn budget from a script you ran to "prepare."
#
# Usage:
#   ./diagnose.sh                              # uses $LM_STUDIO_MODEL or default
#   ./diagnose.sh qwen2.5-7b-instruct          # one model
#   ./diagnose.sh qwen2.5-7b llama-3.1-8b qwen2.5-3b   # several, in order
#   RUNS=3 ./diagnose.sh <models...>           # faster smoke pass
#   ONLY=baseline,hardened,shaped ./diagnose.sh <model>   # subset of arms
#
# Env:
#   LM_STUDIO_URL   default http://localhost:1234/v1
#   RUNS            override runs/arm (default: baseline/hardened 5, shaped 10)
#   ONLY            comma list of arms to run

set -uo pipefail

# ── locate repo ───────────────────────────────────────────────────────
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Try to find the benchmark dir relative to this script or CWD.
find_bench() {
  for base in "$HERE" "$HERE/.." "$PWD" "$PWD/.."; do
    if [ -d "$base/examples/lm-studio-benchmark" ]; then
      (cd "$base/examples/lm-studio-benchmark" && pwd); return 0
    fi
    if [ -f "$base/run-all.ts" ] && [ -d "$base/tasks" ]; then
      (cd "$base" && pwd); return 0
    fi
  done
  return 1
}
BENCH="$(find_bench)" || { echo "  ✗ Could not find examples/lm-studio-benchmark. Run this from your repo."; exit 1; }
DIAG_SRC="$HERE"   # where the six .ts files live (this folder)
OUT="$BENCH/analysis/output"
LM_STUDIO_URL="${LM_STUDIO_URL:-http://localhost:1234/v1}"

C_G=$'\033[32m'; C_R=$'\033[31m'; C_Y=$'\033[33m'; C_B=$'\033[1m'; C_0=$'\033[0m'
say()  { printf "%s\n" "$*"; }
head1(){ printf "\n%s%s%s\n" "$C_B" "$*" "$C_0"; }

# ── 1. ensure diagnostic files are in place ───────────────────────────
head1 "1. Diagnostic files"
NEED=(shape.ts tools-heavy.ts tasks-extra.ts agent-diag.ts run-all.ts compare3.ts)
missing=0
for f in "${NEED[@]}"; do
  if [ ! -f "$BENCH/$f" ]; then
    if [ -f "$DIAG_SRC/$f" ]; then
      cp "$DIAG_SRC/$f" "$BENCH/$f"; say "  ${C_G}copied${C_0} $f"
    else
      say "  ${C_R}MISSING${C_0} $f (not in $DIAG_SRC either)"; missing=1
    fi
  else
    say "  ok     $f"
  fi
done
[ "$missing" = "1" ] && { say "\n  ✗ Some files are missing. Put the six .ts files next to this script."; exit 1; }

# ── 2. verify LM Studio ───────────────────────────────────────────────
head1 "2. LM Studio at $LM_STUDIO_URL"
MODELS_JSON="$(curl -fsS "${LM_STUDIO_URL%/}/models" 2>/dev/null)" || {
  say "  ${C_R}✗ Cannot reach LM Studio.${C_0} Start the local server and load a model."; exit 1; }
say "  ${C_G}reachable${C_0}"
say "  loaded model ids:"
printf '%s' "$MODELS_JSON" | grep -oE '"id"[[:space:]]*:[[:space:]]*"[^"]+"' | sed 's/.*"\([^"]*\)"$/    \1/' | sort -u

# models to run: args, else $LM_STUDIO_MODEL, else first loaded id
if [ "$#" -gt 0 ]; then MODELS=("$@")
elif [ -n "${LM_STUDIO_MODEL:-}" ]; then MODELS=("$LM_STUDIO_MODEL")
else
  first="$(printf '%s' "$MODELS_JSON" | grep -oE '"id"[[:space:]]*:[[:space:]]*"[^"]+"' | head -1 | sed 's/.*"\([^"]*\)"$/\1/')"
  MODELS=("$first")
fi
say "  ${C_B}will run:${C_0} ${MODELS[*]}"

# ── 3. run each model ─────────────────────────────────────────────────
mkdir -p "$OUT"
cd "$BENCH"

for MODEL in "${MODELS[@]}"; do
  head1 "3. Diagnostic run — $MODEL"

  # warmup (ignore output/errors; just load weights & JIT)
  say "  warming up..."
  curl -fsS "${LM_STUDIO_URL%/}/chat/completions" \
    -H 'content-type: application/json' \
    -d "{\"model\":\"$MODEL\",\"messages\":[{\"role\":\"user\",\"content\":\"ok\"}],\"max_tokens\":1}" \
    >/dev/null 2>&1 || say "  (warmup call returned non-200; continuing)"

  # run all arms; run-all.ts writes diag-<arm>.json into $OUT
  LM_STUDIO_MODEL="$MODEL" LM_STUDIO_URL="$LM_STUDIO_URL" \
    npx tsx run-all.ts || { say "  ${C_R}run-all failed for $MODEL${C_0}"; continue; }

  # analysis + markdown; compare3.ts --md writes RESULTS.md into $OUT
  npx tsx compare3.ts --md || npx tsx compare3.ts

  # stamp a per-model copy so multiple models don't overwrite each other
  SAFE="$(printf '%s' "$MODEL" | tr '/ :' '___')"
  [ -f "$OUT/RESULTS.md" ] && cp "$OUT/RESULTS.md" "$OUT/RESULTS-$SAFE.md"
  for arm in "$OUT"/diag-*.json; do
    [ -f "$arm" ] && cp "$arm" "${arm%.json}.$SAFE.bak.json" 2>/dev/null || true
  done
  say "  ${C_G}RESULTS-$SAFE.md written${C_0}"
done

# ── 4. cross-model summary ────────────────────────────────────────────
head1 "4. Where results landed"
ls -1 "$OUT"/RESULTS-*.md 2>/dev/null | sed 's/^/    /' || say "    (no RESULTS files — check errors above)"
say ""
say "  Read order per model:"
say "    - zero-token warning (if present, LM Studio isn't returning usage — nothing is real)"
say "    - the T1-T4 verdicts (shaping thesis)"
say "    - H1 (steering) and H8 (reasoning share) lines"
say "    - shaped 'calls' vs hardened (if shaped rises, dedup markers are confusing the model)"

# ── 5. what this script intentionally skips ───────────────────────────
head1 "5. Not run here (costs money — gated on the above passing)"
cat <<'NOTE'
    The $100 API phase (real dollars + prompt-caching arms) is a SEPARATE
    runner, on purpose, so no script you run to "prepare" can spend money.
    Build and run it only after T1-T4 pass on your strong model (32B) AND a
    cross-family model (Llama 8B). See API-PHASE.md / Claude Prompt "API-4".
NOTE
