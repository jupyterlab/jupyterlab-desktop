import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import { execFileSync, spawn } from 'child_process';

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    existsSync: vi.fn(() => true),
    unlinkSync: vi.fn()
  };
});
vi.mock('child_process', async () => {
  const actual = await vi.importActual<typeof import('child_process')>(
    'child_process'
  );
  return { ...actual, execFileSync: vi.fn(), spawn: vi.fn() };
});
vi.mock('../../src/main/env', () => ({
  getCondaPath: vi.fn(() => '/conda/condabin/conda'),
  getSystemPythonPath: vi.fn(() => '/usr/bin/python3'),
  getCondaChannels: vi.fn(() => ['conda-forge']),
  getPythonEnvsDirectory: vi.fn(() => '/envs'),
  condaEnvPathForCondaExePath: vi.fn(() => '/conda'),
  runCommandInEnvironment: vi.fn(async () => true),
  validateCondaPath: vi.fn(async () => ({ valid: true })),
  validateSystemPythonPath: vi.fn(async () => ({ valid: true })),
  validatePythonEnvironmentInstallDirectory: vi.fn(() => ({ valid: true }))
}));
vi.mock('../../src/main/utils', () => ({
  isBaseCondaEnv: vi.fn(() => true),
  createCommandScriptInEnv: vi.fn(() => 'ACTIVATE'),
  createTempFile: vi.fn(() => '/tmp/activate.sh'),
  getBundledPythonEnvPath: vi.fn(() => '/bundled/env'),
  getBundledPythonPath: vi.fn(() => '/bundled/env/bin/python'),
  getBundledEnvInstallerPath: vi.fn(() => '/bundled/installer'),
  getLogFilePath: vi.fn(() => '/tmp/log'),
  installCondaPackEnvironment: vi.fn(),
  isEnvInstalledByDesktopApp: vi.fn(() => false),
  markEnvironmentAsJupyterInstalled: vi.fn(),
  envPathForPythonPath: vi.fn((p: string) => p),
  pythonPathForEnvPath: vi.fn((p: string) => `${p}/bin/python`),
  EnvironmentInstallStatus: {
    Started: 'started',
    Failure: 'failure',
    Cancelled: 'cancelled',
    Success: 'success',
    RemovingExistingInstallation: 'removing'
  }
}));
vi.mock('../../src/main/config/settings', () => ({
  userSettings: { getValue: vi.fn(() => null), setValue: vi.fn() },
  UserSettings: vi.fn(),
  WorkspaceSettings: vi.fn(),
  SettingType: {
    condaPath: 'condaPath',
    condaChannels: 'condaChannels',
    systemPythonPath: 'systemPythonPath',
    pythonEnvsPath: 'pythonEnvsPath'
  }
}));
vi.mock('../../src/main/registry', () => ({ Registry: vi.fn() }));
vi.mock('../../src/main/config/appdata', () => ({
  appData: { userSetPythonEnvs: [], save: vi.fn() },
  ApplicationData: vi.fn()
}));

import {
  createPythonEnvironment,
  launchCLIinEnvironment
} from '../../src/main/cli';
import {
  isBaseCondaEnv,
  markEnvironmentAsJupyterInstalled
} from '../../src/main/utils';
import { runCommandInEnvironment } from '../../src/main/env';

const mockFs = vi.mocked(fs);
const mockSpawn = vi.mocked(spawn);
const mockExecFileSync = vi.mocked(execFileSync);

function makeChild(code = 0) {
  return {
    on: (event: string, cb: (code: number) => void) => {
      if (event === 'close') {
        cb(code);
      }
    }
  } as any;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFs.existsSync = vi.fn(() => true);
  vi.mocked(isBaseCondaEnv).mockReturnValue(true);
  vi.mocked(runCommandInEnvironment).mockResolvedValue(true);
});

describe('launchCLIinEnvironment', () => {
  it('spawns bash with the generated activate script and cleans it up on close', async () => {
    mockSpawn.mockReturnValue(makeChild(0));
    const result = await launchCLIinEnvironment('/envs/a');
    expect(mockSpawn).toHaveBeenCalledWith(
      'bash',
      ['--init-file', '/tmp/activate.sh'],
      expect.objectContaining({ stdio: 'inherit' })
    );
    expect(mockFs.unlinkSync).toHaveBeenCalledWith('/tmp/activate.sh');
    expect(result).toBe(true);
  });
});

describe('createPythonEnvironment', () => {
  it('runs conda-lock install in the base conda env for a conda-lock-file source', async () => {
    await createPythonEnvironment({
      envPath: '/envs/a',
      envType: 'conda',
      sourceType: 'conda-lock-file',
      sourceFilePath: '/tmp/lock.yml',
      condaChannels: ['conda-forge']
    });
    expect(runCommandInEnvironment).toHaveBeenCalledWith(
      '/conda',
      'conda-lock install -p /envs/a /tmp/lock.yml',
      undefined
    );
    expect(markEnvironmentAsJupyterInstalled).toHaveBeenCalled();
  });

  it('throws for a conda env when no base conda environment exists', async () => {
    vi.mocked(isBaseCondaEnv).mockReturnValue(false);
    await expect(
      createPythonEnvironment({ envPath: '/envs/a', envType: 'conda' })
    ).rejects.toThrow(/base conda environment not found/i);
  });

  it('creates a venv via execFileSync on the system python when no base conda exists', async () => {
    vi.mocked(isBaseCondaEnv).mockReturnValue(false);
    mockFs.existsSync = vi.fn(() => true);
    await createPythonEnvironment({ envPath: '/envs/a', envType: 'venv' });
    expect(mockExecFileSync).toHaveBeenCalledWith('/usr/bin/python3', [
      '-m',
      'venv',
      '/envs/a'
    ]);
    expect(markEnvironmentAsJupyterInstalled).toHaveBeenCalled();
  });

  it('throws for a venv when neither base conda nor a system python is available', async () => {
    vi.mocked(isBaseCondaEnv).mockReturnValue(false);
    mockFs.existsSync = vi.fn(() => false);
    await expect(
      createPythonEnvironment({ envPath: '/envs/a', envType: 'venv' })
    ).rejects.toThrow(/python executable not found/i);
  });
});
