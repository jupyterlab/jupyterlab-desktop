import { expect, test } from '@playwright/test';
import { cleanup, launchApp, pageByTitle } from './helpers';

test('app launches and opens at least one window', async () => {
  const { app, userDataDir, jupyterDir } = await launchApp();
  try {
    await app.firstWindow();
    expect(app.windows().length).toBeGreaterThan(0);
  } finally {
    await app.close();
    cleanup(userDataDir, jupyterDir);
  }
});

test('on first run the Welcome window renders', async () => {
  const { app, userDataDir, jupyterDir } = await launchApp();
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
    cleanup(userDataDir, jupyterDir);
  }
});

test('the session window composes multiple views (titlebar + welcome + content)', async () => {
  const { app, userDataDir, jupyterDir } = await launchApp();
  try {
    // Once the welcome view has settled, the BrowserView/WebContentsView
    // composition should expose several views (titlebar, welcome, content area)
    // as separate pages. A dropped view after the Phase 3 WebContentsView
    // migration would lower this count.
    await pageByTitle(app, /welcome/i);
    await expect
      .poll(() => app.windows().length, { timeout: 10000 })
      .toBeGreaterThanOrEqual(3);
  } finally {
    await app.close();
    cleanup(userDataDir, jupyterDir);
  }
});

test('app shuts down cleanly without hanging', async () => {
  const { app, userDataDir, jupyterDir } = await launchApp();
  try {
    await app.firstWindow();
  } finally {
    // Close in finally so the Electron process is always terminated, even if
    // an earlier step throws. A hang here surfaces via the job timeout.
    await app.close();
    cleanup(userDataDir, jupyterDir);
  }
  // close() has resolved, so the process exited and the windows are gone.
  expect(app.windows().length).toBe(0);
});
