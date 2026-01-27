export const VC_CONTEXT_V2 = {
  '@context': {
    '@version': 1.1,
    id: '@id',
    type: '@type',
    cred: 'https://www.w3.org/ns/credentials#',
    sec: 'https://w3id.org/security#',
    xsd: 'http://www.w3.org/2001/XMLSchema#',

    VerifiableCredential: 'cred:VerifiableCredential',
    issuer: { '@id': 'cred:issuer', '@type': '@id' },
    credentialSubject: { '@id': 'cred:credentialSubject' },
    validFrom: { '@id': 'cred:validFrom', '@type': 'xsd:dateTime' },
    validUntil: { '@id': 'cred:validUntil', '@type': 'xsd:dateTime' },
    proof: 'sec:proof',

    Ed25519Signature2020: 'sec:Ed25519Signature2020',
    proofPurpose: { '@id': 'sec:proofPurpose', '@type': '@vocab' },
    verificationMethod: { '@id': 'sec:verificationMethod', '@type': '@id' },
    created: { '@id': 'http://purl.org/dc/terms/created', '@type': 'xsd:dateTime' }
  }
}

export const CONTEXTS: Record<string, any> = {
  'https://www.w3.org/ns/credentials/v2': VC_CONTEXT_V2
}

export async function documentLoader(url: string): Promise<{
  contextUrl?: string
  document: any
  documentUrl: string
}> {
  if (CONTEXTS[url]) {
    return {
      contextUrl: undefined,
      document: CONTEXTS[url],
      documentUrl: url
    }
  }

  // In strict mode we might throw, but for dev fallback:
  console.warn(`Attempting to fetch remote context: ${url}`)
  try {
    const response = await fetch(url)
    const document = await response.json()
    return {
      contextUrl: undefined,
      document,
      documentUrl: url
    }
  } catch (e) {
    throw new Error(`Could not load context ${url}: ${e}`)
  }
}
