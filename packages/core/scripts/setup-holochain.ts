import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import os from 'os'

const HOLOCHAIN_VERSION = '0.3.6'
const CARGO_CMD = 'cargo'

async function run(cmd: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    console.log(`> ${cmd} ${args.join(' ')}`)
    const p = spawn(cmd, args, { stdio: 'inherit' })
    p.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`Command failed with code ${code}`))
    })
    p.on('error', reject)
  })
}

async function checkVersion(bin: string): Promise<boolean> {
  try {
    const p = spawn(bin, ['--version'])
    return new Promise((resolve) => {
      let out = ''
      p.stdout.on('data', (d) => (out += d.toString()))
      p.on('close', (code) => {
        if (code === 0 && out.includes(HOLOCHAIN_VERSION)) {
          console.log(`Found holochain ${out.trim()}`)
          resolve(true)
        } else {
          if (code === 0) console.log(`Found holochain but wrong version: ${out.trim()}`)
          resolve(false)
        }
      })
      p.on('error', () => resolve(false))
    })
  } catch {
    return false
  }
}

async function main() {
  // 1. Check if holochain is in PATH or Cargo bin
  const cargoBin = path.join(os.homedir(), '.cargo', 'bin', 'holochain')

  // Check PATH first
  if (await checkVersion('holochain')) {
    console.log('Holochain already installed in PATH.')
    process.exit(0)
  }

  // Check Cargo Bin
  if (fs.existsSync(cargoBin)) {
    if (await checkVersion(cargoBin)) {
      console.log(`Holochain already installed at ${cargoBin}`)
      process.exit(0)
    }
  }

  console.log(`Installing Holochain v${HOLOCHAIN_VERSION} via Cargo... (This may take a while)`)
  try {
    await run(CARGO_CMD, ['install', 'holochain', '--version', HOLOCHAIN_VERSION, '--locked'])
    console.log('Successfully installed Holochain.')
  } catch (e) {
    console.error('Failed to install Holochain:', e)
    process.exit(1)
  }
}

main()
