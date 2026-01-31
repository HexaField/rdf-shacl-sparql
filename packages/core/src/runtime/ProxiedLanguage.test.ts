import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { DenoRuntime } from './DenoRuntime'
import { ProxiedLanguage } from './ProxiedLanguage'
import path from 'path'
import fs from 'fs'
import os from 'os'
import { LinkExpression } from '../ad4m/types'
import { KeyManager } from '../identity' // Mock generic
import { MockCarrier } from '../network/index' // If needed

describe('ProxiedLanguage Integration', () => {
  let runtime: DenoRuntime
  let tempDir: string
  let tempFile: string
  let proxiedLang: ProxiedLanguage

  beforeAll(async () => {
    runtime = new DenoRuntime()
    await runtime.start()

    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ad4m-proxy-test-'))
    tempFile = path.join(tempDir, 'proxy-lang.ts')

    const code = `
            export default function create(context: any) {
                return {
                    name: 'proxied-language',
                    create: (data: any) => {
                        return {
                            author: 'did:key:mock',
                            timestamp: new Date().toISOString(),
                            data: data,
                            proof: { signature: 'sig', key: 'key' }
                        };
                    },
                    validate: (expr: any) => {
                        return expr.data === 'valid';
                    },
                    apply: (expr: any) => {
                        // console.log("Apply called with", expr);
                    },
                    linksAdapter: {
                        addLink: (link: any) => {
                            // Echo back via signal or just return
                            return { status: 'added', link };
                        },
                        removeLink: (link: any) => {
                            return { status: 'removed', link };
                        }
                    }
                }
            }
        `
    fs.writeFileSync(tempFile, code)

    // Load the language
    const result = await runtime.loadLanguage(tempFile, 'lang1')
    expect(result.success).toBe(true)

    // Create Proxy
    proxiedLang = new ProxiedLanguage(runtime, 'lang1', result)
  })

  afterAll(async () => {
    await runtime.stop()
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  it('should have correct metadata', () => {
    expect(proxiedLang.address).toBe('proxied-language')
    expect(proxiedLang.linksAdapter).toBeDefined()
  })

  it('should proxy create()', async () => {
    // Mock KeyManager
    const km = {} as any
    const expr = await proxiedLang.create('test-data', km)
    expect(expr.data).toBe('test-data')
    expect(expr.proof.signature).toBe('sig')
  })

  it('should proxy validate()', async () => {
    const validExpr = { data: 'valid' } as any
    const invalidExpr = { data: 'invalid' } as any

    expect(await proxiedLang.validate(validExpr)).toBe(true)
    expect(await proxiedLang.validate(invalidExpr)).toBe(false)
  })

  it('should proxy linksAdapter.addLink()', async () => {
    const link = { data: { source: 'A', target: 'B' } } as any
    // The mock returns an object, but interface returns void.
    // DenoRuntime.execute returns ANY, so we can check if it returns what we expect from the mock.
    const res = await proxiedLang.linksAdapter!.addLink(link)
    // @ts-ignore
    expect(res.status).toBe('added')
    // @ts-ignore
    expect(res.link.data.source).toBe('A')
  })
})
