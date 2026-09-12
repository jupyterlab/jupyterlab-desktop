import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { constants as fsConstants } from 'node:fs';
import * as fs from 'fs';
import * as path from 'path';
import { app, nativeTheme } from 'electron';
import log from 'electron-log';

// randomBytes is a named import in the source, so its binding is fixed at import time and reassigning the module does nothing. Hoisted flag, because the factory runs above every const.
const entropy = vi.hoisted(() => ({ fails: false }));
vi.mock('crypto', async () => {
  const actual = await vi.importActual<typeof import('crypto')>('crypto');
  return {
    ...actual,
    randomBytes: (n: number) => {
      if (entropy.fails) {
        throw new Error('no entropy');
      }
      return actual.randomBytes(n);
    }
  };
});

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    existsSync: vi.fn(),
    lstatSync: vi.fn(),
    statSync: vi.fn(),
    openSync: vi.fn(),
    fsyncSync: vi.fn(),
    closeSync: vi.fn(),
    unlinkSync: vi.fn(),
    accessSync: vi.fn(),
    readlinkSync: vi.fn(),
    mkdtempSync: vi.fn(),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
    rmSync: vi.fn(),
    readFileSync: vi.fn(),
    renameSync: vi.fn(),
    realpathSync: vi.fn(),
    fchownSync: vi.fn(),
    fchmodSync: vi.fn()
  };
});
vi.mock('net', async () => {
  const actual = await vi.importActual<typeof import('net')>('net');
  return { ...actual, Socket: vi.fn(), createServer: vi.fn() };
});
vi.mock('child_process', async () => {
  const actual = await vi.importActual<typeof import('child_process')>(
    'child_process'
  );
  return {
    ...actual,
    exec: vi.fn(),
    execFile: vi.fn(),
    execFileSync: vi.fn(),
    execSync: vi.fn()
  };
});
vi.mock('os', async () => {
  const actual = await vi.importActual<typeof import('os')>('os');
  return { ...actual, tmpdir: vi.fn(() => '/tmp') };
});

import {
  activatePathForEnvPath,
  bundledEnvironmentIsInstalled,
  clearSession,
  condaSourcePathForEnvPath,
  createCommandScriptInEnv,
  createTempFile,
  DarkThemeBGColor,
  deletePythonEnvironment,
  EnvironmentDeleteStatus,
  envPathForPythonPath,
  getFreePort,
  getJlabCLICommandSymlinkPath,
  getJlabCLICommandTargetPath,
  getLogFilePath,
  getRelativePathToUserHome,
  getUnreadableConfigFiles,
  getUserHomeDir,
  isBaseCondaEnv,
  isCondaEnv,
  isDarkTheme,
  isDevMode,
  isEnvInstalledByDesktopApp,
  isPortInUse,
  isSameServerOrigin,
  jlabCLICommandIsSetup,
  jupyterEnvInstallInfoPathForEnvPath,
  LightThemeBGColor,
  markEnvironmentAsJupyterInstalled,
  matchesScheme,
  openDirectoryInExplorer,
  originOf,
  pythonPathForEnvPath,
  readJsonConfigFile,
  resetConfigFile,
  versionWithoutSuffix,
  waitForDuration,
  waitForFunction,
  writeJsonConfigFile
} from '../../src/main/utils';
import * as childProcess from 'child_process';
import * as net from 'net';

const mockFs = vi.mocked(fs);

// Stubbing process.platform does not restage path: it binds win32 or posix at import, from the real host. So a function that branches on the platform runs the branch the test asked for, and joins it with the host's separator. These assertions are about layout, not about which slash, so they compare in one.
const toSlash = (p: string) => p.split(path.sep).join('/');

// Reset the fs stubs to fresh no-op fns before every test so a value set in
// one test cannot leak into a later one that does not set it.
beforeEach(() => {
  vi.clearAllMocks();
  mockFs.existsSync = vi.fn();
  mockFs.lstatSync = vi.fn();
  mockFs.statSync = vi.fn();
  mockFs.accessSync = vi.fn();
  mockFs.readlinkSync = vi.fn();
  mockFs.writeFileSync = vi.fn();
  mockFs.mkdirSync = vi.fn();
  mockFs.rmSync = vi.fn();
  mockFs.readFileSync = vi.fn();
  mockFs.renameSync = vi.fn();
  // the config writer reaches for these; without a reset here the stubs the write describes install would leak into every test that runs after them
  mockFs.openSync = vi.fn();
  mockFs.fsyncSync = vi.fn();
  mockFs.closeSync = vi.fn();
  mockFs.unlinkSync = vi.fn();
  mockFs.realpathSync = vi.fn();
  mockFs.fchownSync = vi.fn();
  mockFs.fchmodSync = vi.fn();
});

describe('isDarkTheme', () => {
  it.each([
    ['light', false],
    ['dark', true]
  ])('"%s" → %s', (theme, expected) => {
    expect(isDarkTheme(theme)).toBe(expected);
  });

  it('falls back to nativeTheme.shouldUseDarkColors for unknown value', () => {
    (nativeTheme as any).shouldUseDarkColors = false;
    expect(isDarkTheme('system')).toBe(false);
    (nativeTheme as any).shouldUseDarkColors = true;
    expect(isDarkTheme('system')).toBe(true);
    (nativeTheme as any).shouldUseDarkColors = false;
  });
});

describe('versionWithoutSuffix', () => {
  it.each([
    ['3.6.0a1', '3.6.0'],
    ['4.0.0b2', '4.0.0'],
    ['4.4.7', '4.4.7'],
    ['1.0.0rc1', '1.0.0']
  ])('"%s" → "%s"', (input, expected) => {
    expect(versionWithoutSuffix(input)).toBe(expected);
  });
});

describe('pythonPathForEnvPath', () => {
  const originalPlatform = process.platform;

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });

  it('returns bin/python on posix', () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    mockFs.existsSync = vi.fn(() => false);
    expect(toSlash(pythonPathForEnvPath('/env'))).toBe('/env/bin/python');
  });

  it('returns python.exe in root for conda on windows', () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    mockFs.existsSync = vi.fn(() => true);
    expect(pythonPathForEnvPath('/env', true)).toContain('python.exe');
    expect(pythonPathForEnvPath('/env', true)).not.toContain('Scripts');
  });

  it('returns Scripts/python.exe for venv on windows', () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    mockFs.existsSync = vi.fn(() => false);
    expect(pythonPathForEnvPath('/env', false)).toContain('Scripts');
    expect(pythonPathForEnvPath('/env', false)).toContain('python.exe');
  });
});

