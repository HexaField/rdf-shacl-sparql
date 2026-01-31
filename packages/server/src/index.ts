import dotenv from 'dotenv'
import fs from 'node:fs'
import os from 'os'
import https from 'node:https'
import path from 'node:path'
import { ApolloServer } from '@apollo/server'
import { expressMiddleware } from '@apollo/server/express4'
import { ApolloServerPluginDrainHttpServer } from '@apollo/server/plugin/drainHttpServer'
import bodyParser from 'body-parser'
import cors from 'cors'
import express from 'express'
import healthRouter from './routes/health'

// Core imports
import {
  Agent,
  KeyManager,
  MockCarrier,
  ShaclLanguage,
  HolochainLanguage,
  type Link,
  Libp2pCarrier,
  HolochainDriver,
  DataFactory
} from '@template/core'
import { LocalFilesystemCarrier } from './network/LocalFilesystemCarrier'

dotenv.config({ path: '.env.local' })
dotenv.config()

const app = express()
const port = process.env.PORT || 3001
const host = process.env.HOST || 'localhost'

const options = {
  key: fs.readFileSync(path.join(process.cwd(), '../../.certs/localhost.key')),
  cert: fs.readFileSync(path.join(process.cwd(), '../../.certs/localhost.cert'))
}

const httpsServer = https.createServer(options, app)

// --- AD4M Setup ---
const keys = await KeyManager.generate()

// Use STORAGE_DIR env var or default to a safe temp location for testing
const storageDir = process.env.STORAGE_DIR || path.join(os.tmpdir(), 'ad4m-storage')

// If NETWORK_FILE is present (from old scripts) we treat it as signal to use P2P
let network
if (process.env.USE_LIBP2P === 'true') {
  network = new Libp2pCarrier()
  await (network as Libp2pCarrier).start()
} else {
  network =
    process.env.NETWORK_FILE || process.env.USE_P2P === 'true'
      ? new LocalFilesystemCarrier(keys.did, storageDir)
      : new MockCarrier(keys.did)
}

console.log(`Agent ${keys.did.substring(0, 8)} starting. Mode: ${network.constructor.name}`)
if (network instanceof LocalFilesystemCarrier) {
  // Ensure storage initialized implicitly by carrier
}
if (network instanceof Libp2pCarrier) {
  console.log('Libp2p Peer ID:', network.id)
}

// --- Holochain Setup ---
const holochainDriver = new HolochainDriver()
await holochainDriver.startHolochainConductor({
  dataPath: process.env.HOLOCHAIN_DATA || path.join(os.tmpdir(), 'ad4m-holochain'),
  conductorPath: process.env.HOLOCHAIN_PATH || 'holochain'
})

// Install main app if happ exists (for testing/dev)
const happPath = path.resolve(
  process.cwd(),
  '../../packages/ad4m/bootstrap-languages/p-diff-sync/hc-dna/workdir/perspective-diff-sync.happ'
)
if (fs.existsSync(happPath)) {
  console.log('[Server] Installing Holochain App:', happPath)
  try {
    // Check if checks if already installed? Driver doesn't check.
    // But since dataPath is likely fresh or we can catch error
    await holochainDriver.installApp({
      path: happPath,
      installed_app_id: 'main-app',
      network_seed: 'test-seed'
    })
    console.log('[Server] App installed successfully')
  } catch (e) {
    console.warn('[Server] App install skipped/failed (might be already installed):', e)
  }
}

const agent = new Agent(keys, undefined, network)
agent.holochain = holochainDriver
const mainPerspective = await agent.perspectives.add('Public Profile')

// --- GraphQL Schema ---
const typeDefs = `#graphql
  scalar JSON

  type Link {
    source: String!
    predicate: String!
    target: String!
  }

  type LinkExpression {
    author: String!
    timestamp: String!
    data: Link!
    proof: JSON
  }

  type Perspective {
    uuid: String!
    name: String
    links: [LinkExpression!]!
  }

  type Agent {
    did: String!
    perspective: Perspective
  }

  input LinkInput {
    source: String!
    predicate: String!
    target: String!
  }

  input LinkQuery {
    source: String
    predicate: String
    target: String
  }

  type Query {
    me: Agent!
    perspective(uuid: String!): Perspective
    perspectiveQueryLinks(uuid: String!, query: LinkQuery!): [LinkExpression!]!
    neighbourhood(url: String!): Perspective
  }

  type Mutation {
    perspectiveAddLink(uuid: String!, link: LinkInput!): LinkExpression!
    perspectiveRemoveLink(uuid: String!, link: LinkInput!): Boolean
    neighbourhoodJoinFromUrl(url: String!): Perspective
  }
`

