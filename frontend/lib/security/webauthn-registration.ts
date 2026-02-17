import { createHash } from "node:crypto"

export class WebAuthnRegistrationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "WebAuthnRegistrationError"
  }
}

type CborValue =
  | number
  | string
  | Uint8Array
  | CborValue[]
  | Map<CborValue, CborValue>

class CborReader {
  private readonly payload: Uint8Array
  private position = 0

  constructor(payload: Uint8Array) {
    this.payload = payload
  }

  get offset() {
    return this.position
  }

  parse(): CborValue {
    const value = this.parseItem()
    if (this.position !== this.payload.length) {
      throw new WebAuthnRegistrationError("CBOR payload has trailing bytes.")
    }
    return value
  }

  parseItem(): CborValue {
    const initial = this.read(1)[0]
    if (initial === undefined) {
      throw new WebAuthnRegistrationError("CBOR payload is truncated.")
    }
    const major = initial >> 5
    const additional = initial & 0x1f
    const length = this.readLength(additional)

    if (major === 0) {
      return length
    }
    if (major === 1) {
      return -1 - length
    }
    if (major === 2) {
      return this.read(length)
    }
    if (major === 3) {
      return Buffer.from(this.read(length)).toString("utf-8")
    }
    if (major === 4) {
      const values: CborValue[] = []
      for (let index = 0; index < length; index += 1) {
        values.push(this.parseItem())
      }
      return values
    }
    if (major === 5) {
      const map = new Map<CborValue, CborValue>()
      for (let index = 0; index < length; index += 1) {
        const key = this.parseItem()
        const value = this.parseItem()
        map.set(key, value)
      }
      return map
    }

    throw new WebAuthnRegistrationError("Unsupported CBOR major type.")
  }

  private read(size: number) {
    if (this.position + size > this.payload.length) {
      throw new WebAuthnRegistrationError("CBOR payload is truncated.")
    }
    const slice = this.payload.slice(this.position, this.position + size)
    this.position += size
    return slice
  }

  private readLength(additional: number) {
    if (additional < 24) return additional
    if (additional === 24) return this.read(1)[0] ?? 0
    if (additional === 25) return this.readUint(2)
    if (additional === 26) return this.readUint(4)
    if (additional === 27) return this.readUint(8)
    throw new WebAuthnRegistrationError("Unsupported CBOR length encoding.")
  }

  private readUint(size: 1 | 2 | 4 | 8) {
    const bytes = this.read(size)
    let value = 0
    for (const byte of bytes) {
      value = value * 256 + byte
    }
    if (!Number.isSafeInteger(value)) {
      throw new WebAuthnRegistrationError("CBOR integer exceeds safe range.")
    }
    return value
  }
}

function toBytes(value: string) {
  try {
    return Buffer.from(value, "base64url")
  } catch {
    throw new WebAuthnRegistrationError("Value is not valid base64url.")
  }
}

function toBase64Url(bytes: Uint8Array | Buffer) {
  return Buffer.from(bytes).toString("base64url")
}

export function sha256Bytes(value: string) {
  return createHash("sha256").update(value, "utf-8").digest()
}

export function sha256Hex(value: string) {
  return createHash("sha256").update(value, "utf-8").digest("hex")
}

export function parseClientData(clientDataJsonB64Url: string) {
  const raw = toBytes(clientDataJsonB64Url)
  let parsed: unknown
  try {
    parsed = JSON.parse(raw.toString("utf-8"))
  } catch {
    throw new WebAuthnRegistrationError("clientDataJSON is not valid JSON.")
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new WebAuthnRegistrationError("clientDataJSON has invalid shape.")
  }
  return parsed as Record<string, unknown>
}

export function parseAttestationObject(attestationObjectB64Url: string) {
  const raw = new Uint8Array(toBytes(attestationObjectB64Url))
  const decoded = new CborReader(raw).parse()
  if (!(decoded instanceof Map)) {
    throw new WebAuthnRegistrationError("Attestation object must decode to a CBOR map.")
  }

  const authDataValue = decoded.get("authData")
  if (!(authDataValue instanceof Uint8Array)) {
    throw new WebAuthnRegistrationError("Attestation object authData is missing.")
  }

  const authData = authDataValue
  if (authData.length < 37) {
    throw new WebAuthnRegistrationError("Authenticator data is too short.")
  }

  const rpIdHash = authData.slice(0, 32)
  const flags = authData[32] ?? 0
  const signCountView = new DataView(authData.buffer, authData.byteOffset, authData.byteLength)
  const signCount = signCountView.getUint32(33, false)

  if ((flags & 0x40) === 0) {
    throw new WebAuthnRegistrationError("Attested credential data flag is missing.")
  }

  let offset = 37
  if (authData.length < offset + 16 + 2) {
    throw new WebAuthnRegistrationError("Attested credential payload is truncated.")
  }

  offset += 16 // AAGUID
  const credentialLengthView = new DataView(authData.buffer, authData.byteOffset + offset, 2)
  const credentialIdLength = credentialLengthView.getUint16(0, false)
  offset += 2

  if (authData.length < offset + credentialIdLength) {
    throw new WebAuthnRegistrationError("Credential ID is truncated.")
  }

  const credentialId = authData.slice(offset, offset + credentialIdLength)
  offset += credentialIdLength

  const publicKeyPayload = authData.slice(offset)
  const publicKeyReader = new CborReader(publicKeyPayload)
  publicKeyReader.parseItem()
  const publicKeyLength = publicKeyReader.offset
  if (publicKeyLength <= 0 || publicKeyPayload.length < publicKeyLength) {
    throw new WebAuthnRegistrationError("Credential public key is invalid.")
  }
  const credentialPublicKey = publicKeyPayload.slice(0, publicKeyLength)

  return {
    rpIdHash,
    flags,
    signCount,
    credentialIdB64Url: toBase64Url(credentialId),
    credentialPublicKeyCoseB64Url: toBase64Url(credentialPublicKey),
  }
}
