import { _electron as electron, ElectronApplication } from '@playwright/test';
import { stubAllDialogs } from 'electron-playwright-helpers';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// A booted JupyterLab server URL: the labview navigates here once a session is
// up. Shared so every server-backed test waits on the same pattern.
export const LAB_URL = /https?:\/\/(127\.0\.0\.1|localhost):\d+/;

// The env-backed tests need a real Python with jupyterlab; CI provisions one and
// points JLAB_TEST_PYTHON_PATH at it. Shared so the skip reason reads the same
// everywhere.
export const NEEDS_PYTHON =
  'set JLAB_TEST_PYTHON_PATH to a python with jupyterlab';

// A fresh userData dir per launch keeps tests independent. Electron's native
// --user-data-dir flag is honored because the app reads app.getPath('userData')
// (see getUserDataDir in utils) and only overrides it on Snap. Returns the app
// plus the temp userData dir so the caller can clean it up in a finally block.
// If launch fails, the temp dir is removed here so repeated runs don't
// accumulate dirs.
//
// Pass `pythonPath` to seed the app's config before launch so it treats that
// interpreter as a configured environment. Two files are written, matching the
// two seams the app reads: `app-data.json` (`pythonPath` enables the welcome
// actions; `userSetPythonEnvs` registers the env so the session registry
// resolves it) and `settings.json` (`pythonPath` is what a new session reads
// via workspace settings to boot its server).
//
// The spawned Jupyter server inherits the launch env via `{ ...process.env }`
// in src/main/server.ts. Redirecting HOME alone isolates it: jupyter derives its
// config, data and runtime dirs from HOME (~/.jupyter, ~/Library/Jupyter, etc.),
// so with HOME pointed at a temp the server and its kernels/terminal never read
// or write the runner's real Jupyter dirs. Setting JUPYTER_CONFIG_DIR/DATA_DIR/
// RUNTIME_DIR explicitly would be redundant. On macOS, HOME does not move
// Electron's own app.getPath('home') (it uses NSHomeDirectory), but the app's
// own state is already isolated by --user-data-dir; HOME only needs to reach the
// python server, which it does through `...process.env`. The jupyter temp dir is
// returned so the caller can remove it alongside userDataDir.
export async function launchApp(opts?: {
  pythonPath?: string;
}): Promise<{
  app: ElectronApplication;
  userDataDir: string;
  jupyterDir: string;
}> {
  const userDataDir = mkdtempSync(join(tmpdir(), 'jlab-e2e-'));
  const jupyterDir = mkdtempSync(join(tmpdir(), 'jlab-e2e-jupyter-'));
  if (opts?.pythonPath) {
    writeFileSync(
      join(userDataDir, 'app-data.json'),
      JSON.stringify({
        pythonPath: opts.pythonPath,
        userSetPythonEnvs: [
          {
            path: opts.pythonPath,
            name: 'e2e-env',
            type: 'path',
            defaultKernel: 'python3'
          }
        ]
      })
    );
    writeFileSync(
      join(userDataDir, 'settings.json'),
      JSON.stringify({ pythonPath: opts.pythonPath })
    );
  }
  try {
    const app = await electron.launch({
      args: ['.', `--user-data-dir=${userDataDir}`],
      env: {
        ...process.env,
        HOME: jupyterDir
      }
    });
    await stubAllDialogs(app);
    return { app, userDataDir, jupyterDir };
  } catch (error) {
    cleanup(userDataDir, jupyterDir);
    throw error;
  }
}

export function cleanup(userDataDir: string, jupyterDir?: string): void {
  rmSync(userDataDir, { recursive: true, force: true });
  if (jupyterDir) {
    rmSync(jupyterDir, { recursive: true, force: true });
  }
}

// The app opens several windows (titlebar, welcome, session, manager) and most
// have an empty title, so firstWindow() is ambiguous. Poll windows() and match
// on the page title instead. Post Electron 30 a WebContentsView also surfaces
// as its own page here, so title matching stays the reliable selector.
export async function pageByTitle(
  app: ElectronApplication,
  pattern: RegExp,
  timeout = 15000
) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    for (const page of app.windows()) {
      try {
        if (pattern.test(await page.title())) {
          return page;
        }
      } catch {
        // page may be mid-navigation; retry on the next pass
      }
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`no window title matched ${pattern}`);
}

// Wait for any open page whose URL matches `pattern`. Unlike
// electron-playwright-helpers' waitForWindowByUrl, which only resolves on a new
// "window" event, this also catches an in-place navigation of an existing page
// (e.g. the session content view swapping to a remote server URL), so it is the
// reliable wait for "a view reached this URL" regardless of how it got there.
export async function pageByUrl(
  app: ElectronApplication,
  pattern: RegExp,
  timeout = 90000
) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    for (const page of app.windows()) {
      try {
        if (pattern.test(page.url())) {
          return page;
        }
      } catch {
        // page may be closing; retry on the next pass
      }
    }
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw new Error(`no window URL matched ${pattern}`);
}
