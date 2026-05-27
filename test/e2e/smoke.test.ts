import { expect, test } from '@playwright/test';
import { cleanup, launchApp, pageByTitle } from './helpers';

test('app launches and opens at least one window', async () => {
  const { app, userDataDir } = await launchApp();
  try {
    await app.firstWindow();
    expect(app.windows().length).toBeGreaterThan(0);
  } finally {
    await app.close();
    cleanup(userDataDir);
  }
});

test('on first run the Welcome window renders', async () => {
  const { app, userDataDir } = await launchApp();
  try {
    // Selecting by title rather than firstWindow(): the app opens several
    // windows and only this one is the welcome view.
    const welcome = await pageByTitle(app, /welcome/i);
    await welcome.waitForLoadState('domcontentloaded');
    // Assert a Welcome-specific element, not just body, so a blank or error
    // page would fail rather than pass.
    await expect(welcome.locator('#new-notebook-link')).toBeVisible();
  } finally {
    await app.close();
    cleanup(userDataDir);
  }
});

test('app shuts down cleanly without hanging', async () => {
  const { app, userDataDir } = await launchApp();
  try {
    await app.firstWindow();
  } finally {
    // Close in finally so the Electron process is always terminated, even if
    // an earlier step throws. A hang here surfaces via the job timeout.
    await app.close();
    cleanup(userDataDir);
  }
  // close() has resolved, so the process exited and the windows are gone.
  expect(app.windows().length).toBe(0);
});
