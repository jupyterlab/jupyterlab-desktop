import { expect, test } from '@playwright/test';
import { cleanup, launchApp, pageByTitle } from './helpers';

test('app launches and opens at least one window', async () => {
  const { app, home } = await launchApp();
  try {
    await app.firstWindow();
    expect(app.windows().length).toBeGreaterThan(0);
  } finally {
    await app.close();
    cleanup(home);
  }
});

test('on first run the Welcome window renders', async () => {
  const { app, home } = await launchApp();
  try {
    // Selecting by title rather than firstWindow(): the app opens several
    // windows and only this one is the welcome view.
    const welcome = await pageByTitle(app, /welcome/i);
    await welcome.waitForLoadState('domcontentloaded');
    await expect(welcome.locator('body')).toBeVisible();
  } finally {
    await app.close();
    cleanup(home);
  }
});

test('app shuts down cleanly without hanging', async () => {
  const { app, home } = await launchApp();
  try {
    await app.firstWindow();
    // app.close() resolves once the process exits; a hang would fail via the
    // suite timeout. Assert close completes and the windows are gone.
    await app.close();
    expect(app.windows().length).toBe(0);
  } finally {
    cleanup(home);
  }
});
