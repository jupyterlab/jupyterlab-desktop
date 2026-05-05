import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    existsSync: vi.fn(),
    lstatSync: vi.fn(),
    statSync: vi.fn()
  };
});
vi.mock('child_process', async () => {
  const actual = await vi.importActual<typeof import('child_process')>('child_process');
  return { ...actual, execFileSync: vi.fn(), spawn: vi.fn() };
});
vi.mock('../../src/main/config/settings', () => ({
  userSettings: {
    getValue: vi.fn(() => null),
    setValue: vi.fn()
  },
  SettingType: {
    condaPath: 'condaPath',
    pythonPath: 'pythonPath',
    envType: 'envType'
  }
}));
vi.mock('../../src/main/config/appdata', () => ({
  appData: {
    discoveredPythonPaths: [],
    condaPath: null
  }
}));

import {
  environmentSatisfiesRequirements,
  validateCondaChannels,
  validateNewPythonEnvironmentName,
  validatePythonEnvironmentInstallDirectory,
  getCondaPath,
  getCondaChannels,
  getSystemPythonPath,
  condaExePathForEnvPath,
  condaEnvPathForCondaExePath,
  getNextPythonEnvName,
  validatePythonPath
} from '../../src/main/env';
import { appData } from '../../src/main/config/appdata';
import { userSettings } from '../../src/main/config/settings';
import * as childProcess from 'child_process';

const mockFs = vi.mocked(fs);

describe('validateNewPythonEnvironmentName', () => {
  beforeEach(() => {
    mockFs.existsSync = vi.fn(() => false);
  });

  it.each([
    ['valid-name', true],
    ['valid_name_123', true],
    ['MyEnv', true],
    ['', false],
    ['   ', false],
    ['name with spaces', false],
    ['name/slash', false],
    ['name.dot', false],
    ['name@at', false]
  ])('"%s" → valid: %s', (name, expected) => {
    expect(validateNewPythonEnvironmentName(name).valid).toBe(expected);
  });

  it('returns invalid when directory already exists', () => {
    mockFs.existsSync = vi.fn(() => true);
    const result = validateNewPythonEnvironmentName('existing-env');
    expect(result.valid).toBe(false);
    expect(result.message).toMatch(/already exists/i);
  });
});

describe('validatePythonEnvironmentInstallDirectory', () => {
  it('returns invalid for non-existent directory', () => {
    mockFs.existsSync = vi.fn(() => false);
    const result = validatePythonEnvironmentInstallDirectory('/nonexistent');
    expect(result.valid).toBe(false);
    expect(result.message).toMatch(/does not exist/i);
  });

  it('returns invalid for a file (not directory)', () => {
    mockFs.existsSync = vi.fn(() => true);
    mockFs.lstatSync = vi.fn(() => ({ isDirectory: () => false } as fs.Stats));
    const result = validatePythonEnvironmentInstallDirectory('/some/file.txt');
    expect(result.valid).toBe(false);
    expect(result.message).toMatch(/not a directory/i);
  });

  it('returns valid for existing directory', () => {
    mockFs.existsSync = vi.fn(() => true);
    mockFs.lstatSync = vi.fn(() => ({ isDirectory: () => true } as fs.Stats));
    const result = validatePythonEnvironmentInstallDirectory('/valid/dir');
    expect(result.valid).toBe(true);
  });

  it('returns invalid on fs error', () => {
    mockFs.existsSync = vi.fn(() => {
      throw new Error('permission denied');
    });
    const result = validatePythonEnvironmentInstallDirectory('/bad/path');
    expect(result.valid).toBe(false);
  });
});

describe('environmentSatisfiesRequirements', () => {
  it('returns true when jupyterlab version satisfies minimum', () => {
    const env = {
      name: 'test',
      path: '/env',
      versions: { jupyterlab: '4.4.7' }
    } as any;
    expect(environmentSatisfiesRequirements(env)).toBe(true);
  });

  it('returns false when jupyterlab version too old', () => {
    const env = {
      name: 'test',
      path: '/env',
      versions: { jupyterlab: '2.9.9' }
    } as any;
    expect(environmentSatisfiesRequirements(env)).toBe(false);
  });

  it('returns false when version missing', () => {
    const env = {
      name: 'test',
      path: '/env',
      versions: {}
    } as any;
    expect(environmentSatisfiesRequirements(env)).toBe(false);
  });

  it('uses custom requirements when provided', () => {
    const env = {
      name: 'test',
      path: '/env',
      versions: { mylib: '2.0.0' }
    } as any;
    const reqs = [
      {
        name: 'mylib',
        moduleName: 'mylib',
        commands: ['--version'],
        versionRange: new (require('semver').Range)('^2.0.0'),
        pipCommand: 'mylib',
        condaCommand: 'mylib'
      }
    ];
    expect(environmentSatisfiesRequirements(env, reqs)).toBe(true);
  });
});

