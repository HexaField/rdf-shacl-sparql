import { verifySignature, type Signer } from '../identity'
import { base58btc } from 'multiformats/bases/base58'

export interface Envelope {
  id: string
  type: string
  sender: string
  recipient: string
  payload: string
  sentAt: string
  signature: string // Base58btc
}

export interface Carrier {
  id: string
  send(envelope: Envelope): Promise<void>
  on(event: 'message', handler: (env: Envelope) => void): void
}

export class MessageFactory {
  // Defines what fields are part of the signature
  static serializeForSigning(env: Omit<Envelope, 'signature'>): Uint8Array {
    // Simple canonical string usually: sender + recipient + sentAt + type + payload
    // Ideally use something robust like canonical JSON, but a deterministic string works for strict schema
    const data = `${env.sender}|${env.recipient}|${env.sentAt}|${env.type}|${env.payload}`
    return new TextEncoder().encode(data)
  }

  static async create(signer: Signer, recipient: string, payload: any, type: string = 'direct'): Promise<Envelope> {
    const env: Omit<Envelope, 'signature'> = {
      id: crypto.randomUUID(),
      type,
      sender: signer.did,
      recipient,
      payload: JSON.stringify(payload),
      sentAt: new Date().toISOString()
    }

    const bytesToSign = this.serializeForSigning(env)
    const sigBytes = await signer.sign(bytesToSign)
    const signature = base58btc.encode(sigBytes)

    return { ...env, signature }
  }

  static async verify(envelope: Envelope): Promise<boolean> {
    const { signature, ...rest } = envelope

    const bytesToVerify = this.serializeForSigning(rest)

    let sigBytes: Uint8Array
    try {
      sigBytes = base58btc.decode(signature)
    } catch (e) {
      return false
    }

    return verifySignature(rest.sender, bytesToVerify, sigBytes)
  }
}

// Global Event Bus for mocks
const MOCK_BUS = new EventTarget()

export class MockCarrier implements Carrier {
  private handlers: ((env: Envelope) => void)[] = []
  public id: string

  constructor(id: string) {
    this.id = id
    // Listen to global bus
    MOCK_BUS.addEventListener('message', (evt: any) => {
      const envelope = evt.detail as Envelope
      // Filter: Broadcast or Direct to Me
      if (envelope.recipient === 'broadcast' || envelope.recipient === this.id) {
        this.handlers.forEach((h) => h(envelope))
      }
    })
  }

  async send(envelope: Envelope): Promise<void> {
    // Dispatch to global bus
    MOCK_BUS.dispatchEvent(new CustomEvent('message', { detail: envelope }))
  }

  on(event: 'message', handler: (env: Envelope) => void): void {
    if (event === 'message') {
      this.handlers.push(handler)
    }
  }
}

export * from './FileCarrier'
