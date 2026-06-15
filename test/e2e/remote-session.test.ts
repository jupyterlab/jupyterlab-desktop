import { expect, test } from '@playwright/test';
import { ChildProcessWithoutNullStreams, spawn } from 'child_process';
import { mkdtempSync, rmSync } from 'fs';
import { createServer } from 'net';
import { dirname, join } from 'path';
import { tmpdir } from 'os';
import { cleanup, launchApp, pageByTitle } from './helpers';

// Drives the "Connect to ... JupyterLab Server" action against a real second
// Jupyter server that this test starts itself (the seeded env's jupyter-lab),
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

// Start jupyter-lab from the same env as `pythonPath` on `port` and resolve once
// its REST API answers (the URL is logged as it binds, a beat before it serves,
// so poll until ready to avoid navigating to a chrome-error page).
async function startRemoteServer(
  rootDir: string,
  port: number
): Promise<{ proc: ChildProcessWithoutNullStreams; url: string }> {
  const jupyter = join(dirname(pythonPath), 'jupyter-lab');
  const proc = spawn(
    jupyter,
    [
      '--no-browser',
      `--port=${port}`,
      '--ip=127.0.0.1',
      `--ServerApp.token=${TOKEN}`,
      `--ServerApp.root_dir=${rootDir}`,
      '--ServerApp.open_browser=False'
    ],
    { env: { ...process.env } }
  );
  proc.on('error', err => {
    throw err;
  });

  const apiUrl = `http://127.0.0.1:${port}/api/status?token=${TOKEN}`;
  const readyBy = Date.now() + 45000;
  for (;;) {
    try {
      const res = await fetch(apiUrl);
      if (res.ok) {
        break;
      }
    } catch {
      // not listening yet
    }
    if (Date.now() > readyBy) {
      throw new Error('remote jupyter server did not become ready');
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }

  return { proc, url: `http://127.0.0.1:${port}/lab?token=${TOKEN}` };
}

test('Connect to a running server opens its labview', async () => {
  test.skip(
    !pythonPath,
    'set JLAB_TEST_PYTHON_PATH to a python with jupyterlab'
  );
  test.setTimeout(150000);

  const rootDir = mkdtempSync(join(tmpdir(), 'jlab-e2e-remote-'));
  const port = await freePort();
  const { proc, url } = await startRemoteServer(rootDir, port);
  const { app, userDataDir, jupyterDir } = await launchApp({ pythonPath });
  try {
    const welcome = await pageByTitle(app, /welcome/i);
    await welcome.locator('a[title^="Connect to an existing"]').click();

    // The connect action opens a modal dialog window. It is a ThemedWindow, so
    // its document title is not distinctive; find it by the URL input it owns.
    const deadline = Date.now() + 20000;
    let dialog = undefined;
    while (Date.now() < deadline && !dialog) {
      for (const page of app.windows()) {
        if ((await page.locator('#server-url').count()) > 0) {
          dialog = page;
          break;
        }
      }
      if (!dialog) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    if (!dialog) {
      throw new Error('remote server connect dialog did not open');
    }

    // Submit the running server's URL through the same IPC the dialog's Enter
    // handler uses, rather than synthesizing keystrokes into the web component.
    await dialog.evaluate((serverUrl: string) => {
      (window as any).electronAPI.setRemoteServerOptions(serverUrl, false);
    }, url);

    // The remote labview loads into the session window's content view, which is
    // an existing page rather than a new window event, so poll the open pages
    // for one that navigated to the remote server.
    const labDeadline = Date.now() + 90000;
    let labUrl = '';
    while (Date.now() < labDeadline && !labUrl) {
      for (const page of app.windows()) {
        const u = page.url();
        if (u.includes(`127.0.0.1:${port}`)) {
          labUrl = u;
          break;
        }
      }
      if (!labUrl) {
        await new Promise(resolve => setTimeout(resolve, 250));
      }
    }
    expect(
      labUrl,
      `no page navigated to 127.0.0.1:${port}; open pages: ${JSON.stringify(
        app.windows().map(p => p.url())
      )}`
    ).toContain(`127.0.0.1:${port}`);
  } finally {
    await app.close();
    cleanup(userDataDir, jupyterDir);
    proc.kill('SIGKILL');
    rmSync(rootDir, { recursive: true, force: true });
  }
});
