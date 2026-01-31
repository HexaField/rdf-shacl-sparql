import { Component, createResource, createSignal, For, onCleanup, onMount } from 'solid-js'
import { getApiUrl } from '../utils/connection'

interface ChatProps {
  perspectiveUuid: string | undefined
  myDid: string | undefined
}

const fetchMessages = async (perspectiveUuid: string) => {
  if (!perspectiveUuid) return []

  const query = `
    query($uuid: String!) {
        perspectiveQueryLinks(uuid: $uuid, query: { predicate: "urn:ad4m:message" }) {
            author
            timestamp
            data {
                target
            }
        }
    }`

  try {
    const res = await fetch(getApiUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        variables: { uuid: perspectiveUuid }
      })
    })
    const json = await res.json()
    // console.log('Chat fetched:', json)
    if (json.data && json.data.perspectiveQueryLinks) {
      const msgs = json.data.perspectiveQueryLinks
        .map((l: any) => ({
          author: l.author,
          text: l.data.target,
          timestamp: l.timestamp
        }))
        .sort((a: any, b: any) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
      // console.log('Processed messages:', msgs)
      return msgs
    }
  } catch (e) {
    console.error('Chat fetch error', e)
  }
  return []
}

const Chat: Component<ChatProps> = (props) => {
  const [messages, { refetch }] = createResource(() => props.perspectiveUuid, fetchMessages)
  const [inputText, setInputText] = createSignal('')

  const sendMessage = async (e: Event) => {
    e.preventDefault()
    if (!props.perspectiveUuid || !inputText()) return

    const text = inputText()
    const mutation = `
        mutation($uuid: String!, $text: String!) {
            perspectiveAddLink(uuid: $uuid, link: {
                source: "urn:ad4m:chat-root", 
                predicate: "urn:ad4m:message", 
                target: $text
            }) {
                timestamp
            }
        }`

    try {
      console.log('Sending message:', text)
      const res = await fetch(getApiUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: mutation,
          variables: { uuid: props.perspectiveUuid, text }
        })
      })
      const json = await res.json()
      // console.log('Send message result:', json)
      setInputText('')
      refetch()
    } catch (err) {
      console.error('Send message error', err)
    }
  }

  onMount(() => {
    const interval = setInterval(() => refetch(), 2000)
    onCleanup(() => clearInterval(interval))
  })

  return (
    <div class="mt-4 rounded border bg-white p-4 shadow-sm">
      <h2 class="mb-4 border-b pb-2 text-xl font-bold">Chat</h2>
      <div class="mb-4 flex h-96 flex-col gap-2 overflow-y-auto rounded border bg-gray-50 p-4">
        <For each={messages()}>
          {(msg) => {
            const isMe = props.myDid && msg.author === props.myDid
            return (
              <div class={`flex max-w-[80%] flex-col ${isMe ? "items-end self-end" : "items-start self-start"}`}>
                <div
                  class={`rounded-lg px-3 py-2 ${isMe ? "rounded-br-none bg-blue-500 text-white" : "rounded-bl-none bg-gray-200 text-gray-800"}`}
                >
                  {msg.text}
                </div>
                <span class="mt-1 px-1 text-xs text-gray-400">
                  {isMe ? 'Me' : msg.author.replace('did:key:', '').substring(0, 7)}
                </span>
              </div>
            )
          }}
        </For>
      </div>
      <form onSubmit={sendMessage} class="flex gap-2">
        <input
          type="text"
          value={inputText()}
          onInput={(e) => setInputText(e.currentTarget.value)}
          class="flex-grow border p-1"
          placeholder="Type a message..."
        />
        <button type="submit" class="rounded bg-blue-500 px-4 py-1 text-white">
          Send
        </button>
      </form>
    </div>
  )
}

export default Chat
