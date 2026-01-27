import fs from 'node:fs'
import path from 'node:path'
import type { Carrier, Envelope } from '@template/core'

export class LocalFilesystemCarrier implements Carrier {
  public id: string
  private handlers: ((env: Envelope) => void)[] = []
  private storageDir: string
  private myInbox: string
  private running: boolean = false
  private processedFiles: Set<string> = new Set()

  constructor(id: string, storageBaseDir: string) {
    this.id = id
    this.storageDir = storageBaseDir

    // Setup my storage structure
    const myDir = path.join(this.storageDir, this.id)
    this.myInbox = path.join(myDir, 'inbox')

    if (!fs.existsSync(this.myInbox)) {
      fs.mkdirSync(this.myInbox, { recursive: true })
    }

    this.startPolling()
    console.log(`[Carrier:${id.substring(0, 8)}] Initialized. Listening on ${this.myInbox}`)
  }

  private startPolling() {
    this.running = true
    const check = () => {
      if (!this.running) return
      try {
        // Read inbox
        const files = fs.readdirSync(this.myInbox).filter((f) => f.endsWith('.json'))

        for (const file of files) {
          if (this.processedFiles.has(file)) continue

          const filePath = path.join(this.myInbox, file)
          try {
            const content = fs.readFileSync(filePath, 'utf-8')
            const envelope = JSON.parse(content) as Envelope

            this.handlers.forEach((h) => h(envelope))

            // Mark processed
            this.processedFiles.add(file)

            // Delete processed message? Or move to archive?
            // For this test impl, let's delete to keep directory clean,
            // but maybe processedFiles Set is enough for ephemeral run.
            // Ideally we delete to prevent re-read on restart if we persisted set.
            // But since we are strictly testing live sync:
            fs.unlinkSync(filePath)
            this.processedFiles.delete(file) // Don't need to track deleted files
          } catch (e) {
            console.error(`[Carrier] Error reading message ${file}:`, e)
          }
        }
      } catch (e) {
        console.error('[Carrier] Polling error', e)
      }
      setTimeout(check, 200)
    }
    check()
  }

  async send(envelope: Envelope): Promise<void> {
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.json`
    const content = JSON.stringify(envelope, null, 2)

    if (envelope.recipient === 'broadcast') {
      // Discovery: List all directories in storageDir
      const peers = fs
        .readdirSync(this.storageDir)
        .filter((f) => fs.statSync(path.join(this.storageDir, f)).isDirectory())

      for (const peerDid of peers) {
        // strict p2p: don't send to self via network loopback if local handling manages it.
        // But Envelope/Carrier contract usually expects me to receive my own broadcast?
        // Core's other impl filtered sender !== this.id.
        // Let's send to everyone except me.
        if (peerDid === this.id) continue

        const peerInbox = path.join(this.storageDir, peerDid, 'inbox')
        if (fs.existsSync(peerInbox)) {
          fs.writeFileSync(path.join(peerInbox, fileName), content)
        }
      }
    } else {
      // Direct message
      const peerInbox = path.join(this.storageDir, envelope.recipient, 'inbox')
      if (fs.existsSync(peerInbox)) {
        fs.writeFileSync(path.join(peerInbox, fileName), content)
      } else {
        console.warn(`[Carrier] Recipient ${envelope.recipient} not found or offline.`)
      }
    }
  }

  on(event: 'message', handler: (env: Envelope) => void): void {
    if (event === 'message') {
      this.handlers.push(handler)
    }
  }

  stop() {
    this.running = false
  }
}
