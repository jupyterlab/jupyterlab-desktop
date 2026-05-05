import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

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
      electron: resolve(__dirname, 'test/setup/electron-mock.ts')
    }
  }
});
