import { defineConfig } from 'vitest/config';

export default defineConfig({
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
        lines: 45,
        statements: 45,
        functions: 50,
        branches: 35,
        // Lock the well-covered modules at their current level so a future
        // change cannot silently regress them.
        'src/main/eventmanager.ts': {
          lines: 100,
          statements: 100,
          functions: 100,
          branches: 90
        },
        'src/main/config/sessionconfig.ts': {
          lines: 90,
          statements: 90,
          functions: 90,
          branches: 85
        },
        'src/main/config/settings.ts': {
          lines: 78,
          statements: 78,
          functions: 60,
          branches: 65
        },
        'src/main/config/appdata.ts': {
          lines: 70,
          statements: 70,
          functions: 75,
          branches: 58
        }
      }
    }
  }
});
