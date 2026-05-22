import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    existsSync: vi.fn(() => false),
    writeFileSync: vi.fn(),
    readFileSync: vi.fn(() => '{}'),
    mkdirSync: vi.fn()
  };
});
vi.mock('child_process', async () => {
  const actual = await vi.importActual<typeof import('child_process')>(
    'child_process'
  );
  return { ...actual, execFileSync: vi.fn(), spawn: vi.fn() };
});
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/tmp/jlab-test'),
    getVersion: vi.fn(() => '1.0.0'),
    getName: vi.fn(() => 'JupyterLab')
  },
  shell: { openPath: vi.fn() }
}));
vi.mock('../../src/main/config/appdata', () => ({
  appData: {
    userSetPythonEnvs: [],
    save: vi.fn()
  },
  ApplicationData: { getSingleton: vi.fn() }
}));
vi.mock('../../src/main/config/settings', () => ({
  userSettings: {
    getValue: vi.fn(() => ''),
    setValue: vi.fn(),
    save: vi.fn()
  },
  SettingType: {
    pythonPath: 'pythonPath',
    pythonEnvsPath: 'pythonEnvsPath',
    condaPath: 'condaPath',
    condaChannels: 'condaChannels',
    systemPythonPath: 'systemPythonPath'
  },
  UserSettings: vi.fn(),
  WorkspaceSettings: vi.fn()
}));
vi.mock('../../src/main/utils', () => ({
  getBundledPythonPath: vi.fn(() => '/bundled/python'),
  getBundledPythonEnvPath: vi.fn(() => '/bundled/env'),
  getBundledEnvInstallerPath: vi.fn(() => '/bundled/installer'),
  getLogFilePath: vi.fn(() => '/tmp/jlab.log'),
  pythonPathForEnvPath: vi.fn((envPath: string) => `${envPath}/bin/python`),
  envPathForPythonPath: vi.fn((pythonPath: string) =>
    pythonPath.replace('/bin/python', '')
  ),
  createCommandScriptInEnv: vi.fn(),
  createTempFile: vi.fn(),
  installCondaPackEnvironment: vi.fn(),
  isBaseCondaEnv: vi.fn(() => false),
  isEnvInstalledByDesktopApp: vi.fn(() => false),
  markEnvironmentAsJupyterInstalled: vi.fn(),
  EnvironmentInstallStatus: {
    RemovingExistingInstallation: 'RemovingExistingInstallation',
    Started: 'Started',
    Cancelled: 'Cancelled',
    Failure: 'Failure',
    Success: 'Success'
  }
}));
vi.mock('../../src/main/env', () => ({
  validateCondaPath: vi.fn(async () => ({ valid: true })),
  validateSystemPythonPath: vi.fn(async () => ({ valid: true })),
  validatePythonEnvironmentInstallDirectory: vi.fn(() => ({
    valid: true,
    message: ''
  })),
  getPythonEnvsDirectory: vi.fn(() => '/home/user/.jlab/envs'),
  getCondaPath: vi.fn(() => ''),
  getCondaChannels: vi.fn(() => []),
  getSystemPythonPath: vi.fn(() => ''),
  condaEnvPathForCondaExePath: vi.fn((p: string) => p),
  runCommandInEnvironment: vi.fn(),
  ICommandRunCallbacks: {}
}));
vi.mock('../../src/main/registry', () => ({ Registry: vi.fn() }));

import {
  addUserSetEnvironment,
  handleEnvSetCondaChannelsCommand,
  handleEnvSetCondaPathCommand,
  handleEnvSetPythonEnvsPathCommand,
  handleEnvSetSystemPythonPathCommand
} from '../../src/main/cli';
import { appData } from '../../src/main/config/appdata';
import { userSettings } from '../../src/main/config/settings';
import * as envModule from '../../src/main/env';

const mockFs = vi.mocked(fs);

