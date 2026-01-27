// src/models/index.ts
import * as jsonld from 'jsonld'
import { DataFactory } from '../store'
import { KeyManager, verifySignature } from '../identity'
import { base58btc } from 'multiformats/bases/base58'
import { documentLoader } from './documentLoader'
import type { VerifiableCredential, Proof } from './types'
import type { Quad } from '@rdfjs/types'
import { Parser, Writer } from 'n3'

// Standard Contexts
const VC_CONTEXT_V2 = 'https://www.w3.org/ns/credentials/v2'

export async function createVC(
  issuer: KeyManager,
  _subjectId: string,
  claims: Quad[],
  type: string[] = ['VerifiableCredential']
): Promise<VerifiableCredential> {
  // 1. Convert Quads to JSON-LD Credential Subject via N3/JSONLD
  const writer = new Writer({ format: 'N-Quads' })
  const nquads = writer.quadsToString(claims)

  // fromRDF returns an array of graph nodes
  const doc = await (jsonld as any).fromRDF(nquads, {
    format: 'application/n-quads'
  })

  // We expect doc to be the graph.
  // If it's a single subject matching ID, we can unwrap it, but kept as array is safer for VCs
  // that support multiple subjects or graph structures.
  const credentialSubject = doc

  const vcRaw: Partial<VerifiableCredential> = {
    '@context': [VC_CONTEXT_V2],
    id: `urn:uuid:${crypto.randomUUID()}`,
    type: type,
    issuer: issuer.did,
    validFrom: new Date().toISOString(),
    credentialSubject: credentialSubject
  }

  // 2. Canonize (Normalization)
  // We need to canonize the document to sign it.
  // We use URDNA2015 (standard for N-Quads in VC Data Integrity)
  // jsonld.canonize returns a string of N-Quads.
  const canonized = (await (jsonld as any).canonize(vcRaw, {
    algorithm: 'URDNA2015',
    format: 'application/n-quads',
    documentLoader,
    safe: false
  })) as string

  const dataToSign = new TextEncoder().encode(canonized)

  // 3. Sign
  const signatureBytes = await issuer.sign(dataToSign)
  const signatureMultibase = base58btc.encode(signatureBytes)

  // 4. Attach Proof
  const proof: Proof = {
    type: 'Ed25519Signature2020',
    created: new Date().toISOString(),
    verificationMethod: `${issuer.did}#${issuer.did.split(':')[2]}`, // did:key pattern
    proofPurpose: 'assertionMethod',
    proofValue: signatureMultibase
  }

  return {
    ...(vcRaw as VerifiableCredential),
    proof
  }
}

export async function verifyVC(vc: VerifiableCredential): Promise<boolean> {
  // 1. Separate Proof
  const { proof, ...rest } = vc
  if (!proof) return false

  // 2. Canonize the document (without proof)
  const canonized = (await (jsonld as any).canonize(rest, {
    algorithm: 'URDNA2015',
    format: 'application/n-quads',
    documentLoader,
    safe: false
  })) as string

  const dataToVerify = new TextEncoder().encode(canonized)

  // 3. Verify Signature
  // Extract DID from issuer or verificationMethod
  // verificationMethod should be "did:key:...#key-id"
  const [did] = proof.verificationMethod.split('#')

  let signatureBytes: Uint8Array
  try {
    signatureBytes = base58btc.decode(proof.proofValue)
  } catch (e) {
    return false
  }

  return await verifySignature(did, dataToVerify, signatureBytes)
}

export async function ingestVC(vc: VerifiableCredential): Promise<Quad[]> {
  // 1. Convert VC to RDF (Quads)
  // jsonld.toRDF returns N-Quads string or dataset
  const rdf = (await (jsonld as any).toRDF(vc, {
    format: 'application/n-quads',
    documentLoader,
    safe: false
  })) as string

  const graphNode = DataFactory.namedNode(vc.id)

  return parseNQuadsWithGraph(rdf, graphNode)
}

// Helper to use N3 parser (need to import)

function parseNQuadsWithGraph(nquads: string, graph: any): Quad[] {
  const parser = new Parser({ format: 'N-Quads' })
  const quads: Quad[] = []

  parser.parse(nquads, (_error, quad) => {
    if (quad) {
      // Retain Subject, Predicate, Object
      // Overwrite Graph
      quads.push(DataFactory.quad(quad.subject, quad.predicate, quad.object, graph))
    }
  })

  return quads
}
