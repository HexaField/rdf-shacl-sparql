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

export interface Persister {
  load(id: string): Promise<string | null>
  save(id: string, data: string): Promise<void>
}

export class Agent {
  public did: string

  // Perspective Manager
  public perspectives: {
    add(name: string): Promise<Perspective>
    get(id: string): Perspective | undefined
    all(): Perspective[]
  }
  private _perspectives: Map<string, PerspectiveImpl> = new Map()

  // Neighbourhood Manager
  public neighbourhoods: {
    join(url: string, language: Language): Promise<Neighbourhood>
    leave(url: string): Promise<boolean>
    get(url: string): Neighbourhood | undefined
    all(): Neighbourhood[]
  }
  private _neighbourhoods: Map<string, NeighbourhoodImpl> = new Map()

  public holochain?: any

  private keys: KeyManager
  private store: QueryEngine | undefined
  private network: Carrier
  private persister?: Persister

  constructor(
    keys: KeyManager,
    store: QueryEngine | undefined, // Deprecated, optional
    network: Carrier,
    persister?: Persister
  ) {
    this.keys = keys
    this.store = store
    this.network = network
    this.persister = persister
    this.did = keys.did

    // Perspective Manager implementation
    this.perspectives = {
      add: async (name: string) => {
        const id = crypto.randomUUID()
        const p = new PerspectiveImpl(id, name, async (data) => {
          if (this.persister) await this.persister.save(id, data)
        })
        if (this.persister) {
          const data = await this.persister.load(id)
          if (data) p.load(data)
        }
        this._perspectives.set(id, p)
        return p
      },
      get: (id: string) => this._perspectives.get(id),
      all: () => Array.from(this._perspectives.values())
    }

    // Neighbourhood Manager implementation
    this.neighbourhoods = {
      join: async (url: string, language: Language) => {
        if (this._neighbourhoods.has(url)) {
          return this._neighbourhoods.get(url)!
        }

        const n = new NeighbourhoodImpl(
          url,
          language,
          this.keys,
          async (payload) => {
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
          },
          async (data) => {
            if (this.persister) await this.persister.save(url, data)
          }
        )

        if (this.persister) {
          const data = await this.persister.load(url)
          if (data) n.load(data)
        }

        this._neighbourhoods.set(url, n)

        // Request History Sync
        const syncReq = await MessageFactory.create(
          this.keys,
          'broadcast',
          { type: 'sync-request', neighbourhoodUrl: url },
          'neighbourhood-sync'
        )
        await this.network.send(syncReq)

        return n
      },
      leave: async (url: string) => {
        return this._neighbourhoods.delete(url)
      },
      get: (url: string) => this._neighbourhoods.get(url),
      all: () => Array.from(this._neighbourhoods.values())
    }

    // Network Listener for Sync
    this.network.on('message', async (env) => {
      // Filter: Ignore messages not for me
      if (env.recipient !== 'broadcast' && env.recipient !== this.did) {
        return
      }

      try {
        // Parse payload. Expect { type: 'neighbourhood-sync' | 'sync-request' | 'sync-response', ... }
        const body = JSON.parse(env.payload)

        // 1. New Message Broadcast
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

        // 2. Sync Request (Someone joined and wants history)
        if (body.type === 'sync-request' && body.neighbourhoodUrl) {
          const n = this._neighbourhoods.get(body.neighbourhoodUrl)
          // Only reply if we have the neighbourhood
          if (n) {
            const links = await n.all()
            if (links.length > 0) {
              const resp = await MessageFactory.create(
                this.keys,
                env.sender, // Direct reply
                {
                  type: 'sync-response',
                  neighbourhoodUrl: body.neighbourhoodUrl,
                  links: links
                },
                'neighbourhood-sync'
              )
              await this.network.send(resp)
            }
          }
        }

        // 3. Sync Response (We received history)
        if (body.type === 'sync-response' && body.neighbourhoodUrl && body.links) {
          const n = this._neighbourhoods.get(body.neighbourhoodUrl)
          if (n) {
            console.log(`[Agent] Received Sync Response for ${body.neighbourhoodUrl} with ${body.links.length} links`)
            for (const link of body.links) {
              try {
                // Directly add to perspective.
                // Note: Bypassing `language.apply` checks might vary per language logic,
                // but `add` is safe for storing known links.
                await n.add(link)
              } catch (e) {
                /* ignore duplicates/errors */
              }
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
