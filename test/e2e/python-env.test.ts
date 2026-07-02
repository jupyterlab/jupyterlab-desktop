import { expect, test } from '@playwright/test';
import {
  cleanup,
  LAB_URL,
  launchApp,
  NEEDS_PYTHON,
  pageByTitle,
  pageByUrl,
  runFirstNotebookCell
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
    const { cell } = await runFirstNotebookCell(app, '1 + 1');
    const output = cell.locator('.jp-OutputArea-output').first();
    await expect(output).toContainText('2', { timeout: 90000 });
  } finally {
    await app.close();
    cleanup(userDataDir, jupyterDir);
  }
});

// ipywidgets is one of the bundled labextensions. A widget rendering is the
// Electron-relevant part: the widget comm rides the kernel websocket Electron
// carries and the view draws the control in the WebContentsView. A jlab bump
// that breaks widget rendering in the embedded view shows up here, where
// jupyter labextension list (a plain compatibility check) would not.
test('a bundled labextension (ipywidgets) renders in the labview', async () => {
  test.skip(!pythonPath, NEEDS_PYTHON);
  test.setTimeout(180000);
  const { app, userDataDir, jupyterDir } = await launchApp({ pythonPath });
  try {
    const { cell } = await runFirstNotebookCell(
      app,
      'from ipywidgets import IntSlider; IntSlider(value=7)'
    );
    const slider = cell.locator('.jupyter-widgets.widget-slider').first();
    await expect(slider).toBeVisible({ timeout: 90000 });
  } finally {
    await app.close();
    cleanup(userDataDir, jupyterDir);
  }
});

// A jlab bump can break how the lab UI itself draws in the WebContentsView
// without touching the notebook path the cell test exercises. Assert the
// chrome the labview renders on load: the file browser, the side bars, the menu
// bar and the status bar.
test('the labview renders the JupyterLab UI chrome', async () => {
  test.skip(!pythonPath, NEEDS_PYTHON);
  test.setTimeout(120000);
  const { app, userDataDir, jupyterDir } = await launchApp({ pythonPath });
  try {
    const welcome = await pageByTitle(app, /welcome/i);
    await welcome.locator('#new-session-link').click({ timeout: 20000 });
    const lab = await pageByUrl(app, LAB_URL);
    await expect(lab.locator('.jp-FileBrowser').first()).toBeVisible({
      timeout: 60000
    });
    await expect(lab.locator('.jp-SideBar').first()).toBeVisible();
    await expect(lab.locator('.lm-MenuBar').first()).toBeVisible();
    await expect(lab.locator('#jp-main-statusbar')).toBeVisible();
  } finally {
    await app.close();
    cleanup(userDataDir, jupyterDir);
  }
});

// Non-ASCII output rendering through the WebContentsView, the manual check from
// past JupyterLab bump PRs (arm64 ICU). A cell that prints accented, CJK and
// Greek text and renders it back confirms text rendering is intact in the
// embedded view after a bump.
test('the labview renders non-ASCII output through Electron', async () => {
  test.skip(!pythonPath, NEEDS_PYTHON);
  test.setTimeout(180000);
  const { app, userDataDir, jupyterDir } = await launchApp({ pythonPath });
  try {
    const text = 'café ñoño 日本語 αβγ';
    const { cell } = await runFirstNotebookCell(
      app,
      `print(${JSON.stringify(text)})`
    );
    const output = cell.locator('.jp-OutputArea-output').first();
    await expect(output).toContainText(text, { timeout: 90000 });
  } finally {
    await app.close();
    cleanup(userDataDir, jupyterDir);
  }
});
