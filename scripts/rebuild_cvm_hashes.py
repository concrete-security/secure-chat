#!/usr/bin/env python3
"""High-assurance CVM attestation reconstruction and policy verification.

Trust model:
- Trusted: local policy file and local cvm/docker-compose.yml.
- Untrusted transport: /tdx_quote response fields except raw quote bytes + event log.

This script reconstructs measurements/hashes from raw evidence and fails hard on
any mismatch.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import secrets
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib import error, request

# Quote layout: TD report starts at byte 48 in TDX quote v4.
_QUOTE_BODY_OFFSET = 48
_MRTD_OFFSET = _QUOTE_BODY_OFFSET + 136
_RTMR0_OFFSET = _QUOTE_BODY_OFFSET + 328
_RTMR1_OFFSET = _QUOTE_BODY_OFFSET + 376
_RTMR2_OFFSET = _QUOTE_BODY_OFFSET + 424
_RTMR3_OFFSET = _QUOTE_BODY_OFFSET + 472

_ATLAS_ALLOWED_TCB_STATUS = {
    "UpToDate",
    "OutOfDate",
    "ConfigurationNeeded",
    "TDRelaunchAdvised",
    "SWHardeningNeeded",
    "Revoked",
}

_INIT_MR = bytes(48)


@dataclass
class CheckResult:
    name: str
    ok: bool
    expected: Any
    actual: Any


def _post_json(url: str, payload: dict[str, Any]) -> dict[str, Any]:
    body = json.dumps(payload).encode("utf-8")
    req = request.Request(
        url,
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with request.urlopen(req, timeout=30) as resp:
            raw = resp.read().decode("utf-8")
            parsed = json.loads(raw)
            if not isinstance(parsed, dict):
                raise RuntimeError("/tdx_quote response is not a JSON object")
            return parsed
    except error.HTTPError as exc:
        details = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"/tdx_quote HTTP {exc.code}: {details}") from exc
    except error.URLError as exc:
        raise RuntimeError(f"Unable to reach /tdx_quote endpoint: {exc.reason}") from exc


def _fetch_quote(attestation_url: str) -> dict[str, Any]:
    nonce_hex = secrets.token_hex(32)
    response = _post_json(attestation_url, {"nonce_hex": nonce_hex})

    quote_obj = response.get("quote")
    if quote_obj is None:
        # Backward-compatible path for endpoints that return quote fields at top-level.
        quote_obj = response
    if not isinstance(quote_obj, dict):
        raise RuntimeError("/tdx_quote response missing object field 'quote'")

    quote_hex = quote_obj.get("quote")
    if not isinstance(quote_hex, str) or not quote_hex.strip():
        raise RuntimeError("/tdx_quote response missing quote.quote hex string")

    event_log_raw = quote_obj.get("event_log")
    if event_log_raw is None:
        raise RuntimeError("/tdx_quote response missing quote.event_log")

    return {
        "nonce_hex": nonce_hex,
        "quote_hex": quote_hex.strip(),
        "event_log_raw": event_log_raw,
        "raw_response": response,
    }


def _parse_quote_measurements(quote_hex: str) -> dict[str, str]:
    if quote_hex.startswith("0x"):
        quote_hex = quote_hex[2:]
    try:
        quote_bytes = bytes.fromhex(quote_hex)
    except ValueError as exc:
        raise RuntimeError("quote.quote is not valid hex") from exc

    min_len = _RTMR3_OFFSET + 48
    if len(quote_bytes) < min_len:
        raise RuntimeError(
            f"Quote is too short ({len(quote_bytes)} bytes), expected at least {min_len}"
        )

    return {
        "mrtd": quote_bytes[_MRTD_OFFSET : _MRTD_OFFSET + 48].hex(),
        "rtmr0": quote_bytes[_RTMR0_OFFSET : _RTMR0_OFFSET + 48].hex(),
        "rtmr1": quote_bytes[_RTMR1_OFFSET : _RTMR1_OFFSET + 48].hex(),
        "rtmr2": quote_bytes[_RTMR2_OFFSET : _RTMR2_OFFSET + 48].hex(),
        "rtmr3": quote_bytes[_RTMR3_OFFSET : _RTMR3_OFFSET + 48].hex(),
        "quote_sha256": hashlib.sha256(quote_bytes).hexdigest(),
    }


def _parse_event_log(raw: Any) -> list[dict[str, Any]]:
    if isinstance(raw, str):
        raw = raw.strip()
        if not raw:
            return []
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise RuntimeError("quote.event_log is not valid JSON") from exc
    elif isinstance(raw, dict):
        # Backward-compatible path if event_log is wrapped in an object.
        parsed = raw.get("events")
    else:
        parsed = raw

    if not isinstance(parsed, list):
        raise RuntimeError("quote.event_log is not a list")

    result: list[dict[str, Any]] = []
    for idx, entry in enumerate(parsed):
        if not isinstance(entry, dict):
            raise RuntimeError(f"event_log[{idx}] is not an object")
        result.append(entry)
    return result


def _extract_imr_histories(events: list[dict[str, Any]]) -> dict[int, list[str]]:
    histories: dict[int, list[str]] = {0: [], 1: [], 2: [], 3: []}

    for entry in events:
        imr_raw = entry.get("imr")
        if imr_raw is None:
            imr_raw = entry.get("mr_index")
        digest = entry.get("digest")

        if isinstance(imr_raw, str):
            normalized = imr_raw.strip().lower()
            if normalized.startswith("rtmr"):
                normalized = normalized[4:]
            elif normalized.startswith("imr"):
                normalized = normalized[3:]
            try:
                imr = int(normalized)
            except ValueError:
                continue
        elif isinstance(imr_raw, int):
            try:
                imr = int(imr_raw)
            except ValueError:
                continue
        else:
            continue

        if imr not in histories:
            continue

        if not isinstance(digest, str) or not digest.strip():
            continue

        digest_normalized = digest.strip().lower()
        if digest_normalized.startswith("0x"):
            digest_normalized = digest_normalized[2:]
        histories[imr].append(digest_normalized)

    return histories


def _rtmr_replay(history: list[str]) -> str:
    mr = _INIT_MR
    for digest_hex in history:
        try:
            payload = bytes.fromhex(digest_hex)
        except ValueError as exc:
            raise RuntimeError(f"Invalid IMR digest in event log: {digest_hex}") from exc
        if len(payload) < 48:
            payload = payload.ljust(48, b"\0")
        mr = hashlib.sha384(mr + payload).digest()
    return mr.hex()


def _extract_event_payload(events: list[dict[str, Any]], event_name: str) -> str | None:
    payload: str | None = None
    for entry in events:
        if entry.get("event") != event_name:
            continue
        candidate = entry.get("event_payload")
        if isinstance(candidate, str) and candidate.strip():
            payload = candidate.strip().lower()
    return payload


def _canonicalize(value: Any) -> Any:
    if isinstance(value, dict):
        return {k: _canonicalize(value[k]) for k in sorted(value.keys())}
    if isinstance(value, list):
        return [_canonicalize(v) for v in value]
    return value


def _atlas_compose_hash(app_compose: Any) -> str:
    # Match Atlas hashing semantics:
    # deterministic compact JSON and sorted object keys.
    canonical = _canonicalize(app_compose)
    serialized = json.dumps(canonical, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()


def _is_lower_hex(value: str, expected_len: int) -> bool:
    if len(value) != expected_len:
        return False
    return all(ch in "0123456789abcdef" for ch in value)


def _validate_policy(policy: dict[str, Any], require_runtime: bool) -> list[str]:
    errors: list[str] = []

    allowed_top = {
        "type",
        "expected_bootchain",
        "app_compose",
        "os_image_hash",
        "allowed_tcb_status",
        "pccs_url",
        "cache_collateral",
        "disable_runtime_verification",
    }

    extra_top = sorted(set(policy.keys()) - allowed_top)
    if extra_top:
        errors.append(f"Unexpected top-level fields: {extra_top}")

    if policy.get("type") != "dstack_tdx":
        errors.append("policy.type must be 'dstack_tdx'")

    allowed_tcb = policy.get("allowed_tcb_status")
    if not isinstance(allowed_tcb, list) or not allowed_tcb:
        errors.append("policy.allowed_tcb_status must be a non-empty list")
    else:
        invalid = [s for s in allowed_tcb if not isinstance(s, str) or s not in _ATLAS_ALLOWED_TCB_STATUS]
        if invalid:
            errors.append(f"policy.allowed_tcb_status has invalid entries: {invalid}")

    disable_runtime = policy.get("disable_runtime_verification") is True
    if require_runtime and disable_runtime:
        errors.append("disable_runtime_verification=true is not allowed in high-assurance mode")

    runtime_required = require_runtime or not disable_runtime
    if runtime_required:
        for field in ("expected_bootchain", "app_compose", "os_image_hash"):
            if field not in policy:
                errors.append(f"policy.{field} is required")

    bootchain = policy.get("expected_bootchain")
    if bootchain is not None:
        if not isinstance(bootchain, dict):
            errors.append("policy.expected_bootchain must be an object")
        else:
            for field in ("mrtd", "rtmr0", "rtmr1", "rtmr2"):
                v = bootchain.get(field)
                if not isinstance(v, str) or not _is_lower_hex(v, 96):
                    errors.append(f"policy.expected_bootchain.{field} must be 96-char lowercase hex")

    os_hash = policy.get("os_image_hash")
    if os_hash is not None and (not isinstance(os_hash, str) or not _is_lower_hex(os_hash, 64)):
        errors.append("policy.os_image_hash must be 64-char lowercase hex")

    app_compose = policy.get("app_compose")
    if app_compose is not None:
        if not isinstance(app_compose, dict):
            errors.append("policy.app_compose must be an object")
        else:
            docker_compose_file = app_compose.get("docker_compose_file")
            if not isinstance(docker_compose_file, str) or docker_compose_file == "":
                errors.append("policy.app_compose.docker_compose_file must be a non-empty string")

    return errors


def _diff_offset(left: bytes, right: bytes) -> int | None:
    shortest = min(len(left), len(right))
    for idx in range(shortest):
        if left[idx] != right[idx]:
            return idx
    if len(left) != len(right):
        return shortest
    return None


def _write_json(path: Path | None, payload: dict[str, Any]) -> None:
    if path is None:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Rebuild CVM evidence hashes and verify Atlas policy")
    parser.add_argument(
        "--attestation-url",
        default="https://vllm.concrete-security.com/tdx_quote",
        help="/tdx_quote endpoint URL",
    )
    parser.add_argument(
        "--policy-file",
        type=Path,
        default=Path("cvm/policies/dev/atlas-policy.json"),
        help="Atlas policy JSON file",
    )
    parser.add_argument(
        "--compose-file",
        type=Path,
        default=Path("cvm/docker-compose.yml"),
        help="Repository docker-compose.yml path",
    )
    parser.add_argument(
        "--report-out",
        type=Path,
        default=Path("reconstructed-hashes.json"),
        help="Output JSON report path",
    )
    parser.add_argument(
        "--association-out",
        type=Path,
        default=Path("policy-association-input.json"),
        help="Output association payload path",
    )
    parser.add_argument(
        "--allow-disable-runtime-verification",
        action="store_true",
        help="Allow disable_runtime_verification=true in policy (not recommended)",
    )
    parser.add_argument(
        "--repo",
        default=os.environ.get("GITHUB_REPOSITORY", "unknown"),
        help="Repository slug for association payload (e.g., org/repo)",
    )
    parser.add_argument(
        "--commit",
        default=os.environ.get("GITHUB_SHA", "unknown"),
        help="Commit SHA for association payload",
    )
    args = parser.parse_args()

    policy = json.loads(args.policy_file.read_text(encoding="utf-8"))
    if not isinstance(policy, dict):
        raise RuntimeError("Policy file must contain a JSON object")

    policy_errors = _validate_policy(
        policy,
        require_runtime=(not args.allow_disable_runtime_verification),
    )
    if policy_errors:
        raise RuntimeError("Policy validation failed: " + " | ".join(policy_errors))

    compose_bytes = args.compose_file.read_bytes()
    compose_sha256 = hashlib.sha256(compose_bytes).hexdigest()

    evidence = _fetch_quote(args.attestation_url)
    measurements = _parse_quote_measurements(evidence["quote_hex"])
    events = _parse_event_log(evidence["event_log_raw"])

    histories = _extract_imr_histories(events)
    replayed = {f"rtmr{idx}": _rtmr_replay(histories[idx]) for idx in (0, 1, 2, 3)}

    compose_hash_event = _extract_event_payload(events, "compose-hash")
    app_id_event = _extract_event_payload(events, "app-id")
    os_hash_event = _extract_event_payload(events, "os-image-hash")

    app_compose = policy["app_compose"]
    app_compose_hash = _atlas_compose_hash(app_compose)

    policy_compose_text = app_compose["docker_compose_file"]
    policy_compose_bytes = policy_compose_text.encode("utf-8")
    policy_compose_sha256 = hashlib.sha256(policy_compose_bytes).hexdigest()

    checks: list[CheckResult] = []

    def check(name: str, expected: Any, actual: Any) -> None:
        checks.append(CheckResult(name=name, ok=(expected == actual), expected=expected, actual=actual))

    for idx in (0, 1, 2, 3):
        key = f"rtmr{idx}"
        check(f"rtmr_replay_{key}", measurements[key], replayed[key])

    # Bootchain checks from policy against quote bytes
    expected_bootchain = policy["expected_bootchain"]
    check("bootchain_mrtd", expected_bootchain["mrtd"], measurements["mrtd"])
    check("bootchain_rtmr0", expected_bootchain["rtmr0"], measurements["rtmr0"])
    check("bootchain_rtmr1", expected_bootchain["rtmr1"], measurements["rtmr1"])
    check("bootchain_rtmr2", expected_bootchain["rtmr2"], measurements["rtmr2"])

    # Hash checks reconstructed locally
    check("compose_hash_event", app_compose_hash, compose_hash_event)
    check("app_id_event", compose_sha256, app_id_event)
    check("os_image_hash_event", policy["os_image_hash"], os_hash_event)

    # Strict compose identity (policy text must match repo file exactly)
    check("compose_text_sha256", compose_sha256, policy_compose_sha256)
    check("compose_text_bytes", compose_bytes, policy_compose_bytes)

    failed = [c for c in checks if not c.ok]
    compose_diff_offset = _diff_offset(compose_bytes, policy_compose_bytes)

    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "attestation_url": args.attestation_url,
        "quote": {
            "nonce_hex": evidence["nonce_hex"],
            "sha256": measurements["quote_sha256"],
            "mrtd": measurements["mrtd"],
            "rtmr0": measurements["rtmr0"],
            "rtmr1": measurements["rtmr1"],
            "rtmr2": measurements["rtmr2"],
            "rtmr3": measurements["rtmr3"],
        },
        "reconstruction": {
            "rtmr_replay": replayed,
            "policy_app_compose_sha256": app_compose_hash,
            "repo_compose_sha256": compose_sha256,
            "policy_compose_text_sha256": policy_compose_sha256,
            "event_log": {
                "compose-hash": compose_hash_event,
                "app-id": app_id_event,
                "os-image-hash": os_hash_event,
            },
            "imr_history_counts": {f"imr{idx}": len(histories[idx]) for idx in (0, 1, 2, 3)},
            "compose_diff_offset": compose_diff_offset,
        },
        "checks": [
            {
                "name": c.name,
                "ok": c.ok,
                "expected": "<bytes>" if isinstance(c.expected, bytes) else c.expected,
                "actual": "<bytes>" if isinstance(c.actual, bytes) else c.actual,
            }
            for c in checks
        ],
        "overall_ok": not failed,
        "failed_checks": [c.name for c in failed],
    }

    association = {
        "version": "cvm_policy_association.v1",
        "repo": args.repo,
        "commit": args.commit,
        "policy_path": str(args.policy_file),
        "policy_sha256": hashlib.sha256(args.policy_file.read_bytes()).hexdigest(),
        "quote_sha256": measurements["quote_sha256"],
        "reconstructed": {
            "mrtd": measurements["mrtd"],
            "rtmr0": measurements["rtmr0"],
            "rtmr1": measurements["rtmr1"],
            "rtmr2": measurements["rtmr2"],
            "rtmr3": measurements["rtmr3"],
            "compose_hash": app_compose_hash,
            "app_id": compose_sha256,
            "os_image_hash": policy["os_image_hash"],
        },
        "checks_ok": not failed,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }

    _write_json(args.report_out, report)
    _write_json(args.association_out, association)

    print(f"Wrote reconstruction report: {args.report_out}")
    print(f"Wrote association payload: {args.association_out}")

    if failed:
        print("\nFAILED CHECKS:", file=sys.stderr)
        for item in failed:
            print(f"- {item.name}", file=sys.stderr)
        if compose_diff_offset is not None:
            print(f"compose byte mismatch offset: {compose_diff_offset}", file=sys.stderr)
        return 1

    print("All reconstruction checks passed")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except RuntimeError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        sys.exit(1)
