# AD4M on W3C Standards: A Proof of Concept

This repository is an experimental proof-of-concept demonstrating a clean-room implementation of the [AD4M (Agent-Centric Distributed Application Meta-Ontology)](https://ad4m.dev) architecture, built entirely on top of standard W3C specifications.

The goal is to show how agent-centric applications—where users own their data and communicate via peer-to-peer networks—can be built using standard semantic web technologies.

## 🧪 The Experiment

We are validating whether adherence to strict standards can achieve the core AD4M promises:

1.  **Agent-Centricity**: Identity is based on DIDs (`did:key`).
2.  **Semantic Data**: All state is stored as RDF Quads (`Oxigraph`).
3.  **Social DNA**: Validation rules are defined using SHACL (`rdf-validate-shacl`).
4.  **Local-First Sync**: Application state is reconciled purely through data exchange, not central databases.

## ⚙️ How It Works

### 1. Identity & Data

Every running instance acts as an **Agent**. The Agent holds a `did:key` and signs every piece of data they create. Data is stored locally in an RDF Graph.

### 2. Perspectives (The Graph)

The Agent manages **Perspectives**. A Perspective is simply a named, isolated RDF graph. It contains **Links** (triples):

> `Author (DID) -> says -> "Hello World"`

### 3. Neighbourhoods (The Network)

To communicate, Agents join **Neighbourhoods**. A Neighbourhood is a Perspective that syncs over a network. In this POC, we use a **Local Filesystem Carrier** to simulate P2P networking. Agents watch specific directories for new messages from peers.

### 4. Social DNA (Validation)

When an Agent receives data from a peer, it doesn't just trust it. It validates it against the Neighbourhood's **Social DNA**. We map this concept to **SHACL** + **SPARQL**:

- Does this data fit the Shape (Subject Class)?
- If yes, accept it into the local graph.
- If no, reject it.

## 🚀 Running the Demo

This repo includes a "Multi-Agent" dev script that spins up a semantic chat application.

1.  **Install dependencies**:

    ```bash
    pnpm install
    ```

2.  **Run the multi-agent simulation**:

    ```bash
    pnpm dev:multi
    ```

    This starts:
    - 2 Server processes (Agents) on ports 3005 and 3006.
    - 1 Client build server.

3.  **Open the Agents**:
    - **Agent A**: [http://localhost:5173/?port=3005](http://localhost:5173/?port=3005)
    - **Agent B**: [http://localhost:5173/?port=3006](http://localhost:5173/?port=3006)

4.  **Verify Sync**: Type a message in Agent A's window. You will see it appear in Agent B's window. Behind the scenes, Agent A signed an RDF Triple, wrote it to a shared inbox, Agent B picked it up, validated it against the Chat SHACL Shape, and displayed it.

## 📚 Architecture

For a detailed breakdown of the mapping between AD4M concepts and W3C standards, see [ARCHITECTURE.md](./ARCHITECTURE.md).
