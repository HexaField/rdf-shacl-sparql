import { describe, it, expect, beforeEach } from 'vitest'
import { KeyManager } from './index'
import { resolveDID, verifySignature } from './utils'

describe('Identity Layer', () => {
  let agent: KeyManager

  beforeEach(async () => {
    agent = await KeyManager.generate()
  })

  describe('KeyManager', () => {
    it('should generate a valid DID', () => {
      expect(agent.did).toMatch(/^did:key:z/) // multibase base58btc starts with z
    })

    it('should sign data', async () => {
      const data = new TextEncoder().encode('Hello World')
      const signature = await agent.sign(data)
      expect(signature).toBeDefined()
      expect(signature.length).toBeGreaterThan(0)
    })
  })

  describe('Resolution', () => {
    it('should resolve a did:key', async () => {
      const doc = await resolveDID(agent.did)
      expect(doc).toBeDefined()
      expect(doc?.id).toBe(agent.did)
      expect(doc?.verificationMethod).toBeDefined()
      expect(doc?.verificationMethod?.length).toBeGreaterThan(0)
    })

    it('should fail for unsupported methods', async () => {
      const doc = await resolveDID('did:example:123')
      expect(doc).toBeNull()
    })
  })

  describe('Verification', () => {
    it('should verify a valid signature', async () => {
      const data = new TextEncoder().encode('Hello World')
      const signature = await agent.sign(data)

      const isValid = await verifySignature(agent.did, data, signature)
      expect(isValid).toBe(true)
    })

    it('should reject an invalid signature', async () => {
      const data = new TextEncoder().encode('Hello World')
      const signature = await agent.sign(data)
      // Tamper with signature
      signature[0] = signature[0] ^ 0xff

      const isValid = await verifySignature(agent.did, data, signature)
      expect(isValid).toBe(false)
    })

    it('should reject signature for wrong data', async () => {
      const data = new TextEncoder().encode('Hello World')
      const signature = await agent.sign(data)
      const otherData = new TextEncoder().encode('Hello World2')

      const isValid = await verifySignature(agent.did, otherData, signature)
      expect(isValid).toBe(false)
    })
  })
})
