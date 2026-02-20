#!/usr/bin/env node

import fs from "fs"
import path from "path"
import process from "process"

function parseArgs(argv) {
  const out = {
    baseUrl: "https://vllm.concrete-security.com",
    policyFile: "cvm/policies/dev/atlas-policy.json",
    requestPath: "/health",
    timeoutMs: 45000,
    reportOut: "atlas-runtime-report.json",
  }

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === "--base-url") {
      out.baseUrl = argv[++i]
    } else if (arg === "--policy-file") {
      out.policyFile = argv[++i]
    } else if (arg === "--request-path") {
      out.requestPath = argv[++i]
    } else if (arg === "--timeout-ms") {
      out.timeoutMs = Number(argv[++i])
    } else if (arg === "--report-out") {
      out.reportOut = argv[++i]
    } else if (arg === "--help" || arg === "-h") {
      printHelp()
      process.exit(0)
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }

  if (!Number.isFinite(out.timeoutMs) || out.timeoutMs <= 0) {
    throw new Error("--timeout-ms must be a positive number")
  }

  return out
}

function printHelp() {
  const text = [
    "Usage: node scripts/atlas_runtime_verify.mjs [options]",
    "",
    "Options:",
    "  --base-url <url>        Base URL for CVM (default: https://vllm.concrete-security.com)",
    "  --policy-file <path>    Atlas policy JSON path (default: cvm/policies/dev/atlas-policy.json)",
    "  --request-path <path>   Request path to execute over aTLS (default: /health)",
    "  --timeout-ms <number>   Request timeout in milliseconds (default: 45000)",
    "  --report-out <path>     JSON output report path (default: atlas-runtime-report.json)",
  ]
  process.stdout.write(`${text.join("\n")}\n`)
}

function normalizeRequestPath(value) {
  if (value.startsWith("http://") || value.startsWith("https://")) {
    const url = new URL(value)
    return `${url.pathname}${url.search || ""}`
  }
  return value.startsWith("/") ? value : `/${value}`
}

function deriveTarget(baseUrl) {
  const parsed = new URL(baseUrl)
  const defaultPort = parsed.protocol === "https:" ? "443" : "80"
  return {
    serverName: parsed.hostname,
    target: `${parsed.hostname}:${parsed.port || defaultPort}`,
  }
}

function loadPolicy(policyFile) {
  const raw = fs.readFileSync(policyFile, "utf8")
  const parsed = JSON.parse(raw)
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Policy file must contain a JSON object")
  }
  if (parsed.type !== "dstack_tdx") {
    throw new Error("Policy type must be 'dstack_tdx'")
  }
  return parsed
}

function writeReport(reportPath, payload) {
  const parent = path.dirname(reportPath)
  fs.mkdirSync(parent, { recursive: true })
  fs.writeFileSync(reportPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8")
}

async function main() {
  const args = parseArgs(process.argv)
  const policy = loadPolicy(args.policyFile)
  const requestPath = normalizeRequestPath(args.requestPath)
  const { serverName, target } = deriveTarget(args.baseUrl)
  let createAtlsFetch

  try {
    ;({ createAtlsFetch } = await import("@concrete-security/atlas-node"))
  } catch {
    throw new Error(
      "Missing dependency '@concrete-security/atlas-node'. Install it before running runtime verification."
    )
  }

  let callbackAttestation = null
  const atlsFetch = createAtlsFetch({
    target,
    serverName,
    policy,
    onAttestation: (attestation) => {
      callbackAttestation = attestation
    },
  })

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), args.timeoutMs)

  let response = null
  let responseBodyPreview = null
  let attestation = null

  try {
    response = await atlsFetch(requestPath, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    })
    attestation = callbackAttestation ?? response.attestation ?? null

    try {
      const text = await response.text()
      responseBodyPreview = text.slice(0, 500)
    } catch {
      responseBodyPreview = null
    }
  } finally {
    clearTimeout(timeout)
  }

  if (!attestation || typeof attestation !== "object") {
    throw new Error("Atlas did not return attestation data")
  }

  const allowedStatuses = Array.isArray(policy.allowed_tcb_status) && policy.allowed_tcb_status.length > 0
    ? policy.allowed_tcb_status
    : ["UpToDate"]

  const checks = [
    {
      name: "attestation_trusted",
      ok: attestation.trusted === true,
      expected: true,
      actual: attestation.trusted,
    },
    {
      name: "tcb_status_allowed",
      ok: typeof attestation.tcbStatus === "string" && allowedStatuses.includes(attestation.tcbStatus),
      expected: allowedStatuses,
      actual: attestation.tcbStatus,
    },
  ]

  const failedChecks = checks.filter((item) => !item.ok).map((item) => item.name)
  const report = {
    generated_at: new Date().toISOString(),
    base_url: args.baseUrl,
    target,
    request_path: requestPath,
    policy_file: args.policyFile,
    response: response
      ? {
          status: response.status,
          status_text: response.statusText,
          ok: response.ok,
          body_preview: responseBodyPreview,
        }
      : null,
    attestation,
    checks,
    overall_ok: failedChecks.length === 0,
    failed_checks: failedChecks,
  }

  writeReport(args.reportOut, report)

  process.stdout.write(`Wrote runtime report: ${args.reportOut}\n`)
  process.stdout.write(`Attestation trusted: ${String(attestation.trusted)}\n`)
  process.stdout.write(`Attestation TCB status: ${String(attestation.tcbStatus)}\n`)

  if (failedChecks.length > 0) {
    process.stderr.write(`Failed checks: ${failedChecks.join(", ")}\n`)
    process.exit(1)
  }

  process.stdout.write("Atlas runtime verification checks passed\n")
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  process.stderr.write(`Atlas runtime verification failed: ${message}\n`)
  process.exit(1)
})
