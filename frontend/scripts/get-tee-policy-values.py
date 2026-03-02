#!/usr/bin/env python3
"""
Fetch TDX quote from a TEE and extract all policy values.

This script fetches the TDX quote from a TEE's /tdx_quote endpoint and extracts
all the values needed to configure ATLAS policy verification, including:
- Bootchain measurements (MRTD, RTMR0-2) from TDX quote
- OS image hash from event log
- App compose configuration from tcb_info field

Usage:
    python3 get-tee-policy-values.py [hostname]

Example:
    python3 get-tee-policy-values.py vllm.concrete-security.com
    python3 get-tee-policy-values.py my-tee.example.com
"""

import base64
import hashlib
import json
import os
import re
import secrets
import sys
import urllib.request
import urllib.error

def fetch_quote(hostname: str) -> dict:
    """Fetch TDX quote from the TEE."""
    url = f"https://{hostname}/tdx_quote"
    # nonce_hex is required by modern attestation-service versions.
    # 32 random bytes encoded as 64 hex chars.
    data = json.dumps({"nonce_hex": secrets.token_hex(32)}).encode('utf-8')

    req = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST"
    )

    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            return json.loads(response.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        error_body = e.read().decode('utf-8')
        print(f"HTTP Error {e.code}: {error_body}", file=sys.stderr)
        sys.exit(1)
    except urllib.error.URLError as e:
        print(f"Connection error: {e.reason}", file=sys.stderr)
        sys.exit(1)

def parse_quote(quote_hex: str) -> dict:
    """Parse TDX quote binary to extract measurements."""
    if quote_hex.startswith("0x"):
        quote_hex = quote_hex[2:]
    quote = bytes.fromhex(quote_hex)

    # TDX Quote v4 structure - TD Report starts at offset 48
    body_offset = 48
    mrtd_offset = body_offset + 136
    rtmr0_offset = body_offset + 328
    rtmr1_offset = body_offset + 376
    rtmr2_offset = body_offset + 424
    rtmr3_offset = body_offset + 472

    return {
        "mrtd": quote[mrtd_offset:mrtd_offset+48].hex(),
        "rtmr0": quote[rtmr0_offset:rtmr0_offset+48].hex(),
        "rtmr1": quote[rtmr1_offset:rtmr1_offset+48].hex(),
        "rtmr2": quote[rtmr2_offset:rtmr2_offset+48].hex(),
        "rtmr3": quote[rtmr3_offset:rtmr3_offset+48].hex(),
    }

def parse_event_log(event_log_str: str) -> dict:
    """Parse event log to extract key values."""
    try:
        events = json.loads(event_log_str) if event_log_str else []
    except json.JSONDecodeError:
        return {}

    result = {}
    for event in events:
        event_name = event.get('event', '')
        payload = event.get('event_payload', '')
        if event_name == 'os-image-hash':
            result['os_image_hash'] = payload
        elif event_name == 'compose-hash':
            result['compose_hash'] = payload
        elif event_name == 'app-id':
            result['app_id'] = payload

    return result

def read_env_file(env_path: str) -> str:
    """Read an env file, returning empty string if it doesn't exist."""
    if os.path.exists(env_path):
        with open(env_path, "r") as f:
            return f.read()
    return ""


def get_current_value(content: str, key: str) -> str | None:
    """Extract the current value of a key from env file content."""
    match = re.search(rf'^{re.escape(key)}=["\']?(.*?)["\']?\s*$', content, re.MULTILINE)
    return match.group(1) if match else None


def apply_env_update(content: str, key: str, value: str) -> str:
    """Apply a single env var update to the content string."""
    pattern = re.compile(rf'^{re.escape(key)}=.*$', re.MULTILINE)
    replacement = f'{key}="{value}"'
    if pattern.search(content):
        return pattern.sub(replacement, content)
    if content and not content.endswith('\n'):
        content += '\n'
    return content + replacement + '\n'


def format_value_preview(key: str, value: str) -> str:
    """Return a human-readable preview of a value (truncated for long b64)."""
    if key == "NEXT_PUBLIC_ATLAS_APP_COMPOSE":
        try:
            decoded = json.loads(base64.b64decode(value).decode())
            docker_compose = decoded.get("docker_compose_file", "")
            lines = docker_compose.split('\n')[:6]
            preview = '\n'.join(f'    {l}' for l in lines)
            if len(docker_compose.split('\n')) > 6:
                preview += '\n    ...'
            return f"  (base64-encoded app_compose, docker-compose preview):\n{preview}"
        except Exception:
            return f"  {value[:80]}..."
    return f"  {value}"


def diff_compose_values(old_b64: str, new_b64: str) -> str:
    """Show a meaningful diff between two base64-encoded app_compose values."""
    try:
        old = json.loads(base64.b64decode(old_b64).decode())
        new = json.loads(base64.b64decode(new_b64).decode())
    except Exception:
        return "  (unable to decode for diff)"

    changes = []
    old_dc = old.get("docker_compose_file", "")
    new_dc = new.get("docker_compose_file", "")
    if old_dc != new_dc:
        import difflib
        diff = difflib.unified_diff(
            old_dc.splitlines(), new_dc.splitlines(),
            fromfile="current docker-compose", tofile="new docker-compose",
            lineterm="",
        )
        changes.append('\n'.join(f'    {l}' for l in diff))

    # Compare top-level keys other than docker_compose_file
    for k in sorted(set(list(old.keys()) + list(new.keys()))):
        if k == "docker_compose_file":
            continue
        if old.get(k) != new.get(k):
            changes.append(f'    {k}: {old.get(k)!r} -> {new.get(k)!r}')

    return '\n'.join(changes) if changes else "  (no meaningful difference)"

def main():
    import argparse
    parser = argparse.ArgumentParser(description='Fetch TDX quote and extract policy values')
    parser.add_argument('hostname', nargs='?', default='vllm.concrete-security.com',
                        help='TEE hostname (default: vllm.concrete-security.com)')
    parser.add_argument('--allowed-envs', '-e', type=str, default='',
                        help='Comma-separated list of allowed environment variables for app_compose')
    parser.add_argument('--update-env', type=str, metavar='FILE',
                        help='Update the given .env file in-place with the fetched policy values')
    parser.add_argument('--yes', '-y', action='store_true',
                        help='Skip confirmation prompts (accept all changes)')
    args = parser.parse_args()

    hostname = args.hostname
    allowed_envs = [e.strip() for e in args.allowed_envs.split(',') if e.strip()]

    sys.stderr.write(f"Fetching TDX quote from {hostname}...\n")
    sys.stderr.flush()

    response = fetch_quote(hostname)

    quote_data = response.get('quote', response)
    quote_hex = quote_data.get('quote', '')
    if not quote_hex:
        print(
            "ERROR: /tdx_quote response is missing 'quote.quote'. "
            "Verify CVM/atlas versions are aligned and endpoint returned a valid attestation payload.",
            file=sys.stderr,
        )
        print(f"Response keys: {sorted(response.keys())}", file=sys.stderr)
        if isinstance(quote_data, dict):
            print(f"quote keys: {sorted(quote_data.keys())}", file=sys.stderr)
        sys.exit(1)
    event_log_str = quote_data.get('event_log', '[]')
    vm_config_raw = quote_data.get('vm_config', {})
    # vm_config might be a JSON string or dict
    if isinstance(vm_config_raw, str):
        vm_config = json.loads(vm_config_raw) if vm_config_raw else {}
    else:
        vm_config = vm_config_raw or {}

    # Extract tcb_info which contains the full app_compose
    tcb_info = response.get('tcb_info', {})
    app_compose_str = tcb_info.get('app_compose', '')
    tcb_compose_hash = tcb_info.get('compose_hash', '')
    tcb_os_image_hash = tcb_info.get('os_image_hash', '')

    # Parse quote and event log
    measurements = parse_quote(quote_hex)
    event_data = parse_event_log(event_log_str)

    # Verify app_compose hash if available
    app_compose_verified = False
    if app_compose_str and tcb_compose_hash:
        computed_hash = hashlib.sha256(app_compose_str.encode()).hexdigest()
        app_compose_verified = (computed_hash == tcb_compose_hash)

    # Output
    print("=" * 60)
    print(f"TEE Policy Values for {hostname}")
    print("=" * 60)
    print()

    print("# Bootchain Measurements (from TDX Quote)")
    print("# These identify the TEE firmware and initial boot state")
    print(f'NEXT_PUBLIC_ATLAS_EXPECTED_MRTD="{measurements["mrtd"]}"')
    print(f'NEXT_PUBLIC_ATLAS_EXPECTED_RTMR0="{measurements["rtmr0"]}"')
    print(f'NEXT_PUBLIC_ATLAS_EXPECTED_RTMR1="{measurements["rtmr1"]}"')
    print(f'NEXT_PUBLIC_ATLAS_EXPECTED_RTMR2="{measurements["rtmr2"]}"')
    print()

    print("# OS Image Hash (from Event Log)")
    if event_data.get('os_image_hash'):
        print(f'NEXT_PUBLIC_ATLAS_EXPECTED_OS_HASH="{event_data["os_image_hash"]}"')
    else:
        print("# WARNING: os-image-hash not found in event log")
    print()

    print("# App Compose (from tcb_info)")
    if app_compose_str:
        if app_compose_verified:
            print(f'# compose-hash: {tcb_compose_hash} (VERIFIED)')
        else:
            print(f'# compose-hash: {tcb_compose_hash} (NOT VERIFIED)')
        # Parse app_compose to show docker-compose info
        try:
            app_compose = json.loads(app_compose_str)
            docker_compose = app_compose.get('docker_compose_file', '')
            if docker_compose:
                # Show first few lines
                lines = docker_compose.split('\n')[:5]
                print('# docker-compose.yml preview:')
                for line in lines:
                    print(f'#   {line}')
                if len(docker_compose.split('\n')) > 5:
                    print('#   ...')
        except json.JSONDecodeError:
            pass
    else:
        print("# WARNING: app_compose not found in tcb_info")
    print()

    print("# App ID")
    if event_data.get('app_id'):
        print(f'# app-id: {event_data["app_id"]}')
    print()

    print("# VM Config")
    if vm_config:
        print(f'# Image Name: {vm_config.get("image", "N/A")}')
        print(f'# CPU Count: {vm_config.get("cpu_count", "N/A")}')
        mem_bytes = vm_config.get("memory_size", 0)
        mem_gb = mem_bytes / (1024**3) if mem_bytes else 0
        print(f'# Memory: {mem_gb:.0f} GB')
        print(f'# GPUs: {vm_config.get("num_gpus", 0)}')
    print()

    print("# RTMR3 (runtime measurements, changes with each boot)")
    print(f'# rtmr3: {measurements["rtmr3"]}')
    print()

    print("=" * 60)
    print("Copy these to your .env file:")
    print("=" * 60)
    print()
    print(f'NEXT_PUBLIC_ATLAS_EXPECTED_MRTD="{measurements["mrtd"]}"')
    print(f'NEXT_PUBLIC_ATLAS_EXPECTED_RTMR0="{measurements["rtmr0"]}"')
    print(f'NEXT_PUBLIC_ATLAS_EXPECTED_RTMR1="{measurements["rtmr1"]}"')
    print(f'NEXT_PUBLIC_ATLAS_EXPECTED_RTMR2="{measurements["rtmr2"]}"')
    os_hash = tcb_os_image_hash or event_data.get('os_image_hash')
    if os_hash:
        print(f'NEXT_PUBLIC_ATLAS_EXPECTED_OS_HASH="{os_hash}"')
    print()

    # Output app_compose from tcb_info (this is the authoritative source)
    if app_compose_str:
        print("=" * 60)
        print("App Compose Configuration (from TEE tcb_info):")
        print("=" * 60)
        print()

        # Base64 encode the full app_compose JSON string
        app_compose_b64 = base64.b64encode(app_compose_str.encode()).decode()
        print(f'NEXT_PUBLIC_ATLAS_APP_COMPOSE="{app_compose_b64}"')
        print()
        print(f"# compose-hash: {tcb_compose_hash}")
        if app_compose_verified:
            print("# Hash verification: PASSED")
        else:
            print("# Hash verification: FAILED")

        # Show preview of the app_compose content
        try:
            app_compose = json.loads(app_compose_str)
            docker_compose = app_compose.get('docker_compose_file', '')
            tee_allowed_envs = app_compose.get('allowed_envs', [])
            if docker_compose:
                lines = docker_compose.split('\n')[:3]
                print('# docker-compose.yml preview:')
                for line in lines:
                    print(f'#   {line}')
                print('#   ...')
            if tee_allowed_envs:
                print(f'# allowed_envs: {tee_allowed_envs}')
        except json.JSONDecodeError:
            pass
        print()

    # Update .env file if requested
    if args.update_env:
        env_updates = {
            "NEXT_PUBLIC_ATLAS_EXPECTED_MRTD": measurements["mrtd"],
            "NEXT_PUBLIC_ATLAS_EXPECTED_RTMR0": measurements["rtmr0"],
            "NEXT_PUBLIC_ATLAS_EXPECTED_RTMR1": measurements["rtmr1"],
            "NEXT_PUBLIC_ATLAS_EXPECTED_RTMR2": measurements["rtmr2"],
        }
        if os_hash:
            env_updates["NEXT_PUBLIC_ATLAS_EXPECTED_OS_HASH"] = os_hash
        if app_compose_str:
            app_compose_b64 = base64.b64encode(app_compose_str.encode()).decode()
            env_updates["NEXT_PUBLIC_ATLAS_APP_COMPOSE"] = app_compose_b64

        content = read_env_file(args.update_env)
        applied = 0
        skipped = 0
        unchanged = 0

        print()
        for key, new_value in env_updates.items():
            old_value = get_current_value(content, key)

            if old_value == new_value:
                unchanged += 1
                continue

            short_key = key.replace("NEXT_PUBLIC_ATLAS_EXPECTED_", "").replace("NEXT_PUBLIC_ATLAS_", "")
            print(f"--- {short_key} ---")
            if old_value is None:
                print(f"  NEW (not currently set)")
                print(f"  Value: {format_value_preview(key, new_value)}")
            elif key == "NEXT_PUBLIC_ATLAS_APP_COMPOSE":
                print(diff_compose_values(old_value, new_value))
            else:
                print(f"  old: {old_value}")
                print(f"  new: {new_value}")

            if args.yes:
                answer = "y"
            else:
                answer = input(f"  Apply {short_key}? [Y/n] ").strip().lower()
            if answer in ("", "y", "yes"):
                content = apply_env_update(content, key, new_value)
                applied += 1
                print(f"  -> applied")
            else:
                skipped += 1
                print(f"  -> skipped")
            print()

        if applied > 0:
            with open(args.update_env, "w") as f:
                f.write(content)

        print(f"Done: {applied} updated, {skipped} skipped, {unchanged} unchanged.")
        return

    print("=" * 60)
    print("JSON Policy Object (for programmatic use):")
    print("=" * 60)
    print()

    policy = {
        "type": "dstack_tdx",
        "expected_bootchain": {
            "mrtd": measurements["mrtd"],
            "rtmr0": measurements["rtmr0"],
            "rtmr1": measurements["rtmr1"],
            "rtmr2": measurements["rtmr2"]
        },
        "allowed_tcb_status": ["UpToDate", "SWHardeningNeeded"]
    }

    if os_hash:
        policy["os_image_hash"] = os_hash

    # Add app_compose from tcb_info (authoritative source)
    if app_compose_str:
        try:
            policy["app_compose"] = json.loads(app_compose_str)
        except json.JSONDecodeError:
            pass

    print(json.dumps(policy, indent=2))

    print()
    print("=" * 60)
    print("Notes:")
    print("=" * 60)
    print("""
The app_compose is extracted directly from the TEE's tcb_info field.
This is the authoritative source and will match the compose-hash.

For secure verification (bootchain + OS + app_compose):
  - Use all the values above including NEXT_PUBLIC_ATLAS_APP_COMPOSE
  - The compose-hash will be verified: {compose_hash}

For relaxed verification (development/testing only):
  - Configure this explicitly in Atlas policy (disable_runtime_verification)
  - Do not rely on omitting NEXT_PUBLIC_ATLAS_APP_COMPOSE
  - Keep relaxed verification disabled in production
""".format(compose_hash=tcb_compose_hash or event_data.get('compose_hash', 'N/A')))

if __name__ == "__main__":
    main()
