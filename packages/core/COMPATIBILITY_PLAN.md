# Ad4m Core Compatibility Plan

## Gap Analysis

To effectively join an Ad4m neighbourhood and interact with the ecosystem, the custom `core` implementation must bridge several gaps between the minimal implementation and the full Ad4m specification.

### 1. Networking & Sync (The "Link Language" Gap)

**Current Status:** `core` has a `FileCarrier`, implying local file operations. **Requirement:** Ad4m Neighbourhoods are defined by a Link Language (often Holochain-based). To join, `core` must:

- Be able to run the Link Language adapter of the neighbourhood.
- Support the transport required by that language (e.g., install/bridge to Holochain, or use a Libp2p carrier if the language supports it).
- **Implementation Note:** If we cannot embed Holochain, we might need a "Remote Agent" pattern where `core` talks to a running Holochain/Ad4m infrastructure, OR we focus on "Libp2p" based link languages which are more portable to Node/Deno.

### 2. Expression & Signature Compatibility

**Current Status:** `core` has a basic `Expression` interface. **Requirement:**

- **Serialization:** Ad4m uses a specific canonical JSON serialization for signing. We must match this exactly.
- **Keys/DIDs:** We need a DID provider. Ad4m typically uses `did:key`. `core` needs a `KeyManager` or similar that generates compatible signatures (Ed25519).
- **Verification:** Implement the logic to verify `ExpressionProof` (signatures) against the author's DID.

### 3. Language Runtime Interfaces

**Current Status:** `DenoRuntime` is implemented but basic. **Requirement:**

- **Context Injection:** The original Ad4m passes a rich `context` object to the language's `create` function, including `{ Agent, Holochain, storageDirectory, ... }`.
- **Process Boundary:** Since we run languages in a child Deno process, we cannot pass these objects directly.
- **Solution:** `host.ts` must create a _Proxy Context_. When the language calls `context.Holochain.callApp(...)`, the proxy sends a JSON-RPC request _back_ to the Node.js parent. The parent executes the networking logic and returns the result.
- **Interface Alignment:** The `Language` object returned by `create()` in Deno has methods (`apply`, `validate`). We need to ensure `DenoRuntime` maps these correctly.
- **Module Loading:** Update `host.ts` to handle default/nested default exports (Ad4m logic: `module.default?.default || module.default || module`).

### 4. Ontology & Graph

**Current Status:** `core` uses RDF/Sparql natively. **Requirement:** Ad4m's "Prologue" maps Links to RDF triples. `core` needs to ensure its internal RDF store can verify and ingest Ad4m "Links" (Source-Predicate-Target) correctly.

---

## Plan: Minimum Viable Interoperability

### Step 1: Align Data Structures & Crypto (Foundation)

- **Action:** Update `packages/core/src/ad4m/types.ts` to exactly match `Expression` (`proof: ExpressionProof`) and `LinkExpression` from Ad4m.
- **Action:** Add dependency `@transmute/did-key.js` (or `@noble/ed25519` + custom wrapper) to `packages/core`.
- **Action:** Implement `createSignedExpression(data)`:
  1.  Serialize `data` using `json-stable-stringify` (must match Ad4m's cannonicalization perfectly).
  2.  Sign bytes with Ed25519.
  3.  Attach proof with `signature` and `key` (did:key).

### Step 2: Protocol-Compatible Deno Runtime

- **Action:** Update `host.ts` (Deno side):
  - Implement a `createContextProxy()` that returns an object mimicking Ad4m's context.
  - Setup bi-directional JSON-RPC: Allow Deno to call "up" to Node.js for `Holochain` or `Agent` services.
- **Action:** Update `DenoRuntime.ts` (Node side):
  - specific handlers for `Holochain` calls coming from Deno (even if they just throw "Not Implemented" for now, they must exist).

### Step 3: Social Context / Neighbourhood Join

- **Objective:** Join a test neighbourhood.
- **Constraint:** Since we don't have Holochain, we will create/use a **Libp2p-based Link Language** (or a simple WebSocket one) as the bridge.
- **Action:** Create a `TransportService` in `d2core` that can communicate with peers.

### Step 4: Verification

- **Test:** Generate an Expression in `core`, sign it.
- **Test:** Have the "real" Ad4m executor verify it.
- **Test:** Generate a Link in `core`, sync it to a mock standard Ad4m client.

## Task List

- [x] **Data Model Alignment**: Update `Expression`, `Link`, and `ExpressionProof` interfaces in `core` to match `ad4m` wire format.
- [x] **Crypto**: Add `@digitalbazaar/ed25519-signature-2020` or similar to handle `did:key` signing/verification compatible with Ad4m.
- [x] **Runtime Bridge (Low Level)**: Bi-directional RPC between Node and Deno (Host/Guest) is working.
- [x] **Network Foundation**: `Libp2pCarrier` implemented for p2p transport.
- [x] **Runtime Bridge (High Level)**: Create `ProxiedLanguage` class in `core` that implements `Language` and delegates to `DenoRuntime`.
- [x] **LinkSyncAdapter**: Define `LinkSyncAdapter` interface in `core` and map it in `ProxiedLanguage` to Deno calls.
- [x] **Integration Test**: Create a script that instantiates `DenoRuntime`, loads a sample "Social Context" language (mocked), and creates a valid signed Expression.
