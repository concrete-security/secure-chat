#!/usr/bin/env bash

# Compare 7 configurations:
#  1. Claude Code (Anthropic SDK → /v1/messages)
#  2. OpenCode + @ai-sdk/anthropic (direct → /v1/messages)
#  3. OpenCode + @ai-sdk/anthropic (retry proxy → /v1/messages)
#  4. OpenCode + @ai-sdk/openai-compatible (direct → /v1/chat/completions)
#  5. OpenCode + @ai-sdk/openai-compatible (retry proxy → /v1/chat/completions)
#  6. Codex + wire_api="chat" (direct → /v1/chat/completions)
#  7. Codex + wire_api="chat" (retry proxy → /v1/chat/completions)
#
# Usage:
#   ./compare_streaming.sh                              # Run once with default prompt
#   ./compare_streaming.sh 10                           # Run 10 times with default prompt
#   ./compare_streaming.sh 5 "List files in cvm/"      # Run 5 times with custom prompt
#   N_RUNS=5 PROMPT="my prompt" ./compare_streaming.sh  # Via env variables

set -euo pipefail

# Script directory (for relative paths)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Number of runs (from arg or env, default 1)
N_RUNS="${1:-${N_RUNS:-10}}"

# Prompt (from arg or env, default provided)
DEFAULT_PROMPT='Read all the Python files in cvm/ and summarize them'
PROMPT="${2:-${PROMPT:-$DEFAULT_PROMPT}}"

VLLM_URL="https://vllm.concrete-security.com"

CAP_BASE="$SCRIPT_DIR/captures"
RESULTS_CSV="$SCRIPT_DIR/output_streaming_results.csv"
mkdir -p "$CAP_BASE"

# Create CSV header if file doesn't exist
if [ ! -f "$RESULTS_CSV" ]; then
  echo "run_id,iteration,timestamp,test,agent,sdk,endpoint,status,calls,retries,prompt" > "$RESULTS_CSV"
fi

# Ports
PORT_CLAUDE=8001
PORT_ANTHROPIC=8002
PORT_RETRY=8003
PORT_OPENAI=8004
PORT_CODEX=8005

setup_capture_dir() {
  local run_id="$1" iteration="$2"
  CAP_DIR="$CAP_BASE/${run_id}_${iteration}"
  mkdir -p "$CAP_DIR"

  OUT_CLAUDE="$CAP_DIR/output_claude.txt"
  OUT_ANTHROPIC="$CAP_DIR/output_anthropic.json"
  OUT_ANTHROPIC_RETRY="$CAP_DIR/output_anthropic_retry.json"
  OUT_OPENAI="$CAP_DIR/output_openai.json"
  OUT_OPENAI_RETRY="$CAP_DIR/output_openai_retry.json"
  OUT_CODEX="$CAP_DIR/output_codex.jsonl"
  OUT_CODEX_RETRY="$CAP_DIR/output_codex_retry.jsonl"

  LOG_RETRY="$CAP_DIR/retry_proxy.log"
  LOG_CLAUDE="$CAP_DIR/mitm_claude.log"
  LOG_ANTHROPIC="$CAP_DIR/mitm_anthropic.log"
  LOG_OPENAI="$CAP_DIR/mitm_openai.log"
  LOG_CODEX="$CAP_DIR/mitm_codex.log"

  MITM_CLAUDE="$CAP_DIR/mitm_claude.mitm"
  MITM_ANTHROPIC="$CAP_DIR/mitm_anthropic.mitm"
  MITM_OPENAI="$CAP_DIR/mitm_openai.mitm"
  MITM_CODEX="$CAP_DIR/mitm_codex.mitm"
}

say() { echo "▶ $*"; }

cleanup() {
  pkill -f "mitmdump" 2>/dev/null || true
  pkill -f "proxy_with_retry" 2>/dev/null || true
}

start_mitm() {
  local port="$1"
  local out_mitm="$2"
  local out_log="$3"

  nohup mitmdump \
    --mode "reverse:${VLLM_URL}" \
    -p "$port" \
    --ssl-insecure \
    -w "$out_mitm" \
    --set flow_detail=4 \
    > "$out_log" 2>&1 &
}

start_retry_proxy() {
  PROXY_PORT="$1" VLLM_URL="$VLLM_URL" nohup python3 "$SCRIPT_DIR/proxy_with_retry.py" > "$LOG_RETRY" 2>&1 &
  sleep 2
}

