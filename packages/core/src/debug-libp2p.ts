import { createLibp2p } from 'libp2p'
import { webSockets } from '@libp2p/websockets'
import { tcp } from '@libp2p/tcp'
import { noise } from '@chainsafe/libp2p-noise'
import { mplex } from '@libp2p/mplex'
import { pipe } from 'it-pipe'
import { multiaddr } from '@multiformats/multiaddr'

async function run() {
  const node1 = await createLibp2p({
    addresses: { listen: ['/ip4/127.0.0.1/tcp/0'] },
    transports: [tcp()],
    streamMuxers: [mplex()],
    connectionEncrypters: [noise()]
  })

  const node2 = await createLibp2p({
    addresses: { listen: ['/ip4/127.0.0.1/tcp/0'] },
    transports: [tcp()],
    streamMuxers: [mplex()],
    connectionEncrypters: [noise()]
  })

  await node1.start()
  await node2.start()

  const protocol = '/test/1.0.0'
  node2.handle(protocol, ({ stream }) => {
    console.log('Node 2 received stream')
    pipe(stream, async (source) => {
      for await (const msg of source) {
        console.log('Received:', msg.toString())
      }
    })
  })

  const peerId = node2.peerId
  const addrs = node2.getMultiaddrs()
  await node1.dial(addrs[0])

  const stream = await node1.dialProtocol(peerId, protocol)
  console.log('Stream prototype:', Object.getOwnPropertyNames(Object.getPrototypeOf(stream)))
  console.log('Is async iterable:', Symbol.asyncIterator in stream)

  // Check hidden properties
  // @ts-ignore
  console.log('Sink property:', stream.sink)
  // @ts-ignore
  console.log('Source property:', stream.source)

  try {
    if (stream.sink) {
      await pipe([new TextEncoder().encode('Hello')], stream.sink)
    } else {
      await pipe([new TextEncoder().encode('Hello')], stream)
    }
    console.log('Sent message')
  } catch (e) {
    console.error('Send error:', e)
  }

  await node1.stop()
  await node2.stop()
}

run()
