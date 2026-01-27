import { createSignal, onCleanup, onMount, Show } from 'solid-js'
import HomeView from '../views/HomeView'
import Chat from '../components/Chat'
import { getApiUrl } from '../utils/connection'

const GRAPHQL_QUERY = `
  query {
    me {
      did
      perspective {
        uuid
        name
      }
    }
  }
`

const JOIN_CHAT_MUTATION = `
  mutation {
    neighbourhoodJoinFromUrl(url: "urn:ad4m:public-chat") {
      uuid
      name
    }
  }
`

/**
 * The Home page component.
 * Manages the state and data fetching for the application health status.
 */
export default function Home() {
  const [message, setMessage] = createSignal('Loading...')
  const [, setPerspectiveUuid] = createSignal<string | undefined>(undefined)
  const [chatUuid, setChatUuid] = createSignal<string | undefined>(undefined)
  const [myDid, setMyDid] = createSignal<string | undefined>(undefined)

  const getData = async () => {
    try {
      // 1. Get Me
      const res = await fetch(getApiUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: GRAPHQL_QUERY })
      })
      const json = await res.json()

      if (json.errors) {
        setMessage('Error: ' + json.errors[0].message)
      } else {
        const did = json.data.me.did
        const persp = json.data.me.perspective
        const perspectiveName = persp?.name || 'Unknown'
        setPerspectiveUuid(persp?.uuid)
        setMyDid(did)
        setMessage(`Agent: ${did.substring(0, 15)}... | Perspective: ${perspectiveName}`)
      }
    } catch (e) {
      console.error(e)
      setMessage('Error fetching data (Check Console / Accept Cert)')
    }
  }

  const joinChat = async () => {
    try {
      const res = await fetch(getApiUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: JOIN_CHAT_MUTATION })
      })
      const json = await res.json()
      if (json.data && json.data.neighbourhoodJoinFromUrl) {
        setChatUuid(json.data.neighbourhoodJoinFromUrl.uuid)
      }
    } catch (e) {
      console.error('Failed to join chat', e)
    }
  }

  onMount(() => {
    void getData()
    void joinChat()

    // Poll less frequently for generic status, Chat handles its own polling
    const interval = setInterval(() => {
      // void getData()
    }, 10000)
    onCleanup(() => clearInterval(interval))
  })

  return (
    <div class="mx-auto max-w-2xl">
      <HomeView serverMessage={message()} />
      <Show when={chatUuid()}>
        <Chat perspectiveUuid={chatUuid()} myDid={myDid()} />
      </Show>
    </div>
  )
}