write_opencode_config() {
  local npm_pkg="$1" baseurl="$2"
  mkdir -p ~/.config/opencode
  cat > ~/.config/opencode/opencode.json <<JSON
{
  "\$schema": "https://opencode.ai/config.json",
  "model": "vllm/gpt-oss-120b",
  "small_model": "vllm/gpt-oss-120b",
  "provider": {
    "vllm": {
      "npm": "${npm_pkg}",
      "options": {
        "baseURL": "${baseurl}",
        "apiKey": "TOTO"
      },
      "models": {
        "gpt-oss-120b": {
          "id": "openai/gpt-oss-120b",
          "name": "OpenAI GPT OSS 120B"
        }
      }
    }
  }
}
JSON
}

write_codex_config() {
  local baseurl="$1"
  local wire_api="${2:-chat}"
  mkdir -p ~/.codex
  cat > ~/.codex/config.toml <<TOML
model_provider = "vllm"
model = "openai/gpt-oss-120b"

model_reasoning_effort = "high"
model_reasoning_summary = "detailed"
model_stream = false
approval_policy = "never"
sandbox_mode = "workspace-write"

model_verbosity = "high"
model_supports_reasoning_summaries = false

[model_providers.vllm]
name = "vLLM"
base_url = "${baseurl}"
env_key = "VLLM_API_KEY"
wire_api = "${wire_api}"

[projects."/home/ubuntu/secure-chat"]
trust_level = "trusted"

[features]
streamable_shell = true
skills = true
unified_exec = true
apply_patch_freeform = true
stream = false
TOML
}

run_opencode() {
  local port="$1" out="$2" npm_pkg="$3"
  write_opencode_config "$npm_pkg" "http://localhost:${port}/v1"
  opencode run --format json "$PROMPT" > "$out" 2>&1 || true
}

run_claude() {
  local port="$1" out="$2"
  ANTHROPIC_BASE_URL="http://localhost:${port}" \
  ANTHROPIC_API_KEY="EMPTY" \
  ANTHROPIC_DEFAULT_OPUS_MODEL=openai/gpt-oss-120b \
  ANTHROPIC_DEFAULT_SONNET_MODEL=openai/gpt-oss-120b \
  ANTHROPIC_DEFAULT_HAIKU_MODEL=openai/gpt-oss-120b \
  claude --print "$PROMPT" > "$out" 2>&1 || true
}

run_codex() {
  local port="$1" out="$2" wire_api="${3:-chat}"
  write_codex_config "http://localhost:${port}/v1" "$wire_api"
  VLLM_API_KEY="TOTO" codex exec --json --full-auto "$PROMPT" > "$out" 2>&1 || true
}

count_calls() {
  local logfile="$1"
  local count
  count=$(grep -c "POST https://.*v1/" "$logfile" 2>/dev/null) || true
  echo "${count:-0}"
}

status_opencode() {
  local out="$1"
  if grep -q '"type":"text","text":"' "$out" 2>/dev/null; then
    echo 1
  else
    echo 0
  fi
}

status_claude() {
  local out="$1"
  if [ -f "$out" ] && [ "$(wc -c < "$out")" -gt 1000 ]; then
    echo 1
  else
    echo 0
  fi
}

status_codex() {
  local out="$1"
  # Codex outputs JSONL; check for agent_message with text content
  if grep -qE '"type":"agent_message".*"text":".+"' "$out" 2>/dev/null; then
    echo 1
  elif grep -qE '"type":"item\.completed".*"agent_message"' "$out" 2>/dev/null; then
    echo 1
  else
    echo 0
  fi
}

check_opencode() {
  local name="$1" out="$2" calls="$3" retries="${4:-0}"
  local status_num status_icon
  status_num=$(status_opencode "$out")
  if [ "$status_num" -eq 1 ]; then
    status_icon="✅"
  else
    status_icon="❌"
  fi
  echo "$status_icon $name - $calls calls ($retries retries)"
}

check_claude() {
  local name="$1" out="$2" calls="$3"
  local status_num status_icon
  status_num=$(status_claude "$out")
  if [ "$status_num" -eq 1 ]; then
    status_icon="✅"
  else
    status_icon="❌"
  fi
  echo "$status_icon $name - $calls calls"
}

