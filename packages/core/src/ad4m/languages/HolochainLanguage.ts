import type { Language } from './Language'
import type { Expression, Perspective } from '../types'
import type { KeyManager } from '../../identity'
import { createVC } from '../../models'
import type { Quad } from '@rdfjs/types'
import type { HolochainDriver } from '../../runtime/holochain/HolochainDriver'

/**
 * A Language that creates Expressions signed by Agent, and attempts to persist to Holochain.
 */
export class HolochainLanguage implements Language {
  readonly address = 'lang:holochain-v1'
  private driver?: HolochainDriver
  private appId: string

  constructor(driver?: HolochainDriver, appId: string = 'main-app') {
    this.driver = driver
    this.appId = appId
  }

  async create(data: Quad[], author: KeyManager): Promise<Expression> {
    // 1. Create VC (Same as ShaclLanguage for compatibility with Chat UI expecting Link data)
    if (data.length === 0) throw new Error('Cannot create expression from empty data')
    const subjectId = data[0].subject.value
    const vc = await createVC(author, subjectId, data)

    // 2. Wrap in Expression
    return {
      author: author.did,
      timestamp: vc.validFrom as string,
      data: data,
      proof: {
        signature: vc.proof.proofValue,
        key: vc.issuer,
        valid: true
      }
    }
  }

  async validate(expression: Expression): Promise<boolean> {
    return true
  }

  async apply(expression: Expression, perspective: Perspective): Promise<void> {
    // Convert Quads to LinkExpressions for Perspective and Holochain
    const links = expression.data.map((q: Quad) => ({
      data: {
        source: q.subject.value,
        predicate: q.predicate.value,
        target: q.object.value
      },
      author: expression.author,
      timestamp: expression.timestamp,
      proof: expression.proof
    }))

    // 1. Add to local perspective (memory)
    for (const link of links) {
      await perspective.add(link)
    }

    // 2. Persist to Holochain (if driver available)
    if (this.driver) {
      try {
        console.log('[HolochainLanguage] Persisting to Holochain:', links.length, 'links')

        const payload = {
          diff: {
            additions: links,
            removals: []
          },
          my_did: expression.author
        }

        await this.driver.callZomeFunction(
          this.appId,
          'perspective-diff-sync',
          'perspective_diff_sync',
          'commit',
          payload
        )
      } catch (e) {
        // console.warn('[HolochainLanguage] Failed to persist to Holochain:', e)
        // Log basic info and the full error object for debugging
        console.error('[HolochainLanguage] Zome Call Failed:', e)
      }
    }
  }
}
