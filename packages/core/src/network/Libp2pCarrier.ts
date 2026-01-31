import { createLibp2p, Libp2p } from 'libp2p'
import { webSockets } from '@libp2p/websockets'
import { tcp } from '@libp2p/tcp'
import { noise } from '@chainsafe/libp2p-noise'
import { mplex } from '@libp2p/mplex'
import { bootstrap } from '@libp2p/bootstrap'
import { mdns } from '@libp2p/mdns'
import { multiaddr } from '@multiformats/multiaddr'
import { Carrier, Envelope } from './index'
import { EventEmitter } from 'events'
import { pipe } from 'it-pipe'

const AD4M_PROTOCOL = '/ad4m/1.0.0'

const decoder = new TextDecoder()

export class Libp2pCarrier extends EventEmitter implements Carrier {
  private node: Libp2p | null = null
  public id: string = ''

  constructor() {
    super()
  }

  async start() {
    this.node = await createLibp2p({
      addresses: {
        listen: ['/ip4/0.0.0.0/tcp/0']
      },
      transports: [webSockets(), tcp()],
      connectionEncrypters: [noise()],
      streamMuxers: [mplex()],
      peerDiscovery: [
        mdns({
          interval: 1000
        })
      ]
    })

    this.id = this.node.peerId.toString()

    this.node.handle(AD4M_PROTOCOL, async (data: any) => {
      const stream = data.stream || data
      try {
        await pipe(stream, async (source: any) => {
          for await (const msg of source) {
            try {
              const str = decoder.decode(msg.subarray())
              const envelope = JSON.parse(str)
              this.emit('message', envelope)
            } catch (e) {
              console.error('Error parsing envelope', e)
            }
          }
        })
      } catch (err) {
        console.error('Error handling stream', err)
      }
    })

    await this.node.start()

    this.node.addEventListener('peer:discovery', async (evt) => {
      const peerInfo = evt.detail
      console.log(`[Libp2pCarrier] Discovered peer ${peerInfo.id.toString()}`)
      try {
        await this.node.dial(peerInfo.id)
        console.log(`[Libp2pCarrier] Connected to peer ${peerInfo.id.toString()}`)
      } catch (e) {
        console.error(`[Libp2pCarrier] Failed to dial peer ${peerInfo.id.toString()}`, e)
      }
    })
  }

  async stop() {
    if (this.node) {
      await this.node.stop()
    }
  }

  async send(envelope: Envelope): Promise<void> {
    if (!this.node) throw new Error('Libp2p node not started')

    const msg = JSON.stringify(envelope)
    const encoded = new TextEncoder().encode(msg)

    // Naive Implementation: Always flood/broadcast to all connected peers
    // In a real DHT/Overlay, we would route to the specific PeerID holding the DID.
    const peers = this.node.getPeers()
    const label = envelope.recipient === 'broadcast' ? 'Broadcast' : `Direct(${envelope.recipient})`
    // console.log(`[Libp2pCarrier] ${label} sending to ${peers.length} peers`)

    for (const peerId of peers) {
      try {
        const stream = await this.node.dialProtocol(peerId, AD4M_PROTOCOL)

        // Polyfill sink if missing (seems to happen with current versions)
        // @ts-ignore
        if (!stream.sink) {
          // @ts-ignore
          stream.sink = async (source: any) => {
            for await (const msg of source) {
              // @ts-ignore
              if (typeof stream.sendData === 'function') {
                // Hack: mplex expects sublist but Uint8Array has subarray
                if (msg && !msg.sublist && msg.subarray) {
                  msg.sublist = msg.subarray
                }
                // @ts-ignore
                stream.sendData(msg)
              }
            }
          }
        }

        // @ts-ignore
        if (stream.sink) {
          // @ts-ignore
          await pipe([encoded], stream.sink)
        }

        await stream.close()
      } catch (e) {
        console.error(`[Libp2pCarrier] Failed to send to ${peerId}:`, e)
      }
    }
  }

  async connect(address: string) {
    if (!this.node) throw new Error('Node not started')
    const ma = multiaddr(address)
    await this.node.dial(ma)
  }
}
