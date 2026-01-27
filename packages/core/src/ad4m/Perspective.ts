import { QueryEngine } from '../query'
import { DataFactory } from '../store'
import type { Link, Perspective } from './types'
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

  async add(link: Link): Promise<void> {
    // 1. Determine Graph ID (Expression ID)
    let graphId: NamedNode
    if (link.proof && typeof link.proof === 'object' && 'id' in link.proof) {
      graphId = DataFactory.namedNode(link.proof.id as string)
    } else {
      // Fallback: Generate a UUID for this link's graph context if no proof
      // Ideally every link comes from an expression
      graphId = DataFactory.namedNode(`urn:uuid:${crypto.randomUUID()}`)
    }

    const s = DataFactory.namedNode(link.source)
    const p = DataFactory.namedNode(link.predicate)
    let o
    if (link.target.startsWith('http') || link.target.startsWith('did:') || link.target.startsWith('urn:')) {
      o = DataFactory.namedNode(link.target)
    } else {
      o = DataFactory.literal(link.target)
    }

    // 2. Add the Data Quad in the Named Graph
    const q = DataFactory.quad(s, p, o, graphId)
    await this.engine.add(q)

    // 2a. Add validation/query copy to Default Graph (to support simple SPARQL queries)
    // This makes the perspective behave like a flattened view of all accepted claims
    await this.engine.add(DataFactory.quad(s, p, o))

    // 3. Add Metadata about the Graph (Reification of the Expression)
    if (link.author) {
      await this.engine.add(DataFactory.quad(graphId, PRED_AUTHOR, DataFactory.namedNode(link.author)))
    }
    if (link.timestamp) {
      await this.engine.add(DataFactory.quad(graphId, PRED_TIMESTAMP, DataFactory.literal(link.timestamp)))
    }
    if (link.proof) {
      await this.engine.add(DataFactory.quad(graphId, PRED_PROOF, DataFactory.literal(JSON.stringify(link.proof))))
    }
  }

  async remove(link: Link): Promise<void> {
    const s = link.source
    const p = link.predicate
    const oIsNode = link.target.startsWith('http') || link.target.startsWith('did:') || link.target.startsWith('urn:')
    const oTerm = oIsNode ? `<${link.target}>` : `"${link.target}"` // Simplified escaping

    // 1. Find all graphs containing this triple
    const sparqlGraphs = `
            SELECT ?g WHERE {
                GRAPH ?g { <${s}> <${p}> ${oTerm} }
            }
        `
    const graphResults = await this.engine.execute(sparqlGraphs)

    for (const row of graphResults.bindings) {
      const g = row.get('g')
      if (g && g.termType === 'NamedNode') {
        const gNode = DataFactory.namedNode(g.value)

        // 2. Remove Metadata for this graph
        // We need to find the values first to delete exact quads
        const sparqlMeta = `
                    PREFIX ad4m: <${AD4M_NS}>
                    SELECT ?p ?o WHERE {
                        <${g.value}> ?p ?o .
                        FILTER (?p IN (ad4m:author, ad4m:timestamp, ad4m:proof))
                    }
                `
        const metaResults = await this.engine.execute(sparqlMeta)
        for (const metaRow of metaResults.bindings) {
          const mp = metaRow.get('p')!
          const mo = metaRow.get('o')!
          // Reconstruct quad to delete
          // Need to be careful with Term usage.
          // Since we don't have direct access to internal store match, we reconstruct from terms
          let obj
          if (mo.termType === 'Literal') {
            obj = DataFactory.literal(mo.value)
          } else {
            obj = DataFactory.namedNode(mo.value)
          }

          await this.engine.delete(DataFactory.quad(gNode, DataFactory.namedNode(mp.value), obj))
        }

        // 3. Remove the Data Quad
        let objT
        if (oIsNode) objT = DataFactory.namedNode(link.target)
        else objT = DataFactory.literal(link.target)

        await this.engine.delete(DataFactory.quad(DataFactory.namedNode(s), DataFactory.namedNode(p), objT, gNode))
      }
    }

    // 4. Cleanup Default Graph
    // Check if any instances remain
    const sparqlCheck = `
            ASK {
                GRAPH ?g { <${s}> <${p}> ${oTerm} }
            }
        `
    const result = await this.engine.execute(sparqlCheck)

    if (result.boolean === false) {
      let objT
      if (oIsNode) objT = DataFactory.namedNode(link.target)
      else objT = DataFactory.literal(link.target)

      await this.engine.delete(
        DataFactory.quad(DataFactory.namedNode(s), DataFactory.namedNode(p), objT, DataFactory.defaultGraph())
      )
    }
  }

  async query(sparql: string): Promise<any[]> {
    const result = await this.engine.execute(sparql)
    return result.bindings
  }

  async all(): Promise<Link[]> {
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

    return result.bindings.map((b) => {
      const proofTerm = b.get('proof')
      return {
        source: b.get('s')?.value || '',
        predicate: b.get('p')?.value || '',
        target: b.get('o')?.value || '',
        author: b.get('author')?.value || 'unknown',
        timestamp: b.get('timestamp')?.value || new Date().toISOString(),
        proof: proofTerm ? JSON.parse(proofTerm.value) : undefined
      }
    })
  }
}
