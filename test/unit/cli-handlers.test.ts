import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';

// Hoisted, because a vi.mock factory runs above every const. Hard-coding the workspace save to false left the --project success branch unreachable and the suite green whichever way it went.
const ws = vi.hoisted(() => ({ saveResult: true }));

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
    save: vi.fn(() => true)
  },
  ApplicationData: { getSingleton: vi.fn() }
}));
vi.mock('../../src/main/config/settings', () => ({
  userSettings: {
    getValue: vi.fn(() => ''),
    setValue: vi.fn(),
    save: vi.fn(() => true),
    // the config handlers read this to decide whether a key may be overridden per project
    settings: { theme: { wsOverridable: true } }
  },
  SettingType: {
    pythonPath: 'pythonPath',
    pythonEnvsPath: 'pythonEnvsPath',
    condaPath: 'condaPath',
    condaChannels: 'condaChannels',
    systemPythonPath: 'systemPythonPath',
    theme: 'theme'
  },
  UserSettings: Object.assign(vi.fn(), {
    getUserSettingsPath: vi.fn(() => '/tmp/jlab-test/settings.json')
  }),
  resolveWorkingDirectory: vi.fn((dir: string) => dir),

  // an arrow function cannot be used with `new`, and a bare vi.fn() constructs an object with none of the methods the handler calls
  WorkspaceSettings: Object.assign(
    vi.fn().mockImplementation(function () {
      return {
        setValue: vi.fn(),
        unsetValue: vi.fn(),
        save: vi.fn(() => ws.saveResult)
      };
    } as any),
    {
      getWorkspaceSettingsPath: vi.fn(
        (dir: string) => `${dir}/.jupyter/desktop-settings.json`
      )
    }
  )
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
  configFileIsUnreadable: vi.fn(() => false),
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
  handleConfigOpenFileCommand,
  handleConfigSetCommand,
  handleConfigUnsetCommand,
  handleEnvActivateCommand,
  handleEnvSetCondaChannelsCommand,
  handleEnvSetCondaPathCommand,
  handleEnvSetPythonEnvsPathCommand,
  handleEnvSetSystemPythonPathCommand,
  handleEnvUpdateRegistryCommand
} from '../../src/main/cli';
import { appData } from '../../src/main/config/appdata';
import { SettingType, userSettings } from '../../src/main/config/settings';
import { resolveWorkingDirectory } from '../../src/main/config/settings';
import * as envModule from '../../src/main/env';
import * as utilsModule from '../../src/main/utils';

const mockFs = vi.mocked(fs);

beforeEach(() => {
  vi.clearAllMocks();
  ws.saveResult = true;
  (appData as any).userSetPythonEnvs = [];
  // save() reports whether the write landed now, and the handlers branch on it
  (appData as any).save = vi.fn(() => true);
  mockFs.existsSync = vi.fn(() => false);
  (userSettings as any).getValue = vi.fn(() => '');
  (userSettings as any).setValue = vi.fn();
  (userSettings as any).save = vi.fn(() => true);
  (utilsModule as any).configFileIsUnreadable = vi.fn(() => false);
  vi.spyOn(envModule, 'validateCondaPath').mockResolvedValue({ valid: true });
  vi.spyOn(envModule, 'validateSystemPythonPath').mockResolvedValue({
    valid: true
  });
  vi.spyOn(
    envModule,
    'validatePythonEnvironmentInstallDirectory'
  ).mockReturnValue({ valid: true, message: '' });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('addUserSetEnvironment', () => {
  it('pushes venv entry to appData.userSetPythonEnvs and saves', () => {
    addUserSetEnvironment('/home/user/myenv', false);
    expect(appData.userSetPythonEnvs).toHaveLength(1);
    expect(appData.userSetPythonEnvs[0].name).toBe('venv: myenv');
    expect(appData.save).toHaveBeenCalledOnce();
  });

  it('pushes conda entry when isConda=true', () => {
    addUserSetEnvironment('/home/user/myconda', true);
    expect(appData.userSetPythonEnvs[0].name).toBe('conda: myconda');
  });

  it('sets userSettings pythonPath when none configured and env python exists', () => {
    (userSettings as any).getValue = vi.fn(() => '');
    // true only for paths under the env dir; bundled python path won't match regardless of mock
    mockFs.existsSync = vi.fn((p: fs.PathLike) =>
      p.toString().startsWith('/home/user/myenv')
    );
    addUserSetEnvironment('/home/user/myenv', false);
    expect(userSettings.setValue).toHaveBeenCalledWith(
      SettingType.pythonPath,
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
      SettingType.pythonEnvsPath,
      '/my/envs'
    );
    expect(userSettings.save).toHaveBeenCalledOnce();
  });

  it('logs error and skips save when no path provided', async () => {
    const spy = vi.spyOn(console, 'error').mockReturnValue(undefined);
    await handleEnvSetPythonEnvsPathCommand({ _: ['set-envs-path'] });
    expect(spy).toHaveBeenCalledWith('Please set a valid envs directory');
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

describe('handleEnvSetCondaChannelsCommand', () => {
  it('sets conda channels from argv slice', async () => {
    await handleEnvSetCondaChannelsCommand({
      _: ['set-conda-channels', 'conda-forge', 'defaults']
    });
    expect(
      userSettings.setValue
    ).toHaveBeenCalledWith(SettingType.condaChannels, [
      'conda-forge',
      'defaults'
    ]);
    expect(userSettings.save).toHaveBeenCalledOnce();
  });

  it('sets empty array when no channels given', async () => {
    await handleEnvSetCondaChannelsCommand({ _: ['set-conda-channels'] });
    expect(userSettings.setValue).toHaveBeenCalledWith(
      SettingType.condaChannels,
      []
    );
  });
});

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
      SettingType.systemPythonPath,
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
    expect(spy).toHaveBeenCalledWith('Python path "/no/python" does not exist');
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
    expect(spy).toHaveBeenCalledWith(
      '"/bad/python" is not a valid Python path'
    );
    expect(userSettings.setValue).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('logs error when no path argument given', async () => {
    const spy = vi.spyOn(console, 'error').mockReturnValue(undefined);
    await handleEnvSetSystemPythonPathCommand({ _: ['set-sys-python'] });
    expect(spy).toHaveBeenCalledWith('Please set a valid Python path');
    expect(userSettings.setValue).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

// Every one of these branches was unreachable: no test set save() to false, so the suite stayed green without running a line of the reporting the pull request is about, and the module mocks would have died on a TypeError before the first assertion if one had.
describe('reporting a refused write', () => {
  const refuseSaves = () => {
    (userSettings as any).save = vi.fn(() => false);
    (appData as any).save = vi.fn(() => false);
    ws.saveResult = false;
  };

  // every refusal here ends in process.exit, so the whole block needs it stubbed or the first one takes the worker with it
  let exit: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    exit = vi
      .spyOn(process, 'exit')
      .mockImplementation((() => undefined) as any);
  });
  // Waits before restoring, so a deferred exit lands while the stub is still up. Three tests here assert only on the message and never await the flush themselves, and their exits reached the real process.exit after the restore: vitest reported an unhandled error while every test in the file still passed, which is the shape that only showed up once stderr was a pipe on CI.
  afterEach(() => exit.mockRestore());

  it('says the file could not be written, and does not claim success', async () => {
    refuseSaves();
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const out = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    mockFs.existsSync = vi.fn(() => true);
    vi.spyOn(envModule, 'validateCondaPath').mockResolvedValue({ valid: true });

    await handleEnvSetCondaPathCommand({
      _: ['set-conda-path', '/usr/bin/conda']
    });

    expect(err).toHaveBeenCalledWith(
      expect.stringContaining('Could not write /tmp/jlab-test/settings.json')
    );
    expect(out).not.toHaveBeenCalled();
    err.mockRestore();
    out.mockRestore();
  });

  // The read guard and a failed write are different refusals, and only one of them is something the reader can act on, so they must not print the same sentence. A workspace save is refused when the global file is the unreadable one, so the message has to name the global rather than the healthy workspace file it was about to write.
  it('names the global file when that is what could not be read', async () => {
    refuseSaves();
    (utilsModule as any).configFileIsUnreadable = vi.fn(
      (p: string) => p === '/tmp/jlab-test/settings.json'
    );
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mockFs.existsSync = vi.fn(() => true);

    await handleConfigSetCommand({
      _: ['set', 'theme', 'dark'],
      project: '/data/nb'
    });

    expect(err).toHaveBeenCalledWith(
      expect.stringContaining('/tmp/jlab-test/settings.json could not be read')
    );
    err.mockRestore();
  });

  // `jlab config set ... && deploy.sh` runs the deploy either way otherwise: stderr carries the message and the status stays 0, which automation cannot tell from success.
  //
  // Asserted on process.exit rather than process.exitCode, because exitCode does not survive Electron's quit and a test for it passes under vitest, which is plain Node. That is the shape this repo calls a green test proving nothing.
  it('exits non-zero rather than only reporting', async () => {
    refuseSaves();
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mockFs.existsSync = vi.fn(() => true);

    try {
      await handleEnvSetCondaPathCommand({
        _: ['set-conda-path', '/usr/bin/conda']
      });
      expect(exit).toHaveBeenCalledWith(1);
    } finally {
      err.mockRestore();
    }
  });

  // addUserSetEnvironment is not CLI-only: app.ts calls it from the InstallBundledPythonEnv handler. A status left behind there sits on a process that is not exiting, and the app reports the whole session as a failure when the user quits hours later.
  it('does not exit on a path the GUI also reaches', async () => {
    refuseSaves();
    (userSettings as any).getValue = vi.fn(() => '');
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const out = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    // the bundled python missing is what sends it down to the env's own python and the save below it; with the bundled one present the whole block is skipped and this asserts nothing
    mockFs.existsSync = vi.fn(
      (target: any) => String(target) !== '/bundled/python'
    ) as any;

    try {
      addUserSetEnvironment('/envs/one', true);
      expect(exit).not.toHaveBeenCalled();
      expect(err).toHaveBeenCalled();
    } finally {
      err.mockRestore();
      out.mockRestore();
    }
  });

  // CLI-only, so nothing here runs inside the long-lived process and it has the same reason to stop as a refused setting.
  it('exits non-zero when the registry refresh could not be written', async () => {
    refuseSaves();
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const out = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    try {
      await handleEnvUpdateRegistryCommand({ _: ['update-registry'] });
      expect(exit).toHaveBeenCalledWith(1);
    } finally {
      err.mockRestore();
      out.mockRestore();
    }
  });

  // The --project branches of both config handlers: the success one was unreachable because the mock pinned the save to false, and unset was not exported at all.
  it('reports a project write it could not make, and says so on success', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const out = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    mockFs.existsSync = vi.fn(() => true);

    try {
      handleConfigUnsetCommand({ _: ['unset', 'theme'], project: '/data/nb' });
      expect(out).toHaveBeenCalled();
      expect(exit).not.toHaveBeenCalled();

      refuseSaves();
      handleConfigUnsetCommand({ _: ['unset', 'theme'], project: '/data/nb' });
      expect(exit).toHaveBeenCalledWith(1);
    } finally {
      err.mockRestore();
      out.mockRestore();
    }
  });

  it('points at the unreadable file instead when that is the reason', async () => {
    refuseSaves();
    (utilsModule as any).configFileIsUnreadable = vi.fn(() => true);
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mockFs.existsSync = vi.fn(() => true);
    vi.spyOn(envModule, 'validateCondaPath').mockResolvedValue({ valid: true });

    await handleEnvSetCondaPathCommand({
      _: ['set-conda-path', '/usr/bin/conda']
    });

    expect(err).toHaveBeenCalledWith(
      expect.stringContaining('could not be read')
    );
    err.mockRestore();
  });
});

describe('handleEnvSetCondaPathCommand', () => {
  it('sets condaPath when path exists and is valid', async () => {
    mockFs.existsSync = vi.fn(() => true);
    vi.spyOn(envModule, 'validateCondaPath').mockResolvedValue({ valid: true });
    await handleEnvSetCondaPathCommand({
      _: ['set-conda-path', '/usr/bin/conda']
    });
    expect(userSettings.setValue).toHaveBeenCalledWith(
      SettingType.condaPath,
      '/usr/bin/conda'
    );
    expect(userSettings.save).toHaveBeenCalledOnce();
  });

  it('logs error when path does not exist', async () => {
    mockFs.existsSync = vi.fn(() => false);
    const spy = vi.spyOn(console, 'error').mockReturnValue(undefined);
    await handleEnvSetCondaPathCommand({ _: ['set-conda-path', '/no/conda'] });
    expect(spy).toHaveBeenCalledWith('conda path "/no/conda" does not exist');
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
    expect(spy).toHaveBeenCalledWith('"/bad/conda" is not a valid conda path');
    expect(userSettings.setValue).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('logs error when no path argument given', async () => {
    const spy = vi.spyOn(console, 'error').mockReturnValue(undefined);
    await handleEnvSetCondaPathCommand({ _: ['set-conda-path'] });
    expect(spy).toHaveBeenCalledWith('Please set a valid conda path');
    expect(userSettings.setValue).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('handleEnvActivateCommand', () => {
  it('rejects an invalid environment directory and does not activate', async () => {
    mockFs.existsSync = vi.fn(() => false);
    const errorSpy = vi.spyOn(console, 'error').mockReturnValue(undefined);
    const logSpy = vi.spyOn(console, 'log').mockReturnValue(undefined);
    await handleEnvActivateCommand({ _: ['env-activate', '/nonexistent/env'] });
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Invalid environment directory')
    );
    expect(logSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('Activating')
    );
    errorSpy.mockRestore();
    logSpy.mockRestore();
  });
});

// `list` prints settingsFilePathFor and `set` writes through new WorkspaceSettings, both of which resolve; open-file built its path from the raw argument, so for a symlinked --project-path it named a file nothing loads and offered it up to be hand-edited.
describe('config open-file names the file the app reads', () => {
  beforeEach(() => {
    vi.mocked(resolveWorkingDirectory).mockImplementation(() => '/resolved');
    vi.mocked(fs.existsSync).mockReturnValue(true);
    // statSync is not in the fs mock factory, so vi.mocked hands back the real one
    vi.spyOn(fs, 'statSync').mockReturnValue({
      isDirectory: () => true,
      isFile: () => true
    } as any);
  });

  it('uses the resolved project path, not the argument', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    handleConfigOpenFileCommand({ projectPath: '/link' });

    const printed = log.mock.calls.map(c => String(c[0])).join('\n');
    expect(printed).toContain('/resolved/.jupyter/desktop-settings.json');
    expect(printed).not.toContain('/link/.jupyter/desktop-settings.json');
    log.mockRestore();
  });
});
