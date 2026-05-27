import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import { execFileSync, spawn } from 'child_process';

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    existsSync: vi.fn(() => true),
    lstatSync: vi.fn()
  };
});
vi.mock('child_process', async () => {
  const actual = await vi.importActual<typeof import('child_process')>(
    'child_process'
  );
  return { ...actual, execFileSync: vi.fn(), spawn: vi.fn() };
});
vi.mock('../../src/main/utils', () => ({
  createCommandScriptInEnv: vi.fn(() => 'SCRIPT'),
  isBaseCondaEnv: vi.fn(() => true),
  runCommand: vi.fn(),
  runCommandSync: vi.fn(),
  getBundledPythonInstallDir: vi.fn(() => '/install'),
  envPathForPythonPath: vi.fn((p: string) => p),
  pythonPathForEnvPath: vi.fn((p: string) => `${p}/bin/python`),
  versionWithoutSuffix: vi.fn((v: string) => v)
}));
vi.mock('../../src/main/config/settings', () => ({
  userSettings: {
    getValue: vi.fn(() => '/conda/condabin/conda'),
    setValue: vi.fn()
  },
  SettingType: {
    condaPath: 'condaPath',
    condaChannels: 'condaChannels',
    systemPythonPath: 'systemPythonPath',
    pythonEnvsPath: 'pythonEnvsPath'
  }
}));
vi.mock('../../src/main/config/appdata', () => ({
  appData: {
    condaPath: null,
    systemPythonPath: null,
    pythonPath: null
  }
}));

import * as env from '../../src/main/env';
import {
  isBaseCondaEnv,
  runCommand,
  runCommandSync
} from '../../src/main/utils';

const mockFs = vi.mocked(fs);
const mockSpawn = vi.mocked(spawn);
const mockExecFileSync = vi.mocked(execFileSync);

// A fake child process: emits the given stdout/stderr data synchronously when
// listeners attach, then fires 'close' with the given exit code.
function makeChild(opts: { stdout?: string; stderr?: string; code?: number }) {
  return {
    stdout: {
      on: (event: string, cb: (chunk: Buffer) => void) => {
        if (event === 'data' && opts.stdout !== undefined) {
          cb(Buffer.from(opts.stdout));
        }
      }
    },
    stderr: {
      on: (event: string, cb: (chunk: Buffer) => void) => {
        if (event === 'data' && opts.stderr !== undefined) {
          cb(Buffer.from(opts.stderr));
        }
      }
    },
    on: (event: string, cb: (code: number) => void) => {
      if (event === 'close') {
        cb(opts.code ?? 0);
      }
    }
  } as any;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFs.existsSync = vi.fn(() => true);
  mockFs.lstatSync = vi.fn(
    () => ({ isFile: () => true, isSymbolicLink: () => false } as fs.Stats)
  );
  vi.mocked(isBaseCondaEnv).mockReturnValue(true);
});

describe('runCommandInEnvironment', () => {
  it('spawns bash with -c and the env script and resolves true on exit code 0', async () => {
    mockSpawn.mockReturnValue(makeChild({ code: 0 }));
    const result = await env.runCommandInEnvironment(
      '/envs/a',
      'jupyter --version'
    );
    expect(mockSpawn).toHaveBeenCalledWith(
      'bash',
      ['-c', 'SCRIPT'],
      expect.objectContaining({
        env: expect.objectContaining({ BASH_SILENCE_DEPRECATION_WARNING: '1' })
      })
    );
    expect(result).toBe(true);
  });

  it('resolves false on a non-zero exit code', async () => {
    mockSpawn.mockReturnValue(makeChild({ code: 1 }));
    const result = await env.runCommandInEnvironment('/envs/a', 'bad-cmd');
    expect(result).toBe(false);
  });

  it('forwards stdout chunks to the stdout callback', async () => {
    mockSpawn.mockReturnValue(makeChild({ stdout: 'hello', code: 0 }));
    const stdout = vi.fn();
    await env.runCommandInEnvironment('/envs/a', 'echo hello', { stdout });
    expect(stdout).toHaveBeenCalledWith('hello');
  });
});

