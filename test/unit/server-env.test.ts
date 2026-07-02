import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { execFile } from 'child_process';

// Narrow seam under test: JupyterServer.start() must hand the spawned process an
// env that redirects JUPYTER_CONFIG_DIR to the app's userData dir (or the
// JLAB_DESKTOP_CONFIG_DIR override), so the embedded server keeps its config out
// of the runner's real ~/.jupyter. The full start() path is heavily coupled
// (free port, launch-script file, settings, conda dialogs), so we mock those
// boundaries and assert only on the env passed to execFile.

const USER_DATA_DIR = '/tmp/fake-user-data';

vi.mock('child_process', async () => {
  const actual = await vi.importActual<typeof import('child_process')>(
    'child_process'
  );
  return { ...actual, execFile: vi.fn() };
});

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    existsSync: vi.fn(() => true),
    chmodSync: vi.fn(),
    unlinkSync: vi.fn()
  };
});

vi.mock('../../src/main/utils', async importOriginal => {
  const actual = await importOriginal<typeof import('../../src/main/utils')>();
  return {
    ...actual,
    getFreePort: vi.fn(async () => 8899),
    getUserDataDir: vi.fn(() => '/tmp/fake-user-data'),
    createTempFile: vi.fn(() => '/tmp/launch.sh'),
    getEnvironmentPath: vi.fn(() => '/envs/e2e'),
    activatePathForEnvPath: vi.fn(() => '/envs/e2e/bin/activate'),
    waitForDuration: vi.fn(() => new Promise(() => undefined))
  };
});

vi.mock('../../src/main/config/settings', () => ({
  serverLaunchArgsDefault: [],
  serverLaunchArgsFixed: [],
  SettingType: {
    serverArgs: 'serverArgs',
    overrideDefaultServerArgs: 'overrideDefaultServerArgs',
    serverEnvVars: 'serverEnvVars'
  },
  userSettings: {
    resolvedWorkingDirectory: '/work'
  },
  WorkspaceSettings: vi.fn().mockImplementation(function () {
    return {
      getValue: (setting: string) => {
        if (setting === 'serverArgs') {
          return '';
        }
        if (setting === 'overrideDefaultServerArgs') {
          return false;
        }
        if (setting === 'serverEnvVars') {
          return {};
        }
        return undefined;
      }
    };
  })
}));

vi.mock('../../src/main/env', () => ({
  condaEnvPathForCondaExePath: vi.fn(() => ''),
  getCondaPath: vi.fn(() => '')
}));

vi.mock('../../src/main/config/appdata', () => ({
  appData: {
    condaPath: null,
    systemPythonPath: null,
    pythonPath: null
  }
}));

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/tmp/fake-user-data'),
    getAppPath: vi.fn(() => '/app')
  },
  dialog: { showMessageBox: vi.fn(), showMessageBoxSync: vi.fn() },
  ipcMain: { emit: vi.fn(), on: vi.fn(), handle: vi.fn() }
}));

vi.mock('../../src/main/pythonenvdialog/pythonenvdialog', () => ({
  ManagePythonEnvironmentDialog: { Tab: { Settings: 'settings' } }
}));

// start() polls the server URL via http/https.request until it is up. Without a
// real server those requests fail and reschedule a setTimeout retry, leaving
// background timers and connection attempts running after the assertions. Report
// the URL as up immediately so the poll resolves and nothing is left scheduled.
vi.mock('http', () => ({
  request: (_url: unknown, cb: (res: { statusCode: number }) => void) => {
    queueMicrotask(() => cb({ statusCode: 200 }));
    return { on: vi.fn(), end: vi.fn() };
  }
}));
vi.mock('https', () => ({
  request: (_url: unknown, cb: (res: { statusCode: number }) => void) => {
    queueMicrotask(() => cb({ statusCode: 200 }));
    return { on: vi.fn(), end: vi.fn() };
  }
}));

import { JupyterServer } from '../../src/main/server';
import { IEnvironmentType } from '../../src/main/tokens';

const mockExecFile = vi.mocked(execFile);

function makeChild() {
  return {
    on: vi.fn(),
    stdout: { on: vi.fn() },
    stderr: { on: vi.fn() }
  } as any;
}

// Lets the async start() executor run far enough to reach the execFile call:
// it awaits getFreePort (one mocked promise) before building the env.
async function flush() {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve();
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  mockExecFile.mockReturnValue(makeChild());
  // Clear so the userData-dir assertion is hermetic: a developer or CI with
  // JLAB_DESKTOP_CONFIG_DIR set in the ambient env would otherwise make start()
  // legitimately prefer it. unstubAllEnvs in afterEach restores the real value.
  vi.stubEnv('JLAB_DESKTOP_CONFIG_DIR', undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('JupyterServer.start env isolation', () => {
  it('sets JUPYTER_CONFIG_DIR on the spawned server env to the userData dir', async () => {
    const server = new JupyterServer({
      environment: {
        path: '/envs/e2e/bin/python',
        name: 'e2e',
        type: IEnvironmentType.VirtualEnv,
        versions: {},
        defaultKernel: 'python3'
      }
    });

    void server.start().catch(() => undefined);
    await flush();

    expect(mockExecFile).toHaveBeenCalledTimes(1);
    const options = mockExecFile.mock.calls[0][1] as { env: NodeJS.ProcessEnv };
    expect(options.env.JUPYTER_CONFIG_DIR).toBe(USER_DATA_DIR);
  });

  it('prefers the JLAB_DESKTOP_CONFIG_DIR override over the userData dir', async () => {
    vi.stubEnv('JLAB_DESKTOP_CONFIG_DIR', '/override/config');
    const server = new JupyterServer({
      environment: {
        path: '/envs/e2e/bin/python',
        name: 'e2e',
        type: IEnvironmentType.VirtualEnv,
        versions: {},
        defaultKernel: 'python3'
      }
    });

    void server.start().catch(() => undefined);
    await flush();

    const options = mockExecFile.mock.calls[0][1] as {
      env: NodeJS.ProcessEnv;
    };
    expect(options.env.JUPYTER_CONFIG_DIR).toBe('/override/config');
  });
});
