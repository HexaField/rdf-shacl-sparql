import { createSignal, onCleanup, onMount, For } from 'solid-js'
import { generateNeighbourhoodId } from '@template/core/utils'
import HomeView from '../views/HomeView'
import Chat from '../components/Chat'
import { getApiUrl } from '../utils/connection'

const GRAPHQL_QUERY = `
  query {
    me {
      did
    }
    neighbourhoods {
      uuid
      name
    }
  }
`

const JOIN_MUTATION = `
  mutation Join($url: String!, $language: String) {
    neighbourhoodJoinFromUrl(url: $url, language: $language) {
      uuid
      name
    }
  }
`

const LEAVE_MUTATION = `
  mutation Leave($url: String!) {
    neighbourhoodLeave(url: $url)
  }
`

/**
 * The Home page component.
 * Manages the state and data fetching for the application health status.
 */
export default function Home() {
  const [message, setMessage] = createSignal('Loading...')
  const [myDid, setMyDid] = createSignal<string | undefined>(undefined)
  const [neighbourhoods, setNeighbourhoods] = createSignal<Array<{ uuid: string; name: string }>>([])
  const [joinUrl, setJoinUrl] = createSignal('')
  const [language, setLanguage] = createSignal('libp2p')
  const [activeNeighbourhoodId, setActiveNeighbourhoodId] = createSignal<string | null>(null)

  const getData = async () => {
    try {
      // 1. Get Me & Neighbourhoods
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
        setMyDid(did)
        const ns = json.data.neighbourhoods || []
        setNeighbourhoods(ns)
        setMessage(`Agent: ${did.substring(0, 15)}... | Joined: ${ns.length}`)

        // Auto-select first if none selected
        if (!activeNeighbourhoodId() && ns.length > 0) {
          setActiveNeighbourhoodId(ns[0].uuid)
        }
      }
    } catch (e) {
      console.error(e)
      setMessage('Error fetching data (Check Console / Accept Cert)')
    }
  }

  const joinNeighbourhood = async (url: string) => {
    try {
      const res = await fetch(getApiUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: JOIN_MUTATION,
          variables: { url, language: language() }
        })
      })
      const json = await res.json()
      if (json.data && json.data.neighbourhoodJoinFromUrl) {
        await getData()
        setJoinUrl('')
        setActiveNeighbourhoodId(json.data.neighbourhoodJoinFromUrl.uuid || url)
      }
    } catch (e) {
      console.error('Failed to join', e)
    }
  }

  const leaveNeighbourhood = async (url: string) => {
    try {
      const res = await fetch(getApiUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: LEAVE_MUTATION,
          variables: { url }
        })
      })
      const json = await res.json()
      if (json.data && json.data.neighbourhoodLeave) {
        if (activeNeighbourhoodId() === url) {
          setActiveNeighbourhoodId(null)
        }
        await getData()
      }
    } catch (e) {
      console.error('Failed to leave', e)
    }
  }

  const createRandom = async () => {
    // Generate a compliant CID-based URN using actual multihash logic
    const url = await generateNeighbourhoodId()
    setJoinUrl(url)
  }

  onMount(() => {
    void getData()
    // Poll for status update
    const interval = setInterval(() => {
      //   void getData()
    }, 5000)
    onCleanup(() => clearInterval(interval))
  })

  // Helper to find name
  const getActiveName = () => neighbourhoods().find((n) => n.uuid === activeNeighbourhoodId())?.name || 'Neighbourhood'

  return (
    <div class="flex h-screen bg-gray-100 font-sans">
      {/* Sidebar */}
      <div class="flex w-64 flex-shrink-0 flex-col border-r border-gray-200 bg-white">
        <div class="border-b border-gray-200 p-4">
          <h1 class="text-lg font-bold text-gray-800">My Neighbourhoods</h1>
          <div class="mt-1 truncate text-xs text-gray-500" title={message()}>
            {message()}
          </div>
        </div>

        <div class="flex-1 space-y-1 overflow-y-auto p-2">
          <For each={neighbourhoods()}>
            {(n) => (
              <button
                onClick={() => setActiveNeighbourhoodId(n.uuid)}
                class={`w-full rounded-md px-3 py-2 text-left text-sm transition-colors ${
                  activeNeighbourhoodId() === n.uuid
                    ? "bg-blue-100 font-medium text-blue-800"
                    : "text-gray-700 hover:bg-gray-100"
                }`}
              >
                <div class="truncate">{n.name}</div>
                <div class="truncate text-xs text-gray-400">{n.uuid.substring(0, 15)}...</div>
              </button>
            )}
          </For>

          <button
            onClick={() => setActiveNeighbourhoodId(null)}
            class={`mt-2 flex w-full items-center rounded-md border-t border-gray-100 px-3 py-2 text-left text-sm text-gray-600 hover:bg-gray-50 ${
              activeNeighbourhoodId() === null ? "bg-gray-100 font-medium" : ''
            }`}
          >
            <span class="mr-2 text-lg leading-none">+</span> Join New
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div class="flex flex-1 flex-col overflow-hidden">
        {activeNeighbourhoodId() ? (
          <>
            <div class="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-3 shadow-sm">
              <div>
                <h2 class="text-xl font-bold text-gray-800">{getActiveName()}</h2>
                <div class="font-mono text-xs text-gray-500">{activeNeighbourhoodId()}</div>
              </div>
              <button
                class="rounded px-3 py-1 text-sm text-red-600 hover:bg-red-50 hover:text-red-800"
                onClick={() => leaveNeighbourhood(activeNeighbourhoodId()!)}
              >
                Leave Neighbourhood
              </button>
            </div>
            <div class="relative flex-1 overflow-hidden bg-gray-50 p-4">
              <Chat perspectiveUuid={activeNeighbourhoodId()!} myDid={myDid()} />
            </div>
          </>
        ) : (
          <div class="flex-1 overflow-y-auto p-8">
            <HomeView serverMessage={message()} />

            <div class="mx-auto mt-8 max-w-2xl rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
              <h2 class="mb-4 text-2xl font-bold text-gray-800">Join / Create Neighbourhood</h2>
              <p class="mb-6 text-gray-600">
                Enter a Neighbourhood URL to join an existing network, or generate a new unique ID to start a new one.
                Choose the link language (transport) that best fits your needs.
              </p>

              <div class="flex flex-col gap-4">
                <div>
                  <label class="mb-1 block text-sm font-medium text-gray-700">Transport / Language</label>
                  <select
                    class="w-full rounded border border-gray-300 bg-white px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
                    value={language()}
                    onInput={(e) => setLanguage(e.currentTarget.value)}
                  >
                    <option value="libp2p">Libp2p (Direct P2P, Good for Local/LAN)</option>
                    <option value="holochain">Holochain (DHT Sync, Persistent)</option>
                  </select>
                </div>

                <div>
                  <label class="mb-1 block text-sm font-medium text-gray-700">Neighbourhood URL</label>
                  <div class="flex gap-2">
                    <input
                      type="text"
                      class="flex-1 rounded border border-gray-300 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="e.g. neighbourhood://Qm..."
                      value={joinUrl()}
                      onInput={(e) => setJoinUrl(e.currentTarget.value)}
                    />
                    <button
                      class="rounded bg-green-600 px-4 py-2 font-medium whitespace-nowrap text-white hover:bg-green-700"
                      onClick={createRandom}
                    >
                      Generate ID
                    </button>
                  </div>
                </div>

                <button
                  class="mt-2 w-full rounded bg-blue-600 px-4 py-3 text-lg font-bold text-white shadow-sm transition-transform hover:bg-blue-700 active:scale-[0.99]"
                  onClick={() => joinNeighbourhood(joinUrl())}
                  disabled={!joinUrl()}
                >
                  Join Neighbourhood
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