// --- Resolvers ---
const resolvers = {
  Query: {
    me: () => ({
      did: agent.did,
      perspective: mainPerspective
    }),
    perspective: (_: any, { uuid }: { uuid: string }) => {
      let p = agent.perspectives.get(uuid)
      if (!p) p = agent.neighbourhoods.get(uuid)
      if (!p && uuid.includes('://')) p = agent.neighbourhoods.get(uuid)
      return p ? { uuid: p.id, name: p.name } : null
    },
    perspectiveQueryLinks: async (_: any, { uuid, query }: { uuid: string; query: any }) => {
      let p = agent.perspectives.get(uuid)
      if (!p) p = agent.neighbourhoods.get(uuid)
      if (!p) throw new Error('Perspective not found')

      const allLinks = await p.all()
      console.log(`[Server] Querying ${allLinks.length} links. Filter:`, query)

      const filtered = allLinks.filter((l) => {
        if (query.source && l.data.source !== query.source) return false
        if (query.predicate && l.data.predicate !== query.predicate) return false
        if (query.target && l.data.target !== query.target) return false
        return true
      })

      console.log(`[Server] Filtered down to ${filtered.length} links`)
      return filtered.map((l) => ({
        author: l.author,
        timestamp: l.timestamp,
        data: { source: l.data.source, predicate: l.data.predicate, target: l.data.target },
        proof: l.proof
      }))
    },
    neighbourhood: (_: any, { url }: { url: string }) => {
      const n = agent.neighbourhoods.get(url)
      return n ? { uuid: n.url, name: 'Neighbourhood' } : null
    }
  },
  Mutation: {
    perspectiveAddLink: async (_: any, { uuid, link }: { uuid: string; link: Link }) => {
      let p = agent.perspectives.get(uuid)
      let isNeighbourhood = false
      if (!p) {
        p = agent.neighbourhoods.get(uuid)
        isNeighbourhood = true
      }
      if (!p) throw new Error('Perspective not found')

      // Use a placeholder signature until we have full signing flow here.
      // In reality, this should be signed by agent.
      // But for Perspective.add(), we need a LinkExpression.

      const newLink = {
        data: link,
        author: agent.did,
        timestamp: new Date().toISOString(),
        proof: { signature: 'server-signed-placeholder', key: agent.did }
      }

      if (isNeighbourhood && 'publish' in p) {
        // Convert Link to Quads for Language.create()
        const s = DataFactory.namedNode(link.source)
        const pred = DataFactory.namedNode(link.predicate)
        let o
        if (link.target.startsWith('http') || link.target.startsWith('did:') || link.target.startsWith('urn:')) {
          o = DataFactory.namedNode(link.target)
        } else {
          o = DataFactory.literal(link.target)
        }
        const quads = [DataFactory.quad(s, pred, o)]

        // @ts-ignore
        await p.publish(quads)
      } else {
        await p.add(newLink)
      }

      return {
        author: newLink.author,
        timestamp: newLink.timestamp,
        data: link,
        proof: newLink.proof
      }
    },
    perspectiveRemoveLink: async (_: any, { uuid, link }: { uuid: string; link: Link }) => {
      let p = agent.perspectives.get(uuid)
      if (!p) p = agent.neighbourhoods.get(uuid)
      if (!p) throw new Error('Perspective not found')

      const linkToRemove = {
        data: link,
        author: '',
        timestamp: '',
        proof: { signature: 'dummy', key: '' } // Removal often uses content-addressing or structure matching, proof implied by request auth
      }
      await p.remove(linkToRemove)
      return true
    },
    neighbourhoodJoinFromUrl: async (_: any, { url }: { url: string }) => {
      // Choose language based on ENV
      const useHolochain = process.env.LINK_LANGUAGE === 'holochain'
      console.log(`[Server] Joining neighbourhood with LinkLanguage: ${useHolochain ? 'Holochain' : 'Shacl'}`)

      const lang = useHolochain ? new HolochainLanguage(holochainDriver, 'main-app') : new ShaclLanguage()

      const n = await agent.neighbourhoods.join(url, lang)
      return { uuid: n.url, name: 'Joined Neighbourhood' }
    }
  },
  Perspective: {
    uuid: (parent: any) => parent.uuid || parent.id,
    links: async (parent: any) => {
      const uuid = parent.uuid || parent.id
      let p = agent.perspectives.get(uuid)
      if (!p) p = agent.neighbourhoods.get(uuid)
      if (!p) return []

      const links = await p.all()
      return links.map((l) => ({
        author: l.author,
        timestamp: l.timestamp,
        data: { source: l.data.source, predicate: l.data.predicate, target: l.data.target },
        proof: l.proof
      }))
    }
  }
}

const server = new ApolloServer({
  typeDefs,
  resolvers,
  plugins: [ApolloServerPluginDrainHttpServer({ httpServer: httpsServer })]
})

await server.start()

app.use('/graphql', cors(), bodyParser.json(), expressMiddleware(server))

app.use('/health', healthRouter)

// Use HTTPS server listen
httpsServer.listen(Number(port), host, () => {
  console.log(`🚀 Server ready at https://${host}:${port}/graphql`)
})
