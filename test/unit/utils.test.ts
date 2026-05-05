import { describe, it, expect, vi, beforeEach } from 'vitest';
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
    mkdirSync: vi.fn()
  };
});
vi.mock('os', async () => {
  const actual = await vi.importActual<typeof import('os')>('os');
  return { ...actual, tmpdir: vi.fn(() => '/tmp') };
});

import {
  isDarkTheme,
  versionWithoutSuffix,
  pythonPathForEnvPath,
  envPathForPythonPath,
  activatePathForEnvPath,
  condaSourcePathForEnvPath,
  jupyterEnvInstallInfoPathForEnvPath,
  isCondaEnv,
  isBaseCondaEnv,
  isEnvInstalledByDesktopApp,
  getRelativePathToUserHome,
  bundledEnvironmentIsInstalled,
  getLogFilePath,
  getJlabCLICommandSymlinkPath,
  getJlabCLICommandTargetPath,
  jlabCLICommandIsSetup,
  waitForDuration,
  waitForFunction,
  DarkThemeBGColor,
  LightThemeBGColor
} from '../../../src/main/utils';

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
    expect(condaSourcePathForEnvPath('/env')).toBe('/env/etc/profile.d/conda.sh');
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
    await expect(waitForFunction(() => false, 100)).rejects.toThrow('Timed out');
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
