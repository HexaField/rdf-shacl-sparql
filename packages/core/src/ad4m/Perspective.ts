import { QueryEngine } from '../query'
import { DataFactory } from '../store'
import type { Link, LinkExpression, Perspective } from './types'
import type { NamedNode } from '@rdfjs/types'

const AD4M_NS = 'http://ad4m.dev/core#'
const PRED_AUTHOR = DataFactory.namedNode(AD4M_NS + 'author')
const PRED_TIMESTAMP = DataFactory.namedNode(AD4M_NS + 'timestamp')
const PRED_PROOF = DataFactory.namedNode(AD4M_NS + 'proof')

export class PerspectiveImpl implements Perspective {
  public readonly id: string
  public readonly name?: string
  private engine: QueryEngine

  constructor(id: string, name?: string) {
    this.id = id
    this.name = name
    this.engine = new QueryEngine()
  }

  async add(expression: LinkExpression): Promise<void> {
    const link = expression.data
    // 1. Determine Graph ID (Expression ID)
    // Use signature as unique ID for the expression graph
    const graphId = DataFactory.namedNode(`urn:ad4m:expression:${expression.proof.signature}`)

    const s = DataFactory.namedNode(link.source)
    const p = DataFactory.namedNode(link.predicate || 'ad4m:link')
    let o
    if (link.target.startsWith('http') || link.target.startsWith('did:') || link.target.startsWith('urn:')) {
      o = DataFactory.namedNode(link.target)
    } else {
      o = DataFactory.literal(link.target)
    }

    // 2. Add the Data Quad in the Named Graph
    const q = DataFactory.quad(s, p, o, graphId)
    // console.log('[Perspective] Adding quad to store:', q.toString())
    await this.engine.add(q)

    // 2a. Add validation/query copy to Default Graph (to support simple SPARQL queries)
    // This makes the perspective behave like a flattened view of all accepted claims
    await this.engine.add(DataFactory.quad(s, p, o))

    // 3. Add Metadata about the Graph (Reification of the Expression)
    if (expression.author) {
      await this.engine.add(DataFactory.quad(graphId, PRED_AUTHOR, DataFactory.namedNode(expression.author)))
    }
    if (expression.timestamp) {
      await this.engine.add(DataFactory.quad(graphId, PRED_TIMESTAMP, DataFactory.literal(expression.timestamp)))
    }
    if (expression.proof) {
      await this.engine.add(
        DataFactory.quad(graphId, PRED_PROOF, DataFactory.literal(JSON.stringify(expression.proof)))
      )
    }
  }

  async remove(expression: LinkExpression): Promise<void> {
    const link = expression.data
    const s = link.source
    const p = link.predicate || 'ad4m:link'
    const oIsNode = link.target.startsWith('http') || link.target.startsWith('did:') || link.target.startsWith('urn:')

    // We want to remove the specific expression graph
    const graphId = DataFactory.namedNode(`urn:ad4m:expression:${expression.proof.signature}`)

    // 1. Remove all quads in that graph
    // (This matches ?s ?p ?o ?graphId)
    // We can't easily "drop graph" in pure RDFJS without iterating, but we know the structure.
    await this.engine.delete(
      DataFactory.quad(
        DataFactory.namedNode(s),
        DataFactory.namedNode(p),
        oIsNode ? DataFactory.namedNode(link.target) : DataFactory.literal(link.target),
        graphId
      )
    )

    // Remove metadata
    await this.engine.delete(DataFactory.quad(graphId, PRED_AUTHOR, DataFactory.namedNode(expression.author)))
    await this.engine.delete(DataFactory.quad(graphId, PRED_TIMESTAMP, DataFactory.literal(expression.timestamp)))
    await this.engine.delete(
      DataFactory.quad(graphId, PRED_PROOF, DataFactory.literal(JSON.stringify(expression.proof)))
    )

    // 2. Remove from default graph?
    // ONLY if no other graph asserts this claim.
    // This is hard in simple KV deletion.
    // For now, let's leave it in default graph or blindly remove it (risk: removing data asserted by others).
    // Correct way: Check if any other graph asserts (s, p, o).

    // For this prototype, we will remove it from default graph too.
    await this.engine.delete(
      DataFactory.quad(
        DataFactory.namedNode(s),
        DataFactory.namedNode(p),
        oIsNode ? DataFactory.namedNode(link.target) : DataFactory.literal(link.target)
      )
    )
  }
  async query(sparql: string): Promise<any[]> {
    const result = await this.engine.execute(sparql)
    return result.bindings
  }

  async all(): Promise<LinkExpression[]> {
    // Select all triples in any graph, plus metadata about that graph
    // Note: This query ignores data in the default graph if it has no metadata attached
    const sparql = `
            PREFIX ad4m: <${AD4M_NS}>
            SELECT ?s ?p ?o ?g ?author ?timestamp ?proof
            WHERE {
                GRAPH ?g { ?s ?p ?o } .
                OPTIONAL { ?g ad4m:author ?author } .
                OPTIONAL { ?g ad4m:timestamp ?timestamp } .
                OPTIONAL { ?g ad4m:proof ?proof }
            }
        `

    const result = await this.engine.execute(sparql)
    console.log(`[Perspective] Helper all() found ${result.bindings.length} bindings`)

    return result.bindings.map((b) => {
      const proofTerm = b.get('proof')
      return {
        data: {
          source: b.get('s')?.value || '',
          predicate: b.get('p')?.value || '',
          target: b.get('o')?.value || ''
        },
        author: b.get('author')?.value || 'unknown',
        timestamp: b.get('timestamp')?.value || new Date().toISOString(),
        proof: proofTerm ? JSON.parse(proofTerm.value) : undefined
      } as LinkExpression
    })
  }
}
