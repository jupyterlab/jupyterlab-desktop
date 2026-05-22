import { _electron as electron, expect, test } from '@playwright/test';
import { stubAllDialogs } from 'electron-playwright-helpers';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

let tempUserData: string;

test.beforeEach(() => {
  tempUserData = mkdtempSync(join(tmpdir(), 'jlab-e2e-'));
});

test.afterEach(async () => {
  rmSync(tempUserData, { recursive: true, force: true });
});

test('app launches and shows a window', async () => {
  const app = await electron.launch({
    args: ['.'],
    env: {
      ...process.env,
      JLAB_DESKTOP_HOME: tempUserData,
      ELECTRON_IS_TEST: '1'
    }
  });

  await stubAllDialogs(app);
  const window = await app.firstWindow();
  await window.waitForLoadState('domcontentloaded');

  expect(app.windows().length).toBeGreaterThan(0);
  await app.close();
});

test('app exits with code 0', async () => {
  const app = await electron.launch({
    args: ['.'],
    env: {
      ...process.env,
      JLAB_DESKTOP_HOME: tempUserData,
      ELECTRON_IS_TEST: '1'
    }
  });

  await stubAllDialogs(app);
  await app.firstWindow();

  const exitCode = await app.close();
  expect(exitCode).toBe(0);
});

test('first-run shows env selection when no env configured', async () => {
  const app = await electron.launch({
    args: ['.'],
    env: {
      ...process.env,
      JLAB_DESKTOP_HOME: tempUserData,
      ELECTRON_IS_TEST: '1',
      // empty userData = no prior config = first run
      APPDATA: tempUserData
    }
  });

  await stubAllDialogs(app);
  const window = await app.firstWindow();

  // welcome view or env select should appear within 15s
  await expect(
    window.locator(
      '#welcome-view, #env-select-dialog, [data-testid="env-select"]'
    )
  ).toBeVisible({ timeout: 15000 });

  await app.close();
});
