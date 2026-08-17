import { _electron as electron, expect, test } from '@playwright/test';
import { stubAllDialogs } from 'electron-playwright-helpers';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { pageByTitle } from './helpers';

// #824: a corrupt config threw during module import, before any window existed,
// so the user got Electron's default error dialog and an app that never started
// again.
//
// Not using launchApp, which seeds valid config; these need the broken kind.
// The notice the app shows is a message box, and Electron's dialog docs note
// that on macOS one without a parent window runs synchronously, so a regression
// that shows it before the first window hangs these rather than failing with a
// message.
async function launchWith(files: { [name: string]: string }) {
  const userDataDir = mkdtempSync(join(tmpdir(), 'jlab-corrupt-'));
  const jupyterDir = mkdtempSync(join(tmpdir(), 'jlab-corrupt-home-'));
  for (const [name, body] of Object.entries(files)) {
    writeFileSync(join(userDataDir, name), body);
  }

  const app = await electron.launch({
    args: ['.', `--user-data-dir=${userDataDir}`],
    env: { ...process.env, HOME: jupyterDir }
  });
  await app.firstWindow();
  await stubAllDialogs(app);

  return {
    app,
    userDataDir,
    cleanup: () => {
      rmSync(userDataDir, { recursive: true, force: true });
      rmSync(jupyterDir, { recursive: true, force: true });
    }
  };
}

test('starts and reaches the welcome view when settings.json is corrupt', async () => {
  const body = '{"theme": "dark", "pythonPath": "/opt/py/bin/python",}';
  const { app, userDataDir, cleanup } = await launchWith({
    'settings.json': body
  });

  try {
    const welcome = await pageByTitle(app, /welcome/i);
    await expect(welcome.locator('#new-notebook-link')).toBeVisible();

    // the file the app could not read is left exactly as it was
    expect(readFileSync(join(userDataDir, 'settings.json'), 'utf8')).toBe(body);
  } finally {
    await app.close();
    cleanup();
  }
});

test('starts when app-data.json is truncated, which is what #881 reports', async () => {
  const body = '{"recentSessions": [';
  const { app, userDataDir, cleanup } = await launchWith({
    'app-data.json': body
  });

  try {
    const welcome = await pageByTitle(app, /welcome/i);
    await expect(welcome.locator('#new-notebook-link')).toBeVisible();

    expect(readFileSync(join(userDataDir, 'app-data.json'), 'utf8')).toBe(body);
  } finally {
    await app.close();
    cleanup();
  }
});
