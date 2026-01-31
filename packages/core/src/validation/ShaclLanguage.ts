import type { Language } from '../ad4m/languages/Language'
import type { Expression, Perspective } from '../ad4m/types'
import type { KeyManager } from '../identity'

import { base58btc } from 'multiformats/bases/base58'

export class ShaclLanguage implements Language {
  readonly address: string = 'shacl-language-v1'

  async create(data: any, author: KeyManager): Promise<Expression> {
    const payload = JSON.stringify(data)
    const signatureBytes = await author.sign(new TextEncoder().encode(payload))
    const signature = base58btc.encode(signatureBytes)

    return {
      author: author.did,
      timestamp: new Date().toISOString(),
      data: data,
      proof: {
        signature,
        key: author.did
      }
    }
  }

  async validate(_expression: Expression): Promise<boolean> {
    return true
  }

  async apply(expression: Expression, perspective: Perspective): Promise<void> {
    const data = expression.data
    let linkExpr

    // Case 1: data is the Link object itself
    if (data && data.source && data.predicate && data.target) {
      linkExpr = {
        data: data,
        author: expression.author,
        timestamp: expression.timestamp,
        proof: expression.proof
      }
    }
    // Case 2: data is a wrapper (LinkExpression-like) containing 'data'
    else if (data && data.data && data.data.source) {
      linkExpr = {
        data: data.data,
        author: expression.author,
        timestamp: expression.timestamp,
        proof: expression.proof
      }
    }

    if (linkExpr) {
      // @ts-ignore
      await perspective.add(linkExpr)
    }
  }
}
