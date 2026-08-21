import { _electron as electron, expect, test } from '@playwright/test';
import { stubAllDialogs } from 'electron-playwright-helpers';
import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { pageByTitle } from './helpers';

// #824: a corrupt config threw during module import, before any window existed, so the user got Electron's default error dialog and an app that never started again.
//
// Not using launchApp, which seeds valid config; these need the broken kind.
async function launchWith(files: { [name: string]: string }) {
  const userDataDir = mkdtempSync(join(tmpdir(), 'jlab-corrupt-'));
  const jupyterDir = mkdtempSync(join(tmpdir(), 'jlab-corrupt-home-'));
  for (const [name, body] of Object.entries(files)) {
    writeFileSync(join(userDataDir, name), body);
  }

  const cleanup = () => {
    rmSync(userDataDir, { recursive: true, force: true });
    rmSync(jupyterDir, { recursive: true, force: true });
  };

  let app;
  try {
    app = await electron.launch({
      args: ['.', `--user-data-dir=${userDataDir}`],
      env: { ...process.env, HOME: jupyterDir }
    });
  } catch (error) {
    cleanup();
    throw error;
  }
  // same order and the same retry as helpers.ts launchApp: stubAllDialogs evaluates the main process, and at launch a window can be mid-navigation
  await app.firstWindow();
  await stubAllDialogs(app).catch(async () => {
    await new Promise(resolve => setTimeout(resolve, 1000));
    await stubAllDialogs(app);
  });

  return { app, userDataDir, cleanup };
}

test('starts and reaches the welcome view when settings.json is corrupt', async () => {
  const body = '{"theme": "dark", "pythonPath": "/opt/py/bin/python",}';
  const { app, userDataDir, cleanup } = await launchWith({
    'settings.json': body
  });

  try {
    try {
      const welcome = await pageByTitle(app, /welcome/i);
      await expect(welcome.locator('#new-notebook-link')).toBeVisible();
    } finally {
      // closed before the assertions, because the save these must not see runs from will-quit: checking while the app is up cannot fail on it
      await app.close();
    }

    expect(readFileSync(join(userDataDir, 'settings.json'), 'utf8')).toBe(body);
    expect(
      readdirSync(userDataDir).filter(name => name.endsWith('.tmp'))
    ).toEqual([]);
  } finally {
    cleanup();
  }
});

test('starts when app-data.json is truncated, which is what #881 reports', async () => {
  const body = '{"recentSessions": [';
  const { app, userDataDir, cleanup } = await launchWith({
    'app-data.json': body
  });

  try {
    try {
      const welcome = await pageByTitle(app, /welcome/i);
      await expect(welcome.locator('#new-notebook-link')).toBeVisible();
    } finally {
      await app.close();
    }

    expect(readFileSync(join(userDataDir, 'app-data.json'), 'utf8')).toBe(body);
    expect(
      readdirSync(userDataDir).filter(name => name.endsWith('.tmp'))
    ).toEqual([]);
  } finally {
    cleanup();
  }
});
