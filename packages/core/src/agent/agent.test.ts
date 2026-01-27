import { describe, it, expect, beforeEach } from 'vitest'
import { Agent } from './index'
import { KeyManager } from '../identity'
import { MockCarrier } from '../network'
import { QueryEngine } from '../query'
import { DataFactory } from '../store'

describe('Agent API', () => {
  let agent: Agent
  let keys: KeyManager
  let carrier: MockCarrier
  let store: QueryEngine
  let aliceDID: string
  let bobDID = 'did:key:zBob'

  beforeEach(async () => {
    keys = await KeyManager.generate()
    aliceDID = keys.did
    store = new QueryEngine()
    carrier = new MockCarrier(aliceDID)

    agent = new Agent(keys, store, carrier)
  })

  it('should initialize with correct DID', () => {
    expect(agent.did).toBe(aliceDID)
  })

  describe('Publishing', () => {
    let claims: any[]

    beforeEach(() => {
      const p = DataFactory.namedNode('http://schema.org/name')
      const o = DataFactory.literal('Alice')
      claims = [DataFactory.quad(DataFactory.namedNode(aliceDID), p, o)]
    })

    it('should publish valid claims as a VC and store them', async () => {
      const vcId = await agent.publish(claims)
      expect(vcId).toContain('urn:uuid:')

      // Check if data is in store
      // The ingestVC puts data in a graph named by the VC ID
      // The 'claims' themselves might be transformed or wrapped.
      // Phase 3 IngestVC: returns quads where Graph = VC ID.

      // Query for the name
      const result = await agent.query(`
                 SELECT ?name WHERE {
                     GRAPH ?g {
                         <${aliceDID}> <http://schema.org/name> ?name
                     }
                 }
             `)

      expect(result.length).toBeGreaterThan(0)
      expect(result[0].get('name')?.value).toBe('Alice')
    })

    it('should fail validation if shape is provided and data violates it', async () => {
      // Simplified manual shape construction
      const targetNode = DataFactory.namedNode('http://www.w3.org/ns/shacl#targetNode')
      const property = DataFactory.namedNode('http://www.w3.org/ns/shacl#property')
      const minCount = DataFactory.namedNode('http://www.w3.org/ns/shacl#minCount')
      const path = DataFactory.namedNode('http://www.w3.org/ns/shacl#path')

      const shapeNode = DataFactory.namedNode('http://example.org/Shape')
      const bnode = DataFactory.blankNode()

      const shapeQuads = [
        DataFactory.quad(shapeNode, targetNode, DataFactory.namedNode(aliceDID)),
        DataFactory.quad(shapeNode, property, bnode),
        DataFactory.quad(bnode, path, DataFactory.namedNode('http://schema.org/age')),
        DataFactory.quad(
          bnode,
          minCount,
          DataFactory.literal('1', DataFactory.namedNode('http://www.w3.org/2001/XMLSchema#integer'))
        )
      ]

      await expect(agent.publish(claims, shapeQuads)).rejects.toThrow('Validation failed')
    })
  })

  describe('Delegation', () => {
    it('should create and send a ZCAP', async () =>
      new Promise<void>((resolve) => {
        const target = 'http://example.org/resource'

        // Create Bob's carrier to receive the message
        const bobCarrier = new MockCarrier(bobDID)

        // Spy/Listen on Bob's carrier
        bobCarrier.on('message', async (env) => {
          if (env.recipient === bobDID) {
            const payload = JSON.parse(env.payload)
            // Check if payload looks like ZCAP
            expect(payload.invoker).toBe(bobDID)
            expect(payload.invocationTarget).toBe(target)
            expect(payload.allowedAction).toBe('read')
            resolve()
          }
        })

        agent.delegate(target, 'read', bobDID)
      }))
  })
})
