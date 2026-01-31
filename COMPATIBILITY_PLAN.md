# AD4M Compatibility Implementation Plan

This document outlines the steps required to make the custom `@template/core` implementation fully interoperable with the original AD4M `p-diff-sync` protocol.

## Goal

Enable an agent using the custom implementation to join a Neighbourhood hosted/shared by an agent using the original AD4M implementation and exchange messages via Holochain.

## Implementation Steps

### 1. Build/Locate Protocol DNA

**Requirement**: The Holochain Conductor must run the specific `p-diff-sync` DNA used by AD4M.

- **Action**: Locate or build the `Perspective-Diff-Sync.happ` file from `packages/ad4m/bootstrap-languages/p-diff-sync`.
- **Verification**: Ensure the file exists and can be installed by the `HolochainDriver`.

### 2. Connect Driver to Specific DNA

**Requirement**: `HolochainDriver` needs to install this specific DNA when a Language is instantiated, rather than a generic placeholder.

- **Action**: Update `HolochainDriver` to accept a `.happ` path and install it with the correct `installed_app_id` (likely derived from the Language Hash or fixed for testing).
- **Verification**: `pnpm test` confirms the app is installed and the Zome is active.

### 3. Implement Zome Protocol (Outgoing)

**Requirement**: Sender must call specific Zome functions with specific data structures.

- **Functions**:
  - `create_did_pub_key_link(did)`: Register agent on join.
  - `commit(payload)`: Send messages. `payload` must match `PerspectiveDiff` structure.
- **Action**: Update `HolochainLanguage.ts` to format RDF/Links into `PerspectiveDiff` JSON and call these functions.
- **Verification**: Test calling `create_did_pub_key_link` and `commit` without errors.

### 4. Implement Signal Handling (Incoming)

**Requirement**: Receiver must listen for Holochain Signals to know when new data arrives.

- **Action**:
  - Update `HolochainDriver` to capture signals from the Conductor's App Interface.
  - Update `HolochainLanguage` to listen to these signals, parse the `PerspectiveDiff`, and apply it to the local store (`Agent`/`Neighbourhood`).
- **Verification**: Run `chat.spec.ts` and ensure messages sync between agents.

## Verification Strategy

We will use the existing `packages/client/tests/chat.spec.ts` but flip the configuration to use the real DNA.
