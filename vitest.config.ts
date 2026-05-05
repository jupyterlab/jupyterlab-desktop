import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['test/unit/**/*.test.ts'],
    setupFiles: ['test/setup/electron-mock.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/main/**/*.ts'],
      exclude: ['src/main/**/*.d.ts', 'src/main/main.ts']
    }
  },
  resolve: {
    alias: {
      // redirect electron to the in-process mock so unit tests run without a real Electron binary
      electron: '/Users/notluquis/jupyterlab-desktop/test/setup/electron-mock.ts'
    }
  }
  // Import-path note: test files that call vi.mock() have their mocks hoisted by vitest,
  // which resolves paths from the project root — so '../../../src/main/foo' works.
  // Test files with NO vi.mock() use standard Node.js resolution from the file's directory;
  // those must use '../../src/main/foo' (two levels up to reach the project root).
});
