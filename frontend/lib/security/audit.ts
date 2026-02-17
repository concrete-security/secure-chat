type AuditDetails = Record<string, unknown>

export function logAuditEvent(event: string, details: AuditDetails = {}) {
  const payload = {
    ts: new Date().toISOString(),
    event,
    details,
  }

  console.info("[audit]", JSON.stringify(payload))
}
