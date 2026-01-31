# Plan: Integrate Deno Runtime for Language Isolation in Core

## Objective

Enable `packages/core` to execute Ad4m-style languages (or generic scripts) in an isolated environment using the Deno runtime. This ensures security and stability by sandboxing language execution from the main application process.

## Architecture

We will create a new runtime module within `packages/core/src/runtime`. This module will manage the spawning and communication with a Deno subprocess.

### 1. `DenoRuntime` Class

A TypeScript class running in the Node.js environment (inside `core`) that responsibilities include:

- Spawning a `deno` child process.
- Managing the lifecycle of the process.
- sending commands (e.g., `loadLanguage`, `execute`) to the Deno process.
- Receiving results and errors.

### 2. Deno Host Script (`host.ts`)

A script designed to run _inside_ Deno. This script will:

- Listen for commands from the parent Node.js process (via stdin/stdout or IPC).
- Dynamically import Language modules.
- Maintain a registry of loaded languages.
- Execute language methods (`create`, `validate`, `apply`, etc.) and return results.

### 3. Communication Protocol

A simple JSON-RPC style protocol over stdio.

- **Request**: `{ jsonrpc: "2.0", method: "methodName", params: [...], id: 1 }`
- **Response**: `{ jsonrpc: "2.0", result: ..., id: 1 }` or `{ jsonrpc: "2.0", error: ..., id: 1 }`

## Implementation Steps

### Phase 1: Submodule Integration (Completed)

- [x] Clone `https://github.com/coasys/ad4m` as a submodule in `packages/ad4m`.

### Phase 2: Runtime Implementation

1.  Create `packages/core/src/runtime/deno/` directory.
2.  Create `packages/core/src/runtime/deno/host.ts`: The entry point for the Deno process.
3.  Create `packages/core/src/runtime/DenoRuntime.ts`: The Node.js controller class.
4.  Define interfaces for the Language interactions (matching `packages/core/src/ad4m/languages/Language.ts`).

### Phase 3: Integration

1.  Export `DenoRuntime` from `packages/core/src/index.ts`.
2.  Add utility to check for `deno` availability in the system path.

### Phase 4: Testing

1.  Create a test language (simple JS/TS file).
2.  Write a test spec in `packages/core` that uses `DenoRuntime` to load and run existing `ShaclLanguage` or a test language.

## Directory Structure Changes

```
packages/core/src/
  ├── runtime/
  │   ├── deno/
  │   │   ├── host.ts         # Runs inside Deno
  │   │   └── wrapper.ts      # (Optional) Helper for Deno environment
  │   ├── DenoRuntime.ts      # Node.js class managing the process
  │   └── index.ts
```

## Dependencies

- Requires `deno` binary to be installed on the host system.
- No new npm dependencies strictly required for `core` (uses native `child_process`).
