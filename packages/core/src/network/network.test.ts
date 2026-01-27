import { describe, it, expect, beforeEach } from 'vitest' // Vitest is used
import { KeyManager } from '../identity'
import { MessageFactory, MockCarrier } from './index'

describe('Network Layer', () => {
  describe('MessageFactory', () => {
    let sender: KeyManager
    let recipientDID = 'did:key:zRecipient'

    beforeEach(async () => {
      sender = await KeyManager.generate()
    })

    it('should create a signed envelope', async () => {
      const payload = { hello: 'world' }
      const envelope = await MessageFactory.create(sender, recipientDID, payload)

      expect(envelope.sender).toBe(sender.did)
      expect(envelope.recipient).toBe(recipientDID)
      expect(envelope.payload).toBe(JSON.stringify(payload))
      expect(envelope.signature).toBeDefined()
    })

    it('should verify a valid envelope', async () => {
      const payload = { foo: 'bar' }
      const envelope = await MessageFactory.create(sender, recipientDID, payload)

      const isValid = await MessageFactory.verify(envelope)
      expect(isValid).toBe(true)
    })

    it('should reject a tampered payload', async () => {
      const payload = { foo: 'bar' }
      const envelope = await MessageFactory.create(sender, recipientDID, payload)

      // Tamper
      const tampered = { ...envelope, payload: JSON.stringify({ foo: 'baz' }) }

      const isValid = await MessageFactory.verify(tampered)
      expect(isValid).toBe(false)
    })
  })

  describe('MockCarrier', () => {
    // Shared bus logic needs to be verified
    let alice: KeyManager
    let bob: KeyManager
    let carrierA: MockCarrier
    let carrierB: MockCarrier

    beforeEach(async () => {
      alice = await KeyManager.generate()
      bob = await KeyManager.generate()

      carrierA = new MockCarrier(alice.did)
      carrierB = new MockCarrier(bob.did)
    })

    it('should deliver a message from Alice to Bob', async () =>
      new Promise<void>(async (resolve, reject) => {
        const payload = 'Direct Message'
        const envelope = await MessageFactory.create(alice, bob.did, payload)

        // Bob listens
        carrierB.on('message', async (msg) => {
          try {
            expect(msg.sender).toBe(alice.did)
            expect(msg.payload).toBe(JSON.stringify(payload))
            const verified = await MessageFactory.verify(msg)
            expect(verified).toBe(true)
            resolve()
          } catch (e) {
            reject(e)
          }
        })

        // Alice sends
        await carrierA.send(envelope)
      }))

    it('should not deliver a message to the wrong recipient', async () => {
      const charlie = await KeyManager.generate()
      const carrierC = new MockCarrier(charlie.did)

      let charlieReceived = false
      carrierC.on('message', () => {
        charlieReceived = true
      })

      const envelope = await MessageFactory.create(alice, bob.did, 'Secret')
      await carrierA.send(envelope)

      // Wait a bit
      await new Promise((r) => setTimeout(r, 10))
      expect(charlieReceived).toBe(false)
    })
  })
})