describe('envPathForPythonPath', () => {
  const originalPlatform = process.platform;

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });

  it('returns parent of bin/ on posix', () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    const result = envPathForPythonPath('/env/bin/python');
    // exact, because 'contains /env' is also true of the argument it was given
    expect(toSlash(result)).toBe('/env/');
  });

  it('returns parent of Scripts/ on windows', () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    // path.join uses host OS separator — just verify it doesn't include Scripts
    const result = envPathForPythonPath('C:/env/Scripts/python.exe');
    expect(result).not.toContain('Scripts');
    expect(result).not.toContain('python.exe');
  });
});

describe('activatePathForEnvPath', () => {
  const originalPlatform = process.platform;

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });

  it('returns activate.bat on windows', () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    expect(activatePathForEnvPath('/env')).toContain('activate.bat');
  });

  it('returns bin/activate on posix', () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    expect(toSlash(activatePathForEnvPath('/env'))).toBe('/env/bin/activate');
  });
});

describe('condaSourcePathForEnvPath', () => {
  const originalPlatform = process.platform;

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });

  it('returns conda.sh path on posix', () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    // undefined is this function's Windows answer, and the empty string it becomes here fails the comparison rather than typing as a string
    expect(toSlash(condaSourcePathForEnvPath('/env') ?? '')).toBe(
      '/env/etc/profile.d/conda.sh'
    );
  });

  it('returns undefined on windows', () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    expect(condaSourcePathForEnvPath('/env')).toBeUndefined();
  });
});

describe('jupyterEnvInstallInfoPathForEnvPath', () => {
  it('returns .jupyter/env.json path', () => {
    expect(toSlash(jupyterEnvInstallInfoPathForEnvPath('/env'))).toBe(
      '/env/.jupyter/env.json'
    );
  });
});

describe('isCondaEnv', () => {
  it('returns true when conda-meta exists', () => {
    mockFs.existsSync = vi.fn(() => true);
    expect(isCondaEnv('/env')).toBe(true);
  });

  it('returns false when conda-meta missing', () => {
    mockFs.existsSync = vi.fn(() => false);
    expect(isCondaEnv('/env')).toBe(false);
  });
});

describe('isEnvInstalledByDesktopApp', () => {
  it('returns true when env.json marker exists', () => {
    mockFs.existsSync = vi.fn(() => true);
    expect(isEnvInstalledByDesktopApp('/env')).toBe(true);
  });

  it('returns false when marker missing', () => {
    mockFs.existsSync = vi.fn(() => false);
    expect(isEnvInstalledByDesktopApp('/env')).toBe(false);
  });
});

describe('getRelativePathToUserHome', () => {
  it('replaces home prefix with ~', () => {
    const home = getUserHomeDir();
    const abs = path.join(home, 'notebooks', 'file.ipynb');
    expect(getRelativePathToUserHome(abs)).toBe(
      `~${path.sep}${path.join('notebooks', 'file.ipynb')}`
    );
  });

  it('returns undefined for a path outside the home directory', () => {
    expect(getRelativePathToUserHome('/etc/passwd')).toBeUndefined();
  });
});

describe('waitForDuration', () => {
  it('resolves false after duration', async () => {
    const result = await waitForDuration(10);
    expect(result).toBe(false);
  });
});

describe('waitForFunction', () => {
  it('resolves immediately when fn returns true', async () => {
    await expect(waitForFunction(() => true)).resolves.toBeUndefined();
  });

  it('rejects on timeout when fn never returns true', async () => {
    await expect(waitForFunction(() => false, 100)).rejects.toThrow(
      'Timed out'
    );
  });

  it('resolves after fn eventually returns true', async () => {
    let count = 0;
    await expect(waitForFunction(() => ++count >= 3)).resolves.toBeUndefined();
    expect(count).toBeGreaterThanOrEqual(3);
  });
});

describe('theme constants', () => {
  it('DarkThemeBGColor is valid hex', () => {
    expect(DarkThemeBGColor).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('LightThemeBGColor is valid hex', () => {
    expect(LightThemeBGColor).toMatch(/^#[0-9a-f]{6}$/i);
  });
});

describe('isBaseCondaEnv', () => {
  const originalPlatform = process.platform;

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });

  it('returns true when condabin/conda exists and is a file on posix', () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    mockFs.existsSync = vi.fn(() => true);
    mockFs.lstatSync = vi.fn(() => ({ isFile: () => true } as fs.Stats));
    expect(isBaseCondaEnv('/env')).toBe(true);
  });

  it('returns false when condabin/conda does not exist', () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    mockFs.existsSync = vi.fn(() => false);
    expect(isBaseCondaEnv('/env')).toBe(false);
  });

  it('returns false when path exists but is not a file', () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    mockFs.existsSync = vi.fn(() => true);
    mockFs.lstatSync = vi.fn(() => ({ isFile: () => false } as fs.Stats));
    expect(isBaseCondaEnv('/env')).toBe(false);
  });

  it('checks condabin/conda.bat on windows', () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    let checkedPath = '';
    mockFs.existsSync = vi.fn((p: fs.PathLike) => {
      checkedPath = p.toString();
      return true;
    });
    mockFs.lstatSync = vi.fn(() => ({ isFile: () => true } as fs.Stats));
    isBaseCondaEnv('/env');
    expect(checkedPath).toContain('conda.bat');
  });
});

describe('bundledEnvironmentIsInstalled', () => {
  it('returns true when bundled env path exists and is directory', () => {
    mockFs.existsSync = vi.fn(() => true);
    mockFs.statSync = vi.fn(() => ({ isDirectory: () => true } as fs.Stats));
    expect(bundledEnvironmentIsInstalled()).toBe(true);
  });

  it('returns false when bundled env path does not exist', () => {
    mockFs.existsSync = vi.fn(() => false);
    expect(bundledEnvironmentIsInstalled()).toBe(false);
  });

  it('returns false when path is a file not directory', () => {
    mockFs.existsSync = vi.fn(() => true);
    mockFs.statSync = vi.fn(() => ({ isDirectory: () => false } as fs.Stats));
    expect(bundledEnvironmentIsInstalled()).toBe(false);
  });
});

