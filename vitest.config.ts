import { fileURLToPath } from 'url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      // Route `require('electron')` (preload scripts) and ESM imports to one
      // stub of vi.fn instances; native require would return the binary path
      // string and bypass vi.mock. The vi.mock in electron-mock.ts targets the
      // same stub, so both resolution paths share instances.
      electron: fileURLToPath(
        new URL('./test/setup/electron-stub.ts', import.meta.url)
      )
    }
  },
  test: {
    environment: 'node',
    globals: true,
    include: ['test/unit/**/*.test.ts'],
    setupFiles: ['test/setup/electron-mock.ts'],
    coverage: {
      provider: 'v8',
      // Instrument the full tree of the unit-tested logic layer (all: true),
      // not just the files a run happens to import, so untested branches count.
      all: true,
      // Scope to the main-process logic modules that are unit-testable. The
      // window/view/dialog/preload UI and the process-entry modules
      // (app, server, registry, connect, main) are integration surfaces; they
      // are covered by the Playwright e2e suite, tracked for expansion in C3,
      // and would otherwise dilute the denominator with code unit tests cannot
      // reach without a running Electron process.
      include: [
        'src/main/env.ts',
        'src/main/cli.ts',
        'src/main/utils.ts',
        'src/main/eventmanager.ts',
        'src/main/eventtypes.ts',
        'src/main/tokens.ts',
        'src/main/config/**/*.ts'
      ],
      exclude: ['**/*.d.ts'],
      thresholds: {
        // Floor for the logic layer as a whole; cli.ts and env.ts still have
        // large untested spawn/discovery branches that pull the aggregate down.
        lines: 48,
        statements: 48,
        functions: 53,
        branches: 37,
        // Lock the well-covered modules at their current level so a future
        // change cannot silently regress them.
        'src/main/eventmanager.ts': {
          lines: 100,
          statements: 100,
          functions: 100,
          branches: 90
        },
        'src/main/config/sessionconfig.ts': {
          lines: 93,
          statements: 93,
          functions: 92,
          branches: 88
        },
        'src/main/config/settings.ts': {
          lines: 90,
          statements: 90,
          functions: 86,
          branches: 73
        },
        'src/main/config/appdata.ts': {
          lines: 75,
          statements: 75,
          functions: 82,
          branches: 62
        }
      }
    }
  }
});
