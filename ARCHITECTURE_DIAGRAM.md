# AD4M Architecture: Technology Integration

This diagram illustrates how DIDs, RDF, VCs, SHACL, SPARQL, Libp2p, and Holochain are integrated within the AD4M stack.

```mermaid
graph TB
    subgraph Agent Runtime
        DID["DID Identity <br/>(did:key:z6Mk...)"]
        KM[Key Manager]
        KM --> |Signs| VC

        subgraph "Data & Logic Layer"
            RDF["RDF Triples <br/>(Subject, Predicate, Object)"]
            VC["Verifiable Credential <br/>(Signed Expression)"]
            SHACL["SHACL Validator <br/>(Social DNA)"]
            SPARQL["SPARQL Engine <br/>(Query Interface)"]

            RDF --> |Wrapped in| VC
            VC --> |Validated by| SHACL
            SPARQL --> |Queries| RDF
        end

        subgraph "Perspective (Graph Database)"
            Store["RDF Store <br/>(Oxigraph / N3)"]
            Store --> |Contains | RDF
        end
    end

    subgraph "Network & Persistence Layer"
        direction LR

        subgraph "Libp2p (Transport)"
            P2P[Libp2p Carrier]
            P2P --> |Broadcasts| VC
            P2P --> |Peer Discovery| mDNS
        end

        subgraph "Holochain (Persistence & Sync)"
            HC[Holochain Driver]
            HCLang[Holochain Language]
            DHT[Holochain DHT]

            HCLang --> |Adapts| VC
            HCLang --> |Commits to| HC
            HC --> |Syncs via| DHT
        end
    end

    %% Connections
    Agent[Agent] --> |Uses| DID
    Agent --> |Manages| Store

    %% Flows
    Store --> |Read| SPA["Client UI"]
    SPA --> |"Write (Mutation)"| Agent

    Agent --> |Publish| P2P
    Agent --> |Persist| HCLang
```

## detailed Data Flow

### 1. Creation & Validation

1. **User** creates data (e.g. "Hello World").
2. **Agent** models this as **RDF** triples.
3. **KeyManager** wraps triples in a **VC** and signs it with the **DID**.
4. **SHACL** engine checks if the RDF structure matches the **Social DNA** of the implementation.

### 2. Storage & Query

1. Authenticated data is stored in the local **RDF Store** (Oxigraph).
2. UI components fetch data using **SPARQL** queries.

### 3. Distribution

- **Ephemeral/Real-time**: The **Libp2pCarrier** broadcasts the signed VC to connected peers.
- **Resilient Storage**: The **HolochainLanguage** adapter takes the VC, converts it to a Holochain commit, and pushes it to the **Holochain DHT** for persistence and redundancy.
