import type { Language } from '../ad4m/languages/Language'
import type { Expression, Perspective } from '../ad4m/types'
import type { KeyManager } from '../identity'

export class ShaclLanguage implements Language {
  readonly address: string = 'shacl-language-v1'

  async create(data: any, author: KeyManager): Promise<Expression> {
    const payload = JSON.stringify(data)
    const signature = await author.sign(new TextEncoder().encode(payload))
    // Proof format for now: just the signature bytes
    return {
      author: author.did,
      timestamp: new Date().toISOString(),
      data: data,
      proof: signature
    }
  }

  async validate(_expression: Expression): Promise<boolean> {
    return true
  }

  async apply(expression: Expression, perspective: Perspective): Promise<void> {
    const data = expression.data
    if (data && data.source && data.predicate && data.target) {
      const link = {
        source: data.source,
        predicate: data.predicate,
        target: data.target,
        author: expression.author,
        timestamp: expression.timestamp,
        proof: expression.proof
      }
      // @ts-ignore
      await perspective.add(link)
    }
  }
}
