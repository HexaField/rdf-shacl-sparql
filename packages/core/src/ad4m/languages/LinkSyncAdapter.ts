import type { LinkExpression } from '../types'

export interface LinkSyncAdapter {
  addLink(link: LinkExpression): Promise<void>
  removeLink(link: LinkExpression): Promise<void>
  addLinks(links: LinkExpression[]): Promise<void>
  removeLinks(links: LinkExpression[]): Promise<void>
}