beforeEach(() => {
  vi.clearAllMocks();
  (appData as any).userSetPythonEnvs = [];
  (appData as any).save = vi.fn();
  mockFs.existsSync = vi.fn(() => false);
  (userSettings as any).getValue = vi.fn(() => '');
  (userSettings as any).setValue = vi.fn();
  (userSettings as any).save = vi.fn();
  vi.spyOn(envModule, 'validateCondaPath').mockResolvedValue({ valid: true });
  vi.spyOn(envModule, 'validateSystemPythonPath').mockResolvedValue({
    valid: true
  });
  vi.spyOn(
    envModule,
    'validatePythonEnvironmentInstallDirectory'
  ).mockReturnValue({ valid: true, message: '' });
});

// ─── addUserSetEnvironment ────────────────────────────────────────────────────

describe('addUserSetEnvironment', () => {
  it('pushes venv entry to appData.userSetPythonEnvs and saves', () => {
    addUserSetEnvironment('/home/user/myenv', false);
    expect(appData.userSetPythonEnvs).toHaveLength(1);
    expect(appData.userSetPythonEnvs[0].name).toContain('venv');
    expect(appData.save).toHaveBeenCalledOnce();
  });

  it('pushes conda entry when isConda=true', () => {
    addUserSetEnvironment('/home/user/myconda', true);
    expect(appData.userSetPythonEnvs[0].name).toContain('conda');
  });

  it('sets userSettings pythonPath when none configured and env python exists', () => {
    (userSettings as any).getValue = vi.fn(() => '');
    // true only for paths under the env dir; bundled python path won't match regardless of mock
    mockFs.existsSync = vi.fn((p: fs.PathLike) =>
      p.toString().startsWith('/home/user/myenv')
    );
    addUserSetEnvironment('/home/user/myenv', false);
    expect(userSettings.setValue).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining('/home/user/myenv')
    );
    expect(userSettings.save).toHaveBeenCalledOnce();
  });

  it('does not override existing pythonPath', () => {
    (userSettings as any).getValue = vi.fn(() => '/existing/python');
    addUserSetEnvironment('/home/user/myenv', false);
    expect(userSettings.setValue).not.toHaveBeenCalled();
  });
});

// ─── handleEnvSetPythonEnvsPathCommand ───────────────────────────────────────

