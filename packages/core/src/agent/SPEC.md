# Specification: The Agent API

## 1. Goal

Provide a unified, high-level API (`Agent` class) that allows developers to compose Identity, Storage, Networking, and Logic into a functional "Agent" capable of publishing data, enforcing rules, and communicating with peers.

## 2. Requirements

### 2.1. Initialization

- Must be initialized with:
  - `KeyManager` (Identity).
  - `Carrier` (Network).
  - `GraphStore` (Data Storage).
- Must have a read-only `did` property.

### 2.2. Publishing (Data Ownership)

- `publish(claims: Quad[], shape?: Quad[]): Promise<string>`
  - **Validation**: If `shape` is provided, validate `claims` using SHACL. Throw validation errors.
  - **Issuance**: Wrap `claims` in a Verifiable Credential (v2.0) signed by the agent.
  - **Storage**: Ingest the signed VC properties back into the local store (as a named graph).
  - **Return**: The ID of the created VC (URI).

### 2.3. Querying (Data Access)

- `query(sparql: string): Promise<any[]>`
  - Execute SPARQL SELECT queries against the local store.

### 2.4. Delegation (Authorization)

- `delegate(target: string, action: 'read'|'write', to: string): Promise<void>`
  - Create a ZCAP delegation for the specified target/action to the recipient DID.
  - Send the ZCAP via the Network layer to the recipient.

### 2.5. Communication

- `send(to: string, payload: any): Promise<void>`
  - Wrap payload in a signed Envelope.
  - Transmit via Carrier.

## 3. API Design

```typescript
import { KeyManager } from '../identity'
import { GraphStore } from '../store'
import { Carrier } from '../network'
import { Quad } from '@rdfjs/types'

export class Agent {
  constructor(
    private keys: KeyManager,
    private store: GraphStore, // Or QueryEngine
    private network: Carrier
  ) {}

  get did(): string

  async publish(claims: Quad[], shape?: Quad[]): Promise<string>
  async query(sparql: string): Promise<any[]>
  async delegate(target: string, action: 'read' | 'write', to: string): Promise<void>
}
```

## 4. Test Scenarios

1.  **Publishing**:
    - Publish Valid Data -> Returns VC ID, Data exists in Store.
    - Publish Invalid Data (SHACL) -> Throws Error.
2.  **Querying**:
    - Query stored data -> Returns bindings.
3.  **Delegation**:
    - Delegate "read" to Bob -> Carrier sends message to Bob containing ZCAP.
