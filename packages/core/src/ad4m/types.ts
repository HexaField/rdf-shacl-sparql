export interface Expression {
  author: string
  timestamp: string
  data: any
  proof: any
}

export interface Link {
  source: string
  predicate: string
  target: string
  author: string
  timestamp: string
  proof?: Expression // The wrapper Expression (VC)
}

export interface Perspective {
  readonly id: string
  readonly name?: string

  add(link: Link): Promise<void>
  remove(link: Link): Promise<void>
  // query is generic to avoid circular dependency, but usually returns standard bindings
  query(sparql: string): Promise<any[]>
  all(): Promise<Link[]>
}