describe('getLogFilePath', () => {
  const originalPlatform = process.platform;

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });

  it('returns path containing main.log by default', () => {
    expect(getLogFilePath()).toContain('main.log');
  });

  it('returns path containing renderer.log for renderer process', () => {
    expect(getLogFilePath('renderer')).toContain('renderer.log');
  });

  it('returns path under Library/Logs on darwin', () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    expect(toSlash(getLogFilePath())).toContain('Library/Logs');
  });

  it('returns path under .config on linux', () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    expect(getLogFilePath()).toContain('.config');
  });

  it('returns path under userData on windows', () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    expect(getLogFilePath()).toContain('logs');
  });
});

describe('getJlabCLICommandSymlinkPath', () => {
  const originalPlatform = process.platform;

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });

  it('returns /usr/local/bin/jlab on darwin', () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    expect(getJlabCLICommandSymlinkPath()).toBe('/usr/local/bin/jlab');
  });

  it('returns undefined on non-darwin', () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    expect(getJlabCLICommandSymlinkPath()).toBeUndefined();
  });
});

describe('getJlabCLICommandTargetPath', () => {
  const originalPlatform = process.platform;

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });

  it('returns undefined on non-darwin', () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    expect(getJlabCLICommandTargetPath()).toBeUndefined();
  });

  it('points at the app directory on darwin', () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    expect(getJlabCLICommandTargetPath()).toBe(`${app.getAppPath()}/app/jlab`);
  });
});

describe('isDevMode', () => {
  afterEach(() => {
    (app as any).isPackaged = false;
  });

  it('is true when the app is not packaged', () => {
    (app as any).isPackaged = false;
    expect(isDevMode()).toBe(true);
  });

  it('is false when the app is packaged', () => {
    (app as any).isPackaged = true;
    expect(isDevMode()).toBe(false);
  });
});

describe('jlabCLICommandIsSetup', () => {
  const originalPlatform = process.platform;

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });

  it('returns true on non-darwin platforms (linux)', () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    expect(jlabCLICommandIsSetup()).toBe(true);
  });

  it('returns true on non-darwin platforms (win32)', () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    expect(jlabCLICommandIsSetup()).toBe(true);
  });
});

describe('openDirectoryInExplorer', () => {
  const originalPlatform = process.platform;
  const mockExec = vi.mocked(childProcess.exec);

  beforeEach(() => {
    mockExec.mockReset();
  });
  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });

  it('returns false when path does not exist', () => {
    mockFs.existsSync = vi.fn(() => false);
    expect(openDirectoryInExplorer('/nonexistent')).toBe(false);
    expect(mockExec).not.toHaveBeenCalled();
  });

  it('returns false when path is a file not a directory', () => {
    mockFs.existsSync = vi.fn(() => true);
    mockFs.statSync = vi.fn(() => ({ isDirectory: () => false } as fs.Stats));
    expect(openDirectoryInExplorer('/some/file.txt')).toBe(false);
  });

  it('returns true and calls exec on darwin', () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    mockFs.existsSync = vi.fn(() => true);
    mockFs.statSync = vi.fn(() => ({ isDirectory: () => true } as fs.Stats));
    const result = openDirectoryInExplorer('/data/notebooks');
    expect(result).toBe(true);
    expect(mockExec).toHaveBeenCalledWith(expect.stringContaining('open'));
  });

  it('returns true and calls exec on windows', () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    mockFs.existsSync = vi.fn(() => true);
    mockFs.statSync = vi.fn(() => ({ isDirectory: () => true } as fs.Stats));
    const result = openDirectoryInExplorer('/data/notebooks');
    expect(result).toBe(true);
    expect(mockExec).toHaveBeenCalledWith(expect.stringContaining('explorer'));
  });

  it('returns true and calls exec on linux', () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    mockFs.existsSync = vi.fn(() => true);
    mockFs.statSync = vi.fn(() => ({ isDirectory: () => true } as fs.Stats));
    const result = openDirectoryInExplorer('/data/notebooks');
    expect(result).toBe(true);
    expect(mockExec).toHaveBeenCalledWith(expect.stringContaining('xdg-open'));
  });
});

describe('createCommandScriptInEnv', () => {
  const originalPlatform = process.platform;

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });

  it('returns empty string when envPath is not a directory', () => {
    mockFs.lstatSync = vi.fn(() => ({ isDirectory: () => false } as fs.Stats));
    expect(createCommandScriptInEnv('/notadir', '/base', {})).toBe('');
  });

  it('returns empty string when envPath lstatSync throws and no activate exists', () => {
    // when lstatSync throws, the try-catch swallows it and execution continues;
    // if there's also no activate script, the function returns ''
    mockFs.lstatSync = vi.fn(() => {
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    });
    mockFs.existsSync = vi.fn(() => false);
    expect(createCommandScriptInEnv('/missing', '/base', {})).toBe('');
  });

  it('returns empty string when no activate script exists', () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    mockFs.lstatSync = vi.fn(() => ({ isDirectory: () => true } as fs.Stats));
    mockFs.existsSync = vi.fn(() => false); // no activate, no conda-meta
    expect(createCommandScriptInEnv('/env', '/base', {})).toBe('');
  });

  it('includes source activate for venv on posix', () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    mockFs.lstatSync = vi.fn(
      () => ({ isDirectory: () => true, isFile: () => false } as fs.Stats)
    );
    mockFs.existsSync = vi.fn((p: fs.PathLike) =>
      p.toString().includes('activate')
    ); // has activate, not conda
    const script = createCommandScriptInEnv('/env', '/base', {
      command: 'pip install numpy'
    });
    expect(script).toContain('source');
    expect(script).toContain('activate');
    expect(script).toContain('pip install numpy');
  });

  it('includes CALL activate on windows venv', () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    mockFs.lstatSync = vi.fn(
      () => ({ isDirectory: () => true, isFile: () => false } as fs.Stats)
    );
    mockFs.existsSync = vi.fn((p: fs.PathLike) =>
      p.toString().includes('activate')
    );
    const script = createCommandScriptInEnv('/env', '/base', {
      command: 'pip install numpy'
    });
    expect(script).toContain('CALL');
    expect(script).toContain('activate');
  });

  it('uses custom quoteChar and joinStr', () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    mockFs.lstatSync = vi.fn(() => ({ isDirectory: () => true } as fs.Stats));
    mockFs.existsSync = vi.fn((p: fs.PathLike) =>
      p.toString().includes('activate')
    );
    const script = createCommandScriptInEnv('/env', '/base', {
      command: 'echo hello',
      quoteChar: "'",
      joinStr: ' ; '
    });
    expect(script).toContain("'");
    expect(script).toContain(' ; ');
  });
});

