import { describe, it, expect, beforeEach } from 'vitest'
import { KeyManager, DataFactory } from '../index'
import { createVC, verifyVC, ingestVC } from './index'
// Mock implementation types slightly different from final to strictly follow TDD
// import type { VerifiableCredential } from './types';

describe('Verifiable Credentials', () => {
  let issuer: KeyManager
  let subjectDID: string

  // Some sample data (Quads)
  const s = DataFactory.namedNode('did:example:alice')
  const p = DataFactory.namedNode('http://schema.org/name')
  const o = DataFactory.literal('Alice')
  const claim = [DataFactory.quad(s, p, o)]

  beforeEach(async () => {
    issuer = await KeyManager.generate()
    subjectDID = 'did:example:alice'
  })

  it('should create a valid Verifiable Credential from Quads', async () => {
    const vc = await createVC(issuer, subjectDID, claim)

    expect(vc.issuer).toBe(issuer.did)
    expect(vc.credentialSubject).toBeDefined()
    expect(vc.proof).toBeDefined()
    // Check proof structure
    expect(vc.proof.verificationMethod).toContain(issuer.did)
  })

  it('should verify a valid VC', async () => {
    const vc = await createVC(issuer, subjectDID, claim)
    const isValid = await verifyVC(vc)
    expect(isValid).toBe(true)
  })

  it('should reject a tampered VC', async () => {
    const vc = await createVC(issuer, subjectDID, claim)

    // Tamper with the proof signature
    const tamperedProof = { ...vc.proof, proofValue: 'invalid' }
    const tamperedVC = { ...vc, proof: tamperedProof }

    const isValid = await verifyVC(tamperedVC)
    expect(isValid).toBe(false)
  })

  it('should ingest VC into Quads with correct Graph ID', async () => {
    const vc = await createVC(issuer, subjectDID, claim)
    const quads = await ingestVC(vc)

    expect(quads.length).toBeGreaterThan(0)

    // Every quad should have the graph set to the VC ID
    quads.forEach((q) => {
      expect(q.graph.value).toBe(vc.id)
    })

    // Should contain our original claim (semantics preserved)
    // Note: Graph changes, but S P O match
    const match = quads.find(
      (q) => q.subject.value === s.value && q.predicate.value === p.value && q.object.value === o.value
    )
    expect(match).toBeDefined()
  })
})