describe('validatePythonPath', () => {
  it('is valid when the executable reports a Python version', async () => {
    mockExecFileSync.mockReturnValue(Buffer.from('Python 3.11.4'));
    const result = await env.validatePythonPath('/usr/bin/python3');
    expect(mockExecFileSync).toHaveBeenCalledWith('/usr/bin/python3', [
      '--version'
    ]);
    expect(result.valid).toBe(true);
  });

  it('is invalid when the path does not exist', async () => {
    mockFs.existsSync = vi.fn(() => false);
    const result = await env.validatePythonPath('/nope');
    expect(result.valid).toBe(false);
    expect(result.message).toMatch(/does not exist/i);
  });

  it('is invalid when the output is not a Python version banner', async () => {
    mockExecFileSync.mockReturnValue(Buffer.from('bash: not python'));
    const result = await env.validatePythonPath('/usr/bin/python3');
    expect(result.valid).toBe(false);
  });

  it('is invalid when execFileSync throws', async () => {
    mockExecFileSync.mockImplementation(() => {
      throw new Error('ENOENT');
    });
    const result = await env.validatePythonPath('/usr/bin/python3');
    expect(result.valid).toBe(false);
  });
});

describe('validateSystemPythonPath', () => {
  it('is valid when the probe prints the sentinel', async () => {
    mockExecFileSync.mockReturnValue(Buffer.from(':valid:\n'));
    const result = await env.validateSystemPythonPath('/usr/bin/python3');
    expect(mockExecFileSync).toHaveBeenCalledWith('/usr/bin/python3', [
      '-c',
      'print(":valid:")'
    ]);
    expect(result.valid).toBe(true);
  });

  it('is invalid when execFileSync throws', async () => {
    mockExecFileSync.mockImplementation(() => {
      throw new Error('boom');
    });
    const result = await env.validateSystemPythonPath('/usr/bin/python3');
    expect(result.valid).toBe(false);
  });
});

describe('validateCondaPath', () => {
  it('is valid when conda info reports a conda_version', async () => {
    mockSpawn.mockReturnValue(
      makeChild({ stdout: '{"conda_version":"23.1.0"}', code: 0 })
    );
    const result = await env.validateCondaPath('/conda/condabin/conda');
    expect(result.valid).toBe(true);
  });

  it('is invalid when the executable is not in a base conda environment', async () => {
    vi.mocked(isBaseCondaEnv).mockReturnValue(false);
    const result = await env.validateCondaPath('/conda/condabin/conda');
    expect(result.valid).toBe(false);
    expect(result.message).toMatch(/base conda/i);
  });

  it('is invalid when conda info output lacks conda_version', async () => {
    mockSpawn.mockReturnValue(makeChild({ stdout: '{"other":1}', code: 0 }));
    const result = await env.validateCondaPath('/conda/condabin/conda');
    expect(result.valid).toBe(false);
  });
});

describe('getEnvironmentInfoFromPythonPath', () => {
  it('maps a conda-root env_info payload to a CondaRoot environment', async () => {
    vi.mocked(runCommand).mockResolvedValue(
      JSON.stringify({
        type: 'conda-root',
        name: 'base',
        versions: { jupyterlab: '4.4.7' },
        defaultKernel: 'python3'
      })
    );
    const result = await env.getEnvironmentInfoFromPythonPath(
      '/conda/bin/python'
    );
    expect(result.path).toBe('/conda/bin/python');
    expect(result.name).toMatch(/base/);
    expect(result.versions.jupyterlab).toBe('4.4.7');
  });

  it('returns undefined when the probe command fails', async () => {
    vi.mocked(runCommand).mockRejectedValue(new Error('spawn failed'));
    const result = await env.getEnvironmentInfoFromPythonPath('/bad/python');
    expect(result).toBeUndefined();
  });
});

describe('getEnvironmentInfoFromPythonPathSync', () => {
  it('maps a venv env_info payload to a VirtualEnv environment', () => {
    vi.mocked(runCommandSync).mockReturnValue(
      JSON.stringify({
        type: 'venv',
        name: 'myenv',
        versions: {},
        defaultKernel: 'python3'
      })
    );
    const result = env.getEnvironmentInfoFromPythonPathSync(
      '/envs/a/bin/python'
    );
    expect(result.path).toBe('/envs/a/bin/python');
    expect(result.name).toMatch(/myenv/);
  });
});

describe('runCommandInEnvironment on Windows', () => {
  const original = process.platform;
  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: original });
  });

  it('spawns cmd with /c and verbatim arguments', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    mockSpawn.mockReturnValue(makeChild({ code: 0 }));
    await env.runCommandInEnvironment('/envs/a', 'dir');
    expect(mockSpawn).toHaveBeenCalledWith(
      'cmd',
      ['/c', 'SCRIPT'],
      expect.objectContaining({ windowsVerbatimArguments: true })
    );
  });
});
