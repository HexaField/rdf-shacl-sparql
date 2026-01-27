# Specification: RDF Data Layer (Phase 1)

## 1. Data Model (RDF Terms & Quads)

**Requirement**: We need a standard way to represent RDF data. **Spec**:

- `Terms` must be compliant with RDF/JS specification.
- `Quad` must be compliant with RDF/JS specification.
- Should expose a `DataFactory` that produces these terms strictly.

## 2. Graph Store

**Requirement**: A local storage engine for RDF Quads. **Spec**:

- **Creation**: A factory function `createGraphStore()` should return a new empty store.
- **Immutability/State**: While the store internally manages state, operations should be clearly defined. (Given performance constraints of RDF stores, we will wrap a mutable `n3.Store` but expose it via a clean interface).
- **Add**: `add(quad: Quad): void` (or returns the store for chaining).
- **Remove**: `remove(quad: Quad): void`.
- **Match**: `match(subject?, predicate?, object?, graph?): Iterable<Quad>`.
- **Count**: `count(): number` returns total quads.
- **Import**: `import(stream: Stream<Quad>): Promise<void>` (Optional for streaming ingestion).

## 3. Usage Pattern (Declarative)

**Spec**:

- Consumers should be able to query the store using pattern matching.
- Support for standardized `Dataset` interface (RDF/JS) is desirable.
