import type { Perspective } from './types'
import type { Language } from './languages/Language'

export interface Neighbourhood extends Perspective {
  readonly url: string
  readonly language: Language

  /**
   * Publish data to this neighbourhood.
   * Creates an expression, applies it locally, and broadcasts it.
   */
  publish(data: any): Promise<void>
}
