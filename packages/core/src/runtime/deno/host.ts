// Map of instantiated Language objects. Key is a handle/ID.
// @ts-ignore
const languages = new Map<string, any>()

// Request tracking for calls originating from Deno to Node
// @ts-ignore
const pendingRequests = new Map<number, { resolve: Function; reject: Function }>()
let nextRequestId = 1

function sendToParent(method: string, params: any): Promise<any> {
  // @ts-ignore
  return new Promise((resolve, reject) => {
    const id = nextRequestId++
    pendingRequests.set(id, { resolve, reject })
    console.log(JSON.stringify({ jsonrpc: '2.0', method, params, id }))
  })
}

function respondToParent(id: number, result: any, error?: { message: string }) {
  const response: any = { jsonrpc: '2.0', id }
  if (error) response.error = error
  else response.result = result

  console.log(JSON.stringify(response))
}

// Create a context object that proxies calls back to the parent Node.js process
function createContextProxy(config: any) {
  return {
    ...config,
    // Proxy HolochainService
    Holochain: {
      callApp: (functionName: string, args: any) => sendToParent('Holochain.callApp', { functionName, args }),
      registerDNAs: (dnas: any[], signalCb: any) => sendToParent('Holochain.registerDNAs', { dnas }),
      call: (dnaNick: string, zomeName: string, fnName: string, params: object | string) =>
        sendToParent('Holochain.call', { dnaNick, zomeName, fnName, params }),
      callAsync: (calls: any[], timeoutMs?: number) => sendToParent('Holochain.callAsync', { calls, timeoutMs })
    },
    // Proxy AgentService
    Agent: {
      did: () => sendToParent('Agent.did', {}),
      sign: (data: any) => sendToParent('Agent.sign', { data })
    },
    // Add ad4mSignal if needed
    ad4mSignal: (signal: any) => sendToParent('ad4mSignal', { signal })
  }
}

async function handleRequest(request: any) {
  // 1. Handle Response to our own request
  if (request.id !== undefined && request.method === undefined) {
    // This is a response from parent
    const handler = pendingRequests.get(request.id)
    if (handler) {
      pendingRequests.delete(request.id)
      if (request.error) {
        handler.reject(new Error(request.error.message))
      } else {
        handler.resolve(request.result)
      }
    }
    return
  }

  // 2. Handle Request from parent
  const { id, method, params } = request

  try {
    let result
    switch (method) {
      case 'loadReasoning':
      case 'load': {
        const { path, handle, config } = params

        let importPath = path
        // Handle absolute paths by prepending file://
        if (path.startsWith('/')) {
          importPath = 'file://' + path
        }

        const module = await import(importPath)

        let create = module.default
        if (create && create.default) create = create.default
        if (typeof create !== 'function' && typeof module.create === 'function') create = module.create
        if (typeof create !== 'function' && typeof module === 'function') create = module

        if (typeof create !== 'function') {
          throw new Error("Could not find 'create' factory function in " + path)
        }

        const context = createContextProxy(config || {})
        const language = await create(context)
        languages.set(handle, language)

        result = {
          success: true,
          name: language.name,
          hasExpressionAdapter: !!language.expressionAdapter,
          hasLinksAdapter: !!language.linksAdapter
        }
        break
      }

      case 'execute': {
        const { handle, method: funcName, args } = params
        const language = languages.get(handle)
        if (!language) throw new Error('Language handle ' + handle + ' not found')

        const parts = funcName.split('.')
        let fn = language
        let ctx = language

        for (const part of parts) {
          ctx = fn
          fn = fn[part]
          if (!fn) throw new Error('Property ' + part + ' not found in language object at ' + funcName)
        }

        if (typeof fn !== 'function') {
          throw new Error(funcName + ' is not a function')
        }

        result = await fn.apply(ctx, args || [])
        break
      }

      case 'eval': {
        const { code } = params
        result = eval(code)
        break
      }

      default:
        throw new Error('Unknown method: ' + method)
    }

    if (id !== undefined) {
      respondToParent(id, result)
    }
  } catch (error: any) {
    if (id !== undefined) {
      respondToParent(id, null, { message: error.message || String(error) })
    }
  }
}

const decoder = new TextDecoder()

async function startLoop() {
  const buf = new Uint8Array(4096)
  let buffer = ''

  try {
    while (true) {
      // @ts-ignore
      const n = await Deno.stdin.read(buf)
      if (n === null) break

      buffer += decoder.decode(buf.subarray(0, n))

      let newlineIndex
      while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newlineIndex)
        buffer = buffer.slice(newlineIndex + 1)

        if (line.trim()) {
          try {
            // Do not await handleRequest, as it might block waiting for RPC responses
            handleRequest(JSON.parse(line))
          } catch (e) {
            // console.error("Failed to parse JSON request inside Deno:", e);
          }
        }
      }
    }
  } catch (err) {
    // console.error("Fatal error in startLoop:", err);
  }
}

// @ts-ignore
if (import.meta.main) {
  startLoop()
}
