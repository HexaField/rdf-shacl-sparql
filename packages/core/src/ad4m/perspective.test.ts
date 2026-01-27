import { describe, it, expect, beforeEach } from 'vitest'
import { PerspectiveImpl } from './Perspective'
import { Agent } from '../agent'
import { KeyManager } from '../identity'
import { MockCarrier } from '../network'

describe('AD4M Phase 1: Perspectives', () => {
  let perspective: PerspectiveImpl

  beforeEach(() => {
    perspective = new PerspectiveImpl('test-uuid', 'Test Perspective')
  })

  it('should initialize empty', async () => {
    const links = await perspective.all()
    expect(links).toHaveLength(0)
  })

  it('should add and retrieve a Link', async () => {
    const link = {
      source: 'did:key:alice',
      predicate: 'http://xmlns.com/foaf/0.1/knows',
      target: 'did:key:bob',
      author: 'did:key:alice',
      timestamp: new Date().toISOString()
    }

    await perspective.add(link)

    const storedLinks = await perspective.all()
    expect(storedLinks).toHaveLength(1)
    expect(storedLinks[0].source).toBe('did:key:alice')
    expect(storedLinks[0].target).toBe('did:key:bob')
  })

  it('should query links using SPARQL', async () => {
    const link = {
      source: 'http://example.org/alice',
      predicate: 'http://xmlns.com/foaf/0.1/name',
      target: 'Alice',
      author: 'did:key:alice',
      timestamp: new Date().toISOString()
    }
    await perspective.add(link)

    const results = await perspective.query(`
            SELECT ?name WHERE {
                <http://example.org/alice> <http://xmlns.com/foaf/0.1/name> ?name
            }
        `)

    expect(results).toHaveLength(1)
    expect(results[0].get('name').value).toBe('Alice')
  })

  it('should remove a link', async () => {
    const link = {
      source: 'http://example.org/alice',
      predicate: 'http://xmlns.com/foaf/0.1/name',
      target: 'Alice',
      author: 'did:key:alice',
      timestamp: new Date().toISOString()
    }
    await perspective.add(link)

    // Verify existence
    const linksBefore = await perspective.all()
    expect(linksBefore).toHaveLength(1)

    // Remove
    await perspective.remove(link)

    // Verify removal
    const linksAfter = await perspective.all()
    expect(linksAfter).toHaveLength(0)

    // Verify SPARQL removal (Default Graph)
    const results = await perspective.query(`
            SELECT ?name WHERE {
                <http://example.org/alice> <http://xmlns.com/foaf/0.1/name> ?name
            }
        `)
    expect(results).toHaveLength(0)
  })
})

describe('AD4M Phase 1: Agent Integration', () => {
  let agent: Agent

  beforeEach(async () => {
    const keys = await KeyManager.generate()
    const carrier = new MockCarrier(keys.did)
    // Note: Agent constructor might change in implementation
    // For now, we assume we will modify Agent to support this
    agent = new Agent(keys, undefined as any, carrier)
  })

  it('should create and manage permissions', async () => {
    const p1 = await agent.perspectives.add('Work')
    const p2 = await agent.perspectives.add('Personal')

    expect(p1.id).toBeDefined()
    expect(p2.id).toBeDefined()
    expect(p1.id).not.toBe(p2.id)

    const retrieved = agent.perspectives.get(p1.id)
    expect(retrieved).toBeDefined()
    // expect(retrieved?.name).toBe('Work');
  })

  it('should isolate data between perspectives', async () => {
    const p1 = await agent.perspectives.add('A')
    const p2 = await agent.perspectives.add('B')

    await p1.add({
      source: 'did:key:A',
      predicate: 'http://p',
      target: 'did:key:B',
      author: agent.did,
      timestamp: new Date().toISOString()
    })

    const links1 = await p1.all()
    const links2 = await p2.all()

    expect(links1).toHaveLength(1)
    expect(links2).toHaveLength(0)
  })
})
