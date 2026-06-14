import { vi } from 'vitest';
import { tmpdir } from 'os';
import { join } from 'path';
import * as electronStub from './electron-stub';

const logFilePath = join(tmpdir(), 'jlab-test.log');

// `electron` is mocked two ways pointing at the same ./electron-stub instances:
//   - vitest.config `resolve.alias` redirects ESM `import ... from 'electron'`.
//   - vitest leaves CJS `require('electron')` (used by the preload scripts)
//     externalized, so it hits Node's require and would return the binary path
//     string. Pre-seeding require.cache for electron's resolved id makes that
//     require return the stub instead. Both paths share electronStub's vi.fns.
try {
  const electronId = require.resolve('electron');
  (require.cache as Record<string, unknown>)[electronId] = {
    id: electronId,
    filename: electronId,
    loaded: true,
    exports: electronStub
  };
} catch {
  // electron not resolvable in this environment; ESM alias still applies.
}

vi.mock('electron-log', () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    transports: {
      file: {
        level: 'info',
        getFile: () => ({ path: logFilePath })
      },
      console: { level: false }
    }
  }
}));
