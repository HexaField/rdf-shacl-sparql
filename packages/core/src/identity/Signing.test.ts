import { describe, it, expect } from 'vitest'
import { KeyManager } from './index'
import { createSignedExpression, verifyExpression } from './Signing'

describe('Signing', () => {
  it('should create and verify a signed expression', async () => {
    const keyManager = await KeyManager.generate()
    const data = { content: 'Hello Ad4m' }

    const expression = await createSignedExpression(data, keyManager)

    expect(expression.author).toBe(keyManager.did)
    expect(expression.data).toEqual(data)
    expect(expression.proof).toBeDefined()

    const verified = await verifyExpression(expression)
    expect(verified).toBe(true)
  })

  it('should fail verification if data is tampered', async () => {
    const keyManager = await KeyManager.generate()
    const data = { content: 'Original' }

    const expression = await createSignedExpression(data, keyManager)

    // Tamper data
    expression.data = { content: 'Tampered' }

    const verified = await verifyExpression(expression)
    expect(verified).toBe(false)
  })

  it('should fail verification if signature is tampered', async () => {
    const keyManager = await KeyManager.generate()
    const data = { content: 'Original' }

    const expression = await createSignedExpression(data, keyManager)

    // Tamper signature
    expression.proof.signature = expression.proof.signature.replace(/[a-f0-9]/, (c) => (c === 'a' ? 'b' : 'a'))

    const verified = await verifyExpression(expression)
    expect(verified).toBe(false)
  })
})
