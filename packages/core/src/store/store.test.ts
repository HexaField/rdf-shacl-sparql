import { describe, it, expect, beforeEach } from 'vitest'
import { createStore, DataFactory } from './index'
import type { GraphStore } from './types'

describe('RDF Data Layer', () => {
  describe('DataFactory', () => {
    it('should create a NamedNode', () => {
      const node = DataFactory.namedNode('http://example.org/Alice')
      expect(node.termType).toBe('NamedNode')
      expect(node.value).toBe('http://example.org/Alice')
    })

    it('should create a Literal', () => {
      const literal = DataFactory.literal('Hello', 'en')
      expect(literal.termType).toBe('Literal')
      expect(literal.value).toBe('Hello')
      expect(literal.language).toBe('en')
    })

    it('should create a Quad', () => {
      const s = DataFactory.namedNode('http://example.org/s')
      const p = DataFactory.namedNode('http://example.org/p')
      const o = DataFactory.literal('o')
      const quad = DataFactory.quad(s, p, o)

      expect(quad.subject.equals(s)).toBe(true)
      expect(quad.predicate.equals(p)).toBe(true)
      expect(quad.object.equals(o)).toBe(true)
    })
  })

  describe('GraphStore', () => {
    let store: GraphStore
    const s = DataFactory.namedNode('http://ex/s')
    const p = DataFactory.namedNode('http://ex/p')
    const o = DataFactory.literal('o')
    const quad = DataFactory.quad(s, p, o)

    beforeEach(() => {
      store = createStore()
    })

    it('should start empty', () => {
      expect(store.count()).toBe(0)
    })

    it('should add a quad', () => {
      store.add(quad)
      expect(store.count()).toBe(1)
    })

    it('should match a quad by subject', () => {
      store.add(quad)
      const results = Array.from(store.match(s))
      expect(results).toHaveLength(1)
      expect(results[0].equals(quad)).toBe(true)
    })

    it('should return empty iterable when no match', () => {
      store.add(quad)
      const s2 = DataFactory.namedNode('http://ex/s2')
      const results = Array.from(store.match(s2))
      expect(results).toHaveLength(0)
    })

    it('should match using multiple parameters', () => {
      const q2 = DataFactory.quad(s, p, DataFactory.literal('o2'))
      store.add(quad)
      store.add(q2)

      const results = Array.from(store.match(s, p))
      expect(results).toHaveLength(2)
    })

    it('should remove a quad', () => {
      store.add(quad)
      expect(store.count()).toBe(1)
      store.remove(quad)
      expect(store.count()).toBe(0)
    })
  })
})