describe('markEnvironmentAsJupyterInstalled', () => {
  beforeEach(() => {
    mockFs.existsSync = vi.fn(() => false);
    mockFs.mkdirSync = vi.fn();
    mockFs.writeFileSync = vi.fn();
  });

  it('creates .jupyter dir when missing and writes env.json', () => {
    markEnvironmentAsJupyterInstalled('/env/myenv');
    expect(mockFs.mkdirSync).toHaveBeenCalledWith(
      expect.stringContaining('.jupyter'),
      { recursive: true }
    );
    expect(mockFs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('env.json'),
      expect.stringContaining('jupyterlab-desktop')
    );
  });

  it('still writes env.json when the .jupyter dir already exists', () => {
    mockFs.existsSync = vi.fn(() => true);
    markEnvironmentAsJupyterInstalled('/env/myenv');
    // mkdir runs unconditionally: recursive mode is a no-op on an existing
    // directory, so there is no reason to check first and race on the answer.
    expect(mockFs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('env.json'),
      expect.stringContaining('jupyterlab-desktop')
    );
  });

  it('merges extraData into written JSON', () => {
    mockFs.existsSync = vi.fn(() => true);
    markEnvironmentAsJupyterInstalled('/env/myenv', { version: '4.0.0' });
    const content = (mockFs.writeFileSync as any).mock.calls[0][1] as string;
    const json = JSON.parse(content);
    expect(json.installer).toBe('jupyterlab-desktop');
    expect(json.version).toBe('4.0.0');
  });

  it('does not throw when writeFileSync fails', () => {
    mockFs.existsSync = vi.fn(() => true);
    mockFs.writeFileSync = vi.fn(() => {
      throw new Error('EACCES');
    });
    expect(() => markEnvironmentAsJupyterInstalled('/env/myenv')).not.toThrow();
  });
});

describe('deletePythonEnvironment', () => {
  beforeEach(() => {
    mockFs.existsSync = vi.fn(() => false);
    mockFs.rmSync = vi.fn();
  });

  it('rejects when env was not installed by Desktop (no env.json)', async () => {
    // isEnvInstalledByDesktopApp → existsSync returns false
    const listener = { onDeleteStatus: vi.fn() };
    await expect(
      deletePythonEnvironment('/env/foreign', listener)
    ).rejects.toBeUndefined();
    expect(listener.onDeleteStatus).toHaveBeenCalledWith(
      EnvironmentDeleteStatus.Failure,
      expect.any(String)
    );
    // the guard must stop here: a rejected promise is not enough, the
    // directory must never be touched when it was not Desktop-installed.
    expect(mockFs.rmSync).not.toHaveBeenCalled();
  });

  it('calls rmSync and resolves true when env.json exists', async () => {
    // isEnvInstalledByDesktopApp → existsSync returns true
    mockFs.existsSync = vi.fn(() => true);
    const listener = { onDeleteStatus: vi.fn() };
    const result = await deletePythonEnvironment('/env/myenv', listener);
    expect(mockFs.rmSync).toHaveBeenCalledWith('/env/myenv', {
      recursive: true,
      force: true
    });
    expect(result).toBe(true);
    expect(listener.onDeleteStatus).toHaveBeenCalledWith(
      EnvironmentDeleteStatus.Success
    );
  });

  it('rejects with Failure status when rmSync throws', async () => {
    mockFs.existsSync = vi.fn(() => true);
    mockFs.rmSync = vi.fn(() => {
      throw new Error('EPERM');
    });
    const listener = { onDeleteStatus: vi.fn() };
    await expect(
      deletePythonEnvironment('/env/myenv', listener)
    ).rejects.toBeUndefined();
    expect(listener.onDeleteStatus).toHaveBeenCalledWith(
      EnvironmentDeleteStatus.Failure,
      'EPERM'
    );
  });

  it('works without a listener', async () => {
    mockFs.existsSync = vi.fn(() => true);
    await expect(deletePythonEnvironment('/env/myenv')).resolves.toBe(true);
  });
});

describe('clearSession', () => {
  const fakeSession = (overrides: Record<string, any> = {}) =>
    (({
      clearCache: vi.fn(() => Promise.resolve()),
      clearAuthCache: vi.fn(() => Promise.resolve()),
      clearStorageData: vi.fn(() => Promise.resolve()),
      flushStorageData: vi.fn(() => Promise.resolve()),
      ...overrides
    } as unknown) as Electron.Session);

  it('resolves once every clear call settles', async () => {
    await expect(clearSession(fakeSession())).resolves.toBeUndefined();
  });

  it('still resolves and logs when a clear call rejects, so teardown proceeds', async () => {
    const session = fakeSession({
      clearStorageData: vi.fn(() => Promise.reject(new Error('boom')))
    });
    // best-effort: callers close windows right after awaiting, so a failed
    // clear must not reject (skipping cleanup) nor hang.
    await expect(clearSession(session)).resolves.toBeUndefined();
    expect(log.error).toHaveBeenCalledWith(
      'Failed to clear part of the session',
      expect.any(Error)
    );
  });
});

describe('createTempFile', () => {
  beforeEach(() => {
    mockFs.mkdtempSync = vi.fn(() => '/tmp/jlab_desktop_abc');
    mockFs.writeFileSync = vi.fn();
  });

  it('calls mkdtempSync with jlab_desktop prefix', () => {
    createTempFile('test.sh', 'echo hi');
    expect(mockFs.mkdtempSync).toHaveBeenCalledWith(
      expect.stringContaining('jlab_desktop')
    );
  });

  it('writes data to the temp file', () => {
    createTempFile('test.sh', 'echo hi', 'utf8');
    expect(mockFs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('test.sh'),
      'echo hi',
      { encoding: 'utf8' }
    );
  });

  it('returns path inside the temp dir', () => {
    const result = createTempFile('run.sh');
    expect(result).toContain('run.sh');
    expect(toSlash(result)).toContain('/tmp/jlab_desktop_abc');
  });

  it('uses defaults when called with no args', () => {
    const result = createTempFile();
    expect(result).toContain('temp');
  });
});

