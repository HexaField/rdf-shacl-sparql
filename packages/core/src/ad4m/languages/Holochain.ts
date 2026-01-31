export interface Dna {
  file: Buffer | string
  nick: string
}

export interface HolochainLanguageDelegate {
  registerDNAs(dnas: Dna[], holochainSignalCallback?: any): Promise<void>
  call(dnaNick: string, zomeName: string, fnName: string, params: object | string): Promise<any>
  callAsync(
    calls: { dnaNick: string; zomeName: string; fnName: string; params: object | string }[],
    timeoutMs?: number
  ): Promise<any[]>
}
