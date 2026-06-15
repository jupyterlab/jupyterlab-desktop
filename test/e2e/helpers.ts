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
// in src/main/server.ts, so redirecting the user-layer Jupyter dirs plus HOME
// here isolates the server's runtime/config writes to a per-launch temp instead
// of the runner's real ~/.jupyter and ~/Library/Jupyter. DATA and RUNTIME pass
// straight through. CONFIG is special: server.ts hardcodes the server's
// JUPYTER_CONFIG_DIR to `process.env.JLAB_DESKTOP_CONFIG_DIR || getUserDataDir()`,
// so a plain JUPYTER_CONFIG_DIR here would be ignored for that server; we set
// JLAB_DESKTOP_CONFIG_DIR (the app's own override) to point it at the temp, and
// keep JUPYTER_CONFIG_DIR for any child process that reads it directly. This
// mirrors pytest-jupyter's `jp_environ` fixture. We do
// NOT set JUPYTER_PATH / JUPYTER_CONFIG_PATH: those control the search path for
// installed extensions, and the venv ships its jupyterlab assets under the env
// prefix; overriding them would hide the lab front end. On macOS, setting HOME
// does not move Electron's own app.getPath('home') (it uses NSHomeDirectory),
// but HOME does reach the python server through `...process.env`, which is what
// we want isolated. The jupyter temp dir is returned so the caller can remove
// it alongside userDataDir.
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
        HOME: jupyterDir,
        JLAB_DESKTOP_CONFIG_DIR: jupyterDir,
        JUPYTER_CONFIG_DIR: jupyterDir,
        JUPYTER_DATA_DIR: jupyterDir,
        JUPYTER_RUNTIME_DIR: join(jupyterDir, 'runtime')
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

// Wait for any open page that contains `selector` (a DOM element). Used to find
// a dialog window that has no distinctive document title (e.g. a ThemedWindow),
// by an element it owns rather than by title.
export async function pageByLocator(
  app: ElectronApplication,
  selector: string,
  timeout = 20000
) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    for (const page of app.windows()) {
      try {
        if ((await page.locator(selector).count()) > 0) {
          return page;
        }
      } catch {
        // page may be mid-navigation; retry on the next pass
      }
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`no window contained selector ${selector}`);
}
