# Specification: Identity & Cryptography (Phase 2)

## 1. DID Resolver Interface

**Requirement**: The system must be able to resolve a DID to its Document to retrieve public keys. **Spec**:

- `resolve(did: string): Promise<DIDDocument | null>`
- `DIDDocument` should at least contain `verificationMethod` array.
- Should support `did:key` as the primary method for this phase.

## 2. Signer Interface

**Requirement**: We need to sign data (VCs, ZCAPs, Messages) using the agent's private key. **Spec**:

- `sign(data: Uint8Array): Promise<Uint8Array>`
- `algorithm`: string (e.g., 'Ed25519').
- `did`: string (The signer's identifier).

## 3. KeyManager (Wallet)

**Requirement**: A component to hold the private key and act as the Agent's identity. **Spec**:

- **Generation**: `generate()` creates a new random identity.
- **Persistence**: (Optional for now) `fromPrivateKey(key: Uint8Array)` creates identity from existing key.
- **Properties**:
  - `did`: string (read-only).
  - `signer`: Signer.
- **Method**: `sign(data: Uint8Array): Promise<Uint8Array>` (Delegates to internal signer).

## 4. Verification Utility

**Requirement**: Verify a signature given a DID and data. **Spec**:

- `verify(did: string, data: Uint8Array, signature: Uint8Array): Promise<boolean>`
- This function should resolve the DID, extract the public key, and verify the signature.

## 5. Implementation Details

- Use `Ed25519` for keys (standard for `did:key`).
- Use `did:key` method for implicit DID Documents (no network resolution needed).