describe('isPortInUse', () => {
  it('resolves false on connection error (port not in use)', async () => {
    const mockSocket = {
      setTimeout: vi.fn(),
      once: vi.fn((event: string, cb: () => void) => {
        if (event === 'error') cb();
      }),
      on: vi.fn((event: string, cb: (v?: any) => void) => {
        if (event === 'close') cb(false);
      }),
      connect: vi.fn(),
      destroy: vi.fn()
    };
    vi.mocked(net.Socket).mockImplementation(function () {
      return mockSocket;
    } as any);
    const result = await isPortInUse(9999);
    expect(result).toBe(false);
  });

  it('resolves true on connect (port in use)', async () => {
    let closeCallback: ((v?: any) => void) | null = null;
    const mockSocket = {
      setTimeout: vi.fn(),
      once: vi.fn(),
      on: vi.fn((event: string, cb: (v?: any) => void) => {
        if (event === 'connect') {
          cb();
        }
        if (event === 'close') {
          closeCallback = cb;
        }
      }),
      connect: vi.fn(() => {
        if (closeCallback) closeCallback(false);
      }),
      destroy: vi.fn()
    };
    vi.mocked(net.Socket).mockImplementation(function () {
      return mockSocket;
    } as any);
    const result = await isPortInUse(8080);
    expect(result).toBe(true);
  });
});

describe('getFreePort', () => {
  it('resolves a numeric port from server address', async () => {
    const mockServer = {
      on: vi.fn((event: string, cb: (e?: any) => void) => {
        if (event === 'listening') cb({});
      }),
      listen: vi.fn(),
      close: vi.fn(),
      address: vi.fn(() => ({ port: 54321 }))
    };
    vi.mocked(net.createServer).mockReturnValue(mockServer as any);
    const port = await getFreePort();
    expect(port).toBe(54321);
  });
});

describe('originOf', () => {
  it('drops the query string, where a Jupyter URL carries its token', () => {
    expect(originOf('http://localhost:8888/lab?token=secret')).toBe(
      'http://localhost:8888'
    );
  });

  it('returns null for an opaque or unparseable source', () => {
    expect(originOf('data:text/html,<p>x')).toBeNull();
    expect(originOf('not a url')).toBeNull();
    expect(originOf(undefined)).toBeNull();
  });
});

describe('isSameServerOrigin', () => {
  const server = 'http://localhost:8888/lab?token=secret';

  it('accepts the same origin regardless of path or query', () => {
    expect(isSameServerOrigin('http://localhost:8888/lab/tree', server)).toBe(
      true
    );
  });

  it('rejects a different port', () => {
    expect(isSameServerOrigin('http://localhost:9999/lab', server)).toBe(false);
  });

  it('rejects a different host', () => {
    expect(isSameServerOrigin('http://evil.example/lab', server)).toBe(false);
  });

  it('rejects a different scheme on the same host and port', () => {
    expect(isSameServerOrigin('https://localhost:8888/lab', server)).toBe(
      false
    );
  });

  it('rejects opaque origins', () => {
    expect(isSameServerOrigin('about:blank', server)).toBe(false);
    expect(isSameServerOrigin('data:text/html,<h1>hi</h1>', server)).toBe(
      false
    );
  });

  it('rejects missing or unparseable URLs instead of throwing', () => {
    expect(isSameServerOrigin(undefined, server)).toBe(false);
    expect(isSameServerOrigin(null, server)).toBe(false);
    expect(isSameServerOrigin('not a url', server)).toBe(false);
    expect(isSameServerOrigin('http://localhost:8888/lab', undefined)).toBe(
      false
    );
  });
});

// The list of unreadable config files lives for the whole module, so every test below uses a path of its own rather than relying on a reset.
describe('readJsonConfigFile', () => {
  it('returns the parsed object for a readable config', () => {
    mockFs.existsSync = vi.fn(() => true);
    mockFs.readFileSync = vi.fn(() => Buffer.from('{"theme":"dark"}')) as any;

    expect(readJsonConfigFile('/data/readable.json')).toEqual({
      theme: 'dark'
    });
    expect(getUnreadableConfigFiles()).not.toContain('/data/readable.json');
  });

  it('returns undefined without marking a file that is not there', () => {
    mockFs.readFileSync = vi.fn(() => {
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    }) as any;

    expect(readJsonConfigFile('/data/absent.json')).toBeUndefined();
    expect(getUnreadableConfigFiles()).not.toContain('/data/absent.json');
  });

  it('leaves malformed JSON where it is and names it', () => {
    mockFs.existsSync = vi.fn(() => true);
    mockFs.readFileSync = vi.fn(() => Buffer.from('{"theme": }')) as any;

    expect(readJsonConfigFile('/data/malformed.json')).toBeUndefined();
    expect(mockFs.renameSync).not.toHaveBeenCalled();
    expect(getUnreadableConfigFiles()).toContain('/data/malformed.json');
  });

  it('names a file it could not read at all', () => {
    mockFs.existsSync = vi.fn(() => true);
    mockFs.readFileSync = vi.fn(() => {
      throw new Error('EACCES');
    }) as any;

    expect(readJsonConfigFile('/data/locked.json')).toBeUndefined();
    expect(mockFs.renameSync).not.toHaveBeenCalled();
    expect(getUnreadableConfigFiles()).toContain('/data/locked.json');
  });

  it('rejects an array, which callers walk without finding anything', () => {
    mockFs.existsSync = vi.fn(() => true);
    mockFs.readFileSync = vi.fn(() => Buffer.from('[]')) as any;

    expect(readJsonConfigFile('/data/array.json')).toBeUndefined();
    expect(getUnreadableConfigFiles()).toContain('/data/array.json');
  });

  it('rejects valid JSON that is not an object', () => {
    mockFs.existsSync = vi.fn(() => true);
    mockFs.readFileSync = vi.fn(() => Buffer.from('42')) as any;

    expect(readJsonConfigFile('/data/number.json')).toBeUndefined();
    expect(getUnreadableConfigFiles()).toContain('/data/number.json');
  });
});

