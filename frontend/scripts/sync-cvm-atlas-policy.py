#!/usr/bin/env python3
"""
Sync per-CVM Atlas policy and proxy URL into Supabase.

Default mode is dry-run. Use --apply to persist changes.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, NoReturn


SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
GET_POLICY_SCRIPT = os.path.join(SCRIPT_DIR, "get-tee-policy-values.py")
DEFAULT_ENV_FILE = os.path.abspath(os.path.join(SCRIPT_DIR, "..", ".env.local"))


def fatal(message: str) -> NoReturn:
    print(f"ERROR: {message}", file=sys.stderr)
    raise SystemExit(1)


def load_env_file(path: str) -> None:
    if not path:
        return
    if not os.path.exists(path):
        return

    try:
        with open(path, encoding="utf-8") as handle:
            for raw_line in handle:
                line = raw_line.strip()
                if not line or line.startswith("#"):
                    continue

                if line.startswith("export "):
                    line = line[len("export ") :].strip()

                if "=" not in line:
                    continue

                key, value = line.split("=", 1)
                key = key.strip()
                value = value.strip()
                if not key:
                    continue

                if len(value) >= 2 and value[0] == value[-1] and value[0] in ('"', "'"):
                    value = value[1:-1]

                os.environ.setdefault(key, value)
    except OSError as error:
        fatal(f"Failed to read env file {path!r}: {error}")


def request_json(
    *,
    base_url: str,
    service_role_key: str,
    method: str,
    path: str,
    query: dict[str, str] | None = None,
    payload: dict[str, Any] | None = None,
    timeout: int = 30,
    prefer: str | None = None,
) -> Any:
    url = base_url.rstrip("/") + path
    if query:
        url = f"{url}?{urllib.parse.urlencode(query)}"

    body: bytes | None = None
    if payload is not None:
        body = json.dumps(payload).encode("utf-8")

    headers = {
        "apikey": service_role_key,
        "Authorization": f"Bearer {service_role_key}",
        "Content-Type": "application/json",
    }
    if prefer:
        headers["Prefer"] = prefer

    request = urllib.request.Request(url, data=body, headers=headers, method=method)

    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            raw = response.read().decode("utf-8")
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as error:
        details = error.read().decode("utf-8", errors="replace")
        fatal(f"Supabase {method} {path} failed ({error.code}): {details}")
    except urllib.error.URLError as error:
        fatal(f"Failed to reach Supabase endpoint: {error.reason}")


def fetch_target_cvm(
    *,
    base_url: str,
    service_role_key: str,
    cvm_id: str | None,
    slug: str | None,
    user_id: str | None,
    timeout: int,
) -> dict[str, Any]:
    resolved_cvm_id = cvm_id

    if user_id:
        assignment_query = {
            "select": "user_id,cvm_instance_id",
            "user_id": f"eq.{user_id}",
        }
        assignment_data = request_json(
            base_url=base_url,
            service_role_key=service_role_key,
            method="GET",
            path="/rest/v1/user_cvm_assignments",
            query=assignment_query,
            timeout=timeout,
        )

        if not isinstance(assignment_data, list):
            fatal("Unexpected response format while fetching user_cvm_assignments.")
        if not assignment_data:
            fatal(f"No CVM assignment found for user_id={user_id}.")
        if len(assignment_data) > 1:
            fatal(f"Expected a single CVM assignment for user_id={user_id}, got {len(assignment_data)} rows.")

        assignment = assignment_data[0]
        if not isinstance(assignment, dict):
            fatal("Unexpected assignment row format.")

        assignment_cvm_id = assignment.get("cvm_instance_id")
        if not isinstance(assignment_cvm_id, str) or not assignment_cvm_id.strip():
            fatal(f"Assignment for user_id={user_id} is missing cvm_instance_id.")
        resolved_cvm_id = assignment_cvm_id.strip()

    if resolved_cvm_id:
        query = {"select": "id,slug,base_url,atlas_proxy_url,atlas_policy", "id": f"eq.{resolved_cvm_id}"}
    else:
        query = {"select": "id,slug,base_url,atlas_proxy_url,atlas_policy", "slug": f"eq.{slug}"}

    data = request_json(
        base_url=base_url,
        service_role_key=service_role_key,
        method="GET",
        path="/rest/v1/cvm_instances",
        query=query,
        timeout=timeout,
    )

    if not isinstance(data, list):
        fatal("Unexpected response format while fetching cvm_instances.")
    if not data:
        if resolved_cvm_id:
            selector = f"id={resolved_cvm_id}"
        elif slug:
            selector = f"slug={slug}"
        else:
            selector = f"user_id={user_id}"
        fatal(f"No CVM found for {selector}.")
    if len(data) > 1:
        if resolved_cvm_id:
            selector = f"id={resolved_cvm_id}"
        elif slug:
            selector = f"slug={slug}"
        else:
            selector = f"user_id={user_id}"
        fatal(f"Expected a single CVM for {selector}, got {len(data)} rows.")

    row = data[0]
    if not isinstance(row, dict):
        fatal("Unexpected CVM row format.")
    return row


def derive_hostname(explicit_hostname: str | None, cvm_row: dict[str, Any]) -> str:
    if explicit_hostname and explicit_hostname.strip():
        return explicit_hostname.strip()

    base_url = cvm_row.get("base_url")
    if not isinstance(base_url, str) or not base_url.strip():
        fatal("CVM base_url is missing; pass --hostname explicitly.")

    parsed = urllib.parse.urlparse(base_url)
    if not parsed.hostname:
        fatal(f"Could not parse hostname from base_url={base_url!r}; pass --hostname explicitly.")
    return parsed.hostname


def resolve_proxy_url(explicit_proxy_url: str | None, cvm_row: dict[str, Any]) -> str:
    if explicit_proxy_url and explicit_proxy_url.strip():
        return explicit_proxy_url.strip()

    existing = cvm_row.get("atlas_proxy_url")
    if isinstance(existing, str) and existing.strip():
        return existing.strip()

    for env_key in ("CVM_ATLAS_PROXY_URL", "NEXT_PUBLIC_ATLAS_PROXY_URL"):
        value = os.environ.get(env_key, "").strip()
        if value:
            return value

    fatal(
        "Atlas proxy URL is required. Provide --atlas-proxy-url or set an existing atlas_proxy_url on the CVM row."
    )


def fetch_policy_json(hostname: str, allowed_envs: str, *, no_verify_ssl: bool = False) -> dict[str, Any]:
    command = [sys.executable, GET_POLICY_SCRIPT, hostname, "--format", "policy-json"]
    if allowed_envs.strip():
        command.extend(["--allowed-envs", allowed_envs.strip()])
    if no_verify_ssl:
        command.append("--no-verify-ssl")

    result = subprocess.run(command, capture_output=True, text=True, check=False)
    if result.returncode != 0:
        stderr = result.stderr.strip() or "no stderr output"
        stdout = result.stdout.strip() or "no stdout output"
        fatal(
            "Failed to derive Atlas policy from get-tee-policy-values.py. "
            f"stderr={stderr!r} stdout={stdout!r}"
        )

    try:
        parsed = json.loads(result.stdout)
    except json.JSONDecodeError as error:
        fatal(f"Policy script returned invalid JSON: {error}")

    if not isinstance(parsed, dict):
        fatal("Policy script output must be a JSON object.")
    if parsed.get("type") != "dstack_tdx":
        fatal('Policy JSON must include {"type":"dstack_tdx"}.')
    return parsed


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Sync cvm_instances.atlas_policy and cvm_instances.atlas_proxy_url from live TEE quote data."
    )
    target_group = parser.add_mutually_exclusive_group(required=True)
    target_group.add_argument("--user-id", type=str, help="Target user ID; resolves assigned CVM row via user_cvm_assignments.")
    target_group.add_argument("--cvm-id", type=str, help="Target CVM row ID (uuid).")
    target_group.add_argument("--slug", type=str, help="Target CVM slug.")

    parser.add_argument(
        "--env-file",
        type=str,
        default=DEFAULT_ENV_FILE,
        help="Optional env file to preload defaults (default: frontend/.env.local if present).",
    )
    parser.add_argument("--hostname", type=str, default="", help="TEE hostname for /tdx_quote. Defaults to CVM base_url host.")
    parser.add_argument("--atlas-proxy-url", type=str, default="", help="Atlas proxy URL to store on the CVM row.")
    parser.add_argument("--allowed-envs", type=str, default="", help="Forwarded to get-tee-policy-values.py --allowed-envs.")
    parser.add_argument("--supabase-url", type=str, default="", help="Supabase project URL.")
    parser.add_argument("--service-role-key", type=str, default="", help="Supabase service-role key.")
    parser.add_argument("--timeout", type=int, default=30, help="HTTP timeout in seconds (default: 30).")
    parser.add_argument("--no-verify-ssl", action="store_true", help="Skip TLS certificate verification (for self-signed certs on dstack CVMs).")
    parser.add_argument("--apply", action="store_true", help="Apply updates. Default is dry-run.")

    args = parser.parse_args()

    load_env_file(args.env_file)

    supabase_url = (
        args.supabase_url.strip()
        or os.environ.get("SUPABASE_URL", "").strip()
        or os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "").strip()
    )
    service_role_key = args.service_role_key.strip() or os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()

    if not supabase_url:
        fatal("Supabase URL is required (--supabase-url or SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL).")
    if not service_role_key:
        fatal("Supabase service-role key is required (--service-role-key or SUPABASE_SERVICE_ROLE_KEY).")

    cvm = fetch_target_cvm(
        base_url=supabase_url,
        service_role_key=service_role_key,
        cvm_id=args.cvm_id,
        slug=args.slug,
        user_id=args.user_id,
        timeout=args.timeout,
    )

    hostname = derive_hostname(args.hostname, cvm)
    atlas_proxy_url = resolve_proxy_url(args.atlas_proxy_url, cvm)
    atlas_policy = fetch_policy_json(hostname, args.allowed_envs, no_verify_ssl=args.no_verify_ssl)

    patch_payload = {
        "atlas_policy": atlas_policy,
        "atlas_proxy_url": atlas_proxy_url,
    }

    if args.user_id:
        print(f"Resolved assignment for user_id={args.user_id}")
        print()

    print("Target CVM:")
    print(json.dumps({"id": cvm.get("id"), "slug": cvm.get("slug"), "base_url": cvm.get("base_url")}, indent=2))
    print()
    print("Computed atlas_policy:")
    print(json.dumps(atlas_policy, indent=2))
    print()
    print(f"Atlas proxy URL: {atlas_proxy_url}")
    print()

    if not args.apply:
        print("Dry-run mode: no changes applied. Re-run with --apply to persist.")
        return

    updated = request_json(
        base_url=supabase_url,
        service_role_key=service_role_key,
        method="PATCH",
        path="/rest/v1/cvm_instances",
        query={"id": f"eq.{cvm.get('id')}", "select": "id,slug,atlas_proxy_url"},
        payload=patch_payload,
        timeout=args.timeout,
        prefer="return=representation",
    )

    print("Update applied:")
    print(json.dumps(updated, indent=2))


if __name__ == "__main__":
    main()
