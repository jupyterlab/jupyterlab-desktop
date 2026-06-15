import { expect, test } from '@playwright/test';
import { stubDialog, waitForWindowByUrl } from 'electron-playwright-helpers';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { cleanup, launchApp, pageByTitle } from './helpers';

// These cover the welcome-page session actions other than New notebook (which
// python-env.test.ts already exercises): New session (blank lab), Open folder,
// and Open file. Each boots a real Jupyter server via the seeded env and the
// labview navigates to the local server URL, so the assertion is the same
// shape as the New notebook case: a window reaches http://127.0.0.1:<port>.
// The two Open variants drive dialog.showOpenDialog, stubbed to return a known
// path so no native file picker blocks the run.
const pythonPath = process.env.JLAB_TEST_PYTHON_PATH;

const LAB_URL = /https?:\/\/(127\.0\.0\.1|localhost):\d+/;

// The welcome page renders a single unified "Open..." action on macOS and two
// separate "Open File..." / "Open Folder..." actions elsewhere, so select the
// link by platform. The macOS link drives the same showOpenDialog with both
// openFile and openDirectory enabled, so a stubbed folder or file path works
// through whichever link the current OS shows.
const openFolderLink =
  process.platform === 'darwin'
    ? '#open-file-or-folder-link'
    : '#open-folder-link';
const openFileLink =
  process.platform === 'darwin'
    ? '#open-file-or-folder-link'
    : '#open-file-link';

test('New session opens a blank labview', async () => {
  test.skip(
    !pythonPath,
    'set JLAB_TEST_PYTHON_PATH to a python with jupyterlab'
  );
  test.setTimeout(120000);
  const { app, userDataDir, jupyterDir } = await launchApp({ pythonPath });
  try {
    const welcome = await pageByTitle(app, /welcome/i);
    const newSession = welcome.locator('#new-session-link');
    await expect(newSession).not.toHaveClass(/disabled/, { timeout: 20000 });
    await newSession.click();
    const lab = await waitForWindowByUrl(app, LAB_URL, { timeout: 90000 });
    expect(lab.url()).toMatch(/:\d+/);
  } finally {
    await app.close();
    cleanup(userDataDir, jupyterDir);
  }
});

test('Open folder boots a session in the chosen directory', async () => {
  test.skip(
    !pythonPath,
    'set JLAB_TEST_PYTHON_PATH to a python with jupyterlab'
  );
  test.setTimeout(120000);
  const projectDir = mkdtempSync(join(tmpdir(), 'jlab-e2e-project-'));
  const { app, userDataDir, jupyterDir } = await launchApp({ pythonPath });
  try {
    // The handler reads the directory from showOpenDialog, so return the temp
    // project dir instead of popping the native picker.
    await stubDialog(app, 'showOpenDialog', {
      canceled: false,
      filePaths: [projectDir]
    });
    const welcome = await pageByTitle(app, /welcome/i);
    const openFolder = welcome.locator(openFolderLink);
    await expect(openFolder).not.toHaveClass(/disabled/, { timeout: 20000 });
    await openFolder.click();
    const lab = await waitForWindowByUrl(app, LAB_URL, { timeout: 90000 });
    expect(lab.url()).toMatch(/:\d+/);
  } finally {
    await app.close();
    cleanup(userDataDir, jupyterDir);
    rmSync(projectDir, { recursive: true, force: true });
  }
});

test('Open file boots a session for the chosen notebook', async () => {
  test.skip(
    !pythonPath,
    'set JLAB_TEST_PYTHON_PATH to a python with jupyterlab'
  );
  test.setTimeout(120000);
  const projectDir = mkdtempSync(join(tmpdir(), 'jlab-e2e-project-'));
  const notebook = join(projectDir, 'opened.ipynb');
  writeFileSync(
    notebook,
    JSON.stringify({ cells: [], metadata: {}, nbformat: 4, nbformat_minor: 5 })
  );
  const { app, userDataDir, jupyterDir } = await launchApp({ pythonPath });
  try {
    await stubDialog(app, 'showOpenDialog', {
      canceled: false,
      filePaths: [notebook]
    });
    const welcome = await pageByTitle(app, /welcome/i);
    const openFile = welcome.locator(openFileLink);
    await expect(openFile).not.toHaveClass(/disabled/, { timeout: 20000 });
    await openFile.click();
    const lab = await waitForWindowByUrl(app, LAB_URL, { timeout: 90000 });
    expect(lab.url()).toMatch(/:\d+/);
  } finally {
    await app.close();
    cleanup(userDataDir, jupyterDir);
    rmSync(projectDir, { recursive: true, force: true });
  }
});
