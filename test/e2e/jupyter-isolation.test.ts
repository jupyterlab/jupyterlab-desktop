import { expect, test } from '@playwright/test';
import { existsSync, readdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import {
  cleanup,
  LAB_URL,
  launchApp,
  NEEDS_PYTHON,
  pageByTitle,
  pageByUrl
} from './helpers';

// Needs a real Python env with jupyterlab. CI provisions one and points
// JLAB_TEST_PYTHON_PATH at it. Skipped when absent so the suite stays green
// everywhere. This proves the embedded Jupyter server writes its runtime state
// to the per-launch temp dirs (HOME / JUPYTER_*_DIR redirected in launchApp,
// matching pytest-jupyter's jp_environ) and leaves the runner's real Jupyter
// runtime dir untouched.
const pythonPath = process.env.JLAB_TEST_PYTHON_PATH;

// Where a non-isolated server would have written its jpserver-*.json. We snapshot
// this before and after the run and assert it gains no new entries.
function realRuntimeDir(): string {
  if (process.platform === 'darwin') {
    return join(homedir(), 'Library', 'Jupyter', 'runtime');
  }
  if (process.platform === 'win32') {
    const appData =
      process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming');
    return join(appData, 'jupyter', 'runtime');
  }
  return join(homedir(), '.local', 'share', 'jupyter', 'runtime');
}

function listDir(dir: string): string[] {
  if (!existsSync(dir)) {
    return [];
  }
  return readdirSync(dir).sort();
}

test('the embedded Jupyter server writes only to the per-launch temp dirs', async () => {
  test.skip(!pythonPath, NEEDS_PYTHON);
  test.setTimeout(120000);

  const realRuntime = realRuntimeDir();
  const realBefore = listDir(realRuntime);

  const { app, userDataDir, jupyterDir } = await launchApp({ pythonPath });
  const tempRuntime = join(jupyterDir, 'runtime');
  try {
    const welcome = await pageByTitle(app, /welcome/i);
    const newNotebook = welcome.locator('#new-notebook-link');
    await expect(newNotebook).not.toHaveClass(/disabled/, { timeout: 20000 });
    await newNotebook.click();

    // Booting the labview means a real Jupyter server came up. Only then is it
    // meaningful to inspect where it wrote its runtime files.
    await pageByUrl(app, LAB_URL);

    // The server used the redirected runtime dir: a connection file landed there.
    const tempRuntimeFiles = listDir(tempRuntime);
    expect(
      tempRuntimeFiles.some(name => /^jpserver-\d+\.json$/.test(name)),
      `expected a jpserver-*.json in ${tempRuntime}, saw ${JSON.stringify(
        tempRuntimeFiles
      )}`
    ).toBe(true);

    // The runner's real runtime dir gained nothing during this run.
    const realAfter = listDir(realRuntime);
    const newReal = realAfter.filter(name => !realBefore.includes(name));
    expect(
      newReal,
      `real Jupyter runtime dir ${realRuntime} gained files: ${JSON.stringify(
        newReal
      )}`
    ).toEqual([]);
  } finally {
    await app.close();
    cleanup(userDataDir, jupyterDir);
  }
});
