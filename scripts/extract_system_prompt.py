#!/usr/bin/env python3
"""Extract system prompt and final response from mitmproxy capture file.

Handles both SDK formats:
- @ai-sdk/openai-compatible: system prompt in messages[].role=="system"
- @ai-sdk/anthropic: system prompt in top-level "system" array field

Skips the title-generator request (first request) and finds the longest
system prompt across all captured requests, which is the real agent prompt.

Also extracts the final text response from the last SSE stream.
"""
import sys
import json

from mitmproxy import io as mitmio
from mitmproxy.exceptions import FlowReadException


def _extract_from_body(body: dict) -> str | None:
    """Extract system prompt from a single request body."""
    parts: list[str] = []

    # Anthropic format: top-level "system" field (array of {type, text} or string)
    system_field = body.get("system")
    if system_field:
        if isinstance(system_field, str):
            parts.append(system_field)
        elif isinstance(system_field, list):
            for item in system_field:
                if isinstance(item, dict) and item.get("type") == "text":
                    parts.append(item.get("text", ""))
                elif isinstance(item, str):
                    parts.append(item)

    # OpenAI-compatible format: messages with role=="system"
    for msg in body.get("messages", []):
        if msg.get("role") == "system":
            content = msg.get("content", "")
            if isinstance(content, str):
                parts.append(content)
            elif isinstance(content, list):
                for item in content:
                    if isinstance(item, dict) and item.get("type") == "text":
                        parts.append(item.get("text", ""))
                    elif isinstance(item, str):
                        parts.append(item)

    if parts:
        return "\n".join(parts)
    return None


def _parse_sse_content(raw: bytes) -> str:
    """Parse SSE stream and concatenate all text content from delta events.

    Handles both formats:
    - OpenAI: choices[].delta.content
    - Anthropic: content_block_delta with delta.type=="text_delta"
    """
    parts: list[str] = []
    text = raw.decode("utf-8", errors="replace")
    for line in text.splitlines():
        if not line.startswith("data: ") or line.strip() == "data: [DONE]":
            continue
        try:
            chunk = json.loads(line[6:])
        except (json.JSONDecodeError, ValueError):
            continue
        # OpenAI-compatible format
        for choice in chunk.get("choices", []):
            delta = choice.get("delta", {})
            content = delta.get("content")
            if content:
                parts.append(content)
        # Anthropic format: content_block_delta with text_delta
        if chunk.get("type") == "content_block_delta":
            delta = chunk.get("delta", {})
            if delta.get("type") == "text_delta":
                t = delta.get("text")
                if t:
                    parts.append(t)
    return "".join(parts)


def extract_final_response(mitm_file: str) -> str | None:
    """Read .mitm file and extract the final text response from the last SSE stream."""
    last_content = None
    try:
        with open(mitm_file, "rb") as f:
            reader = mitmio.FlowReader(f)
            for flow in reader.stream():
                if not (hasattr(flow, "response") and flow.response):
                    continue
                if not flow.response.content:
                    continue
                text = _parse_sse_content(flow.response.content)
                if text:
                    last_content = text
    except FlowReadException as e:
        print(f"Error reading {mitm_file}: {e}", file=sys.stderr)
    if last_content:
        preview = last_content[:150].replace("\n", "\\n")
        print(f"  final_response: {len(last_content)} chars | {preview}", file=sys.stderr)
    return last_content


def extract_system_prompt(mitm_file: str) -> str | None:
    """Read .mitm file and extract the longest system prompt (skipping title generator)."""
    prompts: list[str] = []
    try:
        with open(mitm_file, "rb") as f:
            reader = mitmio.FlowReader(f)
            for flow in reader.stream():
                if not (hasattr(flow, "request") and flow.request):
                    continue
                try:
                    body = json.loads(flow.request.content)
                except (json.JSONDecodeError, AttributeError, TypeError):
                    continue
                prompt = _extract_from_body(body)
                if prompt:
                    prompts.append(prompt)
    except FlowReadException as e:
        print(f"Error reading {mitm_file}: {e}", file=sys.stderr)

    if not prompts:
        return None

    # Return the longest prompt — the title-generator prompt is always short,
    # while the real agent system prompt is much longer.
    selected = max(prompts, key=len)
    preview = selected[:100].replace("\n", "\\n")
    print(f"  system_prompt: {len(selected)} chars | {preview}", file=sys.stderr)
    return selected


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: extract_system_prompt.py <mitm_file> [output_file]")
        sys.exit(1)

    mitm_file = sys.argv[1]
    output_file = sys.argv[2] if len(sys.argv) > 2 else None

    prompt = extract_system_prompt(mitm_file)

    if prompt:
        if output_file:
            with open(output_file, "w") as f:
                f.write(prompt)
        else:
            print(prompt)
    else:
        print("No system prompt found", file=sys.stderr)
        sys.exit(1)
