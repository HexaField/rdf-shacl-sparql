export interface DIDDocument {
  id: string
  verificationMethod: VerificationMethod[]
  authentication?: (string | VerificationMethod)[]
  assertionMethod?: (string | VerificationMethod)[]
}

export interface VerificationMethod {
  id: string
  type: string
  controller: string
  publicKeyMultibase?: string
}

export interface Signer {
  sign(data: Uint8Array): Promise<Uint8Array>
  did: string
}
