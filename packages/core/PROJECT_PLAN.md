# Core Library Project Plan: Agent-Centric P2P Stack

This plan outlines the development of the `@template/core` library to serve as the foundation for agent-centric, local-first P2P applications. The architecture aligns with the [AD4M](https://docs.ad4m.dev/) specifications while strictly adhering to the user's requested technology stack: **DIDs, RDF Quads, VC 2.0, SHACL, SPARQL, and ZCAPs**.

## 1. Architecture Overview

The library will be structured into modular layers, enabling developers to compose "Agents" that own data (in RDF stores), control identity (DIDs), and communicate via pluggable carriers.

### Core Modules

- **Identity (DIDs)**: Managing keys, signing, and resolving decentralized identifiers.
- **Knowledge Graph (RDF Quads)**: A local quad-store representing the "Perspective" or "Card Catalog".
- **Credentials (VC 2.0)**: Creating, signing, and verifying claims (The "Entries").
- **Validation (SHACL)**: Enforcing schema and logic rules (The "Rulebook").
- **Query & Logic (SPARQL + ZCAP)**: Access control and data retrieval (The "Librarian").
- **Network (Carrier Adapter)**: Abstract interface for P2P transport.

## 2. Implementation Phases

### Phase 1: Foundation & Data Layer (The Card Catalog)

**Goal**: Establish the RDF storage engine and basic data types.

- [x] **Dependencies**: Install `n3`, `rdf-data-factory`.
- [x] **Data Model**: Define interfaces for `Quad`, `Subject`, `Predicate`, `Object`, `Graph`.
- [x] **Store Interface**: Create a `GraphStore` interface for adding/removing/querying quads.
- [x] **In-Memory Implementation**: specific implementation of `GraphStore` for local state.

### Phase 2: Identity & Cryptography (The Library Cards)

**Goal**: Implement DID management and signing.

- [x] **DID Interface**: Define `DIDResolver` and `Signer` interfaces.
- [x] **Key Management**: Implement a simple `KeyManager` (e.g., `did:key`).
- [x] **Verification**: Utilities to verify signatures against DIDs.

### Phase 3: Verifiable Credentials (The Verified Entries)

**Goal**: bridge RDF and VC 2.0.

- [x] **VC Structure**: Define the TypeScript interfaces for VC 2.0.
- [x] **Ingestion**: Implement `VC -> RDF` mapper.
  - _Strategy_: Each VC is treated as a subgraph (named graph) identified by the Credential ID.
- [x] **Issuance**: Utilities to create and sign RDF datasets as VCs.

### Phase 4: Structural Validation (SHACL - The Rulebook)

**Goal**: Ensure data quality before ingestion.

- [x] **Dependencies**: Integrate a SHACL validator (e.g., `rdf-validate-shacl`).
- [x] **Validation Service**: Create a method `validate(data: Graph, shape: Shape): Report`.
- [x] **Gatekeeper Hook**: Implement a middleware that runs SHACL validation before writing to the Store.

### Phase 5: Query & Access Control (SPARQL & ZCAP - The Librarian)

**Goal**: Permissioned access to data.

- [x] **SPARQL Engine**: Integrate a light query engine (e.g., `oxigraph` via WASM or `comunica` dependent on size constraints).
- [x] **ZCAP Implementation**:
  - Define ZCAP structure as RDF.
  - Implement `invoke capability` logic.
  - Implement `delegation` chain verification using SPARQL traversals.
- [x] **Guard**: A method `checkAccess(agent: DID, resource: URI, action: string): boolean`.

### Phase 6: Networking (The Carrier)

**Goal**: Abstract P2P transport.

- [x] **Carrier Adapter**: Define interface `Carrier` (send, receive, broadcast).
- [x] **Message Envelope**: Define the standard P2P message format (Sender, Receiver, Payload (VC/ZCAP), Signature).
- [x] **Mock Implementation**: A simple in-memory message bus for testing.

### Phase 7: The Agent API (Composition)

**Goal**: The public API for app developers.

- [x] **Agent Class**:
  ```typescript
  class Agent {
    did: DID
    store: GraphStore
    network: Carrier

    async publish(data: RDF, shape?: SHACL): Promise<CID>
    async query(sparql: string): Promise<Result>
    async delegate(capability: ZCAP, to: DID): Promise<void>
  }
  ```

## 3. Tech Stack Recommendations

- **Language**: TypeScript (Strict)
- **RDF**: `n3` (Fast, standard)
- **Validation**: `rdf-validate-shacl` or `rdfjs-wrapper` around standard validators.
- **Query**: `comunica/query-sparql` (Robust) or `oxigraph` (Fast).
- **Build**: Rollup (Existing)

## 4. Next Steps

1.  Initialize the folder structure in `packages/core/src`.
2.  Install core RDF dependencies.
3.  Implement the `GraphStore` and `DID` interfaces.
