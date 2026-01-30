import stringify from 'json-stable-stringify'
import { toString } from 'uint8arrays/to-string'
import { fromString } from 'uint8arrays/from-string'
import { ed25519 } from '@noble/curves/ed25519.js'
import { base58btc } from 'multiformats/bases/base58'
import type { Expression, ExpressionProof } from '../ad4m/types'
import { KeyManager } from './index'

export async function createSignedExpression(data: any, author: KeyManager): Promise<Expression> {
  const timestamp = new Date().toISOString()
  const authorDid = author.did

  const payload = {
    author: authorDid,
    timestamp,
    data
  }

  // Canonical serialization
  const payloadString = stringify(payload) || ''

  // Sign the canonical string bytes
  const signatureBytes = await author.sign(fromString(payloadString))

  // Ad4m uses hex signature strings
  const signature = toString(signatureBytes, 'hex')

  const proof: ExpressionProof = {
    signature,
    key: authorDid,
    valid: true // Assumed valid upon creation
  }

  return {
    ...payload,
    proof
  }
}

export async function verifyExpression(expression: Expression): Promise<boolean> {
  // 1. Extract proof
  const { proof, ...payload } = expression
  if (!proof || !proof.signature || !proof.key) return false

  // 2. Recreate canonical payload string
  const payloadString = stringify(payload) || ''
  const message = fromString(payloadString)

  // 3. Decode signature (hex)
  const signature = fromString(proof.signature, 'hex')

  // 4. Resolve Public Key from did:key
  try {
    const publicKey = resolvePublicKeyFromDid(proof.key)

    // 5. Verify using Ed25519
    return ed25519.verify(signature, message, publicKey)
  } catch (e) {
    console.warn('Signature verification error:', e)
    return false
  }
}

function resolvePublicKeyFromDid(did: string): Uint8Array {
  if (!did.startsWith('did:key:')) {
    throw new Error(`Unsupported DID method: ${did}`)
  }

  const multibaseKey = did.split(':')[2]
  if (!multibaseKey.startsWith('z')) {
    throw new Error(`Unsupported multibase encoding (expected z/base58btc): ${multibaseKey}`)
  }

  // Decode z-base58btc
  const decoded = base58btc.decode(multibaseKey)

  // Parse Multicodec
  // Ed25519 is 0xed, 0x01 (varint 2-bytes)
  if (decoded[0] !== 0xed || decoded[1] !== 0x01) {
    throw new Error(`Unsupported key type (expected Ed25519 0xed01)`)
  }

  // Slice off the 2-byte header to get raw 32-byte public key
  return decoded.slice(2)
}
