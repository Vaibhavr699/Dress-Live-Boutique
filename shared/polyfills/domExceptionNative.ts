import { Platform } from 'react-native';

/**
 * livekit-client uses `new DOMException(...)`. Hermes may omit DOMException or ship a
 * broken binding; always install our constructor on native so LiveKit can load.
 * Real browsers already expose DOMException — leave them untouched (web only).
 */
if (Platform.OS !== 'web') {
  class DOMExceptionPolyfill extends Error {
    constructor(message = '', name = 'Error') {
      super(message);
      this.name = name;
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).DOMException = DOMExceptionPolyfill;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (typeof global !== 'undefined') (global as any).DOMException = DOMExceptionPolyfill;
}

export {};
