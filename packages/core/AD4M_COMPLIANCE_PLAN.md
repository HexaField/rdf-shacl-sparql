# AD4M Compliance Plan for `@template/core`

This document references the verified [AD4M Documentation](https://docs.ad4m.dev/) to map out the evolution of `@template/core` into a lightweight, AD4M-compliant Agent-Centric implementation.

## 1. Conceptual Mapping

We will retain the current stack (`RDF`, `SHACL`, `ZCAP`, `VC`) but restructure the architecture to match AD4M's core abstractions.

| AD4M Concept | Current Repo | Target Architecture |
| :-- | :-- | :-- |
| **Agent** | `Agent` class | **Unchanged**. Continue using `did:key` and `KeyManager`. |
| **Perspective** | Monolithic `QueryEngine` | **Multi-Store**. `Agent` manages a Map of `Perspective` objects, each with its own `QueryEngine` (Graph Scope). |
| **Expression** | `VerifiableCredential` | **Wrapper**. Introduce `Expression` interface. VCs become the specific implementation of valid data objects. |
| **Language** | Hardcoded logic | **Interface**. Define `Language` to encapsulate creation/validation logic. |
| **Neighbourhood** | `Carrier` + `ZCAP` | **Sync Layer**. A `Neighbourhood` is a _Shared Perspective_ kept in sync via the Carrier using SHACL rules. |
| **Link** | `Quad` | **Link Object**. A typed wrapper around Quads to match AD4M's `source-predicate-target` model. |

---

## 2. Implementation Roadmap

### Phase 1: Structural Alignment (Perspectives & Links)

**Goal**: Decouple the single store into managing multiple "Perspectives".

- [ ] **Define `Link` Interface**:
  ```typescript
  interface Link {
    source: string
    predicate: string
    target: string
    author: DID
    timestamp: string
    proof?: any // The VC proof
  }
  ```
- [ ] **Refactor `QueryEngine`**:
  - Move `QueryEngine` to be the internal engine of a `Perspective` class.
  - `Perspective` exposes `add(link)`, `remove(link)`, and `query(sparql)`.
- [ ] **Update `Agent`**:
  - Remove direct `store` access.
  - Add `agent.perspectives.add("name")`.
  - Add `agent.perspectives.get("id")`.

### Phase 2: Protocol Abstraction (Languages)

**Goal**: Allow different data types/formats (Social DNA) to be plugged in.

- [ ] **Define `Language` Interface**:
  ```typescript
  interface Language {
    readonly address: string // "hash-of-code"
    apply(expression: Expression, perspective: Perspective): Promise<void>
    validate(expression: Expression): Promise<boolean>
  }
  ```
- [ ] **Implement `ShaclLanguage`**:
  - Wrap current `SHACLValidator` and `createVC` logic into a Language implementation.
  - Address: `lang:shacl-vc-v1`.

### Phase 3: The "Link" Between Agents (Neighbourhoods)

**Goal**: Shared context via syncing.

- [ ] **Define `Neighbourhood`**:
  - Extends `Perspective`.
  - Has a `linkLanguage` (The rules for what Links are allowed).
  - Has a `meta` (Name, Description).
- [ ] **Sync Protocol**:
  - Implement "Gossip" over `Carrier`.
  - When linking to a Neighbourhood, the `Agent` subscribes to messages tagged with that Neighbourhood ID.
  - Incoming messages -> Validate via Language -> `perspective.add(link)`.

---

## 3. Revised Agent API

The resulting API will look closer to the AD4M reference:

```typescript
const agent = new Agent(new KeyManager())

// 1. Create a local Perspective (Private Notebook)
const notebook = await agent.perspectives.add('Private Notes')
await notebook.add({
  source: 'note-1',
  predicate: 'text',
  target: 'Hello World'
})

// 2. Join a Neighbourhood (Shared Space)
const discordReplacement = await agent.neighbourhoods.join('neighbourhood://xyz-123', ShaclLanguage)

// 3. Interact
// Logic is handled by the Language (Structural Validation + VC Signing)
await discordReplacement.add({
  source: agent.did,
  predicate: 'msg',
  target: 'Hello everyone!'
})
```

## 4. Simplified Compliance Checklist (The "Lightweight" Constraints)

To remain lightweight, we explicitly avoid:

- **WASM/Holochain**: We run purely in JS/TS runtime.
- **Dynamic Language Loading**: We will bundle Languages at build time (or dynamic import), not fetch arbitrary code from IPFS (initially).
- **Prolog**: We substitute Social DNA prolog rules with SHACL constraints and ZCAP permissions.

## 5. Next Steps

1.  Implement `src/ad4m/types.ts` defining `Link`, `Expression`, `Perspective`.
2.  Refactor `src/agent/index.ts` to manage a collection of Perspectives.
