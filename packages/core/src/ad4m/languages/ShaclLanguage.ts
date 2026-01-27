import type { Language } from './Language'
import type { Expression, Perspective } from '../types'
import type { KeyManager } from '../../identity'
import { createVC } from '../../models'
import { SHACLValidator } from '../../validation'
import type { Quad } from '@rdfjs/types'
import { verifySignature } from '../../identity'
import { base58btc } from 'multiformats/bases/base58'
import * as jsonld from 'jsonld'
import { documentLoader } from '../../models/documentLoader'

/**
 * A Language that interprets Verifiable Credentials (VCs) as Expressions.
 *
 * - `Expression.data`: The RDF Quads (Claims).
 * - `Expression.proof`: The Signed Verifiable Credential object.
 */
export class ShaclLanguage implements Language {
  readonly address = 'lang:shacl-vc-v1'
  private shape?: Quad[]

  // Optional: Pre-configured shape for this instance of the language
  constructor(shape?: Quad[]) {
    this.shape = shape
  }

  async create(data: Quad[], author: KeyManager): Promise<Expression> {
    // 1. Validate against SHACL if shape exists
    if (this.shape) {
      const report = await SHACLValidator.validate(data, this.shape)
      if (!report.conforms) {
        throw new Error(`SHACL Validation Failed: ${report.results.map((r) => r.message).join(', ')}`)
      }
    }

    // 2. Create VC
    // We assume the subject of the first quad is the subjectId
    if (data.length === 0) throw new Error('Cannot create expression from empty data')
    const subjectId = data[0].subject.value

    const vc = await createVC(author, subjectId, data)

    // 3. Wrap in Expression
    return {
      author: author.did,
      timestamp: vc.validFrom as string,
      data: data, // We store the raw quads for easy access, though strictly they are inside the VC
      proof: vc // The VC is the proof/payload
    }
  }

  async validate(expression: Expression): Promise<boolean> {
    const vc = expression.proof

    // 1. Verify Structure
    if (!vc.proof || !vc.issuer) return false

    // 2. Verify Signature
    // Reuse logic from models/index.ts or verifySignature directly
    // We need to re-canonize to verify.
    // Ideally we expose `verifyVC` in models/index.ts.
    // For now, let's implement validation manually or check if we can reuse `verifySignature`

    // Extract proof and document
    const { proof, ...doc } = vc

    // Canonize
    const canonized = await (jsonld as any).canonize(doc, {
      algorithm: 'URDNA2015',
      format: 'application/n-quads',
      documentLoader,
      safe: false
    })

    const dataBytes = new TextEncoder().encode(canonized as string)
    const signatureBytes = base58btc.decode(proof.proofValue)

    // Get Issuer Verification Method (simplified: assume did:key matches issuer)
    // In real AD4M, we'd resolve the DID.
    // Here we assume issuer === expression.author
    if (vc.issuer !== expression.author) return false

    const isValid = await verifySignature(vc.issuer, dataBytes, signatureBytes)

    if (!isValid) return false

    // 3. Verify SHACL if shape exists
    if (this.shape) {
      // We need the data as quads.
      // If expression.data is trusty, use it. Else extract from VC.
      // For now, use expression.data
      const report = await SHACLValidator.validate(expression.data as Quad[], this.shape)
      return report.conforms
    }

    return true
  }

  async apply(expression: Expression, perspective: Perspective): Promise<void> {
    if (!(await this.validate(expression))) {
      throw new Error('Invalid Expression')
    }

    // Extract Links from Quads
    // Since we are adding to a Perspective (which wraps a QueryEngine/Store),
    // we can iterate the quads and add them.

    // In this simplified model: 1 Quad = 1 Link
    const quads = expression.data as Quad[]

    for (const q of quads) {
      await perspective.add({
        source: q.subject.value,
        predicate: q.predicate.value,
        target: q.object.value,
        author: expression.author,
        timestamp: expression.timestamp,
        proof: expression // recursive reference? or just the VC?
      })
    }
  }
}
