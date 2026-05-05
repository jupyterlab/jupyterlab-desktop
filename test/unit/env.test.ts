import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    existsSync: vi.fn(),
    lstatSync: vi.fn()
  };
});
vi.mock('../../../src/main/config/settings', () => ({
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
vi.mock('../../../src/main/config/appdata', () => ({
  appData: {
    discoveredPythonPaths: [],
    condaPath: null
  }
}));

import {
  validateNewPythonEnvironmentName,
  validatePythonEnvironmentInstallDirectory,
  environmentSatisfiesRequirements,
  validateCondaChannels
} from '../../../src/main/env';

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
    mockFs.existsSync = vi.fn(() => { throw new Error('permission denied'); });
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
    const env = { name: 'test', path: '/env', versions: { mylib: '2.0.0' } } as any;
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
