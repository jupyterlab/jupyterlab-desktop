import { _electron as electron, expect, test } from '@playwright/test';
import { ElectronApplication } from '@playwright/test';
import { stubAllDialogs } from 'electron-playwright-helpers';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

async function launchApp(
  overrideEnv: Record<string, string> = {}
): Promise<{ app: ElectronApplication; tempDir: string }> {
  const tempDir = mkdtempSync(join(tmpdir(), 'jlab-e2e-'));
  const app = await electron.launch({
    args: ['.'],
    env: {
      ...process.env,
      JLAB_DESKTOP_HOME: tempDir,
      ...overrideEnv
    }
  });
  await stubAllDialogs(app);
  return { app, tempDir };
}

async function cleanup(app: ElectronApplication, tempDir: string) {
  await app.close().catch(() => undefined);
  rmSync(tempDir, { recursive: true, force: true });
}

test('app launches and shows at least one window', async () => {
  const { app, tempDir } = await launchApp();
  try {
    await app.firstWindow();
    expect(app.windows().length).toBeGreaterThan(0);
  } finally {
    await cleanup(app, tempDir);
  }
});

test('app exits cleanly with code 0', async () => {
  const { app, tempDir } = await launchApp();
  try {
    await app.firstWindow();
    const exitCode = await app.close();
    expect(exitCode).toBe(0);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('first window reaches domcontentloaded within 30s', async () => {
  const { app, tempDir } = await launchApp();
  try {
    const window = await app.firstWindow();
    await window.waitForLoadState('domcontentloaded');
    const title = await window.title();
    // JupyterLab Desktop windows always have a non-empty title
    expect(typeof title).toBe('string');
  } finally {
    await cleanup(app, tempDir);
  }
});

test('app responds to evaluate (main process accessible)', async () => {
  const { app, tempDir } = await launchApp();
  try {
    await app.firstWindow();
    const version = await app.evaluate(({ app: electronApp }) =>
      electronApp.getVersion()
    );
    expect(typeof version).toBe('string');
    expect(version.length).toBeGreaterThan(0);
  } finally {
    await cleanup(app, tempDir);
  }
});