describe('writeJsonConfigFile', () => {
  beforeEach(() => {
    mockFs.openSync = vi.fn(() => 7) as any;
    mockFs.fsyncSync = vi.fn();
    mockFs.closeSync = vi.fn();
    mockFs.unlinkSync = vi.fn();
    // no file there yet, which is what a first write sees
    const enoent = () => {
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    };
    mockFs.realpathSync = vi.fn(enoent) as any;
    mockFs.statSync = vi.fn(enoent) as any;
    mockFs.lstatSync = vi.fn(enoent) as any;
    mockFs.fchownSync = vi.fn();
    mockFs.fchmodSync = vi.fn();
  });

  it('writes through a sibling temporary and renames it over the target', () => {
    expect(writeJsonConfigFile('/data/write.json', { theme: 'dark' })).toBe(
      true
    );

    // The name is unpredictable by design, so the shape is what there is to assert. wx, so a symlink left at that name is refused rather than followed, and 0600 because nothing existed to carry a mode from.
    expect(mockFs.openSync).toHaveBeenCalledWith(
      expect.stringMatching(/^\/data\/write\.json\.[0-9a-f]{12}\.tmp$/),
      'wx',
      0o600
    );
    expect(mockFs.writeFileSync).toHaveBeenCalledWith(
      7,
      JSON.stringify({ theme: 'dark' }, null, 2)
    );
    expect(mockFs.renameSync).toHaveBeenCalledWith(
      expect.stringMatching(/^\/data\/write\.json\.[0-9a-f]{12}\.tmp$/),
      '/data/write.json'
    );
  });

  it('carries the existing permissions onto the temporary', () => {
    mockFs.lstatSync = vi.fn(() => ({
      isSymbolicLink: () => false,
      isFile: () => true,
      mode: 0o100600
    })) as any;

    writeJsonConfigFile('/data/private.json', {});

    // chmod, not openSync's mode, which the umask narrows on the way through
    expect(mockFs.fchmodSync).toHaveBeenCalledWith(7, 0o600);
  });

  // A directory answers 0755, and carrying that onto the temporary would create the file holding app-data.json's tokens world-readable for as long as it exists. Only a regular file has bits worth copying.
  it('does not take its mode from a directory sitting at the config path', () => {
    // lstatSync, not statSync: that is what the non-symlink path reads, and mocking the other one made this pass on the 0600 default instead of on the guard.
    mockFs.lstatSync = vi.fn(() => ({
      isSymbolicLink: () => false,
      isFile: () => false,
      mode: 0o40755
    })) as any;

    writeJsonConfigFile('/data/app-data.json', {});

    expect(mockFs.openSync).toHaveBeenCalledWith(
      expect.any(String),
      'wx',
      0o600
    );
  });

  it('closes the descriptor when the write fails before the rename', () => {
    mockFs.fsyncSync = vi.fn(() => {
      throw new Error('EIO');
    });

    expect(writeJsonConfigFile('/data/eio.json', {})).toBe(false);
    expect(mockFs.closeSync).toHaveBeenCalledWith(7);
    expect(mockFs.renameSync).not.toHaveBeenCalled();
  });

  // closeSync releases the descriptor even when it reports an error, so the catch must not close the same number again: by then it can belong to a file somebody else just opened. The guard is that fd is cleared before the call.
  it('does not close the descriptor twice when the close itself fails', () => {
    mockFs.closeSync = vi.fn(() => {
      throw new Error('EIO');
    });

    expect(writeJsonConfigFile('/data/badclose.json', {})).toBe(false);
    expect(mockFs.closeSync).toHaveBeenCalledTimes(1);
    expect(mockFs.renameSync).not.toHaveBeenCalled();
  });

  it('carries ownership across when the app is running as root', () => {
    const realGetuid = process.getuid;
    (process as any).getuid = () => 0;
    mockFs.lstatSync = vi.fn(() => ({
      isSymbolicLink: () => false,
      isFile: () => true,
      mode: 0o100600,
      uid: 501,
      gid: 20
    })) as any;

    try {
      writeJsonConfigFile('/data/owned.json', {});
    } finally {
      (process as any).getuid = realGetuid;
    }

    // through the descriptor: the path form follows a symlink and would hand away whatever it names
    expect(mockFs.fchownSync).toHaveBeenCalledWith(7, 501, 20);
  });

  // The lockout this function exists to prevent, in the case it used to return early on: `sudo jlab` with no config yet. Without an existing file to copy from, the containing directory is what the new file has to match, or every later unprivileged run gets EACCES on its own settings.
  it('carries the directory owner when the file does not exist yet', () => {
    const realGetuid = process.getuid;
    (process as any).getuid = () => 0;
    // nothing at the path: statOrUndefined returns undefined for the file and the stats for its directory
    mockFs.lstatSync = vi.fn(() => {
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    }) as any;
    // the same string the source passes, with no path.resolve of its own: resolve turns the POSIX literal into `\data` on Windows while the source's dirname leaves it `/data`, which is the mismatch this used to fail on
    mockFs.statSync = vi.fn((target: string) => {
      if (target === path.dirname('/data/fresh.json')) {
        return { uid: 501, gid: 20, mode: 0o40755 } as any;
      }
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    }) as any;

    try {
      writeJsonConfigFile('/data/fresh.json', {});
    } finally {
      (process as any).getuid = realGetuid;
    }

    expect(mockFs.fchownSync).toHaveBeenCalledWith(7, 501, 20);
  });

  it('leaves ownership alone when the app is not root', () => {
    const realGetuid = process.getuid;
    (process as any).getuid = () => 501;
    // lstatSync, the same call the root case above stubs: it is what finds the existing file, and stubbing statSync instead left this returning on the `!existing` branch without ever reaching the check it is named after
    mockFs.lstatSync = vi.fn(() => ({
      isSymbolicLink: () => false,
      isFile: () => true,
      mode: 0o100600,
      uid: 501,
      gid: 20
    })) as any;

    try {
      writeJsonConfigFile('/data/unowned.json', {});
    } finally {
      (process as any).getuid = realGetuid;
    }

    // fchownSync, which is what the code calls; asserting on chownSync passed whatever the code did
    expect(mockFs.fchownSync).not.toHaveBeenCalled();
  });

  // A filesystem with no fsync is not a filesystem that failed to write. On a CIFS or gvfs home this used to lose every settings change, where master's plain writeFileSync worked, and syncDirectoryEntry already concedes the same case one call below.
  it('saves anyway when the filesystem does not implement fsync', () => {
    mockFs.fsyncSync = vi.fn(() => {
      throw Object.assign(new Error('EINVAL'), { code: 'EINVAL' });
    }) as any;

    expect(writeJsonConfigFile('/data/nofsync.json', {})).toBe(true);
    expect(mockFs.renameSync).toHaveBeenCalled();
  });

  it('fails the save when fsync reports a real I/O error', () => {
    mockFs.fsyncSync = vi.fn(() => {
      throw Object.assign(new Error('EIO'), { code: 'EIO' });
    }) as any;

    // the bytes genuinely may not be there, so publishing the name over the old file would be a lie
    expect(writeJsonConfigFile('/data/eio-fsync.json', {})).toBe(false);
    expect(mockFs.renameSync).not.toHaveBeenCalled();
  });

  // Under sudo the directory this call creates is root's too, so the fallback above would have read root:root and carried it onto the file: `.jupyter` inside a user's project is that case.
  it('carries ownership onto a directory it had to create', () => {
    const realGetuid = process.getuid;
    (process as any).getuid = () => 0;
    mockFs.lstatSync = vi.fn(() => {
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    }) as any;
    mockFs.mkdirSync = vi.fn(() => '/proj/.jupyter') as any;
    mockFs.statSync = vi.fn((target: string) => {
      if (target === '/proj') {
        return { uid: 501, gid: 20, mode: 0o40755 } as any;
      }
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    }) as any;

    try {
      writeJsonConfigFile('/proj/.jupyter/desktop-settings.json', {});
    } finally {
      (process as any).getuid = realGetuid;
    }

    // through a descriptor, not the path: this runs as root over a directory created a moment ago
    expect(mockFs.fchownSync).toHaveBeenCalledWith(7, 501, 20);
  });

  // A descriptor is not the guard on its own, which is what the assertion above cannot see: a plain 'r' open resolves a symlink like any path, so root would fchown whatever a swapped-in link names. carryOwnership's fd is safe for a different reason, its O_CREAT|O_EXCL open, and copying the reasoning without the flags left this one open.
  //
  // Its own test, skipped rather than made conditional, so the report says which platform did not run it. O_NOFOLLOW is POSIX and `fs.constants` has no such key on Windows, where `f & undefined` is 0 and the assertion compares 0 against undefined. The source is unreachable there anyway, since it returns unless getuid() is 0 and Windows has no getuid, but a silent `if` here would be a test that quietly checks nothing on a third of the matrix.
  it.skipIf(process.platform === 'win32')(
    'refuses a symlink where the directory should be',
    () => {
      const realGetuid = process.getuid;
      (process as any).getuid = () => 0;
      mockFs.lstatSync = vi.fn(() => {
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      }) as any;
      mockFs.mkdirSync = vi.fn(() => '/proj/.jupyter') as any;
      mockFs.statSync = vi.fn((target: string) => {
        if (target === '/proj') {
          return { uid: 501, gid: 20, mode: 0o40755 } as any;
        }
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      }) as any;

      try {
        writeJsonConfigFile('/proj/.jupyter/desktop-settings.json', {});
      } finally {
        (process as any).getuid = realGetuid;
      }

      const flags = vi
        .mocked(mockFs.openSync)
        .mock.calls.map(call => Number(call[1]))
        .filter(f => Number.isFinite(f));
      expect(flags.length).toBeGreaterThan(0);
      for (const f of flags) {
        expect(f & fsConstants.O_NOFOLLOW).toBe(fsConstants.O_NOFOLLOW);
      }
    }
  );

  // `wx` exists so an entry already at that name is refused rather than followed, and the cleanup would have deleted it anyway, undoing the guard on the one path where it fired. Unreachable against a real filesystem now that the name is random, which is why it is pinned here.
  it('does not delete what was already at the temporary name', () => {
    mockFs.openSync = vi.fn(() => {
      throw Object.assign(new Error('EEXIST'), { code: 'EEXIST' });
    }) as any;

    expect(writeJsonConfigFile('/data/collide.json', {})).toBe(false);

    expect(mockFs.unlinkSync).not.toHaveBeenCalled();
  });

  // The contract the JSDoc states and will-quit depends on: this returns false, it never throws. randomBytes throws when the entropy source is unavailable, and building the temporary name outside the try let that escape, leaving _quit unreached and the app unquittable.
  it('reports failure rather than throwing when the name cannot be built', () => {
    entropy.fails = true;

    try {
      expect(writeJsonConfigFile('/data/noentropy.json', {})).toBe(false);
    } finally {
      entropy.fails = false;
    }
  });

  it('follows a dangling link to the path it names', () => {
    mockFs.lstatSync = vi.fn(() => ({ isSymbolicLink: () => true })) as any;
    // one hop, then the target is not itself a link, which is what a real dangling link gives: readlink on it raises EINVAL
    let hops = 0;
    mockFs.readlinkSync = vi.fn(() => {
      if (hops++ === 0) {
        return '/dotfiles/settings.json';
      }
      throw Object.assign(new Error('EINVAL'), { code: 'EINVAL' });
    }) as any;

    expect(writeJsonConfigFile('/data/dangling.json', {})).toBe(true);

    // the target the link names, not the link's own directory. Resolved here because a bare '/dotfiles/...' picks up the current drive on Windows.
    const target = path.resolve('/dotfiles/settings.json');
    expect(mockFs.renameSync).toHaveBeenCalledWith(
      expect.stringMatching(/\.[0-9a-f]{12}\.tmp$/),
      target
    );
  });

  it('flushes the directory so the new name survives a power cut', () => {
    const platform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    mockFs.openSync = vi.fn((target: any) =>
      String(target).endsWith('.tmp') ? 7 : 9
    ) as any;

    try {
      writeJsonConfigFile('/data/dirsync.json', {});
    } finally {
      Object.defineProperty(process, 'platform', { value: platform });
    }

    expect(mockFs.openSync).toHaveBeenCalledWith('/data', 'r');
    expect(mockFs.fsyncSync).toHaveBeenCalledWith(9);
    expect(mockFs.closeSync).toHaveBeenCalledWith(9);
  });

  it('skips the directory flush on Windows, which cannot open one', () => {
    const platform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'win32' });

    try {
      writeJsonConfigFile('/data/win.json', {});
    } finally {
      Object.defineProperty(process, 'platform', { value: platform });
    }

    expect(mockFs.openSync).toHaveBeenCalledTimes(1);
  });

  it('flushes the contents before publishing the name', () => {
    writeJsonConfigFile('/data/fsync.json', {});

    expect(mockFs.fsyncSync).toHaveBeenCalledWith(7);
    expect((mockFs.fsyncSync as any).mock.invocationCallOrder[0]).toBeLessThan(
      (mockFs.renameSync as any).mock.invocationCallOrder[0]
    );
  });

  it('refuses to write a file that could not be read this session', () => {
    mockFs.existsSync = vi.fn(() => true);
    mockFs.readFileSync = vi.fn(() => Buffer.from('{')) as any;
    readJsonConfigFile('/data/refused.json');

    expect(writeJsonConfigFile('/data/refused.json', { theme: 'dark' })).toBe(
      false
    );
    expect(mockFs.openSync).not.toHaveBeenCalled();
    expect(mockFs.writeFileSync).not.toHaveBeenCalled();
    expect(mockFs.renameSync).not.toHaveBeenCalled();
  });

  it('keeps a symlinked config a symlink by writing beside its target', () => {
    mockFs.lstatSync = vi.fn(() => ({ isSymbolicLink: () => true })) as any;
    mockFs.realpathSync = vi.fn(() => '/dotfiles/settings.json') as any;

    expect(writeJsonConfigFile('/data/linked.json', { theme: 'dark' })).toBe(
      true
    );

    const tempPath = (mockFs.openSync as any).mock.calls[0][0] as string;
    expect(tempPath).toMatch(/^\/dotfiles\/settings\.json\.[0-9a-f]{12}\.tmp$/);
    expect(mockFs.openSync).toHaveBeenCalledWith(tempPath, 'wx', 0o600);
    expect(mockFs.renameSync).toHaveBeenCalledWith(
      tempPath,
      '/dotfiles/settings.json'
    );
  });

  it('removes the temporary and reports failure instead of throwing', () => {
    mockFs.renameSync = vi.fn(() => {
      const error: NodeJS.ErrnoException = new Error('EPERM');
      error.code = 'EPERM';
      throw error;
    }) as any;

    expect(writeJsonConfigFile('/data/busy.json', { theme: 'dark' })).toBe(
      false
    );
    expect(mockFs.unlinkSync).toHaveBeenCalledWith(
      expect.stringMatching(/^\/data\/busy\.json\.[0-9a-f]{12}\.tmp$/)
    );
  });
});

