import { describe, it, expect, beforeEach } from 'vitest'
import { Agent } from '../agent'
import { KeyManager } from '../identity'
import { MockCarrier } from '../network'
import { ShaclLanguage } from './languages/ShaclLanguage'
import { DataFactory } from '../store'

describe('AD4M Phase 3: Neighbourhoods', () => {
  let agent1: Agent
  let agent2: Agent
  let language: ShaclLanguage
  const neighbourhoodUrl = 'neighbourhood://test-space'

  beforeEach(async () => {
    // Setup shared carrier (mock bus is global in MockCarrier implementation)
    const k1 = await KeyManager.generate()
    const k2 = await KeyManager.generate()

    agent1 = new Agent(k1, undefined, new MockCarrier(k1.did))
    agent2 = new Agent(k2, undefined, new MockCarrier(k2.did))

    language = new ShaclLanguage() // No shape = allow all
  })

  it('should join a neighbourhood', async () => {
    const n1 = await agent1.neighbourhoods.join(neighbourhoodUrl, language)
    expect(n1.url).toBe(neighbourhoodUrl)
    expect(n1.language).toBe(language)
  })

  it('should sync published messages between agents', async () => {
    const n1 = await agent1.neighbourhoods.join(neighbourhoodUrl, language)
    const n2 = await agent2.neighbourhoods.join(neighbourhoodUrl, language)

    // Define data
    const quad = DataFactory.quad(
      DataFactory.namedNode(agent1.did),
      DataFactory.namedNode('http://example.org/msg'),
      DataFactory.literal('Hello World')
    )

    // Promise that resolves when data is synced
    const synced = new Promise<void>((resolve, reject) => {
      let checkCount = 0
      const interval = setInterval(async () => {
        const links = await n2.all()
        if (links.length > 0) {
          clearInterval(interval)
          try {
            expect(links[0].data.target).toBe('Hello World')
            expect(links[0].author).toBe(agent1.did)
            resolve()
          } catch (e) {
            reject(e)
          }
        }
        checkCount++
        if (checkCount > 10) {
          clearInterval(interval)
          reject(new Error('Sync timeout'))
        }
      }, 100)
    })

    // Agent 1 publishes
    await n1.publish([quad])

    await synced
  })

  it('should separate data from different neighbourhoods', async () => {
    const nA1 = await agent1.neighbourhoods.join('neighbourhood://A', language)
    const nB2 = await agent2.neighbourhoods.join('neighbourhood://B', language) // Agent 2 only in B

    const quad = DataFactory.quad(
      DataFactory.namedNode(agent1.did),
      DataFactory.namedNode('http://example.org/msg'),
      DataFactory.literal('Msg for A')
    )

    await nA1.publish([quad])

    await new Promise<void>((resolve, reject) => {
      setTimeout(async () => {
        const links = await nB2.all()
        try {
          expect(links).toHaveLength(0) // Should not accept msg for A
          resolve()
        } catch (e) {
          reject(e)
        }
      }, 500)
    })
  })
})
