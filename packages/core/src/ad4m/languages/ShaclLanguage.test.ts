import { describe, it, expect, beforeEach } from 'vitest'
import { ShaclLanguage } from './ShaclLanguage'
import { PerspectiveImpl } from '../Perspective'
import { KeyManager } from '../../identity'
import { DataFactory } from '../../store'

describe('AD4M Phase 2: ShaclLanguage', () => {
  let language: ShaclLanguage
  let author: KeyManager
  let perspective: PerspectiveImpl

  beforeEach(async () => {
    language = new ShaclLanguage()
    author = await KeyManager.generate()
    perspective = new PerspectiveImpl('test-p', 'Test Perspective')
  })

  it('should have correct address', () => {
    expect(language.address).toBe('lang:shacl-vc-v1')
  })

  it('should create a valid Expression from Quads', async () => {
    const quad = DataFactory.quad(
      DataFactory.namedNode(author.did),
      DataFactory.namedNode('http://schema.org/name'),
      DataFactory.literal('Alice')
    )

    const expr = await language.create([quad], author)

    expect(expr.author).toBe(author.did)
    expect(expr.proof).toBeDefined() // The VC
    expect(expr.data).toBeDefined() // The Quads (or VC credentialSubject)
  })

  it('should validate a correct Expression', async () => {
    const quad = DataFactory.quad(
      DataFactory.namedNode(author.did),
      DataFactory.namedNode('http://schema.org/name'),
      DataFactory.literal('Alice')
    )
    const expr = await language.create([quad], author)

    const isValid = await language.validate(expr)
    expect(isValid).toBe(true)
  })

  it('should apply an Expression to a Perspective', async () => {
    const quad = DataFactory.quad(
      DataFactory.namedNode(author.did),
      DataFactory.namedNode('http://schema.org/name'),
      DataFactory.literal('Alice')
    )
    const expr = await language.create([quad], author)

    await language.apply(expr, perspective)

    const links = await perspective.all()
    expect(links).toHaveLength(1)
    expect(links[0].data.source).toBe(author.did)
    expect(links[0].data.predicate).toBe('http://schema.org/name')
    expect(links[0].data.target).toBe('Alice')
  })
})
