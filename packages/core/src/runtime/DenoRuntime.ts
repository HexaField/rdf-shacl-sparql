import { spawn, ChildProcess } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as fs from 'node:fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export interface RuntimeOptions {
  denoPath?: string
  permissions?: string[] // e.g., ["--allow-read", "--allow-net"]
  // Default handlers for context calls
  agentService?: any
}

interface JsonRpcMessage {
  jsonrpc: '2.0'
  id: number
  method?: string
  params?: any
  result?: any
  error?: {
    code?: number
    message: string
    data?: any
  }
}

export class DenoRuntime {
  private process: ChildProcess | null = null
  private messageQueue: Map<number, { resolve: Function; reject: Function }> = new Map()
  private nextId = 1
  private rpcHandlers: Map<string, (params: any) => Promise<any>> = new Map()

  constructor(private options: RuntimeOptions = {}) {
    this.registerDefaultHandlers()
  }

  private registerDefaultHandlers() {
    this.registerRpcHandler('Holochain.callApp', async (params) => {
      console.warn(`[Node] Holochain call received from Deno: ${params.functionName}`)
      throw new Error('Holochain bridge not implemented in Node.js runtime yet.')
    })

    this.registerRpcHandler('Agent.did', async () => {
      // TODO: Connect to actual AgentService
      return 'did:key:zMockAgent'
    })

    this.registerRpcHandler('Agent.sign', async ({ data }) => {
      // TODO: Connect to actual AgentService
      return 'mock_signature_hex'
    })
  }

  public registerRpcHandler(method: string, handler: (params: any) => Promise<any>) {
    this.rpcHandlers.set(method, handler)
  }

  async start() {
    if (this.process) return

    const denoPath = this.options.denoPath || 'deno'
    const hostScriptPath = path.resolve(__dirname, 'deno/host.ts')

    if (!fs.existsSync(hostScriptPath)) {
      throw new Error(`Deno host script not found at ${hostScriptPath}`)
    }

    const args = ['run', ...this.getPermissions(), hostScriptPath]

    this.process = spawn(denoPath, args, {
      stdio: ['pipe', 'pipe', 'pipe']
    })

    this.process.stdout?.on('data', (data) => {
      const lines = data.toString().split('\n')
      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const msg = JSON.parse(line) as JsonRpcMessage
          this.handleMessage(msg)
        } catch (e) {
          console.error('Failed to parse Deno output:', line, e)
        }
      }
    })

    this.process.stderr?.on('data', (data) => {
      console.error(`[Deno Stderr]: ${data}`)
    })

    this.process.on('close', (code) => {
      this.process = null
      // Reject all pending requests
      for (const { reject } of this.messageQueue.values()) {
        reject(new Error(`Deno process exited with code ${code}`))
      }
      this.messageQueue.clear()
    })
  }

  private getPermissions(): string[] {
    return this.options.permissions || ['--allow-all'] // Default to allow all for now
  }

  private async handleMessage(msg: JsonRpcMessage) {
    // 1. Response to our request
    if (msg.id && msg.method === undefined) {
      if (this.messageQueue.has(msg.id)) {
        const { resolve, reject } = this.messageQueue.get(msg.id)!
        this.messageQueue.delete(msg.id)
        if (msg.error) {
          reject(new Error(msg.error.message))
        } else {
          resolve(msg.result)
        }
      }
      return
    }

    // 2. Request from Deno
    if (msg.id && msg.method) {
      const handler = this.rpcHandlers.get(msg.method)
      let result
      let error

      try {
        if (handler) {
          result = await handler(msg.params)
        } else {
          throw new Error(`Method ${msg.method} not found on Node.js host`)
        }
      } catch (e: any) {
        error = { message: e.message || String(e) }
      }

      // Send response back
      const response = {
        jsonrpc: '2.0',
        id: msg.id,
        result,
        error
      }
      this.process?.stdin?.write(JSON.stringify(response) + '\n')
    }
  }

  async stop() {
    if (this.process) {
      this.process.kill()
      this.process = null
    }
  }

  private async call(method: string, params: any): Promise<any> {
    if (!this.process) {
      await this.start()
    }

    return new Promise((resolve, reject) => {
      const id = this.nextId++
      this.messageQueue.set(id, { resolve, reject })

      const request = JSON.stringify({
        jsonrpc: '2.0',
        method,
        params,
        id
      })

      this.process?.stdin?.write(request + '\n')
    })
  }

  async loadLanguage(modulePath: string, handle: string, config: any = {}) {
    return this.call('load', { path: modulePath, handle, config })
  }

  async execute(handle: string, func: string, args: any[] = []) {
    return this.call('execute', { handle, method: func, args })
  }

  async eval(code: string) {
    return this.call('eval', { code })
  }
}
