import { Store as OxiStore } from 'oxigraph'
import type { Quad, Term } from '@rdfjs/types'
import { verifySignature, type Signer } from '../identity'
import { base58btc } from 'multiformats/bases/base58'

// 1. ZCAP Model
export interface ZCAP {
  id: string
  invoker: string // DID
  parentCapability?: string
  invocationTarget: string // Resource URI
  allowedAction: 'read' | 'write' | 'append'
  proof: {
    type: string
    created: string
    verificationMethod: string
    proofPurpose: string
    proofValue: string // Multibase
  }
}

// 2. Query Engine
export interface QueryResult {
  bindings: Map<string, Term>[]
  boolean?: boolean
}

export class QueryEngine {
  private store: OxiStore

  constructor() {
    this.store = new OxiStore()
  }

  async add(quad: Quad): Promise<void> {
    // Oxigraph supports RDF/JS quads directly
    this.store.add(quad as any)
  }

  async delete(quad: Quad): Promise<void> {
    this.store.delete(quad as any)
  }

  /**
   * Executes a SPARQL Select query
   */
  async execute(sparql: string): Promise<QueryResult> {
    const results = this.store.query(sparql)

    if (typeof results === 'boolean') {
      return { bindings: [], boolean: results }
    }

    // Results can be boolean (ASK), or array of bindings (SELECT), or quads (CONSTRUCT)
    // We assume SELECT for now
    if (Array.isArray(results)) {
      // Distinguish between Bindings and Quads
      // If empty, it satisfies both array types
      if (results.length === 0) return { bindings: [] }

      // Check if it's a Binding (Map)
      if (results[0] instanceof Map) {
        return { bindings: results as Map<string, Term>[] }
      }
    }

    return { bindings: [] }
  }

  serialize(): string {
    const quads = this.store.match(undefined, undefined, undefined, undefined)
    let output = ''
    for (const q of quads) {
      output += q.toString() + ' .\n'
    }
    return output
  }

  deserialize(nquads: string): void {
    if (!nquads) return
    this.store.load(nquads, 'application/n-quads')
  }
}

// 3. Authorization
export class ZCAPGuard {
  private static serialize(zcap: Omit<ZCAP, 'proof'>): Uint8Array {
    // Consistent serialization for signing
    // id|invoker|parent|target|action
    const data = `${zcap.id}|${zcap.invoker}|${zcap.parentCapability || ''}|${zcap.invocationTarget}|${zcap.allowedAction}`
    return new TextEncoder().encode(data)
  }

  static async create(
    signer: Signer,
    invoker: string,
    target: string,
    action: 'read' | 'write' | 'append',
    parentCapability?: string
  ): Promise<ZCAP> {
    const body: Omit<ZCAP, 'proof'> = {
      id: `urn:uuid:${crypto.randomUUID()}`,
      invoker,
      invocationTarget: target,
      allowedAction: action,
      parentCapability
    }

    const bytesToSign = ZCAPGuard.serialize(body)
    const signatureBytes = await signer.sign(bytesToSign)

    return {
      ...body,
      proof: {
        type: 'Ed25519Signature2020',
        created: new Date().toISOString(),
        verificationMethod: `${signer.did}#${signer.did.split(':')[2]}`,
        proofPurpose: 'capabilityDelegation',
        proofValue: base58btc.encode(signatureBytes)
      }
    }
  }

  /**
   * Simple check: Does agent have a ZCAP for this resource?
   * In a real system, this would verify the chain and signatures.
   * For Phase 5, we verify the structure matches.
   */
  static async verify(
    capability: ZCAP,
    agent: string,
    target: string,
    action: 'read' | 'write' | 'append'
  ): Promise<boolean> {
    // 1. Check Invoker
    if (capability.invoker !== agent) return false

    // 2. Check Target
    // Simplified: exact match. Real ZCAP: prefix match often allowed.
    if (capability.invocationTarget !== target) return false

    // 3. Check Action
    if (capability.allowedAction !== action) return false

    // 4. Verify Signature
    const { proof, ...rest } = capability
    const bytesToVerify = ZCAPGuard.serialize(rest)

    // Extract delegator DID from verificationMethod
    const delegatorDID = proof.verificationMethod.split('#')[0]

    let signatureBytes: Uint8Array
    try {
      signatureBytes = base58btc.decode(proof.proofValue)
    } catch (e) {
      return false
    }

    return await verifySignature(delegatorDID, bytesToVerify, signatureBytes)
  }
}
