import { expect, test } from '@playwright/test';
import { ChildProcessWithoutNullStreams, spawn } from 'child_process';
import { mkdtempSync, rmSync } from 'fs';
import { createServer } from 'net';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  cleanup,
  launchApp,
  NEEDS_PYTHON,
  pageByLocator,
  pageByTitle,
  pageByUrl
} from './helpers';

// Drives the "Connect to ... JupyterLab Server" action against a real second
// Jupyter server that this test starts itself (the seeded env's jupyterlab),
// then asserts the labview connects to that external server's URL. The remote
// dialog submits via window.electronAPI.setRemoteServerOptions; we call it from
// the dialog page rather than synthesizing keystrokes into the jp-text-field
// web component, so the test exercises the real link -> dialog -> main-process
// remote-session path without depending on custom-element keyboard behavior.
const pythonPath = process.env.JLAB_TEST_PYTHON_PATH;

const TOKEN = 'e2e-remote-token';

// Reserve a free port (jupyter's --port=0 logs a literal :0 here rather than
// picking one), then release it for jupyter to bind.
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const port = (srv.address() as { port: number }).port;
      srv.close(() => resolve(port));
    });
  });
}

// Start a Jupyter server from the seeded env on `port`, isolated to its own
// temp HOME / JUPYTER_* dirs so it never touches the runner's real config, and
// resolve once its REST API answers. `python -m jupyterlab` is used instead of
// the jupyter-lab launcher path so this works the same on Windows, macOS, and
// Linux. The URL is logged as the server binds, a beat before it serves, so
// poll the API until ready to avoid navigating to a chrome-error page.
async function startRemoteServer(
  rootDir: string,
  serverHome: string,
  port: number
): Promise<ChildProcessWithoutNullStreams> {
  const proc = spawn(
    pythonPath,
    [
      '-m',
      'jupyterlab',
      '--no-browser',
      `--port=${port}`,
      '--ip=127.0.0.1',
      `--ServerApp.token=${TOKEN}`,
      `--ServerApp.root_dir=${rootDir}`,
      '--ServerApp.open_browser=False'
    ],
    {
      env: {
        ...process.env,
        HOME: serverHome,
        JUPYTER_CONFIG_DIR: serverHome,
        JUPYTER_DATA_DIR: serverHome,
        JUPYTER_RUNTIME_DIR: join(serverHome, 'runtime')
      }
    }
  );

  let spawnError: Error | undefined;
  proc.on('error', err => {
    spawnError = err;
  });

  const apiUrl = `http://127.0.0.1:${port}/api/status?token=${TOKEN}`;
  const readyBy = Date.now() + 45000;
  for (;;) {
    if (spawnError) {
      throw spawnError;
    }
    try {
      const res = await fetch(apiUrl);
      if (res.ok) {
        return proc;
      }
    } catch {
      // not listening yet
    }
    if (Date.now() > readyBy) {
      throw new Error('remote jupyter server did not become ready');
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
}

test('Connect to a running server opens its labview', async () => {
  test.skip(!pythonPath, NEEDS_PYTHON);
  test.setTimeout(150000);

  const rootDir = mkdtempSync(join(tmpdir(), 'jlab-e2e-remote-'));
  const serverHome = mkdtempSync(join(tmpdir(), 'jlab-e2e-remote-home-'));
  const port = await freePort();
  const url = `http://127.0.0.1:${port}/lab?token=${TOKEN}`;
  const proc = await startRemoteServer(rootDir, serverHome, port);
  const { app, userDataDir, jupyterDir } = await launchApp({ pythonPath });
  try {
    const welcome = await pageByTitle(app, /welcome/i);
    await welcome.locator('#connect-remote-link').click();

    // The connect action opens a modal ThemedWindow whose document title is not
    // distinctive; find it by the URL input it owns, then submit the running
    // server's URL through the same IPC the dialog's Enter handler uses. The
    // window loads asynchronously, so its page handle can briefly go stale as it
    // navigates ("Target page has been closed"); re-find and submit until it
    // sticks. evaluate runs once on success, so the IPC is sent at most once.
    await expect(async () => {
      const dialog = await pageByLocator(app, '#server-url', 5000);
      await dialog.evaluate((serverUrl: string) => {
        (window as any).electronAPI.setRemoteServerOptions(serverUrl, false);
      }, url);
    }).toPass({ timeout: 20000 });

    // The remote labview loads into the existing session content view, so wait
    // on the page URL rather than a new-window event.
    const lab = await pageByUrl(app, new RegExp(`127\\.0\\.0\\.1:${port}`));
    expect(lab.url()).toContain(`127.0.0.1:${port}/lab`);
  } finally {
    await app.close();
    cleanup(userDataDir, jupyterDir);
    proc.kill('SIGKILL');
    rmSync(rootDir, { recursive: true, force: true });
    rmSync(serverHome, { recursive: true, force: true });
  }
});
