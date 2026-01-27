# Specification: Structural Validation (SHACL)

## 1. Goal

Ensure data integrity by validating RDF graphs against SHACL (Shapes Constraint Language) shapes. This serves as the "Rulebook" for the agent-centric P2P stack.

## 2. Requirements

### 2.1. Validator Interface

- **Input**:
  - `data`: The RDF Dataset/Store to validate (The "Card Catalog").
  - `shapes`: The RDF Dataset/Store containing SHACL shapes (The "Rulebook").
- **Output**: `ValidationReport`
  - `conforms`: boolean.
  - `results`: Array of violation descriptions.

### 2.2. SHACL Support

- Must support `SHACL Core` constraints (minCount, maxCount, datatype, class, etc.).
- Must be compatible with `n3.Store` or generic `RDF/JS` Datasets.

## 3. API Design

```typescript
import type { Store } from 'n3'
import type { Quad } from '@rdfjs/types'

export interface ValidationResult {
  message: string
  path?: string
  focusNode?: string
  severity: 'Info' | 'Warning' | 'Violation'
  sourceConstraintComponent?: string
}

export interface ValidationReport {
  conforms: boolean
  results: ValidationResult[]
}

export class SHACLValidator {
  /**
   * Validates data against a set of shapes.
   * @param data - The data graph (Quads)
   * @param shapes - The shapes graph (Quads)
   */
  static validate(data: Quad[], shapes: Quad[]): Promise<ValidationReport>
}
```

## 4. Test Scenarios

1.  **Conforming Data**: Data that matches the shape matches `conforms: true`.
2.  **Missing Property**: Data missing a `minCount: 1` property matches `conforms: false`.
3.  **Wrong Datatype**: String instead of Integer matches `conforms: false`.
