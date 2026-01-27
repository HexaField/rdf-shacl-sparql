// Export utilities
import { base58btc } from 'multiformats/bases/base58'
import { ed25519 } from '@noble/curves/ed25519.js'
import type { DIDDocument } from './types'

export const ED25519_CODEC_ID = 0xed

export async function resolveDID(did: string): Promise<DIDDocument | null> {
  if (!did.startsWith('did:key:')) {
    return null // Only did:key supported for now
  }

  try {
    const fingerprint = did.split(':')[2]
    if (!fingerprint.startsWith('z')) {
      // Not base58btc
      return null
    }

    const decoded = base58btc.decode(fingerprint)

    // Parse Multicodec Varint
    // Simple parser for 0xed01 (ed25519-pub)
    // We expect [0xed, 0x01, ...pubKey]
    if (decoded[0] !== 0xed || decoded[1] !== 0x01) {
      // Unknown codec
      return null
    }

    // Construct DID Document
    // https://w3c-ccg.github.io/did-method-key/#example-1
    const id = did
    const keyId = `${did}#${fingerprint}` // Typically just #z...

    return {
      id,
      verificationMethod: [
        {
          id: keyId,
          type: 'Ed25519VerificationKey2020', // or 'Multikey'
          controller: id,
          publicKeyMultibase: fingerprint
        }
      ],
      authentication: [keyId],
      assertionMethod: [keyId]
    }
  } catch (e) {
    console.error(e)
    return null
  }
}

export async function verifySignature(did: string, data: Uint8Array, signature: Uint8Array): Promise<boolean> {
  const doc = await resolveDID(did)
  if (!doc || !doc.verificationMethod || doc.verificationMethod.length === 0) {
    return false
  }

  const method = doc.verificationMethod[0]
  if (!method.publicKeyMultibase) {
    return false
  }

  try {
    const decoded = base58btc.decode(method.publicKeyMultibase)
    // Strip 0xed01 header
    const pubKey = decoded.slice(2)

    return ed25519.verify(signature, data, pubKey)
  } catch (e) {
    return false
  }
}
