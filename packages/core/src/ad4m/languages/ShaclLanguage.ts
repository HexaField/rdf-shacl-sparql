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
      proof: {
        signature: vc.proof.proofValue,
        key: vc.issuer
      }
    }
  }

  async validate(expression: Expression): Promise<boolean> {
    // Simplified validation for compatibility prototype
    // In a full implementation, we would reconstruct the Verifiable Credential from the Expression data
    // and verify the signature in expression.proof.signature
    return true
  }

  async apply(expression: Expression, perspective: Perspective): Promise<void> {
    if (!(await this.validate(expression))) {
      throw new Error('Invalid Expression')
    }

    // Extract Links from Quads
    // Since we are adding to a Perspective (which wraps a QueryEngine/Store),
    // we can iterate the quads and add them.

    // Handle various data shapes (Quad[], LinkExpression, Link)
    console.log('[ShaclLanguage] apply data:', JSON.stringify(expression.data))
    const items = Array.isArray(expression.data) ? expression.data : [expression.data]

    for (const item of items) {
      let linkData

      // Quad-like
      if (item.subject && item.predicate && item.object) {
        linkData = {
          source: item.subject.value,
          predicate: item.predicate.value,
          target: item.object.value
        }
      }
      // Wrapped Link (LinkExpression-like structure from server)
      else if (item.data && item.data.source) {
        linkData = item.data
      }
      // Raw Link
      else if (item.source && item.predicate) {
        linkData = item
      }

      if (linkData) {
        console.log('[ShaclLanguage] Adding link:', linkData)
        await perspective.add({
          data: linkData,
          author: expression.author,
          timestamp: expression.timestamp,
          proof: expression.proof
        })
      }
    }
  }
}
