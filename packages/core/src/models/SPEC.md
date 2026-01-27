# Specification: Verifiable Credentials (Phase 3)

## 1. Data Model (VC 2.0)

**Requirement**: Represent standard W3C Verifiable Credentials in TypeScript. **Spec**:

- `VerifiableCredential`:
  - `@context`: string[] (Must include standard context v2).
  - `id`: string (URN or URI).
  - `type`: string[] (Must include 'VerifiableCredential').
  - `issuer`: string | { id: string } (DID).
  - `validFrom`: string (ISO 8601).
  - `credentialSubject`: object | object[] (The actual data attributes).
  - `proof`: object (Digital signature).

## 2. Issuance Service

**Requirement**: Transform raw RDF data (Quads) into a signed VC. **Spec**:

- `createVC(issuer: Signer, subjectId: string, claims: Quad[], type?: string[]): Promise<VerifiableCredential>`
- **Process**:
  1.  Construct the basic JSON-LD object.
  2.  Canonicalize the document (using `jsonld-signatures` or similar, or simplified for this phase). _Note: For this "Lite" implementation, we will assume generic JSON serialization for signing to avoid heavy JSON-LD canon dependencies unless necessary, BUT strict RDF requirements imply `uranus` or `jsonld`._
  3.  A simpler approach for this "RDF-native" system: **The VC _IS_ a Graph**.
  4.  **Revised Spec**: The issuance takes a `Graph` (set of Quads). It generates a signature over the N-Quads representation of that graph.
  5.  Result: A simple wrapper object containing the Quads and the Proof.

## 3. Ingestion (VC -> RDF)

**Requirement**: Store credentials in the local QuadStore. **Spec**:

- `ingest(vc: VerifiableCredential): Quad[]`
- **Strategy**: "Graph per Credential".
  - All quads from the VC are stored in the QuadStore.
  - The `Graph` component of these Quads is set to the `vc.id`.
  - This allows efficiently deleting or querying specific credentials later.
- **Mapping**:
  - If the input is JSON-LD, convert to Quads.
  - If the input is already RDF-aware, just re-graph them.

## 4. Verification

**Requirement**: Check if a stored graph is valid. **Spec**:

- `verifyVC(vc: VerifiableCredential): Promise<boolean>`
- Check signature against the issuer's DID.
