import { test, expect } from '@playwright/test'
import { spawn, ChildProcess } from 'child_process'
import path from 'path'
import fs from 'fs'
import os from 'os'
import net from 'net'

const SERVERS: ChildProcess[] = []
const CLIENTS: ChildProcess[] = []

// Helper to check if port is in use (server handling connections)
async function waitForPort(port: number, timeout = 60000) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    try {
      await new Promise<void>((resolve, reject) => {
        const socket = new net.Socket()
        socket.setTimeout(200)
        socket.on('connect', () => {
          socket.destroy()
          resolve()
        })
        socket.on('timeout', () => {
          socket.destroy()
          reject(new Error('timeout'))
        })
        socket.on('error', (err) => {
          socket.destroy()
          reject(err)
        })
        socket.connect(port, 'localhost')
      })
      return
    } catch (e) {
      await new Promise((r) => setTimeout(r, 500))
    }
  }
  throw new Error(`Timeout waiting for port ${port}`)
}

// Helper to start a server
async function startServer(port: number, storageDir: string, linkLanguage: string) {
  const rootDir = process.cwd().endsWith('client') ? path.resolve(process.cwd(), '../..') : process.cwd()
  const serverDir = path.join(rootDir, 'packages/server')
  const tsxPath = path.join(rootDir, 'node_modules/.bin/tsx')
  console.log(`Starting Server ${port} with LINK_LANGUAGE=${linkLanguage}`)
  const p = spawn(tsxPath, ['src/index.ts'], {
    cwd: serverDir,
    // We pass STORAGE_DIR to the server process
    env: {
      ...process.env,
      PORT: port.toString(),
      STORAGE_DIR: storageDir,
      USE_LIBP2P: 'true',
      LINK_LANGUAGE: linkLanguage,
      HOST: 'localhost',
      HOLOCHAIN_DATA: path.join(storageDir, 'ad4m-holochain')
    },
    stdio: 'pipe'
  })
  if (p.stdout) {
    p.stdout.on('data', (data) => console.log(`[Server ${port}:out] ${data}`))
  }
  if (p.stderr) {
    p.stderr.on('data', (data) => console.log(`[Server ${port}:err] ${data}`))
  }
  SERVERS.push(p)
  // Wait for readiness
  await waitForPort(port)
  // Give it a tiny bit more time for GraphQL init
  await new Promise((r) => setTimeout(r, 1000))
}

// Helper to start a client
async function startClient(port: number) {
  console.log(`Starting client on ${port}...`)
  // We launch just one client instance. The API connection is determined by ?port= query param in the URL.
  const p = spawn('pnpm', ['-F', '@template/client', 'dev', '--port', port.toString()], {
    cwd: path.resolve(process.cwd(), '../..'),
    env: { ...process.env },
    stdio: 'pipe'
  })
  CLIENTS.push(p)
  // Wait for readiness
  await waitForPort(port)
  console.log(`Client ${port} ready.`)
}

async function killProcesses() {
  console.log('Shutting down processes...')
  CLIENTS.forEach((p) => p.kill())
  SERVERS.forEach((p) => p.kill())
  CLIENTS.length = 0
  SERVERS.length = 0
}

const MODES = ['shacl', 'holochain']

for (const mode of MODES) {
  test(`Chat reconciliation (${mode})`, async ({ browser }) => {
    test.setTimeout(180000)

    // Setup unique storage for this test run
    // Use /tmp on macOS/Linux to avoid "UNIX socket path too long" error with Holochain/Lair
    const tmpBase = process.platform === 'darwin' || process.platform === 'linux' ? '/tmp' : os.tmpdir()
    const STORAGE_DIR = path.join(tmpBase, `ad4m-test-${mode}-${Date.now()}`)
    if (fs.existsSync(STORAGE_DIR)) fs.rmSync(STORAGE_DIR, { recursive: true, force: true })
    fs.mkdirSync(STORAGE_DIR)

    try {
      // Start Infrastructure
      // We offset ports for 'holochain' mode so parallel runs don't conflict (though pure serial here)
      const portOffset = mode === 'holochain' ? 10 : 0
      const serverPort1 = 3005 + portOffset
      const serverPort2 = 3006 + portOffset
      const clientPort = 5001 + portOffset

      await Promise.all([
        startServer(serverPort1, path.join(STORAGE_DIR, 'agent1'), mode),
        startServer(serverPort2, path.join(STORAGE_DIR, 'agent2'), mode)
      ])
      console.log(`Servers started for ${mode}.`)

      // Start Single Client
      await startClient(clientPort)
      console.log(`Client started for ${mode}.`)

      // Context 1 -> Client 1 (Agent A)
      const context1 = await browser.newContext({ ignoreHTTPSErrors: true })
      const page1 = await context1.newPage()

      // Context 2 -> Client 2 (Agent B)
      const context2 = await browser.newContext({ ignoreHTTPSErrors: true })
      const page2 = await context2.newPage()

      // 1. Go to Home with specific ports
      await page1.goto(`https://localhost:${clientPort}/?port=${serverPort1}`)
      await page2.goto(`https://localhost:${clientPort}/?port=${serverPort2}`)

      // 2. Wait for Chat to appear (implies Joined Neighbourhood)
      await expect(page1.getByText('Chat')).toBeVisible({ timeout: 30000 })
      await expect(page2.getByText('Chat')).toBeVisible({ timeout: 30000 })

      // 3. Client 1 types
      const message = `Hello from Agent A (${mode})`
      const message2 = `Hello from Agent B (${mode})`

      const input = page1.locator('input[type="text"]')
      await input.fill(message)
      await page1.getByRole('button', { name: 'Send' }).click()

      const input2 = page2.locator('input[type="text"]')
      await input2.fill(message2)
      await page2.getByRole('button', { name: 'Send' }).click()

      // 4. Verify Client 1 sees it immediately
      await expect(page1.getByText(message)).toBeVisible({ timeout: 60000 })
      await expect(page2.getByText(message2)).toBeVisible({ timeout: 60000 })

      // 5. Verify Sync
      await expect(page2.getByText(message)).toBeVisible({ timeout: 60000 })
      await expect(page1.getByText(message2)).toBeVisible({ timeout: 60000 })
    } catch (e) {
      console.error(`Error during test (${mode}):`, e)
      expect(e).toBeUndefined() // Fail the test
    } finally {
      await killProcesses()
      // Cleanup storage
      // if (fs.existsSync(STORAGE_DIR)) fs.rmSync(STORAGE_DIR, { recursive: true, force: true })
    }
  })
}
