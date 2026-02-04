#!/usr/bin/env bash
# Test opencode avec différents system prompts
# Usage:
#   ./test_system_prompts.sh                    # Run once with default prompt
#   ./test_system_prompts.sh 5                  # Run 5 times
#   ./test_system_prompts.sh 3 "my prompt"      # Run 3 times with custom prompt

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
N_RUNS="${1:-${N_RUNS:-1}}"
DEFAULT_PROMPT='Read all the Python files in cvm/ and summarize them'
PROMPT="${2:-${PROMPT:-$DEFAULT_PROMPT}}"

VLLM_URL="https://vllm.concrete-security.com"
EXPERIMENT_DIR="$PROJECT_DIR/experiments/system_prompt_test"
RESULTS_CSV="$EXPERIMENT_DIR/system_prompt_results.csv"
mkdir -p "$EXPERIMENT_DIR"

# System prompts mapping: name:model_id:prompt_file_path
PROMPTS_DIR="$HOME/opencode-source/packages/opencode/src/session/prompt"
SYSTEM_PROMPTS=(
  #"claude-code:claude-code-custom:$PROMPTS_DIR/claude-code.txt"
  #"claude-code-real:claude-code-real-custom:$PROMPTS_DIR/claude-code-real.txt"
  #"gpt-oss:gpt-oss-custom:$PROMPTS_DIR/gpt-oss.txt"
  "gpt-oss-custom:gpt-oss-custom-custom:$PROMPTS_DIR/gpt-oss-custom.txt"
  #"codex:gpt-5-custom:$PROMPTS_DIR/codex_header.txt"
  #"beast:gpt-4-custom:$PROMPTS_DIR/beast.txt"
  #"gemini:gemini-custom:$PROMPTS_DIR/gemini.txt"
  #"anthropic:claude-custom:$PROMPTS_DIR/anthropic.txt"
  #"qwen:custom-model:$PROMPTS_DIR/qwen.txt"
)

PORT_MITM=8010

# CSV header
if [ ! -f "$RESULTS_CSV" ]; then
  echo "run_id,timestamp,prompt_name,prompt_file,model_id,sdk,agent,has_final_response,has_tool_calls,tool_call_count,has_reasoning,api_calls,system_prompt_verified,system_prompt_length,success,user_prompt" > "$RESULTS_CSV"
fi

# SDKs to test
SDKS=(
  "@ai-sdk/openai-compatible"
  "@ai-sdk/anthropic"
)

say() { echo "▶ $*"; }

stop_mitm() {
  pkill -f "mitmdump.*$PORT_MITM" 2>/dev/null || true
}

start_mitm() {
  local out_mitm="$1" out_log="$2"
  nohup mitmdump \
    --mode "reverse:${VLLM_URL}" \
    -p "$PORT_MITM" \
    --ssl-insecure \
    -w "$out_mitm" \
    --set flow_detail=4 \
    > "$out_log" 2>&1 &
  sleep 2
}

# Real model ID on the vLLM server
REAL_MODEL_ID="openai/gpt-oss-120b"

write_opencode_config() {
  local model_id="$1" sdk="$2"
  mkdir -p ~/.config/opencode
  cat > ~/.config/opencode/opencode.json <<JSON
{
  "\$schema": "https://opencode.ai/config.json",
  "model": "vllm/${model_id}",
  "small_model": "vllm/${model_id}",
  "provider": {
    "vllm": {
      "npm": "${sdk}",
      "options": {
        "baseURL": "http://localhost:${PORT_MITM}/v1",
        "apiKey": "TOTO"
      },
      "models": {
        "${model_id}": {
          "id": "${REAL_MODEL_ID}",
          "name": "Test Model ${model_id}"
        }
      }
    }
  }
}
JSON
}

run_opencode() {
  local out="$1"
  timeout 120 opencode run --format json "$PROMPT" > "$out" 2>&1 || true
}

# Check if response has final text content (actual text, not just stop)
has_final_response() {
  local out="$1"
  # OpenCode NDJSON: a "type":"text" event means the model produced actual text output
  if grep -q '"type":"text"' "$out" 2>/dev/null; then
    echo 1
  else
    echo 0
  fi
}

# Check if response has tool calls
has_tool_calls() {
  local out="$1"
  if grep -qE '"tool_calls"|"function_call"|"type":"tool_use"' "$out" 2>/dev/null; then
    echo 1
  else
    echo 0
  fi
}

