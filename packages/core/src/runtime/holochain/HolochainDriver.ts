import { spawn, ChildProcess } from 'child_process'
import { AdminWebsocket, AppWebsocket } from '@holochain/client'
import path from 'path'
import fs from 'fs'
import { EventEmitter } from 'events'

export class HolochainDriver extends EventEmitter {
  private process: ChildProcess | null = null
  private adminWs: AdminWebsocket | null = null
  public appWs: AppWebsocket | null = null
  private workdir: string = ''
  private appPort: number = 0
  private appConnections = new Map<string, AppWebsocket>()

  async startHolochainConductor(config: any) {
    console.log('[HolochainDriver] Starting conductor...', config)
    this.workdir = config.dataPath
    if (!fs.existsSync(this.workdir)) fs.mkdirSync(this.workdir, { recursive: true })
    if (!fs.existsSync(path.join(this.workdir, 'data')))
      fs.mkdirSync(path.join(this.workdir, 'data'), { recursive: true })

    // Check if holochain binary exists
    const bin = config.conductorPath || 'holochain'

    try {
      const check = spawn(bin, ['--version'])
      await new Promise((resolve, reject) => {
        check.on('error', reject)
        check.on('close', (code) => {
          if (code === 0) resolve(true)
          else reject(new Error('Exit code ' + code))
        })
      })
    } catch (e) {
      throw new Error(
        `[HolochainDriver] holochain binary not found at '${bin}'. Please install Holochain v0.3.6+ or check PATH.`
      )
    }

    // Generate Config
    const configPath = path.join(this.workdir, 'config.yaml')
    const adminPort = 0 // Let Holochain pick
    const dataPath = path.join(this.workdir, 'data')

    const yamlConfig = `---
data_root_path: "${dataPath}"
use_dangerous_test_keystore: true
signing_service_uri: ~
encryption_service_uri: ~
decryption_service_uri: ~
dpki: ~
admin_interfaces:
  - driver:
      type: websocket
      port: ${adminPort}
      allowed_origins: "*"
`
    fs.writeFileSync(configPath, yamlConfig)

    console.log('[HolochainDriver] Spawning holochain with config:', configPath)
    this.process = spawn(bin, ['-c', configPath, '-p'])

    // Feed passphrase if prompted (or just in case)
    // Holochain might wait for passphrase on stdin
    setTimeout(() => {
      if (this.process?.stdin) {
        console.log('[HolochainDriver] Sending passphrase...')
        this.process.stdin.write('pass\n')
        this.process.stdin.write('pass\n') // Confirmation?
      }
    }, 1000)

    this.process.stdout?.setEncoding('utf8')
    this.process.stderr?.setEncoding('utf8')

    this.process.stderr?.on('data', (data) => {
      console.error(`[HC stderr]: ${data}`)
    })

    // Wait for Admin Interface
    const adminPortFound = await new Promise<number>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timeout waiting for Holochain Admin Interface')), 30000)

      const onData = (data: string) => {
        console.log(`[HC stdout]: ${data}`)
        // Look for "Admin interface bound to localhost:12345"
        // Output format varies, but usually: "Bound admin interface to 127.0.0.1:xxx"
        // Also handle "Bound admin interface to 0.0.0.0:xxx" if happens
        // Holochain 0.3.6 might output ###ADMIN_PORT:12345###
        const match =
          data.match(/Bound admin interface to (?:127\.0\.0\.1|localhost|0\.0\.0\.0):(\d+)/) ||
          data.match(/###ADMIN_PORT:(\d+)###/)
        if (match) {
          clearTimeout(timeout)
          resolve(parseInt(match[1]))
        }
      }

      this.process!.stdout!.on('data', (chunk) => onData(chunk.toString()))
    })

    console.log('[HolochainDriver] Admin Port:', adminPortFound)

    // Connect Admin
    this.adminWs = await AdminWebsocket.connect({
      url: new URL(`ws://127.0.0.1:${adminPortFound}`),
      wsClientOptions: { origin: 'test' }
    })

    // Attach App Interface
    const appPort = await this.adminWs.attachAppInterface({
      port: 0,
      allowed_origins: '*'
    })
    this.appPort = appPort.port
    console.log('[HolochainDriver] App Port:', this.appPort)

    // Connect App
    // In Holochain 0.3.x, connecting to AppWebsocket requires an authentication token.
    // We cannot generate a token until we have an app installed (installed_app_id).
    // Therefore, we cannot eagerly connect a generic AppWebsocket here.
    // We must defer connection until we have an app to connect to.

