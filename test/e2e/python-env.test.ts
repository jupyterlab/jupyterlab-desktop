import { expect, test } from '@playwright/test';
import { cleanup, launchApp, pageByTitle } from './helpers';

// These tests need a real Python env with jupyterlab. CI provisions one and
// points JLAB_TEST_PYTHON_PATH at it; locally, set it to any python that has
// jupyterlab installed. Skipped when absent so the suite stays green everywhere.
const pythonPath = process.env.JLAB_TEST_PYTHON_PATH;

test.describe('with a seeded Python environment', () => {
  test.skip(
    !pythonPath,
    'set JLAB_TEST_PYTHON_PATH to a python with jupyterlab'
  );

  test('the welcome local-server actions are enabled', async () => {
    const { app, userDataDir } = await launchApp({ pythonPath });
    try {
      const welcome = await pageByTitle(app, /welcome/i);
      await welcome.waitForLoadState('domcontentloaded');
      const newNotebook = welcome.locator('#new-notebook-link');
      await expect(newNotebook).toBeVisible();
      // The app validates the seeded env and emits EnableLocalServerActions,
      // which removes the `disabled` class from the local-server actions.
      await expect(newNotebook).not.toHaveClass(/disabled/, { timeout: 20000 });
    } finally {
      await app.close();
      cleanup(userDataDir);
    }
  });
});
