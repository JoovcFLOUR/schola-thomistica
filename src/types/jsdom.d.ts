declare module 'jsdom' {
  export class JSDOM {
    public window: Window & typeof globalThis;
    constructor(html?: string | Buffer, options?: Record<string, unknown>);
  }
}
