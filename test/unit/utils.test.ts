import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { join } from 'path';

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
  DarkThemeBGColor,
  envPathForPythonPath,
  getJlabCLICommandSymlinkPath,
  getJlabCLICommandTargetPath,
  getLogFilePath,
  getRelativePathToUserHome,
  isBaseCondaEnv,
  isCondaEnv,
  isDarkTheme,
  isEnvInstalledByDesktopApp,
  jlabCLICommandIsSetup,
  jupyterEnvInstallInfoPathForEnvPath,
  LightThemeBGColor,
  openDirectoryInExplorer,
  pythonPathForEnvPath,
  versionWithoutSuffix,
  waitForDuration,
  waitForFunction
} from '../../src/main/utils';
import * as childProcess from 'child_process';

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
  it('replaces home prefix with ~ for paths under home', async () => {
    // resolve the mocked home path at runtime so symlinks (e.g. macOS /var
    // vs /private/var) and platform differences do not break the prefix match
    const { getUserHomeDir } = await import('../../src/main/utils');
    const home = getUserHomeDir();
    const result = getRelativePathToUserHome(
      join(home, 'notebooks', 'file.ipynb')
    );
    expect(result).toBe(`~${path.sep}notebooks${path.sep}file.ipynb`);
  });

  it('returns undefined for paths not under home', () => {
    expect(
      getRelativePathToUserHome('/totally/unrelated/path')
    ).toBeUndefined();
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
