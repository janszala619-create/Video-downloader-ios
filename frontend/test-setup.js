import { JSDOM } from 'jsdom'

// Node 25 exposes an unconfigured global localStorage; use browser storage in tests.
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: new JSDOM('', { url: 'http://localhost' }).window.localStorage,
})
