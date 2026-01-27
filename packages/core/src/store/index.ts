import { Store } from 'n3'
import { DataFactory as RdfDataFactory } from 'rdf-data-factory'
import type { GraphStore, Quad, Term } from './types'

// Singleton instance of the factory to avoid overhead
const factory = new RdfDataFactory()

export const DataFactory = factory

class N3GraphStore implements GraphStore {
  private store: Store

  constructor() {
    this.store = new Store()
  }

  add(quad: Quad): GraphStore {
    this.store.addQuad(quad)
    return this
  }

  remove(quad: Quad): GraphStore {
    this.store.removeQuad(quad)
    return this
  }

  match(subject?: Term | null, predicate?: Term | null, object?: Term | null, graph?: Term | null): Iterable<Quad> {
    // n3 store.match returns a stream, getQuads returns an array.
    // Array is iterable.
    return this.store.getQuads(subject || null, predicate || null, object || null, graph || null)
  }

  count(): number {
    return this.store.size
  }

  has(quad: Quad): boolean {
    return this.store.has(quad)
  }

  [Symbol.iterator](): Iterator<Quad> {
    return this.store[Symbol.iterator]()
  }
}

export function createStore(): GraphStore {
  return new N3GraphStore()
}
