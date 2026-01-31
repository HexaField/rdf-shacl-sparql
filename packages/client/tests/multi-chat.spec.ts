import { test, expect } from '@playwright/test'
import { spawn, ChildProcess } from 'child_process'
import path from 'path'
import fs from 'fs'
import os from 'os'
import net from 'net'

const SERVERS: ChildProcess[] = []
const CLIENTS: ChildProcess[] = []

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

async function startServer(port: number, storageDir: string) {
  const rootDir = process.cwd().endsWith('client') ? path.resolve(process.cwd(), '../..') : process.cwd()
  const serverDir = path.join(rootDir, 'packages/server')
  const tsxPath = path.join(rootDir, 'node_modules/.bin/tsx')
  console.log(`Starting Server ${port}`)
  const p = spawn(tsxPath, ['src/index.ts'], {
    cwd: serverDir,
    env: {
      ...process.env,
      PORT: port.toString(),
      STORAGE_DIR: storageDir,
      USE_LIBP2P: 'true',
      LINK_LANGUAGE: 'holochain',
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

  // Wait for port
  await waitForPort(port)
  await new Promise((r) => setTimeout(r, 1000))

  return p
}

async function startClient(port: number) {
  console.log(`Starting client on ${port}...`)
  const p = spawn('pnpm', ['-F', '@template/client', 'dev', '--port', port.toString()], {
    cwd: path.resolve(process.cwd(), '../..'),
    env: { ...process.env },
    stdio: 'pipe'
  })
  CLIENTS.push(p)
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

test.afterAll(async () => {
  await killProcesses()
})

test('Multi-language neighbourhood lifecycle', async ({ browser }) => {
  test.setTimeout(180000)

  // const mode = 'holochain'
  const tmpBase = process.platform === 'darwin' || process.platform === 'linux' ? '/tmp' : os.tmpdir()
  const STORAGE_DIR = path.join(tmpBase, `ad4m-test-mixed-${Date.now()}`)
  if (fs.existsSync(STORAGE_DIR)) fs.rmSync(STORAGE_DIR, { recursive: true, force: true })
  fs.mkdirSync(STORAGE_DIR)

  try {
    const serverPort1 = 3105
    const serverPort2 = 3106
    const clientPort = 5101

    const p1 = await startServer(serverPort1, path.join(STORAGE_DIR, 'agent1'))
    SERVERS.push(p1)
    const p2 = await startServer(serverPort2, path.join(STORAGE_DIR, 'agent2'))
    SERVERS.push(p2)

    await startClient(clientPort)

    const context1 = await browser.newContext({ ignoreHTTPSErrors: true })
    const page1 = await context1.newPage()
    page1.on('console', (msg) => console.log(`[Page1] ${msg.text()}`))

    const context2 = await browser.newContext({ ignoreHTTPSErrors: true })
    const page2 = await context2.newPage()
    page2.on('console', (msg) => console.log(`[Page2] ${msg.text()}`))

    // 1. Go to Home with specific ports
    await page1.goto(`https://localhost:${clientPort}/?port=${serverPort1}`)
    await page2.goto(`https://localhost:${clientPort}/?port=${serverPort2}`)

    // === SCENARIO 1: Libp2p (Sync on Join) ===
    console.log('--- Testing Libp2p Mode (Sync) ---')
    await page1.getByRole('combobox').selectOption('libp2p')
    await page1.getByRole('button', { name: 'Generate ID' }).click()
    const n1 = await page1.getByPlaceholder('e.g. neighbourhood://Qm...').inputValue()
    await page1.getByRole('button', { name: 'Join Neighbourhood' }).click()

    await expect(page1.getByRole('heading', { name: n1 })).toBeVisible()
    await expect(page1.getByText('Chat')).toBeVisible()

    // 1. Send PRE-JOIN message
    const msgPreJoin = 'Pre-Join Message'
    await page1.getByPlaceholder('Type a message...').fill(msgPreJoin)
    await page1.getByRole('button', { name: 'Send' }).click()
    await expect(page1.getByText(msgPreJoin)).toBeVisible()

    // 2. Join Agent 2
    await page2.getByRole('combobox').selectOption('libp2p')
    await page2.getByPlaceholder('e.g. neighbourhood://Qm...').fill(n1)
    await page2.getByRole('button', { name: 'Join Neighbourhood' }).click()
    await expect(page2.getByRole('heading', { name: n1 })).toBeVisible()

    // 3. Check Sync
    await expect(page2.getByText(msgPreJoin)).toBeVisible({ timeout: 60000 })
    console.log('Libp2p Sync on Join Verified')

    // 4. Live Sync
    const msgLive = `Hello Libp2p Live`
    await page1.getByPlaceholder('Type a message...').fill(msgLive)
    await page1.getByRole('button', { name: 'Send' }).click()
    await expect(page2.getByText(msgLive)).toBeVisible({ timeout: 60000 })
    console.log('Libp2p Live Sync Verified')

    // === SCENARIO 2: Persistence ===
    console.log('--- Testing Persistence ---')
    // Kill Agent 1
    p1.kill()
    SERVERS.shift() // Remove from list to avoid double kill
    // Wait a moment
    await new Promise((r) => setTimeout(r, 2000))

    // Restart Agent 1
    console.log('Restarting Server 1...')
    const p1_new = await startServer(serverPort1, path.join(STORAGE_DIR, 'agent1'))
    SERVERS.push(p1_new)

    // Reload Page 1
    await page1.reload()

    // Should be automatically back in the chat (sidebar list)
    await expect(page1.getByRole('button', { name: n1 })).toBeVisible() // In sidebar
    await page1.getByRole('button', { name: n1 }).click() // Click to enter

    // Should see history
    await expect(page1.getByText(msgPreJoin)).toBeVisible()
    await expect(page1.getByText(msgLive)).toBeVisible()
    console.log('Persistence Verified')

    // === SCENARIO 2: Holochain ===
    console.log('--- Testing Holochain Mode ---')

    // Navigate to "Join New" on both pages
    await page1.getByText('+ Join New').click()
    await page2.getByText('+ Join New').click()

    await page1.getByRole('combobox').selectOption('holochain')
    await page1.getByRole('button', { name: 'Generate ID' }).click()
    // Wait for input to change
    await expect(page1.getByPlaceholder('e.g. neighbourhood://Qm...')).not.toHaveValue(n1)
    const n2 = await page1.getByPlaceholder('e.g. neighbourhood://Qm...').inputValue()
    await page1.getByRole('button', { name: 'Join Neighbourhood' }).click()

    // Verify n2 is active
    await expect(page1.getByRole('heading', { name: n2 })).toBeVisible()

    await page2.getByRole('combobox').selectOption('holochain')
    await page2.getByPlaceholder('e.g. neighbourhood://Qm...').fill(n2)
    await page2.getByRole('button', { name: 'Join Neighbourhood' }).click()
    await expect(page2.getByRole('heading', { name: n2 })).toBeVisible()

    // Chat Sync Holochain
    const msg2 = `Hello Holochain from Agent A`
    // We don't need nth(1) anymore, only one chat is visible
    await page1.getByPlaceholder('Type a message...').fill(msg2)
    await page1.getByRole('button', { name: 'Send' }).click()
    await expect(page2.getByText(msg2)).toBeVisible({ timeout: 60000 })
    console.log('Holochain Sync Verified')
  } catch (e) {
    console.error(e)
    throw e
  }
})
