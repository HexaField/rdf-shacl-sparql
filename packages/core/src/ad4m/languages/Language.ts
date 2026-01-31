import type { Expression, Perspective } from '../types'
import type { KeyManager } from '../../identity'
import type { LinkSyncAdapter } from './LinkSyncAdapter'

/**
 * AD4M Language Interface.
 * Defines how to handle a specific type of data (Expression).
 */
export interface Language {
  /** Unique hash/id of the language code/logic */
  readonly address: string

  /**
   * Optional LinkSyncAdapter if this is a Link Language
   */
  readonly linksAdapter?: LinkSyncAdapter

  /**
   * Factory method to create a valid Expression from raw data.
   */
  create(data: any, author: KeyManager): Promise<Expression>

  /**
   * Validates the integrity and schema of an Expression.
   */
  validate(expression: Expression): Promise<boolean>

  /**
   * Applies the expression to a Perspective (Store).
   * e.g. Extracting links and adding them to the graph.
   */
  apply(expression: Expression, perspective: Perspective): Promise<void>
}
