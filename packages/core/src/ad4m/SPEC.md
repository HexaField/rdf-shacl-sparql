# AD4M Phase 1 Specification: Perspectives & Links

## 1. Overview

This module aligns the core architecture with AD4M's "Perspective" abstraction. A Perspective is a subjective knowledge graph containing "Links".

## 2. Terminology

- **Link**: The fundamental unit of data. A semantic triple (Source, Predicate, Target) with metadata (Author, Timestamp, Proof).
- **Perspective**: A named graph database that stores Links. It acts as a wrapper around the `QueryEngine`.
- **Expression**: A validated data object (currently a VC) that serves as the "Proof" for a Link.

## 3. Interfaces

### 3.1 Link

A Link must contain:

- `source`: string (URI)
- `predicate`: string (URI)
- `target`: string (URI)
- `author`: string (DID)
- `timestamp`: string (ISO Date)
- `proof`: object (The VC/Expression)

### 3.2 Perspective

A Perspective is distinct from others (separate isolation). Methods:

- `add(link: Link): Promise<void>`
- `remove(link: Link): Promise<void>`
- `query(sparql: string): Promise<QueryResult>`
- `all(): Promise<Link[]>`

### 3.3 Agent Integration

The Agent must support multiple Perspectives.

- `agent.perspectives`: A manager for perspectives.
  - `add(name: string): Promise<Perspective>`
  - `get(id: string): Perspective | undefined`
  - `byId(id: string): Perspective | undefined`

## 4. Test Scenarios

### 4.1 Perspective Logic

- A Perspective should be initialized with an empty store.
- `add()` should accept a Link and store it as Quads.
- `query()` should return results matching the stored Links.
- `all()` should return all added Links.

### 4.2 Agent Perspective Management

- Agent should allow creating a new named Perspective.
- Agent should allow retrieving an existing Perspective by ID.
- Different Perspectives should not share data (isolation).

## 5. Migration Strategy

- The existing `QueryEngine` class logic will be re-used but wrapped by `Perspective`.
- The `Agent.store` property will be deprecated/removed in favor of `agent.perspectives`.

## 6. Phase 2 Specification: Languages

### 6.1 Overview

Languages allow the Agent to understand different types of Expressions. A Language defines how to create, validate, and apply data.

### 6.2 Interfaces

#### `Language`

- `readonly address: string`: Unique identifier for the language logic (e.g. `lang:shacl-vc-v1`).
- `validate(expression: Expression): Promise<boolean>`: Verifies the integrity and schema of the expression.
- `apply(expression: Expression, perspective: Perspective): Promise<void>`: Interpretation logic. Takes the expression and updates the Perspective state (e.g., adding Links).
- `create(data: any, author: KeyManager): Promise<Expression>`: Factory method to turn raw data into a signed Expression compliant with this language.

### 6.3 Standard Implementation: `ShaclLanguage`

- **Address**: `lang:shacl-vc-v1`
- **Data Model**: The `Expression.data` holds the RDF Quads (Claims). The `Expression.proof` holds the VC Proof.
- **Validation**:
  1.  Verifies the VC signature.
  2.  Verifies the Quads against a pre-configured SHACL shape (if any).
- **Apply**:
  1.  Ingests the VC.
  2.  Converts Quads to `Links`.
  3.  Adds Links to the Perspective.

## 7. Phase 3 Specification: Neighbourhoods (Shared Context)

### 7.1 Overview

A Neighbourhood is a Shared Perspective. Unlike a local Perspective (private notebook), a Neighbourhood is synced with other agents via the Network Carrier.

### 7.2 Terminology

- **Neighbourhood**: A Perspective that is collaboratively maintained.
- **Sync Protocol**: The mechanism to propagate Expressions between agents.
- **Gossip**: The strategy used (Broadcast for lightweight) to share Expressions.

### 7.3 Interfaces

#### `Neighbourhood extends Perspective`

- inherited methods: `query`, `all`
- `url`: string (e.g. `neighbourhood://<UUID>`) defined at creation.
- `language`: Language instance. This defines the "Physics" (Validation Rules) of the Neighbourhood.
- `publish(data: any): Promise<void>`:
  1. Uses `language.create(data)` to make an Expression.
  2. Applies Expression locally (`language.apply`).
  3. Broadcasts Expression via Carrier (`type: 'neighbourhood-sync'`, `payload: { neighbourhoodUrl, expression }`).

### 7.4 Agent Integration

- `agent.neighbourhoods`: A manager for joining/creating neighbourhoods.
  - `join(url: string, language: Language): Promise<Neighbourhood>`
- **Sync Listener**:
  - Agent listens to `Carrier` for `neighbourhood-sync` messages.
  - If `msg.recipient` is broadcast OR `msg.payload.neighbourhoodUrl` matches a joined neighbourhood:
    1. Retrieve the Neighbourhood and its Language.
    2. Validate Expression (`language.validate`).
    3. If valid, Apply (`language.apply`).

### 7.5 Implementation Details

- **MockCarrier**: We will use `recipient: 'broadcast'` for gossip.
- **Payload**: The Carrier Envelope payload will wrap the Expression:
  ```json
  {
    "neighbourhoodUrl": "neighbourhood://...",
    "expression": { ... }
  }
  ```