check_codex() {
  local name="$1" out="$2" calls="$3" retries="${4:-0}"
  local status_num status_icon
  status_num=$(status_codex "$out")
  if [ "$status_num" -eq 1 ]; then
    status_icon="✅"
  else
    status_icon="❌"
  fi
  echo "$status_icon $name - $calls calls ($retries retries)"
}

save_csv() {
  local run_id="$1" iteration="$2" ts="$3" test="$4" agent="$5" sdk="$6" endpoint="$7" status="$8" calls="$9" retries="${10:-0}" prompt="${11:-}"
  # Escape prompt for CSV: double quotes inside, wrap in quotes
  local escaped_prompt="${prompt//\"/\"\"}"
  echo "$run_id,$iteration,$ts,$test,$agent,$sdk,$endpoint,$status,$calls,$retries,\"$escaped_prompt\"" >> "$RESULTS_CSV"
}

run_single_iteration() {
  local iteration="$1"
  local run_id="$2"

  echo
  echo "════════════════════════════════════════════════════════════"
  echo "  ITERATION $iteration / $N_RUNS  (Run ID: $run_id)"
  echo "════════════════════════════════════════════════════════════"

  say "1/7 Claude Code..."
  run_claude "$PORT_CLAUDE" "$OUT_CLAUDE"

  say "2/7 OpenCode + @ai-sdk/anthropic (direct)..."
  run_opencode "$PORT_ANTHROPIC" "$OUT_ANTHROPIC" "@ai-sdk/anthropic"

  say "3/7 OpenCode + @ai-sdk/anthropic (retry)..."
  run_opencode "$PORT_RETRY" "$OUT_ANTHROPIC_RETRY" "@ai-sdk/anthropic"

  say "4/7 OpenCode + @ai-sdk/openai-compatible (direct)..."
  run_opencode "$PORT_OPENAI" "$OUT_OPENAI" "@ai-sdk/openai-compatible"

  say "5/7 OpenCode + @ai-sdk/openai-compatible (retry)..."
  run_opencode "$PORT_RETRY" "$OUT_OPENAI_RETRY" "@ai-sdk/openai-compatible"

  say "6/7 Codex + wire_api=chat (direct)..."
  run_codex "$PORT_CODEX" "$OUT_CODEX" "chat"

  say "7/7 Codex + wire_api=chat (retry)..."
  run_codex "$PORT_RETRY" "$OUT_CODEX_RETRY" "chat"

  # RESULTS

  # Count calls = POST requests to vLLM (for all tests)
  calls_claude=$(count_calls "$LOG_CLAUDE")
  calls_anthropic=$(count_calls "$LOG_ANTHROPIC")
  calls_openai=$(count_calls "$LOG_OPENAI")
  calls_codex=$(count_calls "$LOG_CODEX")

  # Count calls from retry proxy logs (format: [forward] POST url)
  calls_anthropic_retry=$(grep -c "\[forward\] POST.*v1/messages" "$LOG_RETRY" 2>/dev/null) || true
  calls_anthropic_retry=${calls_anthropic_retry:-0}
  calls_openai_retry=$(grep -c "\[forward\] POST.*v1/chat/completions" "$LOG_RETRY" 2>/dev/null) || true
  calls_openai_retry=${calls_openai_retry:-0}
  calls_codex_retry=$(grep -c "\[forward\] POST.*v1/chat/completions" "$LOG_RETRY" 2>/dev/null) || true
  calls_codex_retry=${calls_codex_retry:-0}

  # Count retries (NO TEXT triggers)
  retries_total=$(grep -c "\[forward\] NO TEXT" "$LOG_RETRY" 2>/dev/null) || true
  retries_total=${retries_total:-0}

  # Calculate statuses
  status_claude=$(status_claude "$OUT_CLAUDE")
  status_anthropic=$(status_opencode "$OUT_ANTHROPIC")
  status_openai=$(status_opencode "$OUT_OPENAI")
  status_anthropic_retry=$(status_opencode "$OUT_ANTHROPIC_RETRY")
  status_openai_retry=$(status_opencode "$OUT_OPENAI_RETRY")
  status_codex=$(status_codex "$OUT_CODEX")
  status_codex_retry=$(status_codex "$OUT_CODEX_RETRY")

  echo
  echo "RESULT (iteration $iteration):"
  check_claude   "Claude Code"                           "$OUT_CLAUDE"          "$calls_claude"
  check_opencode "OpenCode @ai-sdk/anthropic     (direct)" "$OUT_ANTHROPIC"       "$calls_anthropic"
  check_opencode "OpenCode @ai-sdk/anthropic     (retry)"  "$OUT_ANTHROPIC_RETRY" "$calls_anthropic_retry" "$retries_total"
  check_opencode "OpenCode @ai-sdk/openai-compat (direct)" "$OUT_OPENAI"          "$calls_openai"
  check_opencode "OpenCode @ai-sdk/openai-compat (retry)"  "$OUT_OPENAI_RETRY"    "$calls_openai_retry"    "$retries_total"
  check_codex    "Codex    wire_api=chat         (direct)" "$OUT_CODEX"           "$calls_codex"
  check_codex    "Codex    wire_api=chat         (retry)"  "$OUT_CODEX_RETRY"     "$calls_codex_retry"     "$retries_total"

  # Save to CSV
  TS=$(date -Iseconds)
  save_csv "$run_id" "$iteration" "$TS" "claude"           "claude"   "@anthropic-ai/sdk"         "/v1/messages"          "$status_claude"           "$calls_claude"           0              "$PROMPT"
  save_csv "$run_id" "$iteration" "$TS" "anthropic_direct" "opencode" "@ai-sdk/anthropic"         "/v1/messages"          "$status_anthropic"        "$calls_anthropic"        0              "$PROMPT"
  save_csv "$run_id" "$iteration" "$TS" "anthropic_retry"  "opencode" "@ai-sdk/anthropic"         "/v1/messages"          "$status_anthropic_retry"  "$calls_anthropic_retry"  "$retries_total" "$PROMPT"
  save_csv "$run_id" "$iteration" "$TS" "openai_direct"    "opencode" "@ai-sdk/openai-compatible" "/v1/chat/completions"  "$status_openai"           "$calls_openai"           0              "$PROMPT"
  save_csv "$run_id" "$iteration" "$TS" "openai_retry"     "opencode" "@ai-sdk/openai-compatible" "/v1/chat/completions"  "$status_openai_retry"     "$calls_openai_retry"     "$retries_total" "$PROMPT"
  save_csv "$run_id" "$iteration" "$TS" "codex_direct"     "codex"    "reqwest/hyper"             "/v1/chat/completions"  "$status_codex"            "$calls_codex"            0              "$PROMPT"
  save_csv "$run_id" "$iteration" "$TS" "codex_retry"      "codex"    "reqwest/hyper"             "/v1/chat/completions"  "$status_codex_retry"      "$calls_codex_retry"      "$retries_total" "$PROMPT"
}

