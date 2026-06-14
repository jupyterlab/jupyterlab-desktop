import { expect, test } from '@playwright/test';
import { waitForWindowByUrl } from 'electron-playwright-helpers';
import { cleanup, launchApp, pageByTitle } from './helpers';

// Needs a real Python env with jupyterlab. CI provisions one and points
// JLAB_TEST_PYTHON_PATH at it; locally, set it to any python that has jupyterlab
// installed. Skipped when absent so the suite stays green everywhere.
const pythonPath = process.env.JLAB_TEST_PYTHON_PATH;

test('with a seeded Python env, New notebook opens the labview', async () => {
  test.skip(
    !pythonPath,
    'set JLAB_TEST_PYTHON_PATH to a python with jupyterlab'
  );
  test.setTimeout(120000);
  const { app, userDataDir, jupyterDir } = await launchApp({ pythonPath });
  try {
    const welcome = await pageByTitle(app, /welcome/i);
    // The app validated the seeded env and emitted EnableLocalServerActions,
    // so the local-server action loses its `disabled` class and is clickable.
    const newNotebook = welcome.locator('#new-notebook-link');
    await expect(newNotebook).not.toHaveClass(/disabled/, { timeout: 20000 });
    await newNotebook.click();
    // The session boots a real Jupyter server (via the seeded env) and the
    // labview WebContentsView navigates to it. Assert it reached the local
    // server URL rather than driving the JupyterLab DOM through Electron.
    const lab = await waitForWindowByUrl(
      app,
      /https?:\/\/(127\.0\.0\.1|localhost):\d+/,
      { timeout: 90000 }
    );
    expect(lab.url()).toMatch(/:\d+/);
  } finally {
    await app.close();
    cleanup(userDataDir, jupyterDir);
  }
});