describe('resetConfigFile', () => {
  beforeEach(() => {
    mockFs.openSync = vi.fn(() => 7) as any;
    mockFs.fsyncSync = vi.fn();
    mockFs.closeSync = vi.fn();
    // no file there yet, which is what a first write sees
    const enoent = () => {
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    };
    mockFs.realpathSync = vi.fn(enoent) as any;
    mockFs.statSync = vi.fn(enoent) as any;
    mockFs.lstatSync = vi.fn(enoent) as any;
    mockFs.fchownSync = vi.fn();
  });

  it('moves the file aside and lets the next write through', () => {
    mockFs.existsSync = vi.fn(
      (path: any) => !String(path).includes('.corrupt')
    );
    mockFs.readFileSync = vi.fn(() => Buffer.from('{')) as any;
    readJsonConfigFile('/data/reset.json');
    expect(writeJsonConfigFile('/data/reset.json', {})).toBe(false);

    expect(resetConfigFile('/data/reset.json')).toBe(true);

    expect(mockFs.renameSync).toHaveBeenCalledWith(
      '/data/reset.json',
      '/data/reset.json.corrupt'
    );
    expect(getUnreadableConfigFiles()).not.toContain('/data/reset.json');
    expect(writeJsonConfigFile('/data/reset.json', {})).toBe(true);
  });

  it('moves the file a symlinked config points at, not the link', () => {
    mockFs.existsSync = vi.fn(() => false);
    mockFs.realpathSync = vi.fn(() => '/dotfiles/settings.json') as any;

    expect(resetConfigFile('/data/linked.json')).toBe(true);

    expect(mockFs.renameSync).toHaveBeenCalledWith(
      '/dotfiles/settings.json',
      '/dotfiles/settings.json.corrupt'
    );
  });

  it('refuses rather than sacrifice a copy once every slot is taken', () => {
    mockFs.existsSync = vi.fn(() => true);

    expect(resetConfigFile('/data/full.json')).toBe(false);

    // the first copy is the one still holding real settings
    expect(mockFs.renameSync).not.toHaveBeenCalled();
  });

  it('treats a file that is already gone as reset', () => {
    mockFs.existsSync = vi.fn(() => false);
    mockFs.renameSync = vi.fn(() => {
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    }) as any;

    expect(resetConfigFile('/data/vanished.json')).toBe(true);
  });

  it('keeps the copy from an earlier corruption instead of overwriting it', () => {
    mockFs.existsSync = vi.fn(
      (path: any) => !String(path).endsWith('.corrupt.1')
    );

    resetConfigFile('/data/again.json');

    expect(mockFs.renameSync).toHaveBeenCalledWith(
      '/data/again.json',
      '/data/again.json.corrupt.1'
    );
  });

  it('reports failure when the file could not be moved', () => {
    mockFs.existsSync = vi.fn(() => false);
    mockFs.renameSync = vi.fn(() => {
      throw new Error('EPERM');
    }) as any;

    expect(resetConfigFile('/data/stuck.json')).toBe(false);
  });
});

