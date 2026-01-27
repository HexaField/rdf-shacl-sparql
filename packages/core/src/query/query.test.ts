import { describe, it, expect, beforeEach } from 'vitest'
import { DataFactory } from '../store'
import { QueryEngine, ZCAPGuard, type ZCAP } from './index'
import { KeyManager } from '../identity'

describe('Query & Access Control', () => {
  describe('QueryEngine (SPARQL)', () => {
    let engine: QueryEngine

    beforeEach(() => {
      engine = new QueryEngine()
    })

    it('should execute a simple SELECT query', async () => {
      const s = DataFactory.namedNode('http://example.org/alice')
      const p = DataFactory.namedNode('http://schema.org/name')
      const o = DataFactory.literal('Alice')

      await engine.add(DataFactory.quad(s, p, o))

      const query = `
                SELECT ?name WHERE {
                    <http://example.org/alice> <http://schema.org/name> ?name .
                }
            `
      const results = await engine.execute(query)

      expect(results.bindings.length).toBe(1)
      expect(results.bindings[0].get('name')?.value).toBe('Alice')
    })

    it('should return empty results for non-matching query', async () => {
      const query = `
                SELECT ?name WHERE {
                    <http://example.org/bob> <http://schema.org/name> ?name .
                }
            `
      const results = await engine.execute(query)
      expect(results.bindings.length).toBe(0)
    })
  })

  describe('ZCAP Guard', () => {
    const rootResource = 'http://example.org/photos/1'
    let owner: KeyManager
    let delegate: KeyManager
    let zcap: ZCAP

    beforeEach(async () => {
      owner = await KeyManager.generate()
      delegate = await KeyManager.generate()

      // Owner issues a ZCAP to delegate for 'read' access
      zcap = await ZCAPGuard.create(owner, delegate.did, rootResource, 'read')
    })

    it('should allow access if agent matches invoker, action matches, and signature is valid', async () => {
      const result = await ZCAPGuard.verify(zcap, delegate.did, rootResource, 'read')
      expect(result).toBe(true)
    })

    it('should deny access if agent does not match invoker', async () => {
      const eve = await KeyManager.generate()
      const result = await ZCAPGuard.verify(zcap, eve.did, rootResource, 'read')
      expect(result).toBe(false)
    })

    it('should deny access if action is not allowed', async () => {
      const result = await ZCAPGuard.verify(zcap, delegate.did, rootResource, 'write')
      expect(result).toBe(false)
    })

    it('should deny access if target does not match', async () => {
      const result = await ZCAPGuard.verify(zcap, delegate.did, 'http://example.org/other', 'read')
      expect(result).toBe(false)
    })

    it('should deny access if signature is invalid', async () => {
      const tampered = { ...zcap, allowedAction: 'write' as const }
      // Signature is for 'read', so this should fail signature verification even if we request 'write'
      // Wait, signature covers the object. If we change object, signature fails.

      // We verify against READ (which matches the tampered object), but the signature won't match the new bytes
      const result = await ZCAPGuard.verify(tampered, delegate.did, rootResource, 'write')
      expect(result).toBe(false)
    })
  })
})
