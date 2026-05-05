import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';

vi.mock('../../../src/main/config/settings', () => ({
  userSettings: { getValue: vi.fn(() => null), setValue: vi.fn() },
  SettingType: { condaPath: 'condaPath', pythonPath: 'pythonPath' }
}));
vi.mock('../../../src/main/config/appdata', () => ({
  appData: { discoveredPythonPaths: [], userSetPythonEnvs: [] }
}));
vi.mock('../../../src/main/registry', () => ({
  appRegistry: { getDefaultEnvironment: vi.fn() }
}));
vi.mock('../../../src/main/env', () => ({
  updateDiscoveredPythonPaths: vi.fn(() => Promise.resolve()),
  getCondaPath: vi.fn(() => null),
  getPythonEnvsDirectory: vi.fn(() => '/tmp/envs')
}));
vi.mock('../../../src/main/utils', async () => {
  const actual = await vi.importActual('../../../src/main/utils');
  return {
    ...actual,
    getUserDataDir: vi.fn(() => '/tmp/test-userdata'),
    getUserHomeDir: vi.fn(() => '/tmp/home'),
    getAppDir: vi.fn(() => '/tmp/app')
  };
});

import { parseCLIArgs } from '../../../src/main/cli';

let exitSpy: ReturnType<typeof vi.spyOn>;

beforeAll(() => {
  exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
});
afterAll(() => {
  exitSpy.mockRestore();
});

async function parse(args: string[]) {
  return parseCLIArgs(args);
}

describe('parseCLIArgs', () => {
  it('parses --python-path', async () => {
    const result = await parse(['--python-path', '/usr/bin/python3']);
    expect(result['python-path']).toBe('/usr/bin/python3');
  });

  it('parses --working-dir', async () => {
    const result = await parse(['--working-dir', '/home/user/notebooks']);
    expect(result['working-dir']).toBe('/home/user/notebooks');
  });

  it('parses --log-level debug', async () => {
    const result = await parse(['--log-level', 'debug']);
    expect(result['log-level']).toBe('debug');
  });

  it('defaults log-level to warn', async () => {
    const result = await parse([]);
    expect(result['log-level']).toBe('warn');
  });

  it('defaults persist-session-data to true', async () => {
    const result = await parse([]);
    expect(result['persist-session-data']).toBe(true);
  });

  it('parses --no-persist-session-data', async () => {
    const result = await parse(['--no-persist-session-data']);
    expect(result['persist-session-data']).toBe(false);
  });

  it('parses positional file path', async () => {
    const result = await parse(['/data/test.ipynb']);
    expect(result._).toContain('/data/test.ipynb');
  });

  it('parses multiple positional paths', async () => {
    const result = await parse(['/a.ipynb', '/b.ipynb']);
    expect(result._).toContain('/a.ipynb');
    expect(result._).toContain('/b.ipynb');
  });

  it('parses env subcommand', async () => {
    const result = await parse(['env', 'list']);
    expect(result._[0]).toBe('env');
  });

  it('invalid log-level calls process.exit', async () => {
    await parse(['--log-level', 'invalid']);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
