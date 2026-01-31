/**
 * Canonical AD4M Expression types
 */

export interface ExpressionProof {
  signature: string
  key: string
  valid?: boolean
  invalid?: boolean
}

export interface Expression {
  author: string
  timestamp: string
  data: any
  proof: ExpressionProof
}

export interface Link {
  source: string
  predicate: string
  target: string
}

export interface LinkExpression {
  author: string
  timestamp: string
  data: Link
  proof: ExpressionProof
}

export interface Perspective {
  readonly id: string
  readonly name?: string

  add(link: LinkExpression): Promise<void>
  remove(link: LinkExpression): Promise<void>
  query(sparql: string): Promise<any[]>
  all(): Promise<LinkExpression[]>
}
