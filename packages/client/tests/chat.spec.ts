import { test, expect } from '@playwright/test'
import { spawn, ChildProcess } from 'child_process'
import path from 'path'
import fs from 'fs'
import os from 'os'
import net from 'net'

// Use a shared temp directory for the test run to isolate from other runs
const STORAGE_DIR = path.join(os.tmpdir(), `ad4m-test-storage-${Date.now()}`)

const SERVERS: ChildProcess[] = []
const CLIENTS: ChildProcess[] = []

// Helper to check if port is in use (server handling connections)
async function waitForPort(port: number, timeout = 20000) {
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
  const p = spawn('pnpm', ['-F', '@template/server', 'dev'], {
    cwd: path.resolve(process.cwd(), '../..'),
    // We pass STORAGE_DIR to the server process
    env: {
      ...process.env,
      PORT: port.toString(),
      STORAGE_DIR: storageDir,
      USE_P2P: 'true', // Signal to use LocalFilesystemCarrier
      HOST: 'localhost'
    },
    stdio: 'pipe'
  })
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

test.beforeAll(async () => {
  // Clean storage
  if (fs.existsSync(STORAGE_DIR)) fs.rmSync(STORAGE_DIR, { recursive: true, force: true })
  fs.mkdirSync(STORAGE_DIR)

  console.log(`Starting infrastructure in ${STORAGE_DIR}...`)

  // Start Servers
  await Promise.all([startServer(3005, STORAGE_DIR), startServer(3006, STORAGE_DIR)])
  console.log('Servers started.')

  // Start Single Client
  await startClient(5001)
  console.log('Client started.')
})

test.afterAll(async () => {
  console.log('Shutting down...')
  CLIENTS.forEach((p) => p.kill())
  SERVERS.forEach((p) => p.kill())
  // Cleanup storage
  if (fs.existsSync(STORAGE_DIR)) fs.rmSync(STORAGE_DIR, { recursive: true, force: true })
})

test('Chat reconciliation between two agents', async ({ browser }) => {
  // Context 1 -> Client 1 (Agent A)
  const context1 = await browser.newContext({ ignoreHTTPSErrors: true })
  const page1 = await context1.newPage()

  // Context 2 -> Client 2 (Agent B)
  const context2 = await browser.newContext({ ignoreHTTPSErrors: true })
  const page2 = await context2.newPage()

  // 1. Go to Home with specific ports
  // Client 1 connects to Server 3005
  await page1.goto('https://localhost:5001/?port=3005')
  // Client 2 connects to Server 3006
  await page2.goto('https://localhost:5001/?port=3006')

  // 2. Wait for Chat to appear (implies Joined Neighbourhood)
  await expect(page1.getByText('Chat')).toBeVisible({ timeout: 15000 })
  await expect(page2.getByText('Chat')).toBeVisible({ timeout: 15000 })

  // 3. Client 1 types
  const message = `Hello from Agent A ${Date.now()}`
  // Find input by placeholder or role
  const input = page1.locator('input[type="text"]')
  await input.fill(message)
  await page1.getByRole('button', { name: 'Send' }).click()

  // 4. Verify Client 1 sees it immediately
  await expect(page1.getByText(message)).toBeVisible()

  // 5. Verify Client 2 sees it (via sync)
  // This confirms that Server 3005 wrote to its inbox, pushed to others, Server 3006 picked it up.
  await expect(page2.getByText(message)).toBeVisible({ timeout: 10000 })
})
