import { Language } from '../ad4m/languages/Language'
import { LinkSyncAdapter } from '../ad4m/languages/LinkSyncAdapter'
import { Expression, Perspective, LinkExpression } from '../ad4m/types'
import { KeyManager } from '../identity'
import { DenoRuntime } from './DenoRuntime'

export class ProxiedLanguage implements Language {
  public readonly address: string
  public readonly linksAdapter?: LinkSyncAdapter

  constructor(
    private runtime: DenoRuntime,
    private handle: string,
    meta: { name?: string; hasLinksAdapter?: boolean } = {}
  ) {
    this.address = meta.name || handle
    if (meta.hasLinksAdapter) {
      this.linksAdapter = new ProxiedLinkSyncAdapter(runtime, handle)
    }
  }

  async create(data: any, author: KeyManager): Promise<Expression> {
    // Pass data to Deno.
    // Note: We don't pass 'author' key manager, assuming Deno context has Agent access if needed.
    return this.runtime.execute(this.handle, 'create', [data])
  }

  async validate(expression: Expression): Promise<boolean> {
    return this.runtime.execute(this.handle, 'validate', [expression])
  }

  async apply(expression: Expression, perspective: Perspective): Promise<void> {
    // Warning: passing 'perspective' is not fully supported yet as it requires
    // bi-directional object proxying for the Perspective methods (add/remove).
    // For now satisfy interface but catch errors if Deno tries to use the missing arg.
    try {
      await this.runtime.execute(this.handle, 'apply', [expression])
    } catch (e) {
      console.warn('ProxiedLanguage.apply failed (expected if language requires perspective arg):', e)
      throw e
    }
  }
}

class ProxiedLinkSyncAdapter implements LinkSyncAdapter {
  constructor(
    private runtime: DenoRuntime,
    private handle: string
  ) {}

  addLink(link: LinkExpression): Promise<void> {
    return this.runtime.execute(this.handle, 'linksAdapter.addLink', [link])
  }
  removeLink(link: LinkExpression): Promise<void> {
    return this.runtime.execute(this.handle, 'linksAdapter.removeLink', [link])
  }
  async addLinks(links: LinkExpression[]): Promise<void> {
    // Optimization: if backend supports batch, use it. Else loop.
    // Assuming simple loop for now or backend support.
    // Let's loop to be safe as interface doesn't strictly imply batch support in runtime.
    for (const link of links) await this.addLink(link)
  }
  async removeLinks(links: LinkExpression[]): Promise<void> {
    for (const link of links) await this.removeLink(link)
  }
}
