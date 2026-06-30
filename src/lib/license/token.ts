// Offline token verification — the TypeScript/WebCrypto mirror of iakms's
// `iakms-client-sdk` (token.rs). Token format:
//
//   iakms1.<base64url(payload_json)>.<base64url(signature)>
//
// Signature input = the bytes of `iakms1.<payload_b64>` (prefix + payload, dot
// included). Algorithm = ECDSA P-256 / SHA-256, signature = raw r||s (64 bytes).
// Public key = SEC1 uncompressed point (65 bytes). WebCrypto's ECDSA verify
// expects exactly raw r||s, so it matches the spec one-to-one.

const PREFIX = 'iakms1'

/** Token claims — mirrors iakms `TokenClaims`. */
export interface TokenClaims {
  app_id: string
  license_id: string
  device_uuid: string
  fingerprint_hash: string
  max_seats: number
  policy: string
  status: string
  /** Unix seconds. */
  issued_at: number
  /** Unix seconds — lease TTL; offline use is valid until this. */
  expires_at: number
  nonce: string
  key_version: number
}

export type TokenErrorCode =
  | 'malformed'
  | 'base64'
  | 'payload'
  | 'bad_signature_bytes'
  | 'unknown_key_version'
  | 'bad_signature'
  | 'expired'
  | 'rollback'
  | 'device_mismatch'

export class TokenError extends Error {
  constructor(
    public code: TokenErrorCode,
    message?: string,
  ) {
    super(message ?? code)
    this.name = 'TokenError'
  }
}

export interface VerifyOptions {
  /** When set, the token's device_uuid must match (anti-copy). */
  expectedDeviceUuid?: string
  /** Current Unix time (seconds). */
  nowUnix: number
  /** Highest issued_at seen so far (anti clock-rollback). First run: 0. */
  minIssuedAt: number
}

function b64urlDecode(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4))
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + pad
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

async function importPubKey(publicKeyB64: string): Promise<CryptoKey> {
  const raw = b64urlDecode(publicKeyB64) // 65-byte SEC1 uncompressed point
  return crypto.subtle.importKey(
    'raw',
    raw as BufferSource,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['verify'],
  )
}

/**
 * Verify a token offline, then apply business checks (expiry, device binding,
 * rollback). `keyForVersion` returns the embedded/cached `public_key_b64` for a
 * given key_version. Throws `TokenError` on any failure; returns claims on pass.
 */
export async function verifyToken(
  token: string,
  keyForVersion: (version: number) => string | undefined,
  opts: VerifyOptions,
): Promise<TokenClaims> {
  const parts = token.split('.')
  if (parts.length !== 3 || parts[0] !== PREFIX) throw new TokenError('malformed')
  const [, payloadB64, sigB64] = parts

  let claims: TokenClaims
  try {
    claims = JSON.parse(new TextDecoder().decode(b64urlDecode(payloadB64))) as TokenClaims
  } catch {
    throw new TokenError('payload')
  }

  const pub = keyForVersion(claims.key_version)
  if (!pub) throw new TokenError('unknown_key_version', String(claims.key_version))

  let sigBytes: Uint8Array
  try {
    sigBytes = b64urlDecode(sigB64)
  } catch {
    throw new TokenError('base64')
  }
  if (sigBytes.length !== 64) throw new TokenError('bad_signature_bytes')

  const key = await importPubKey(pub)
  const input = new TextEncoder().encode(`${PREFIX}.${payloadB64}`)
  const ok = await crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    sigBytes as BufferSource,
    input as BufferSource,
  )
  if (!ok) throw new TokenError('bad_signature')

  // Business checks, after the signature is proven.
  if (opts.nowUnix > claims.expires_at) throw new TokenError('expired')
  if (claims.issued_at < opts.minIssuedAt) throw new TokenError('rollback')
  if (opts.expectedDeviceUuid && opts.expectedDeviceUuid !== claims.device_uuid) {
    throw new TokenError('device_mismatch')
  }

  return claims
}
