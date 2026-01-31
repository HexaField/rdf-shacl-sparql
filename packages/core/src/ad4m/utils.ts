import { base58btc } from 'multiformats/bases/base58'

/**
 * Generates a compliant AD4M Neighbourhood ID.
 * Uses SHA-256 Multihash encoded in Base58BTC (CID v0 style) prefixed with neighbourhood://
 *
 * @param seed - Optional input to hash. If not provided, uses a random UUID.
 * @returns The neighbourhood URN.
 */
export async function generateNeighbourhoodId(seed?: string): Promise<string> {
  const input = seed || crypto.randomUUID()
  const encoder = new TextEncoder()
  const data = encoder.encode(input)

  // Use Web Crypto API (available in Node 20+ and Browsers)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashBytes = new Uint8Array(hashBuffer)

  // Construct Multihash: 0x12 (SHA2-256) + 0x20 (32 bytes) + Hash bytes
  const multihash = new Uint8Array(2 + hashBytes.length)
  multihash[0] = 0x12
  multihash[1] = 0x20
  multihash.set(hashBytes, 2)

  // base58btc.encode adds a 'z' prefix (multibase). CID v0 (Qm...) does not use this prefix.
  const encoded = base58btc.encode(multihash)
  return `neighbourhood://${encoded.substring(1)}`
}