# Count tool calls in OpenCode NDJSON output
count_tool_calls() {
  local out="$1"
  local count
  count=$(grep -c '"type":"tool_use"' "$out" 2>/dev/null) || true
  echo "${count:-0}"
}

# Check if response has reasoning/thinking content
has_reasoning() {
  local out="$1"
  if grep -qE '"thinking"|"reasoning"|<thinking>|<reasoning>' "$out" 2>/dev/null; then
    echo 1
  else
    echo 0
  fi
}

# Determine success: has final response = conversation completed successfully
compute_success() {
  local has_response="$1"
  echo "$has_response"
}

# Count API calls from MITM log
count_api_calls() {
  local logfile="$1"
  local count
  count=$(grep -c "POST https://.*v1/" "$logfile" 2>/dev/null) || true
  echo "${count:-0}"
}

# Extract and verify system prompt from MITM capture
extract_system_prompt() {
  local mitm_file="$1" output_file="$2"
  # Use Python script to properly parse MITM capture (also prints final_response preview)
  /usr/bin/python3 "$SCRIPT_DIR/extract_system_prompt.py" "$mitm_file" "$output_file" || true
}

# Print tool calls summary from OpenCode NDJSON output
print_tool_calls() {
  local out="$1"
  /usr/bin/python3 -c "
import sys, json
tools = []
with open(sys.argv[1]) as f:
    for line in f:
        line = line.strip()
        if not line: continue
        try:
            obj = json.loads(line)
        except: continue
        if obj.get('type') == 'tool_use':
            p = obj.get('part', {})
            name = p.get('tool', '?')
            inp = p.get('state', {}).get('input', {})
            # Show the first relevant arg
            arg = inp.get('pattern') or inp.get('file_path') or inp.get('filePath') or inp.get('command', '')
            if arg:
                arg = str(arg)[:60]
                tools.append(f'{name}({arg})')
            else:
                tools.append(name)
if tools:
    print(f'  🔨 tool_calls: {\" -> \".join(tools)}', file=sys.stderr)
else:
    print(f'  🔨 tool_calls: (none)', file=sys.stderr)
" "$out" 2>&1 || true
}

# Print preview of the final text response from OpenCode NDJSON output
print_final_response() {
  local out="$1"
  /usr/bin/python3 -c "
import sys, json
text = ''
with open(sys.argv[1]) as f:
    for line in f:
        line = line.strip()
        if not line: continue
        try:
            obj = json.loads(line)
        except: continue
        if obj.get('type') == 'text':
            t = obj.get('part', {}).get('text', '')
            if len(t) > len(text):
                text = t
if text:
    preview = text[:150].replace('\n', '\\\\n')
    print(f' 👉 final_response: {len(text)} chars | {preview}', file=sys.stderr)
else:
    print('  👉 final_response: (none)', file=sys.stderr)
" "$out" 2>&1 || true
}

verify_system_prompt() {
  local captured="$1" expected_file="$2"
  if [ ! -s "$captured" ] || [ ! -s "$expected_file" ]; then
    echo 0
    return
  fi
  # Check if the full expected prompt is contained in the captured prompt
  /usr/bin/python3 -c "
import sys
expected = open(sys.argv[1]).read().strip()
captured = open(sys.argv[2]).read().strip()
sys.exit(0 if expected in captured else 1)
" "$expected_file" "$captured" 2>/dev/null && echo 1 || echo 0
}

save_csv() {
  local run_id="$1" ts="$2" prompt_name="$3" prompt_file="$4" model_id="$5" sdk="$6"
  local has_response="$7" has_tools="$8" tool_count="$9" has_reason="${10}" api_calls="${11}" verified="${12}" prompt_len="${13}" success="${14}"
  local escaped_prompt="${PROMPT//\"/\"\"}"
  echo "$run_id,$ts,$prompt_name,$prompt_file,$model_id,$sdk,opencode,$has_response,$has_tools,$tool_count,$has_reason,$api_calls,$verified,$prompt_len,$success,\"$escaped_prompt\"" >> "$RESULTS_CSV"
}

