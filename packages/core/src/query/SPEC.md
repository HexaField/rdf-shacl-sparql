# Specification: Query & Access Control (SPARQL & ZCAP)

## 1. Goal

Provide a unified interface for querying the Knowledge Graph using SPARQL, while enforcing decentralized access control capabilities (ZCAPs).

## 2. Requirements

### 2.1. SPARQL Engine

- **Interface**: `query(sparql: string, sources: Store[]): Promise<Bindings[]>`
- **Capabilities**:
  - SELECT queries.
  - Must support querying over the local `GraphStore`.

### 2.2. ZCAP (Authorization)

- **Data Model**: Represent a simplified ZCAP in RDF.
  - `@context`: https://w3id.org/security/v2
  - `id`: URI
  - `invoker`: DID of the agent allowed to use this capability.
  - `parentCapability`: URI of the capability being delegated (conceptually).
  - `invocationTarget`: The resource URI being accessed.
  - `allowedAction`: 'read', 'write', 'append'. (Simplified caveat).
  - `proof`: object (Signature by the parent capability's invoker / root controller).
- **Logic**:
  - `verifyCapability(target: URI, action: string, agent: DID): Promise<boolean>`
  - Checks signature validity.
  - Checks that the agent is the `invoker`.

### 2.3. Guard

- **Function**: `checkAccess(store: GraphStore, agent: DID, query: string): Promise<boolean>`
- **Logic**:
  - Parse the query to determine the _Target_ resources and _Action_ (Read/Update).
  - Verify if the agent has a ZCAP logic allowing this action on the target.

## 3. API Design

```typescript
import { Store } from 'n3'

// 1. ZCAP Model
export interface ZCAP {
  id: string
  invoker: string // DID
  parentCapability?: string
  invocationTarget: string // Resource URI
  allowedAction: 'read' | 'write' | 'append'
  proof: {
    type: string
    created: string
    verificationMethod: string
    proofPurpose: string
    proofValue: string // Multibase
  }
}

export class ZCAPGuard {
  static async create(
    signer: Signer,
    invoker: string,
    target: string,
    action: 'read' | 'write' | 'append',
    parentCapability?: string
  ): Promise<ZCAP>

  static async verify(capability: ZCAP, agent: DID, target: URI, action: 'read' | 'write'): Promise<boolean>
}
export interface QueryResult {
  bindings: Record<string, string>[]
}

export class QueryEngine {
  constructor(private store: Store) {}

  /**
   * Executes a SPARQL Select query
   */
  async execute(sparql: string): Promise<QueryResult>
}

// 3. Authorization
export class ZCAPGuard {
  /**
   * Simple check: Does agent have a ZCAP for this resource?
   * In a real system, this would verify the chain and signatures.
   * For Phase 5, we verify the structure matches.
   */
  static verify(capability: ZCAP, agent: DID, target: URI, action: 'read' | 'write'): boolean
}
```

## 4. Test Scenarios

1.  **SPARQL Query**: Run `SELECT ?s ?p ?o WHERE { ?s ?p ?o }` against the specific store.
2.  **ZCAP Verification - Success**: Agent presents a valid ZCAP for "read" on "http://example.org/resource".
3.  **ZCAP Verification - Fail Agent**: Agent DID does not match `invoker`.
4.  **ZCAP Verification - Fail Action**: Capability allows "read", agent tries "write".
5.  **Access Guard**: Integrate Query + Auth (Simulated).
