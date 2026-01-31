import { HolochainDriver } from './HolochainDriver'
import path from 'path'
import fs from 'fs'
import os from 'os'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

async function main() {
  const WORKSPACE_ROOT = path.resolve(__dirname, '../../../../..')
  const HAPP_PATH = path.join(
    WORKSPACE_ROOT,
    'packages/ad4m/bootstrap-languages/p-diff-sync/hc-dna/workdir/Perspective-Diff-Sync.happ'
  )

  if (!fs.existsSync(HAPP_PATH)) {
    console.error('HAPP FILE NOT FOUND:', HAPP_PATH)
    // Try lowercase
    const HAPP_PATH_LOWER = path.join(
      WORKSPACE_ROOT,
      'packages/ad4m/bootstrap-languages/p-diff-sync/hc-dna/workdir/perspective-diff-sync.happ'
    )
    if (!fs.existsSync(HAPP_PATH_LOWER)) {
      console.error('HAPP FILE NOT FOUND (lower):', HAPP_PATH_LOWER)
      process.exit(1)
    }
    console.log('Using lowercase happ path')
  }

  const workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'ad4m-debug-hc-'))
  console.log('Workdir:', workdir)

  const driver = new HolochainDriver()

  // Hook into stdout/stderr directly
  // Driver uses spawn internally.

  try {
    await driver.startHolochainConductor({
      dataPath: workdir,
      conductorPath: 'holochain'
    })

    console.log('Conductor started.')

    const appId = 'debug-app-' + Date.now()
    console.log('Installing app...')
    const appInfo = await driver.installApp({
      path: HAPP_PATH,
      installed_app_id: appId,
      network_seed: 'debug-seed'
    })
    console.log('App Installed:', appInfo)

    console.log('Calling Zome...')
    const result = await driver.callZomeFunction(
      appId,
      'perspective-diff-sync',
      'perspective_diff_sync',
      'current_revision',
      null
    )
    console.log('Zome Result:', result)
  } catch (e) {
    console.error('ERROR:', e)
    console.log('Waiting for logs...')
    await new Promise((r) => setTimeout(r, 5000))
    console.log('Exiting.')
    driver.shutdown()
    process.exit(1)
  } finally {
    await driver.shutdown()
  }
}

main()
