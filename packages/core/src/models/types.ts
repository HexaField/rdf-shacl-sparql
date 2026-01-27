export interface VerifiableCredential {
  '@context': string[]
  id: string
  type: string[]
  issuer: string
  validFrom: string
  credentialSubject: any // Can be JSON-LD object or flat map
  proof: Proof
}

export interface Proof {
  type: string
  created: string
  verificationMethod: string
  proofPurpose: string
  proofValue: string // Multibase signature
  jws?: string // Optional if using JWT
}