describe('originOf', () => {
  it('returns the origin of a parseable URL', () => {
    expect(originOf('http://localhost:8888/lab?token=secret')).toBe(
      'http://localhost:8888'
    );
  });

  it.each(['about:blank', 'data:text/html,<h1>hi</h1>'])(
    'returns null for the opaque origin of %s',
    url => {
      expect(originOf(url)).toBeNull();
    }
  );

  it.each(['not a url', '', undefined, null])(
    'returns null instead of throwing for %s',
    url => {
      expect(originOf(url as string | undefined | null)).toBeNull();
    }
  );
});

describe('matchesScheme', () => {
  it('accepts a URL whose scheme is in the given set', () => {
    expect(matchesScheme('https://example.com/x', 'http:', 'https:')).toBe(
      true
    );
    expect(matchesScheme('mailto:a@b.c', 'http:', 'https:', 'mailto:')).toBe(
      true
    );
  });

  it('rejects a scheme the caller did not ask for', () => {
    expect(matchesScheme('mailto:a@b.c', 'http:', 'https:')).toBe(false);
    expect(matchesScheme('file:///etc/passwd', 'http:', 'https:')).toBe(false);
    expect(matchesScheme('javascript:alert(1)', 'http:', 'https:')).toBe(false);
  });

  it('rejects a URL that does not parse instead of throwing', () => {
    expect(matchesScheme('not a url', 'http:', 'https:')).toBe(false);
  });

  it('rejects when no scheme is accepted', () => {
    expect(matchesScheme('https://example.com/')).toBe(false);
  });
});
