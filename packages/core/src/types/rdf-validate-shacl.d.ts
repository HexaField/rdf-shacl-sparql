declare module 'rdf-validate-shacl' {
  export default class SHACLValidator {
    constructor(shapes: any, options?: any)
    validate(data: any): any
  }
}
