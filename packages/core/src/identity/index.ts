import { ed25519 } from '@noble/curves/ed25519.js'
import { base58btc } from 'multiformats/bases/base58'
import type { Signer } from './types'

// Export everything from here
export * from './types'
export * from './utils'

export class KeyManager implements Signer {
  private privateKey: Uint8Array
  public publicKey: Uint8Array
  public did: string

  private constructor(privateKey: Uint8Array) {
    this.privateKey = privateKey
    this.publicKey = ed25519.getPublicKey(privateKey)
    this.did = this.deriveDID(this.publicKey)
  }

  static async generate(): Promise<KeyManager> {
    const privateKey = ed25519.utils.randomSecretKey()
    return new KeyManager(privateKey)
  }

  // Sign using Ed25519
  async sign(data: Uint8Array): Promise<Uint8Array> {
    return ed25519.sign(data, this.privateKey)
  }

  // Derive did:key:z<MultiBase58BTC(0xed01 + pubKey)>
  private deriveDID(publicKey: Uint8Array): string {
    // Multicodec for Ed25519 public key is 0xed01 (varint) -> [0xed, 0x01]

    const header = new Uint8Array([0xed, 0x01])
    const bytes = new Uint8Array(header.length + publicKey.length)
    bytes.set(header)
    bytes.set(publicKey, header.length)

    return `did:key:${base58btc.encode(bytes)}`
  }
}