# ══════════════════════════════════════════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════════════════════════════════════════

# Initial cleanup
cleanup

# Generate unique run ID for this batch
RUN_ID=$(head -c 4 /dev/urandom | xxd -p)

echo
echo "════════════════════════════════════════════════════════════"
echo "  Starting $N_RUNS iteration(s)  |  Batch ID: $RUN_ID"
echo "  Prompt: $PROMPT"
echo "════════════════════════════════════════════════════════════"

# Run iterations
for i in $(seq 1 "$N_RUNS"); do
  # Clean and restart proxies each iteration
  cleanup

  setup_capture_dir "$RUN_ID" "$i"
  say "Starting proxies (iteration $i)..."
  start_mitm "$PORT_CLAUDE" "$MITM_CLAUDE" "$LOG_CLAUDE"
  start_mitm "$PORT_ANTHROPIC" "$MITM_ANTHROPIC" "$LOG_ANTHROPIC"
  start_mitm "$PORT_OPENAI" "$MITM_OPENAI" "$LOG_OPENAI"
  start_mitm "$PORT_CODEX" "$MITM_CODEX" "$LOG_CODEX"
  start_retry_proxy "$PORT_RETRY"
  sleep 2

  run_single_iteration "$i" "$RUN_ID"
done



echo
echo "════════════════════════════════════════════════════════════"
echo "  COMPLETED $N_RUNS iteration(s)"
echo "  Batch ID: $RUN_ID"
echo "  Results saved to: $RESULTS_CSV"
echo "════════════════════════════════════════════════════════════"
