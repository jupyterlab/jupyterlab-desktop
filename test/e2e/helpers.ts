import {
  _electron as electron,
  ElectronApplication,
  Locator,
  Page
} from '@playwright/test';
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
    // Point new sessions at the temp jupyter dir so notebooks the test creates
    // (New notebook) land there and get removed with it, instead of the real
    // home. On macOS the spawned server's cwd follows this setting; HOME alone
    // does not move it because Electron resolves home via NSHomeDirectory.
    writeFileSync(
      join(userDataDir, 'settings.json'),
      JSON.stringify({
        pythonPath: opts.pythonPath,
        defaultWorkingDirectory: jupyterDir
      })
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
    // Wait for a window to exist, then stub dialogs. stubAllDialogs evaluates
    // the main process, and at launch a window can be mid-navigation, which
    // makes that evaluate throw "execution context was destroyed". Retry once
    // after a short settle so the race doesn't flake the whole suite.
    await app.firstWindow();
    await stubAllDialogs(app).catch(async () => {
      await new Promise(resolve => setTimeout(resolve, 1000));
      await stubAllDialogs(app);
    });
    return { app, userDataDir, jupyterDir };
  } catch (error) {
    cleanup(userDataDir, jupyterDir);
    throw error;
  }
}

// Open a new notebook from the welcome, run `code` in its first cell, and
// return the labview page plus that cell so the caller can assert on the output
// it produced. Shared by the cell-run and widget-render tests, which differ
// only in the code and what they look for. The cell handling follows Galata
// (textbox role + pressSequentially, the status-bar kernel-ready poll), and the
// kernel picker is accepted only if it appears.
export async function runFirstNotebookCell(
  app: ElectronApplication,
  code: string
): Promise<{ lab: Page; cell: Locator }> {
  const welcome = await pageByTitle(app, /welcome/i);
  const newNotebook = welcome.locator('#new-notebook-link');
  await newNotebook.waitFor({ state: 'visible', timeout: 20000 });
  await newNotebook.click();

  const lab = await pageByUrl(app, LAB_URL);
  await lab
    .locator('.jp-Dialog button.jp-mod-accept')
    .click({ timeout: 15000 })
    .catch(() => undefined);
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

  const cell = lab
    .locator('.jp-NotebookPanel:not(.lm-mod-hidden) .jp-Notebook .jp-Cell')
    .first();
  const editor = cell.getByRole('textbox');
  await editor.click();
  await editor.press('Control+A');
  await editor.pressSequentially(code);
  await lab.keyboard.press('Shift+Enter');
  return { lab, cell };
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