describe('validateCondaChannels', () => {
  it('returns valid for standard channel string', () => {
    expect(validateCondaChannels('conda-forge defaults').valid).toBe(true);
  });

  it('returns valid for empty string (no extra channels)', () => {
    expect(validateCondaChannels('').valid).toBe(true);
  });

  it('returns invalid for channels with special chars', () => {
    const result = validateCondaChannels('conda-forge; rm -rf /');
    expect(result.valid).toBe(false);
  });
});

describe('condaExePathForEnvPath', () => {
  const originalPlatform = process.platform;

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });

  it('returns bin/conda on posix', () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    expect(condaExePathForEnvPath('/env')).toBe('/env/bin/conda');
  });

  it('returns Scripts/conda.exe on windows', () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    expect(condaExePathForEnvPath('/env')).toContain('conda.exe');
    expect(condaExePathForEnvPath('/env')).toContain('Scripts');
  });
});

describe('condaEnvPathForCondaExePath', () => {
  it('resolves parent directory of bin/conda', () => {
    const result = condaEnvPathForCondaExePath('/opt/conda/bin/conda');
    expect(result).toBe('/opt/conda');
  });

  it('resolves parent directory of Scripts/conda.exe', () => {
    const result = condaEnvPathForCondaExePath('/opt/conda/Scripts/conda.exe');
    expect(result).toBe('/opt/conda');
  });
});

describe('getCondaChannels', () => {
  beforeEach(() => {
    (userSettings as any).getValue = vi.fn(() => null);
  });

  it('returns default conda-forge when no user setting', () => {
    expect(getCondaChannels()).toEqual(['conda-forge']);
  });

  it('returns user-configured channels when set', () => {
    (userSettings as any).getValue = vi.fn(() => ['defaults', 'conda-forge']);
    expect(getCondaChannels()).toEqual(['defaults', 'conda-forge']);
  });

  it('falls back to default when setting is not an array', () => {
    (userSettings as any).getValue = vi.fn(() => 'conda-forge');
    expect(getCondaChannels()).toEqual(['conda-forge']);
  });
});

describe('getCondaPath', () => {
  beforeEach(() => {
    mockFs.existsSync = vi.fn(() => false);
    (userSettings as any).getValue = vi.fn(() => null);
    (appData as any).condaPath = null;
  });

  afterEach(() => {
    delete process.env['CONDA_EXE'];
  });

  it('returns undefined when no conda found', () => {
    expect(getCondaPath()).toBeUndefined();
  });

  it('returns user setting path when it exists', () => {
    (userSettings as any).getValue = vi.fn(() => '/usr/local/conda');
    mockFs.existsSync = vi.fn(() => true);
    expect(getCondaPath()).toBe('/usr/local/conda');
  });

  it('falls through to appData.condaPath when user setting file missing', () => {
    (userSettings as any).getValue = vi.fn(() => '/missing/conda');
    (appData as any).condaPath = '/appdata/conda';
    mockFs.existsSync = vi.fn((p: fs.PathLike) => p.toString() === '/appdata/conda');
    expect(getCondaPath()).toBe('/appdata/conda');
  });

  it('uses CONDA_EXE env var as last resort', () => {
    process.env['CONDA_EXE'] = '/env/conda';
    mockFs.existsSync = vi.fn((p: fs.PathLike) => p.toString() === '/env/conda');
    expect(getCondaPath()).toBe('/env/conda');
  });
});