describe('handleEnvSetPythonEnvsPathCommand', () => {
  it('sets pythonEnvsPath when dir is valid', async () => {
    vi.spyOn(
      envModule,
      'validatePythonEnvironmentInstallDirectory'
    ).mockReturnValue({ valid: true, message: '' });
    await handleEnvSetPythonEnvsPathCommand({
      _: ['set-envs-path', '/my/envs']
    });
    expect(userSettings.setValue).toHaveBeenCalledWith(
      expect.any(String),
      '/my/envs'
    );
    expect(userSettings.save).toHaveBeenCalledOnce();
  });

  it('logs error and skips save when no path provided', async () => {
    const spy = vi.spyOn(console, 'error').mockReturnValue(undefined);
    await handleEnvSetPythonEnvsPathCommand({ _: ['set-envs-path'] });
    expect(spy).toHaveBeenCalled();
    expect(userSettings.setValue).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('logs error and skips save when path is invalid', async () => {
    vi.spyOn(
      envModule,
      'validatePythonEnvironmentInstallDirectory'
    ).mockReturnValue({
      valid: false,
      message: 'not a directory'
    });
    const spy = vi.spyOn(console, 'error').mockReturnValue(undefined);
    await handleEnvSetPythonEnvsPathCommand({
      _: ['set-envs-path', '/bad/path']
    });
    expect(spy).toHaveBeenCalledWith('not a directory');
    expect(userSettings.setValue).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

// ─── handleEnvSetCondaChannelsCommand ────────────────────────────────────────

describe('handleEnvSetCondaChannelsCommand', () => {
  it('sets conda channels from argv slice', async () => {
    await handleEnvSetCondaChannelsCommand({
      _: ['set-conda-channels', 'conda-forge', 'defaults']
    });
    expect(userSettings.setValue).toHaveBeenCalledWith(expect.any(String), [
      'conda-forge',
      'defaults'
    ]);
    expect(userSettings.save).toHaveBeenCalledOnce();
  });

  it('sets empty array when no channels given', async () => {
    await handleEnvSetCondaChannelsCommand({ _: ['set-conda-channels'] });
    expect(userSettings.setValue).toHaveBeenCalledWith(expect.any(String), []);
  });
});

// ─── handleEnvSetSystemPythonPathCommand ─────────────────────────────────────

describe('handleEnvSetSystemPythonPathCommand', () => {
  it('sets systemPythonPath when path is valid', async () => {
    mockFs.existsSync = vi.fn(() => true);
    vi.spyOn(envModule, 'validateSystemPythonPath').mockResolvedValue({
      valid: true
    });
    await handleEnvSetSystemPythonPathCommand({
      _: ['set-sys-python', '/usr/bin/python3']
    });
    expect(userSettings.setValue).toHaveBeenCalledWith(
      expect.any(String),
      '/usr/bin/python3'
    );
    expect(userSettings.save).toHaveBeenCalledOnce();
  });

  it('logs error when path does not exist', async () => {
    mockFs.existsSync = vi.fn(() => false);
    const spy = vi.spyOn(console, 'error').mockReturnValue(undefined);
    await handleEnvSetSystemPythonPathCommand({
      _: ['set-sys-python', '/no/python']
    });
    expect(spy).toHaveBeenCalled();
    expect(userSettings.setValue).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('logs error when path fails validation', async () => {
    mockFs.existsSync = vi.fn(() => true);
    vi.spyOn(envModule, 'validateSystemPythonPath').mockResolvedValue({
      valid: false,
      message: 'not python'
    });
    const spy = vi.spyOn(console, 'error').mockReturnValue(undefined);
    await handleEnvSetSystemPythonPathCommand({
      _: ['set-sys-python', '/bad/python']
    });
    expect(spy).toHaveBeenCalled();
    expect(userSettings.setValue).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('logs error when no path argument given', async () => {
    const spy = vi.spyOn(console, 'error').mockReturnValue(undefined);
    await handleEnvSetSystemPythonPathCommand({ _: ['set-sys-python'] });
    expect(spy).toHaveBeenCalled();
    expect(userSettings.setValue).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

// ─── handleEnvSetCondaPathCommand ────────────────────────────────────────────

describe('handleEnvSetCondaPathCommand', () => {
  it('sets condaPath when path exists and is valid', async () => {
    mockFs.existsSync = vi.fn(() => true);
    vi.spyOn(envModule, 'validateCondaPath').mockResolvedValue({ valid: true });
    await handleEnvSetCondaPathCommand({
      _: ['set-conda-path', '/usr/bin/conda']
    });
    expect(userSettings.setValue).toHaveBeenCalledWith(
      expect.any(String),
      '/usr/bin/conda'
    );
    expect(userSettings.save).toHaveBeenCalledOnce();
  });

  it('logs error when path does not exist', async () => {
    mockFs.existsSync = vi.fn(() => false);
    const spy = vi.spyOn(console, 'error').mockReturnValue(undefined);
    await handleEnvSetCondaPathCommand({ _: ['set-conda-path', '/no/conda'] });
    expect(spy).toHaveBeenCalled();
    expect(userSettings.setValue).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('logs error when conda path fails validation', async () => {
    mockFs.existsSync = vi.fn(() => true);
    vi.spyOn(envModule, 'validateCondaPath').mockResolvedValue({
      valid: false,
      message: 'not conda'
    });
    const spy = vi.spyOn(console, 'error').mockReturnValue(undefined);
    await handleEnvSetCondaPathCommand({ _: ['set-conda-path', '/bad/conda'] });
    expect(spy).toHaveBeenCalled();
    expect(userSettings.setValue).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('logs error when no path argument given', async () => {
    const spy = vi.spyOn(console, 'error').mockReturnValue(undefined);
    await handleEnvSetCondaPathCommand({ _: ['set-conda-path'] });
    expect(spy).toHaveBeenCalled();
    expect(userSettings.setValue).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
