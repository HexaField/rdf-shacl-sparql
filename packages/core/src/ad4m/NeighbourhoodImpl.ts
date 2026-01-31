import { PerspectiveImpl } from './Perspective'
import type { Neighbourhood } from './Neighbourhood'
import type { Language } from './languages/Language'
import type { KeyManager } from '../identity'

export class NeighbourhoodImpl extends PerspectiveImpl implements Neighbourhood {
  public readonly url: string
  public readonly language: Language
  private agentKeys: KeyManager
  private sendFn: (payload: any) => Promise<void>

  constructor(
    url: string,
    language: Language,
    agentKeys: KeyManager,
    sendFn: (payload: any) => Promise<void>,
    saveHook?: (data: string) => Promise<void>
  ) {
    super(url, url, saveHook) // ID and Name are the URL for now
    this.url = url
    this.language = language
    this.agentKeys = agentKeys
    this.sendFn = sendFn
  }

  async publish(data: any): Promise<void> {
    // 1. Create Expression
    const expression = await this.language.create(data, this.agentKeys)

    // 2. Apply Locally
    await this.language.apply(expression, this)

    // 3. Broadcast
    const syncPayload = {
      neighbourhoodUrl: this.url,
      expression: expression
    }

    await this.sendFn(syncPayload)
  }
}
