import fs from 'node:fs'
import type { Carrier, Envelope } from './index'

export class FileCarrier implements Carrier {
  private handlers: ((env: Envelope) => void)[] = []
  public id: string
  private filePath: string
  private lastReadIndex: number = 0
  private running: boolean = false

  constructor(id: string, filePath: string) {
    this.id = id
    this.filePath = filePath

    // Ensure file exists
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, '')
    } else {
      // Start reading from the end to avoid processing old messages if rebooted?
      // Or read all? Let's read all from now, but ideally in a test we might want a clean slate.
      // For this impl, assume start from 0 is fine, or maybe we want to ignore past?
      // Let's just append.
      const content = fs.readFileSync(filePath, 'utf-8')
      this.lastReadIndex = content.length
    }

    this.startPolling()
  }

  private startPolling() {
    this.running = true
    const check = () => {
      if (!this.running) return
      try {
        if (fs.existsSync(this.filePath)) {
          const stats = fs.statSync(this.filePath)
          if (stats.size > this.lastReadIndex) {
            const buffer = Buffer.alloc(stats.size - this.lastReadIndex)
            const fd = fs.openSync(this.filePath, 'r')
            fs.readSync(fd, buffer, 0, buffer.length, this.lastReadIndex)
            fs.closeSync(fd)

            this.lastReadIndex = stats.size

            const chunk = buffer.toString('utf-8')
            const lines = chunk.split('\n').filter((line) => line.trim().length > 0)

            for (const line of lines) {
              try {
                const envelope = JSON.parse(line) as Envelope
                // Filter: Broadcast or Direct to Me (and typically ignore my own echo in strictly P2P, but here maybe okay)
                if (envelope.recipient === 'broadcast' || envelope.recipient === this.id) {
                  // Don't emit back to sender (echo cancellation)
                  if (envelope.sender !== this.id) {
                    this.handlers.forEach((h) => h(envelope))
                  }
                }
              } catch (e) {
                // Ignore json parse errors
              }
            }
          }
        }
      } catch (e) {
        console.error('FileCarrier polling error', e)
      }
      setTimeout(check, 100)
    }
    check()
  }

  async send(envelope: Envelope): Promise<void> {
    const line = JSON.stringify(envelope) + '\n'
    fs.appendFileSync(this.filePath, line)
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
