import type { Quad } from '@rdfjs/types'
import { KeyManager } from '../identity'
import { type Carrier, MessageFactory } from '../network'
import { QueryEngine, ZCAPGuard, type QueryResult } from '../query'
import { createVC, ingestVC } from '../models'
import { SHACLValidator } from '../validation'
import { PerspectiveImpl } from '../ad4m/Perspective'
import type { Perspective } from '../ad4m/types'
import type { Neighbourhood } from '../ad4m/Neighbourhood'
import type { Language } from '../ad4m/languages/Language'
import { NeighbourhoodImpl } from '../ad4m/NeighbourhoodImpl'

export class Agent {
  public did: string

  // Perspective Manager
  public perspectives: {
    add(name: string): Promise<Perspective>
    get(id: string): Perspective | undefined
  }
  private _perspectives: Map<string, PerspectiveImpl> = new Map()

  // Neighbourhood Manager
  public neighbourhoods: {
    join(url: string, language: Language): Promise<Neighbourhood>
    get(url: string): Neighbourhood | undefined
  }
  private _neighbourhoods: Map<string, NeighbourhoodImpl> = new Map()

  public holochain?: any

  private keys: KeyManager
  private store: QueryEngine | undefined
  private network: Carrier

  constructor(
    keys: KeyManager,
    store: QueryEngine | undefined, // Deprecated, optional
    network: Carrier
  ) {
    this.keys = keys
    this.store = store
    this.network = network
    this.did = keys.did

    // Perspective Manager implementation
    this.perspectives = {
      add: async (name: string) => {
        const id = crypto.randomUUID()
        const p = new PerspectiveImpl(id, name)
        this._perspectives.set(id, p)
        return p
      },
      get: (id: string) => this._perspectives.get(id)
    }

    // Neighbourhood Manager implementation
    this.neighbourhoods = {
      join: async (url: string, language: Language) => {
        if (this._neighbourhoods.has(url)) {
          return this._neighbourhoods.get(url)!
        }

        const n = new NeighbourhoodImpl(url, language, this.keys, async (payload) => {
          // Send function using the carrier
          const env = await MessageFactory.create(
            this.keys,
            'broadcast',
            // Wrap payload in sync structure
            {
              type: 'neighbourhood-sync',
              ...payload
            },
            'neighbourhood-sync'
          )
          await this.network.send(env)
        })

        this._neighbourhoods.set(url, n)
        return n
      },
      get: (url: string) => this._neighbourhoods.get(url)
    }

    // Network Listener for Sync
    this.network.on('message', async (env) => {
      try {
        // Parse payload. Expect { type: 'neighbourhood-sync', neighbourhoodUrl, expression }
        const body = JSON.parse(env.payload)
        if (body.type === 'neighbourhood-sync' && body.neighbourhoodUrl) {
          const n = this._neighbourhoods.get(body.neighbourhoodUrl)
          if (n) {
            try {
              // Validate & Apply using the Neighbourhood's Language
              await n.language.apply(body.expression, n)
            } catch (e) {
              console.warn(`Agent ${this.did} failed to apply sync message for ${body.neighbourhoodUrl}:`, e)
            }
          }
        }
      } catch (e) {
        // ignore parsing errors
      }
    })

    // Backward compatibility: If store provided, make it a default perspective
    if (store) {
      // We can't easily wrap an existing engine instance into PerspectiveImpl
      // without changing PerspectiveImpl to accept it.
      // For now, we leave `this.store` working for legacy methods.
    }
  }

  /**
   * Publish data to the local store wrapped in a verifiable credential.
   * Optionally validates against a SHACL shape.
   */
  async publish(claims: Quad[], shape?: Quad[]): Promise<string> {
    // 1. Validate if shape provided
    if (shape && shape.length > 0) {
      const report = await SHACLValidator.validate(claims, shape)
      if (!report.conforms) {
        const errors = report.results.map((r) => r.message).join(', ')
        throw new Error(`Validation failed: ${errors}`)
      }
    }

    // 2. Create VC
    // We use the agent's DID as the Subject ID if the claims describe the agent,
    // OR we pick the subject from the claims?
    // createVC(issuer, subjectId, claims)
    // Heuristic: Use the subject of the first claim
    if (claims.length === 0) throw new Error('No claims to publish')
    const subjectId = claims[0].subject.value

    const vc = await createVC(this.keys, subjectId, claims)

    // 3. Ingest to Store
    // ingestVC returns Quads (with Graph set to VC ID)
    const quads = await ingestVC(vc)

    if (this.store) {
      for (const q of quads) {
        await this.store.add(q)
      }
    }

    // 4. Return ID
    return vc.id
  }

  /**
   * Query the local knowledge graph
   */
  async query(sparql: string): Promise<Map<string, any>[]> {
    if (!this.store) {
      return []
    }
    const result: QueryResult = await this.store.execute(sparql)
    return result.bindings
  }

  /**
   * Delegate access control to another agent
   */
  async delegate(target: string, action: 'read' | 'write' | 'append', to: string): Promise<void> {
    // 1. Create ZCAP
    const zcap = await ZCAPGuard.create(this.keys, to, target, action)

    // 2. Send via Network
    const envelope = await MessageFactory.create(
      this.keys,
      to,
      zcap, // Payload is the ZCAP JSON
      'zcap-delegation'
    )

    await this.network.send(envelope)
  }
}
