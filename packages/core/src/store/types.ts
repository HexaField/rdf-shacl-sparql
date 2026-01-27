import type { Quad, NamedNode, Literal, BlankNode, Variable, Term } from '@rdfjs/types'

export interface GraphStore {
  add(quad: Quad): GraphStore
  remove(quad: Quad): GraphStore
  match(subject?: Term | null, predicate?: Term | null, object?: Term | null, graph?: Term | null): Iterable<Quad>
  count(): number
  has(quad: Quad): boolean
  // Functional-style import capable (async mostly for streams, but keeping simple for now)
  // toArray/Symbol.iterator could be added
  [Symbol.iterator](): Iterator<Quad>
}

export { Quad, NamedNode, Literal, BlankNode, Variable, Term }
