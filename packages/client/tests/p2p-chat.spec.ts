import { test, expect } from '@playwright/test'
import { spawn, ChildProcess } from 'child_process'
import path from 'path'
import fs from 'fs'
import os from 'os'
import net from 'net'

// Use a shared temp directory for the test run to isolate from other runs
const STORAGE_DIR = path.join(os.tmpdir(), `ad4m-test-storage-p2p-${Date.now()}`)

const SERVERS: ChildProcess[] = []
const CLIENTS: ChildProcess[] = []

// Helper to check if port is in use (server handling connections)
async function waitForPort(port: number, timeout = 30000) {
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
async function startServer(port: number, storageDir: string) {
  console.log(`Starting P2P Server on ${port}...`)
  const p = spawn('pnpm', ['-F', '@template/server', 'dev'], {
    cwd: path.resolve(process.cwd(), '../..'),
    env: {
      ...process.env,
      PORT: port.toString(),
      STORAGE_DIR: storageDir,
      USE_LIBP2P: 'true',
      HOST: 'localhost'
    },
    stdio: 'pipe'
  })

  // Pipe output to see errors if any
  p.stdout?.on('data', (data) => console.log(`[Server ${port}] ${data}`))
  p.stderr?.on('data', (data) => console.error(`[Server ${port}] ${data}`))

  SERVERS.push(p)
  // Wait for readiness
  await waitForPort(port)
  // Give it a tiny bit more time for Libp2p init and discovery
  await new Promise((r) => setTimeout(r, 2000))
}

// Helper to start a client
async function startClient(port: number) {
  console.log(`Starting client on ${port}...`)
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

test.beforeAll(async () => {
  // Clean storage
  if (fs.existsSync(STORAGE_DIR)) fs.rmSync(STORAGE_DIR, { recursive: true, force: true })
  fs.mkdirSync(STORAGE_DIR)

  console.log(`Starting P2P infrastructure in ${STORAGE_DIR}...`)

  // Start Servers
  // Use ports 3007 and 3008 to avoid conflict with standard dev or other tests
  await Promise.all([startServer(3007, STORAGE_DIR), startServer(3008, STORAGE_DIR)])
  console.log('Servers started.')

  // Start Single Client (served on 5002)
  await startClient(5002)
  console.log('Client started.')
})

test.afterAll(async () => {
  console.log('Shutting down...')
  CLIENTS.forEach((p) => p.kill())
  SERVERS.forEach((p) => p.kill())
  // Cleanup storage
  if (fs.existsSync(STORAGE_DIR)) fs.rmSync(STORAGE_DIR, { recursive: true, force: true })
})

test('P2P Chat reconciliation between two agents', async ({ browser }) => {
  // Context 1 -> Client 1 (Agent A) connected to Server 3007
  const context1 = await browser.newContext({ ignoreHTTPSErrors: true })
  const page1 = await context1.newPage()

  page1.on('console', (msg) => console.log(`[Page 1] ${msg.text()}`))
  page1.on('pageerror', (exception) => console.log(`[Page 1 Error] ${exception}`))

  // Context 2 -> Client 2 (Agent B) connected to Server 3008
  const context2 = await browser.newContext({ ignoreHTTPSErrors: true })
  const page2 = await context2.newPage()

  page2.on('console', (msg) => console.log(`[Page 2] ${msg.text()}`))
  page2.on('pageerror', (exception) => console.log(`[Page 2 Error] ${exception}`))

  // 1. Go to Home with specific ports
  await page1.goto('https://localhost:5002/?port=3007')
  await page2.goto('https://localhost:5002/?port=3008')

  // 2. Wait for Chat to appear (implies Joined Neighbourhood)
  await expect(page1.getByText('Chat')).toBeVisible({ timeout: 20000 })
  await expect(page2.getByText('Chat')).toBeVisible({ timeout: 20000 })

  // 3. Client 1 types
  const message = `Hello P2P World ${Date.now()}`
  const input = page1.locator('input[type="text"]')
  await input.fill(message)
  await page1.getByRole('button', { name: 'Send' }).click()

  // 4. Verify Client 1 sees it immediately
  await expect(page1.getByText(message)).toBeVisible()

  // 5. Verify Client 2 sees it (via sync)
  // This confirms that Server 3007 found Server 3008 via mDNS and synced the link.
  await expect(page2.getByText(message)).toBeVisible({ timeout: 20000 })
})
