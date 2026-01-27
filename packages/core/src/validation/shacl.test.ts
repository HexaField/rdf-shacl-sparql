import { describe, it, expect } from 'vitest'
import { Parser } from 'n3'
import { SHACLValidator } from './index'

// Helper to parse Turtle string into Quads
async function parseTurtle(ttl: string): Promise<any[]> {
  const parser = new Parser()
  return new Promise((resolve, reject) => {
    const quads: any[] = []
    parser.parse(ttl, (error, quad) => {
      if (error) reject(error)
      if (quad) quads.push(quad)
      else resolve(quads)
    })
  })
}

describe('SHACL Validation', () => {
  // Simple SHACL Shape: A Person must have at least one name (max 1 for this test to be strict)
  const personShape = `
        @prefix sh: <http://www.w3.org/ns/shacl#> .
        @prefix ex: <http://example.org/> .
        @prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

        ex:PersonShape
            a sh:NodeShape ;
            sh:targetClass ex:Person ;
            sh:property [
                sh:path ex:name ;
                sh:minCount 1 ;
                sh:maxCount 1 ;
                sh:datatype xsd:string ;
            ] .
    `

  it('should pass validation for conforming data', async () => {
    const validData = `
            @prefix ex: <http://example.org/> .
            ex:Alice a ex:Person ;
                     ex:name "Alice" .
        `

    const shapes = await parseTurtle(personShape)
    const data = await parseTurtle(validData)

    const report = await SHACLValidator.validate(data, shapes)

    expect(report.conforms).toBe(true)
    expect(report.results).toHaveLength(0)
  })

  it('should fail validation when property is missing (minCount)', async () => {
    const invalidData = `
            @prefix ex: <http://example.org/> .
            ex:Bob a ex:Person .
        `

    const shapes = await parseTurtle(personShape)
    const data = await parseTurtle(invalidData)

    const report = await SHACLValidator.validate(data, shapes)

    expect(report.conforms).toBe(false)
    expect(report.results.length).toBeGreaterThan(0)
    expect(report.results[0].message).toBeDefined()
  })

  it('should fail validation when too many values (maxCount)', async () => {
    const invalidData = `
            @prefix ex: <http://example.org/> .
            ex:Charlie a ex:Person ;
                       ex:name "Charlie", "Chuck" .
        `

    const shapes = await parseTurtle(personShape)
    const data = await parseTurtle(invalidData)

    const report = await SHACLValidator.validate(data, shapes)

    expect(report.conforms).toBe(false)
  })

  it('should fail validation when datatype is wrong', async () => {
    const invalidData = `
            @prefix ex: <http://example.org/> .
            ex:Davina a ex:Person ;
                      ex:name 123 .
        `

    const shapes = await parseTurtle(personShape)
    const data = await parseTurtle(invalidData)

    const report = await SHACLValidator.validate(data, shapes)

    expect(report.conforms).toBe(false)
  })
})
