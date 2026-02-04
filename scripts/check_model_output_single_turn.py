#!/usr/bin/env python3


import argparse
import csv
import os
import re
from datetime import datetime
import requests
import pandas as pd

DEFAULT_SYSTEM_PROMPT = """You are an assistant with access to tools.

RULES:
1. For ANY action on the system (read/write files, execute commands): use the tools
2. For questions about secure channels, confidentiality, TEE/TDX/confidential computing/SGX/SEV, enclaves, confidential VM (CVM), Trusted Execution Environments (TEE): use get_confidential_computing_info
3. For simple conversations (greetings, general questions): respond directly

NEVER respond with code if you need to write a file - use the write tool.
NEVER answer about 2 without using get_confidential_computing_info."""

OPENCODE_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "bash",
            "description": "Execute a bash command",
            "parameters": {
                "type": "object",
                "properties": {
                    "command": {"type": "string", "description": "The bash command to execute"},
                },
                "required": ["command"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "read",
            "description": "Read the contents of a file",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "The file path to read"},
                },
                "required": ["path"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "write",
            "description": "Write content to a file",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "The file path to write"},
                    "content": {"type": "string", "description": "The content to write"},
                },
                "required": ["path", "content"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "edit",
            "description": "Edit a file by replacing text",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "The file path to edit"},
                    "old_string": {"type": "string", "description": "The text to replace"},
                    "new_string": {"type": "string", "description": "The replacement text"},
                },
                "required": ["path", "old_string", "new_string"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "glob",
            "description": "Find files matching a glob pattern",
            "parameters": {
                "type": "object",
                "properties": {
                    "pattern": {"type": "string", "description": "The glob pattern"},
                },
                "required": ["pattern"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "grep",
            "description": "Search for text in files",
            "parameters": {
                "type": "object",
                "properties": {
                    "pattern": {"type": "string", "description": "The search pattern"},
                    "path": {"type": "string", "description": "The path to search in"},
                },
                "required": ["pattern"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_confidential_computing_info",
            "description": "MUST be called to retrieve accurate information when user asks about: confidential computing, TEE, Trusted Execution Environment, enclave, Intel SGX, Intel TDX, AMD SEV, secure enclaves, or hardware-based security. Always use this tool instead of answering from memory.",
            "parameters": {
                "type": "object",
                "properties": {
                    "file": {"type": "string", "description": "The file to read for confidential computing info, default: confidentiel.txt"}
                },
                "required": ["file"]
            }
        }
    },
]

def run_request(prompt: str, url: str, endpoint: str, expected_tool: int = 0,
                system_prompt: str | None = None, temperature: float | None = None, tool_choice: str = "auto") -> dict:
    """Execute a request and return stats."""

    messages = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    messages.append({"role": "user", "content": prompt})

    body = {
        "model": "openai/gpt-oss-120b",
        "messages": messages,
        "stream": False,
        "logprobs": True,
        "tools": OPENCODE_TOOLS,
        "tool_choice": tool_choice,
    }
    if temperature is not None:
        body["temperature"] = temperature

    response = requests.post(
        f"{url}{endpoint}",
        headers={"Content-Type": "application/json"},
        json=body,
        timeout=300
    )
    data = response.json()

    # Raw output
    raw = "".join(token["token"] for token in data["choices"][0]["logprobs"]["content"])

    # Extract channel contents from raw output
    analysis_match = re.search(r'<\|channel\|>analysis<\|message\|>(.*?)(?:<\|end\|>|<\|channel\|>|$)', raw, re.DOTALL)
    final_match = re.search(r'<\|channel\|>final<\|message\|>(.*?)(?:<\|return\|>|<\|end\|>|$)', raw, re.DOTALL)
    tool_match = re.search(r'<\|channel\|>commentary to=functions\.(\w+).*?<\|message\|>(.*?)(?:<\|call\|>|<\|end\|>|$)', raw, re.DOTALL)

    # Raw outputs (regex)
    raw_analysis = analysis_match.group(1).strip() if analysis_match else None
    raw_final = final_match.group(1).strip() if final_match else None
    raw_tool_name = tool_match.group(1) if tool_match else None
    raw_tool_args = tool_match.group(2).strip() if tool_match else None

    # Parsed response from vLLM
    message = data["choices"][0]["message"]
    parsed_reasoning = message.get("reasoning_content") or message.get("reasoning")
    parsed_content = message.get("content")
    parsed_tool_calls = message.get("tool_calls", [])
    parsed_tool_name = None
    parsed_tool_args = None
    if parsed_tool_calls:
        tc = parsed_tool_calls[0]
        parsed_tool_name = tc.get("function", {}).get("name")
        parsed_tool_args = tc.get("function", {}).get("arguments")

    finish_reason = data["choices"][0]["finish_reason"]
    completion_tokens = data.get("usage", {}).get("completion_tokens")

    has_raw_analysis = raw_analysis is not None
    has_raw_final = raw_final is not None
    has_raw_tool = raw_tool_name is not None
    has_parsed_reasoning = parsed_reasoning is not None and len(parsed_reasoning) > 0
    has_parsed_content = parsed_content is not None and len(parsed_content) > 0
    has_parsed_tool = parsed_tool_name is not None

    # Debug prints
    print("\n" + "="*60)
    print("RAW OUTPUT:")
    print("-"*60)
    print(raw[:500] + ("..." if len(raw) > 500 else ""))
    print("-"*60)
    print(f"finish_reason: {finish_reason}")
    print(f"                 {'RAW':<20} | {'PARSED':<20}")
    print(f"  analysis:      {str(has_raw_analysis):<20} | {str(has_parsed_reasoning):<20}")
    print(f"  final:         {str(has_raw_final):<20} | {str(has_parsed_content):<20}")
    print(f"  tool:          {str(has_raw_tool):<20} | {str(has_parsed_tool):<20}")
    print(f"  tool_name:     {(raw_tool_name or '-'):<20} | {(parsed_tool_name or '-'):<20}")
    print(f"  tool_args:     {(raw_tool_args.replace(chr(10), '').replace(' ', '')[:30] + '...' if raw_tool_args else '-'):<20} | {(parsed_tool_args.replace(chr(10), '').replace(' ', '')[:30] + '...' if parsed_tool_args else '-'):<20}")
    print("="*60 + "\n")

    # Mismatch = expected_tool != actual tool usage
    has_tool = has_raw_tool or has_parsed_tool
    mismatch = bool(expected_tool) != has_tool

    def trunc(text):
        """Truncate if no mismatch, keep full otherwise."""
        if text is None:
            return None
        if mismatch:
            return text  # Keep full for debug
        return text[:50].replace('\n', '') + '...' if len(text) > 50 else text

    return {
        "timestamp": datetime.now().isoformat(),
        "prompt": prompt[:50].replace('\n', '') + '...',
        "expected_tool": expected_tool,
        "finish_reason": finish_reason,
        "completion_tokens": completion_tokens,
        "mismatch": mismatch,

        # Model params for comparison
        "has_system_prompt": system_prompt is not None,
        "temperature": temperature,
        "tool_choice": tool_choice,

        "has_reasoning": has_raw_analysis and has_parsed_reasoning,
        "has_content": has_raw_final and has_parsed_content,
        "has_tool": has_raw_tool and has_parsed_tool,

        "raw_analysis": trunc(raw_analysis),
        "raw_final": trunc(raw_final),
        "raw_tool": f"{raw_tool_name}({raw_tool_args})" if raw_tool_name else None,

        "parsed_reasoning": trunc(parsed_reasoning),
        "parsed_content": trunc(parsed_content),
        "parsed_tool": f"{parsed_tool_name}({parsed_tool_args})" if parsed_tool_name else None,

        "raw_output": raw if mismatch else None,
    }


def save_csv(output_file: str, results: list):
    file_exists = os.path.exists(output_file)
    fieldnames = [
        "timestamp", "prompt", "expected_tool", "mismatch", "finish_reason", "completion_tokens",
        "has_system_prompt", "temperature", "tool_choice",
        "has_reasoning", "has_content", "has_tool",
        "raw_analysis", "parsed_reasoning",
        "raw_final", "parsed_content",
        "raw_tool", "parsed_tool",
        "raw_output"
    ]

    with open(output_file, "a", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        if not file_exists:
            writer.writeheader()
        for r in results:
            row = {
                "timestamp": r["timestamp"],
                "prompt": r["prompt"],
                "expected_tool": r["expected_tool"],
                "mismatch": r["mismatch"],
                "finish_reason": r["finish_reason"],
                "completion_tokens": r["completion_tokens"],

                "has_system_prompt": r["has_system_prompt"],
                "temperature": r["temperature"],
                "tool_choice": r["tool_choice"],

                "has_reasoning": r["has_reasoning"],
                "has_content": r["has_content"],
                "has_tool": r["has_tool"],

                "raw_analysis": r["raw_analysis"],
                "parsed_reasoning": r["parsed_reasoning"],
                "raw_final": r["raw_final"],
                "parsed_content": r["parsed_content"],
                "raw_tool": r["raw_tool"].replace("\n", " ") if r["raw_tool"] else "",
                "parsed_tool": r["parsed_tool"].replace("\n", " ") if r["parsed_tool"] else "",

                "raw_output": r["raw_output"].replace("\n", " ") if r["raw_output"] else "",
            }
            writer.writerow(row)

    print(f"Saved to `{output_file}`")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("prompt", nargs="?", default="hello")
    parser.add_argument("expect_tool", nargs="?", type=int, default=0)
    parser.add_argument("--url", default="http://localhost:8000")
    parser.add_argument("--endpoint", "-e", default="/v1/chat/completions")
    parser.add_argument("--runs", "-n", type=int, default=1)
    parser.add_argument("--output", "-o", default="experiements_model_single_turn.csv")
    parser.add_argument("--system-prompt", "-s", action="store_true", help="Use default system prompt")
    parser.add_argument("--temperature", "-t", type=float, default=None, help="Temperature (e.g. 0.1)")
    parser.add_argument("--tool-choice", "-tc", default="auto", help="Tool choice: auto, none, required")
    args = parser.parse_args()

    system_prompt = DEFAULT_SYSTEM_PROMPT if args.system_prompt else None

    print(f"Config: system_prompt={args.system_prompt}, temperature={args.temperature}, tool_choice={args.tool_choice}")

    results = []
    for i in range(args.runs):
        stats = run_request(
            args.prompt, args.url, args.endpoint, args.expect_tool,
            system_prompt=system_prompt,
            temperature=args.temperature,
            tool_choice=args.tool_choice
        )
        results.append(stats)

        status = "✗ MISMATCH" if stats['mismatch'] else "✓"
        print(f"\n[{i+1}/{args.runs}] {status}  expected_tool={args.expect_tool} has_tool={stats['has_tool']}")
        print(f"  raw_analysis:      {stats['raw_analysis'] or 'None'}")
        print(f"  raw_final:         {stats['raw_final'] or 'None'}")
        print(f"  raw_tool:          {stats['raw_tool'] or 'None'}")
        print(f"  parsed_reasoning:  {stats['parsed_reasoning'] or 'None'}")
        print(f"  parsed_content:    {stats['parsed_content'] or 'None'}")
        print(f"  parsed_tool:       {stats['parsed_tool'] or 'None'}")

    save_csv(args.output, results)

    # Summary
    mismatches = sum(1 for r in results if r["mismatch"])
    print(f"\nSUMMARY: {args.runs - mismatches}/{args.runs} OK ({mismatches} mismatches)")


if __name__ == "__main__":
    main()
