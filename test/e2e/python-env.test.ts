import { expect, test } from '@playwright/test';
import {
  cleanup,
  LAB_URL,
  launchApp,
  NEEDS_PYTHON,
  pageByTitle,
  pageByUrl
} from './helpers';

// Needs a real Python env with jupyterlab. CI provisions one and points
// JLAB_TEST_PYTHON_PATH at it; locally, set it to any python that has jupyterlab
// installed. Skipped when absent so the suite stays green everywhere.
const pythonPath = process.env.JLAB_TEST_PYTHON_PATH;

test('with a seeded Python env, New notebook opens the labview', async () => {
  test.skip(!pythonPath, NEEDS_PYTHON);
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
    const lab = await pageByUrl(app, LAB_URL);
    expect(lab.url()).toMatch(/\/lab/);
  } finally {
    await app.close();
    cleanup(userDataDir, jupyterDir);
  }
});

// The point of this one is the Electron glue, not JupyterLab: a notebook cell
// evaluated through the labview WebContentsView exercises the whole embedded
// chain (server boots, the kernel connects over the websocket Electron's net
// stack carries, output renders back in the view). 1 + 1 is enough; testing
// numpy here would be testing Python, not Electron.
test('a notebook cell runs through the Electron labview', async () => {
  test.skip(!pythonPath, NEEDS_PYTHON);
  test.setTimeout(180000);
  const { app, userDataDir, jupyterDir } = await launchApp({ pythonPath });
  try {
    const welcome = await pageByTitle(app, /welcome/i);
    const newNotebook = welcome.locator('#new-notebook-link');
    await expect(newNotebook).not.toHaveClass(/disabled/, { timeout: 20000 });
    await newNotebook.click();

    const lab = await pageByUrl(app, LAB_URL);
    // With the seeded env the notebook usually picks the kernel on its own, but
    // a kernel picker can still appear; accept it if it does, don't block if not.
    await lab
      .locator('.jp-Dialog button.jp-mod-accept')
      .click({ timeout: 15000 })
      .catch(() => undefined);

    // Wait for the kernel to finish connecting before running anything, using
    // Galata's readiness check (the status bar stops showing connecting states)
    // rather than a fixed delay.
    await lab.waitForFunction(
      () => {
        const text =
          document.querySelector('#jp-main-statusbar')?.textContent ?? '';
        return !['Connecting', 'Initializing', 'Starting'].some(s =>
          text.includes(s)
        );
      },
      { timeout: 90000 }
    );

    // Drive the active notebook's first cell the way Galata does: target the
    // editor by its textbox role, replace its content, then run with Shift+Enter.
    const cell = lab
      .locator('.jp-NotebookPanel:not(.lm-mod-hidden) .jp-Notebook .jp-Cell')
      .first();
    const editor = cell.getByRole('textbox');
    await editor.click();
    await editor.press('Control+A');
    await editor.pressSequentially('1 + 1');
    await lab.keyboard.press('Shift+Enter');

    const output = cell.locator('.jp-OutputArea-output').first();
    await expect(output).toContainText('2', { timeout: 90000 });
  } finally {
    await app.close();
    cleanup(userDataDir, jupyterDir);
  }
});
