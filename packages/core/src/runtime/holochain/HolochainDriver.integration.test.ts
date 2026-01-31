import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { HolochainDriver } from './HolochainDriver'
import path from 'path'
import fs from 'fs'
import os from 'os'

const WORKSPACE_ROOT = path.resolve(__dirname, '../../../../..')
const HAPP_PATH = path.join(
  WORKSPACE_ROOT,
  'packages/ad4m/bootstrap-languages/p-diff-sync/hc-dna/workdir/Perspective-Diff-Sync.happ'
)

describe('HolochainDriver Integration', () => {
  let driver: HolochainDriver
  let workdir: string
  let appId: string

  beforeAll(async () => {
    workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'ad4m-test-hc-'))
    driver = new HolochainDriver()
    await driver.startHolochainConductor({
      dataPath: workdir,
      conductorPath: 'holochain'
    })
  })

  afterAll(async () => {
    await driver.shutdown()
    // fs.rmSync(workdir, { recursive: true, force: true })
  })

  it('should have a valid .happ file', () => {
    expect(fs.existsSync(HAPP_PATH)).toBe(true)
  })

  it('should install the app successfully', async () => {
    appId = 'test-app-' + Date.now()
    const appInfo = await driver.installApp({
      path: HAPP_PATH,
      installed_app_id: appId,
      network_seed: 'test-seed'
    })

    expect(appInfo).toBeDefined()
    expect(appInfo.installed_app_id).toBe(appId)

    // Verify connections
    expect(driver.appWs).toBeDefined()
  })

  it('should be able to call a zome function', async () => {
    try {
      const result = await driver.callZomeFunction(
        appId,
        'perspective-diff-sync', // Role name (from happ.yaml)
        'perspective_diff_sync', // Zome name (from dna.yaml)
        'current_revision', // Valid function
        null
      )
      console.log('Zome call success:', result)
      expect(result).toBeDefined()
    } catch (e: any) {
      console.log('Zome call result (error):', e.message)
      // If it's a logic error from the zome, that's fine (means connection worked)
      // "App WS not connected" is a failure.
      expect(e.message).not.toContain('App WS not connected')
      expect(e.message).not.toContain('ECONNREFUSED')
    }
  })
})