describe('getSystemPythonPath', () => {
  beforeEach(() => {
    mockFs.existsSync = vi.fn(() => false);
    (userSettings as any).getValue = vi.fn(() => null);
    (appData as any).systemPythonPath = null;
  });

  it('returns undefined when not configured', () => {
    expect(getSystemPythonPath()).toBeUndefined();
  });

  it('returns user setting when file exists', () => {
    (userSettings as any).getValue = vi.fn(() => '/usr/bin/python3');
    mockFs.existsSync = vi.fn(() => true);
    expect(getSystemPythonPath()).toBe('/usr/bin/python3');
  });

  it('falls through to appData.systemPythonPath', () => {
    (userSettings as any).getValue = vi.fn(() => '/missing/python');
    (appData as any).systemPythonPath = '/appdata/python3';
    mockFs.existsSync = vi.fn((p: fs.PathLike) => p.toString() === '/appdata/python3');
    expect(getSystemPythonPath()).toBe('/appdata/python3');
  });
});

describe('getNextPythonEnvName', () => {
  beforeEach(() => {
    (userSettings as any).getValue = vi.fn(() => null);
  });

  it('returns env_1 when no environments exist', () => {
    mockFs.existsSync = vi.fn(() => false);
    const name = getNextPythonEnvName();
    expect(name).toMatch(/^env_\d+$/);
  });

  it('increments index when env_1 already exists', () => {
    let envCheckCount = 0;
    mockFs.existsSync = vi.fn((p: fs.PathLike) => {
      if (p.toString().includes('env_')) {
        envCheckCount++;
        return envCheckCount === 1; // env_1 exists, env_2 does not
      }
      return true; // other paths (install dir etc.) exist
    });
    const name = getNextPythonEnvName();
    expect(name).toMatch(/^env_[2-9]\d*$/);
  });
});

describe('validatePythonPath', () => {
  const mockExecFileSync = vi.mocked(childProcess.execFileSync);

  beforeEach(() => {
    mockFs.existsSync = vi.fn(() => false);
    mockFs.lstatSync = vi.fn(() => ({ isFile: () => false, isSymbolicLink: () => false } as fs.Stats));
    mockExecFileSync.mockReset();
  });

  it('returns invalid when path does not exist', async () => {
    mockFs.existsSync = vi.fn(() => false);
    const result = await validatePythonPath('/nonexistent/python');
    expect(result.valid).toBe(false);
    expect(result.message).toMatch(/does not exist/i);
  });

  it('returns invalid when path is not a file or symlink', async () => {
    mockFs.existsSync = vi.fn(() => true);
    mockFs.lstatSync = vi.fn(() => ({ isFile: () => false, isSymbolicLink: () => false } as fs.Stats));
    const result = await validatePythonPath('/some/dir');
    expect(result.valid).toBe(false);
    expect(result.message).toMatch(/not a valid file/i);
  });

  it('returns valid when file exists and execFileSync returns Python version', async () => {
    mockFs.existsSync = vi.fn(() => true);
    mockFs.lstatSync = vi.fn(() => ({ isFile: () => true, isSymbolicLink: () => false } as fs.Stats));
    mockExecFileSync.mockReturnValue(Buffer.from('Python 3.11.0\n'));
    const result = await validatePythonPath('/usr/bin/python3');
    expect(result.valid).toBe(true);
  });

  it('returns invalid when execFileSync does not return Python version string', async () => {
    mockFs.existsSync = vi.fn(() => true);
    mockFs.lstatSync = vi.fn(() => ({ isFile: () => true, isSymbolicLink: () => false } as fs.Stats));
    mockExecFileSync.mockReturnValue(Buffer.from('not a python binary\n'));
    const result = await validatePythonPath('/usr/bin/ruby');
    expect(result.valid).toBe(false);
  });

  it('returns invalid when execFileSync throws', async () => {
    mockFs.existsSync = vi.fn(() => true);
    mockFs.lstatSync = vi.fn(() => ({ isFile: () => true, isSymbolicLink: () => false } as fs.Stats));
    mockExecFileSync.mockImplementation(() => { throw new Error('spawn error'); });
    const result = await validatePythonPath('/bad/python');
    expect(result.valid).toBe(false);
  });

  it('accepts symlinks as valid path type', async () => {
    mockFs.existsSync = vi.fn(() => true);
    mockFs.lstatSync = vi.fn(() => ({ isFile: () => false, isSymbolicLink: () => true } as fs.Stats));
    mockExecFileSync.mockReturnValue(Buffer.from('Python 3.10.0\n'));
    const result = await validatePythonPath('/usr/local/bin/python');
    expect(result.valid).toBe(true);
  });
});