    // this.appWs = await AppWebsocket.connect({
    //     url: new URL(`ws://127.0.0.1:${appPort.port}`),
    //     wsClientOptions: { origin: 'test' }
    // })

    // console.log('[HolochainDriver] Connected to App Interface')
    this.emit('ready')
  }

  async logDhtStatus() {}
  async shutdown() {
    if (this.appWs) {
      await this.appWs.client.close()
    }
    if (this.adminWs) {
      await this.adminWs.client.close()
    }
    if (this.process) {
      this.process.kill()
      // Wait for exit?
    }
  }

  async getAgentKey() {
    if (!this.appWs) throw new Error('App WS not ready')
    // In real HC, we probably need to generate an agent key via Admin API first
    const key = await this.adminWs?.generateAgentPubKey()
    return key || Buffer.from('mock-agent-key')
  }

  async call(dnaNick: string, zomeName: string, fnName: string, payload: any) {
    return this.callZomeFunction('default-app', dnaNick, zomeName, fnName, payload)
  }

  async signString(data: string) {
    return 'mock-signature-implemented-later'
  }

  async installApp(params: any) {
    if (!this.adminWs) throw new Error('Admin WS not connected')
    if (!this.appPort) throw new Error('App Port not attached')

    const appId = params.installed_app_id || params.appId
    const pathStr = params.path || params.happPath

    console.log('[HolochainDriver] Installing App:', appId, pathStr)

    // Generate an agent key first
    const agentKey = await this.adminWs.generateAgentPubKey()
    console.log('[HolochainDriver] Generated Agent Key:', agentKey)

    const appInfo = await this.adminWs.installApp({
      source: {
        type: 'path',
        value: pathStr
      },
      installed_app_id: appId,
      network_seed: params.network_seed,
      agent_key: agentKey
    })

    await this.adminWs.enableApp({ installed_app_id: appId })

    // Authorize signing credentials for all cells
    // New requirement in 0.4+ / client 0.20+
    for (const [role, cellInfos] of Object.entries(appInfo.cell_info)) {
      for (const cellInfo of cellInfos) {
        // In client 0.20+, cellInfo is { type: 'provisioned', value: ... }
        // In older versions, it might be { provisioned: ... }
        // @ts-ignore
        let provisioned = cellInfo.provisioned || cellInfo['provisioned']

        // @ts-ignore
        if (!provisioned && cellInfo.type === 'provisioned') {
          // @ts-ignore
          provisioned = cellInfo.value
        }

        if (provisioned) {
          console.log('[HolochainDriver] Authorizing signing credentials for cell:', provisioned.cell_id)
          await this.adminWs.authorizeSigningCredentials(provisioned.cell_id)
        } else {
          console.log('[HolochainDriver] Skipping non-provisioned cellInfo', cellInfo)
        }
      }
    }

    // Issue token
    const token = await this.adminWs.issueAppAuthenticationToken({
      installed_app_id: appId
    })

    // Connect App WS
    const ws = await AppWebsocket.connect({
      url: new URL(`ws://127.0.0.1:${this.appPort}`),
      token: token.token,
      wsClientOptions: { origin: 'test' }
    })

    this.appConnections.set(appId, ws)
    this.appWs = ws // Set default

    return appInfo
  }

  async callZomeFunction(installedAppId: string, dnaNick: string, zomeName: string, fnName: string, payload: any) {
    let ws = this.appConnections.get(installedAppId)
    if (!ws) {
      // Fallback for tests or single-app scenario
      if (this.appWs) ws = this.appWs
      else throw new Error(`App WS not connected for appId: ${installedAppId}`)
    }

    try {
      const result = await ws.callZome({
        role_name: dnaNick, // Assuming dnaNick maps to role_name in manifest
        zome_name: zomeName,
        fn_name: fnName,
        payload: payload
      })
      return result
    } catch (e) {
      console.error('Zome Call Failed:', e)
      throw e
    }
  }

  async agentInfos() {
    return []
  }
  async addAgentInfos(infos: any) {}

  // Stubbing other methods called by HolochainService
  async unPackDna(path: string) {
    return {}
  }
  async packDna(path: string) {
    return {}
  }
  async unPackHapp(path: string) {
    return {}
  }
  async packHapp(path: string) {
    return {}
  }
  async getAppInfo(id: string) {
    return null
  }
  async removeApp(id: string) {}
}
