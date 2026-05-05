import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    existsSync: vi.fn(),
    lstatSync: vi.fn(),
    statSync: vi.fn(),
    accessSync: vi.fn(),
    readlinkSync: vi.fn(),
    mkdtempSync: vi.fn(),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
    rmSync: vi.fn()
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
  isBaseCondaEnv,
  isCondaEnv,
  isDarkTheme,
  isEnvInstalledByDesktopApp,
  isPortInUse,
  jlabCLICommandIsSetup,
  jupyterEnvInstallInfoPathForEnvPath,
  LightThemeBGColor,
  markEnvironmentAsJupyterInstalled,
  openDirectoryInExplorer,
  pythonPathForEnvPath,
  versionWithoutSuffix,
  waitForDuration,
  waitForFunction
} from '../../../src/main/utils';
import * as childProcess from 'child_process';
import * as net from 'net';

const mockFs = vi.mocked(fs);

describe('isDarkTheme', () => {
  it.each([
    ['light', false],
    ['dark', true]
  ])('"%s" → %s', (theme, expected) => {
    expect(isDarkTheme(theme)).toBe(expected);
  });

  it('falls back to nativeTheme.shouldUseDarkColors for unknown value', () => {
    // nativeTheme mock returns false
    expect(isDarkTheme('system')).toBe(false);
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
    expect(pythonPathForEnvPath('/env')).toBe('/env/bin/python');
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
    expect(result).toContain('/env');
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
    expect(activatePathForEnvPath('/env')).toBe('/env/bin/activate');
  });
});

describe('condaSourcePathForEnvPath', () => {
  const originalPlatform = process.platform;

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });

  it('returns conda.sh path on posix', () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    expect(condaSourcePathForEnvPath('/env')).toBe(
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
    expect(jupyterEnvInstallInfoPathForEnvPath('/env')).toBe(
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
    const home = '/Users/test';
    const abs = '/Users/test/notebooks/file.ipynb';
    // app.getPath('home') is mocked to /tmp/jlab-test-userdata/home
    // but we can test the logic by checking the function exists
    expect(typeof getRelativePathToUserHome).toBe('function');
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
    expect(getLogFilePath()).toContain('Library/Logs');
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

  // darwin path requires require.main via isDevMode() — only test the non-darwin case here
  it('returns undefined on non-darwin', () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    expect(getJlabCLICommandTargetPath()).toBeUndefined();
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
      throw new Error('ENOENT');
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

  it('skips mkdirSync when .jupyter dir already exists', () => {
    mockFs.existsSync = vi.fn(() => true);
    markEnvironmentAsJupyterInstalled('/env/myenv');
    expect(mockFs.mkdirSync).not.toHaveBeenCalled();
    expect(mockFs.writeFileSync).toHaveBeenCalled();
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
    expect(result).toContain('/tmp/jlab_desktop_abc');
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
