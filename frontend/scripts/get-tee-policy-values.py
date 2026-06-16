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
import secrets
import ssl
import sys
import urllib.request
import urllib.error

_ssl_context: ssl.SSLContext | None = None

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
        kwargs: dict = {"timeout": 30}
        if _ssl_context is not None:
            kwargs["context"] = _ssl_context
        with urllib.request.urlopen(req, **kwargs) as response:
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

def build_policy(measurements: dict, os_hash: str | None, app_compose_str: str) -> dict:
    policy = {
        "type": "dstack_tdx",
        "expected_bootchain": {
            "mrtd": measurements["mrtd"],
            "rtmr0": measurements["rtmr0"],
            "rtmr1": measurements["rtmr1"],
            "rtmr2": measurements["rtmr2"]
        },
        "allowed_tcb_status": ["UpToDate", "SWHardeningNeeded"],
        "accept_self_signed_certs": True
    }

    if os_hash:
        policy["os_image_hash"] = os_hash

    if app_compose_str:
        # Store as raw JSON string to preserve key ordering for hash verification.
        # PostgreSQL JSONB reorders object keys, which breaks compose hash matching.
        policy["app_compose"] = app_compose_str

    return policy

def main():
    import argparse
    parser = argparse.ArgumentParser(description='Fetch TDX quote and extract policy values')
    parser.add_argument('hostname', nargs='?', default='vllm.concrete-security.com',
                        help='TEE hostname (default: vllm.concrete-security.com)')
    parser.add_argument('--allowed-envs', '-e', type=str, default='',
                        help='Comma-separated list of allowed environment variables for app_compose')
    parser.add_argument('--format', choices=['full', 'policy-json'], default='full',
                        help='Output format: full (human-readable report) or policy-json (JSON policy only)')
    parser.add_argument('--no-verify-ssl', action='store_true',
                        help='Skip TLS certificate verification (for self-signed certs on dstack CVMs)')
    args = parser.parse_args()

    if args.no_verify_ssl:
        global _ssl_context
        _ssl_context = ssl.create_default_context()
        _ssl_context.check_hostname = False
        _ssl_context.verify_mode = ssl.CERT_NONE

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

    os_hash = tcb_os_image_hash or event_data.get('os_image_hash')
    policy = build_policy(measurements, os_hash, app_compose_str)

    if args.format == "policy-json":
        print(json.dumps(policy, indent=2))
        return

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

    print("=" * 60)
    print("JSON Policy Object (for programmatic use):")
    print("=" * 60)
    print()

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
