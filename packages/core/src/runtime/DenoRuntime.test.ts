import { describe, it, expect, afterAll, beforeAll } from 'vitest'
import { DenoRuntime } from './DenoRuntime'
import path from 'path'
import fs from 'fs'
import os from 'os'

describe('DenoRuntime', () => {
  let runtime: DenoRuntime
  let tempDir: string
  let tempFile: string

  beforeAll(() => {
    runtime = new DenoRuntime()
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ad4m-core-test-'))
    tempFile = path.join(tempDir, 'test-lang.ts')

    // Ad4m-style language module:
    // Default export is a factory function that takes 'context' and returns the language object.
    const code = `
            export default function create(context: any) {
                return {
                    name: 'test-language',
                    
                    // Standard method
                    echo: (msg: string) => msg,
                    
                    // Test context injection
                    getTestConfig: () => context.testConfig,
                    
                    // Test RPC back to host
                    testRpc: async () => {
                        try {
                            // This should trigger the handler in DenoRuntime
                            await context.Agent.did();
                            return "rpc-success";
                        } catch(e) {
                            return "rpc-fail: " + e.message;
                        }
                    }
                };
            }
        `

    fs.writeFileSync(tempFile, code)
  })

  afterAll(async () => {
    await runtime.stop()
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  it('should load a language module using the Ad4m factory pattern', async () => {
    await runtime.start()
    const result = await runtime.loadLanguage(tempFile, 'test-lang', { testConfig: 'working' })
    expect(result.success).toBe(true)
    expect(result.name).toBe('test-language')
  })

  it('should execute a function on the instantiated language object', async () => {
    const result = await runtime.execute('test-lang', 'echo', ['hello'])
    expect(result).toBe('hello')
  })

  it('should have access to injected context', async () => {
    const result = await runtime.execute('test-lang', 'getTestConfig')
    expect(result).toBe('working')
  })

  it('should be able to call back to the host (RPC)', async () => {
    const result = await runtime.execute('test-lang', 'testRpc')
    expect(result).toBe('rpc-success')
  })

  it('should handle evaluation', async () => {
    const res = await runtime.eval('1 + 1')
    expect(res).toBe(2)
  })
})
