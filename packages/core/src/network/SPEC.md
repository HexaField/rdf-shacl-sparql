# Specification: Networking (The Carrier)

## 1. Goal

Provide an abstract interface for Peer-to-Peer (P2P) communication, allowing Agents to exchange messages securely regardless of the underlying transport (e.g., Libp2p, WebSocket, Bluetooth).

## 2. Requirements

### 2.1. Message Envelope

- **Structure**:
  - `id`: string (UUID)
  - `type`: string (e.g., 'direct', 'broadcast', 'zcap-invocation')
  - `sender`: string (DID)
  - `recipient`: string (DID) or 'broadcast'
  - `payload`: string (serialized JSON or raw data)
  - `sentAt`: string (ISO Date)
  - `signature`: string (Multibase encoded signature of the content)
- **Security**:
  - Messages must be signed by the `sender`.
  - Recipients must be able to verify the `signature`.

### 2.2. Carrier Interface

- **Methods**:
  - `send(envelope: Envelope): Promise<void>`
  - `on(event: 'message', handler: (env: Envelope) => void): void`
  - `connect?()`: Optional connection logic.
- **Behavior**:
  - Delivers directly addressed messages to the specific peer.
  - (Optional) Handles broadcasts.

### 2.3. Mock Implementation

- An in-memory message bus to simulate network traffic for unit tests.
- Allows multiple "Agents" (Carriers) to subscribe to a shared channel.

## 3. API Design

```typescript
import { Signer } from '../identity'

export interface Envelope {
  id: string
  type: string
  sender: string
  recipient: string
  payload: string
  sentAt: string
  signature: string // Base58btc encoded signature
}

export interface Carrier {
  id: string // The DID of this node
  send(envelope: Envelope): Promise<void>
  on(event: 'message', handler: (env: Envelope) => void): void
}

export class MessageFactory {
  static async create(signer: Signer, recipient: string, payload: any, type?: string): Promise<Envelope>

  static async verify(envelope: Envelope): Promise<boolean>
}
```

## 4. Test Scenarios

1.  **Creation**: Create and sign an envelope. Verify structure.
2.  **Transport**:
    - Agent A sends to Agent B.
    - Agent B 'message' handler triggers.
    - Agent B verifies A's signature.
3.  **Privacy**:
    - Agent A sends to Agent B.
    - Agent C (also on network) does _not_ receive it (or ignores it in this mock layer).