run_test_for_prompt() {
  local prompt_name="$1" model_id="$2" prompt_file="$3" sdk="$4" run_id="$5" run_num="$6"

  # Flat: experiments/system_prompt_test/{run_id}_{endpoint}_{system_prompt}/
  local sdk_short="${sdk##*/}"  # @ai-sdk/openai-compatible -> openai-compatible
  local test_dir="$EXPERIMENT_DIR/${run_id}_endpoint_${sdk_short}_system_prompt_${prompt_name}"
  mkdir -p "$test_dir"

  local out_file="$test_dir/output.json"
  local mitm_file="$test_dir/mitm.mitm"
  local mitm_log="$test_dir/mitm.log"
  local captured_prompt="$test_dir/system_prompt_captured.txt"
  local config_backup="$test_dir/opencode_config.json"
  local expected_prompt="$prompt_file"

  say "Testing $prompt_name + $sdk_short (model_id=$model_id)..."

  # Stop any existing MITM and start fresh
  stop_mitm
  start_mitm "$mitm_file" "$mitm_log"

  # Write config with this model_id and SDK
  write_opencode_config "$model_id" "$sdk"

  # Backup the config used for this test
  cp ~/.config/opencode/opencode.json "$config_backup"

  # Run opencode
  run_opencode "$out_file"

  # Wait for MITM to flush
  sleep 1
  stop_mitm

  # Extract system prompt from MITM
  extract_system_prompt "$mitm_file" "$captured_prompt"

  # Print tool calls and final response preview
  print_tool_calls "$out_file"
  print_final_response "$out_file"

  # Analyze results
  local has_response has_tools tool_count has_reason api_calls verified prompt_len success
  has_response=$(has_final_response "$out_file")
  has_tools=$(has_tool_calls "$out_file")
  tool_count=$(count_tool_calls "$out_file")
  has_reason=$(has_reasoning "$out_file")
  api_calls=$(count_api_calls "$mitm_log")
  verified=$(verify_system_prompt "$captured_prompt" "$expected_prompt")
  prompt_len=$(wc -c < "$expected_prompt" 2>/dev/null || echo 0)
  success=$(compute_success "$has_response")

  # Status icon
  local status_icon="❌"
  [ "$success" -eq 1 ] && status_icon="✅"

  echo "  $status_icon $prompt_name + $sdk_short: response=$has_response, tools=$tool_count, reasoning=$has_reason, verified=$verified, success=$success"

  # Save to CSV
  local ts
  ts=$(date -Iseconds)
  save_csv "$run_id" "$ts" "$prompt_name" "$prompt_file" "$model_id" "$sdk" \
           "$has_response" "$has_tools" "$tool_count" "$has_reason" "$api_calls" "$verified" "$prompt_len" "$success"
}

# MAIN
RUN_ID=$(head -c 4 /dev/urandom | xxd -p)

# Calculate total tests
TOTAL_TESTS=$(( ${#SYSTEM_PROMPTS[@]} * ${#SDKS[@]} * N_RUNS ))

echo
echo "════════════════════════════════════════════════════════════"
echo "  System Prompt Test"
echo "  Run ID: $RUN_ID"
echo "  Prompts: ${#SYSTEM_PROMPTS[@]} | SDKs: ${#SDKS[@]} | Runs: $N_RUNS"
echo "  Total tests: $TOTAL_TESTS"
echo "  User prompt: $PROMPT"
echo "════════════════════════════════════════════════════════════"

TEST_NUM=0
for run in $(seq 1 "$N_RUNS"); do
  for sdk in "${SDKS[@]}"; do
    for entry in "${SYSTEM_PROMPTS[@]}"; do
      IFS=':' read -r prompt_name model_id prompt_file <<< "$entry"
      TEST_NUM=$((TEST_NUM + 1))
      echo
      echo "──── Test $TEST_NUM / $TOTAL_TESTS (run $run) ────"
      run_test_for_prompt "$prompt_name" "$model_id" "$prompt_file" "$sdk" "${RUN_ID}_${run}" "$run"
    done
  done
done

stop_mitm

echo
echo "════════════════════════════════════════════════════════════"
echo "  COMPLETED $TOTAL_TESTS tests"
echo "  Run ID: $RUN_ID"
echo "  Results: $RESULTS_CSV"
echo "  Experiments: $EXPERIMENT_DIR/${RUN_ID}_*/"
echo "════════════════════════════════════════════════════════════"
