import type { Quad } from '@rdfjs/types'
// @ts-ignore
import SHACLValidatorLib from 'rdf-validate-shacl'
import { Store } from 'n3'

// Helper to create a DatasetCore from generic Quads for the validator
function createDataset(quads: Quad[]) {
  return new Store(quads)
}

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
  static async validate(data: Quad[], shapes: Quad[]): Promise<ValidationReport> {
    // Load shapes and data into N3 Stores (which act as RDF/JS Datasets)
    const shapesDataset = createDataset(shapes)
    const dataDataset = createDataset(data)

    // N3 Store does not implement .dataset(), so we ideally rely on default factory
    // if we don't pass one. Or we can pass one that works.
    // rdf-validate-shacl constructor: (shapes, options)
    const validator = new SHACLValidatorLib(shapesDataset)
    const report = validator.validate(dataDataset)

    const results: ValidationResult[] = report.results.map((result: any) => ({
      message: result.message?.[0]?.value || 'Validation Error',
      path: result.path?.value,
      focusNode: result.focusNode?.value,
      severity: result.severity?.value?.split('#').pop() || 'Violation',
      sourceConstraintComponent: result.sourceConstraintComponent?.value
    }))

    return {
      conforms: report.conforms,
      results
    }
  }
}

export * from './ShaclLanguage'
