#!/usr/bin/env python3
"""
Proxy with retry logic for vLLM.
Retries if model returns empty text response.
"""

import json
import os
import httpx
from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse, JSONResponse
import uvicorn

app = FastAPI()

VLLM_URL = os.environ.get("VLLM_URL", "https://vllm.concrete-security.com")
MAX_RETRIES = int(os.environ.get("MAX_RETRIES", "2"))


def parse_sse_events(raw_response: str) -> list[dict]:
    """Parse SSE events from raw response into JSON objects."""
    events = []
    for line in raw_response.split("\n"):
        line = line.strip()
        if line.startswith("data:"):
            data = line[5:].strip()
            if data and data != "[DONE]":
                try:
                    events.append(json.loads(data))
                except json.JSONDecodeError:
                    pass
    return events


def extract_anthropic_response(events: list[dict]) -> tuple[str, bool]:
    """Extract text and tool usage from Anthropic SSE events."""
    text_parts = []
    has_tool = False

    for event in events:
        event_type = event.get("type", "")

        # Text content from content_block_delta
        if event_type == "content_block_delta":
            delta = event.get("delta", {})
            if delta.get("type") == "text_delta":
                text_parts.append(delta.get("text", ""))

        # Tool usage from content_block_start
        if event_type == "content_block_start":
            content_block = event.get("content_block", {})
            if content_block.get("type") == "tool_use":
                has_tool = True

    return "".join(text_parts), has_tool


def extract_openai_response(events: list[dict]) -> tuple[str, bool]:
    """Extract text and tool usage from OpenAI SSE events."""
    text_parts = []
    has_tool = False

    for event in events:
        choices = event.get("choices", [])
        for choice in choices:
            delta = choice.get("delta", {})

            # Text content
            content = delta.get("content")
            if content:
                text_parts.append(content)

            # Tool calls
            if delta.get("tool_calls"):
                has_tool = True

    return "".join(text_parts), has_tool


async def forward_with_retry(body: dict, headers: dict, endpoint: str = "/v1/chat/completions", retry_count: int = 0):
    """Forward request to vLLM, retry if response has no text or HTTP error."""
    url = f"{VLLM_URL}{endpoint}"

    print(f"\n{'='*60}")
    print(f"[forward] attempt={retry_count + 1}/{MAX_RETRIES + 1}")
    print(f"[forward] POST {url}")
    print(f"[forward] model={body.get('model')}")
    print(f"[forward] messages count={len(body.get('messages', []))}")

    async with httpx.AsyncClient(verify=False) as client:
        async with client.stream("POST", url, json=body, headers=headers, timeout=300.0) as resp:
            status_code = resp.status_code
            print(f"[forward] response status={status_code}")

            # Check for HTTP errors (4xx/5xx)
            if status_code >= 400:
                error_body = await resp.aread()
                error_text = error_body.decode("utf-8", errors="ignore")
                print(f"[forward] HTTP ERROR {status_code}: {error_text[:200]}")

                if retry_count < MAX_RETRIES:
                    print(f"[forward] HTTP error, will retry...")
                    return await forward_with_retry(body, headers, endpoint, retry_count + 1)
                else:
                    print(f"[forward] FAILED - max retries reached after HTTP error")
                    return [error_body], status_code

            chunks = []
            full_response = ""

            async for chunk in resp.aiter_bytes():
                chunks.append(chunk)
                full_response += chunk.decode("utf-8", errors="ignore")

            # Parse SSE events and extract text/tools using JSON parser
            events = parse_sse_events(full_response)

            if endpoint == "/v1/messages":
                total_text, has_tool = extract_anthropic_response(events)
            else:
                total_text, has_tool = extract_openai_response(events)

            has_text = len(total_text.strip()) > 0
            has_response = has_text or has_tool

            print(f"[forward] DONE: {len(chunks)} chunks, {len(events)} SSE events parsed")
            print(f"[forward] text={len(total_text)} chars")
            print(f"[forward] has_text={has_text}, has_tool={has_tool} → valid={has_response}")
            if total_text:
                print(f"[forward] text preview: {total_text[:100]}...")

            if not has_response and retry_count < MAX_RETRIES:
                print(f"[forward] NO TEXT! Will retry...")
                body["messages"].append({
                    "role": "user",
                    "content": "Provide your final response or a tool function."
                })
                return await forward_with_retry(body, headers, endpoint, retry_count + 1)

            if has_response:
                print(f"[forward] SUCCESS - returning response")
            else:
                print(f"[forward] FAILED - max retries reached")

            return chunks, status_code


@app.post("/v1/messages")
async def proxy_messages(request: Request):
    body = await request.json()
    headers = {
        "Content-Type": "application/json",
        "x-api-key": request.headers.get("x-api-key", "EMPTY"),
    }

    try:
        chunks, status_code = await forward_with_retry(body, headers, endpoint="/v1/messages")
        if status_code >= 400:
            return JSONResponse(
                content={"error": {"message": "Upstream error", "type": "upstream_error"}},
                status_code=status_code
            )
        return StreamingResponse((c for c in chunks), media_type="text/event-stream")
    except Exception as e:
        print(f"[proxy] Error: {e}")
        return JSONResponse(content={"error": str(e)}, status_code=500)


@app.post("/v1/chat/completions")
async def proxy_completions(request: Request):
    body = await request.json()
    headers = {
        "Content-Type": "application/json",
        "Authorization": request.headers.get("Authorization", "Bearer EMPTY"),
    }

    try:
        chunks, status_code = await forward_with_retry(body, headers, endpoint="/v1/chat/completions")
        if status_code >= 400:
            return JSONResponse(
                content={"error": {"message": "Upstream error", "type": "upstream_error"}},
                status_code=status_code
            )
        return StreamingResponse((c for c in chunks), media_type="text/event-stream")
    except Exception as e:
        print(f"[proxy] Error: {e}")
        return JSONResponse(content={"error": str(e)}, status_code=500)


@app.get("/v1/models")
async def proxy_models():
    async with httpx.AsyncClient(verify=False) as client:
        resp = await client.get(f"{VLLM_URL}/v1/models")
        return resp.json()


if __name__ == "__main__":
    port = int(os.environ.get("PROXY_PORT", "8003"))
    print(f"[proxy] Starting on port {port}...")
    uvicorn.run(app, host="0.0.0.0", port=port)
