import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    existsSync: vi.fn(),
    lstatSync: vi.fn(),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    readFileSync: vi.fn(() => {
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    }),
    renameSync: vi.fn(),
    realpathSync: vi.fn((target: any) => target),
    chownSync: vi.fn(),
    fchmodSync: vi.fn(),
    openSync: vi.fn(() => 7),
    fsyncSync: vi.fn(),
    closeSync: vi.fn(),
    unlinkSync: vi.fn()
  };
});

import {
  CtrlWBehavior,
  DEFAULT_WIN_HEIGHT,
  DEFAULT_WIN_WIDTH,
  LogLevel,
  resolveWorkingDirectory,
  serverLaunchArgsDefault,
  serverLaunchArgsFixed,
  Setting,
  SettingType,
  StartupMode,
  ThemeType,
  UIMode,
  UserSettings
} from '../../src/main/config/settings';
import { resetConfigFile } from '../../src/main/utils';

const mockFs = vi.mocked(fs);

// readFileSync is stubbed for the whole file now, so an existsSync left set to true by one test would feed the next one whatever the previous body returned.
beforeEach(() => {
  vi.clearAllMocks();
  mockFs.existsSync = vi.fn();
  mockFs.lstatSync = vi.fn();
  mockFs.mkdirSync = vi.fn();
  mockFs.writeFileSync = vi.fn();
  // an undefined return makes readJsonConfigFile throw a TypeError with no code, which marks the path for every test that follows
  mockFs.readFileSync = vi.fn(() => {
    throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
  }) as any;
  mockFs.renameSync = vi.fn();
  mockFs.realpathSync = vi.fn((target: any) => target) as any;
  mockFs.statSync = vi.fn(() => {
    throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
  }) as any;
  mockFs.chownSync = vi.fn();
  mockFs.fchmodSync = vi.fn();
  // the config write goes to a sibling temporary and is renamed over the target, so these three stand between save() and the real filesystem
  mockFs.openSync = vi.fn(() => 7) as any;
  mockFs.fsyncSync = vi.fn();
  mockFs.closeSync = vi.fn();
  mockFs.unlinkSync = vi.fn();
});

describe('constants', () => {
  it('DEFAULT_WIN_WIDTH is 1024', () => expect(DEFAULT_WIN_WIDTH).toBe(1024));
  it('DEFAULT_WIN_HEIGHT is 768', () => expect(DEFAULT_WIN_HEIGHT).toBe(768));
});

describe('enums', () => {
  it('ThemeType has system/light/dark', () => {
    expect(ThemeType.System).toBe('system');
    expect(ThemeType.Light).toBe('light');
    expect(ThemeType.Dark).toBe('dark');
  });

  it('StartupMode values are correct', () => {
    expect(StartupMode.WelcomePage).toBe('welcome-page');
    expect(StartupMode.LastSessions).toBe('restore-sessions');
  });

  it('LogLevel values are correct', () => {
    expect(LogLevel.Error).toBe('error');
    expect(LogLevel.Debug).toBe('debug');
  });

  it('CtrlWBehavior values are correct', () => {
    expect(CtrlWBehavior.CloseWindow).toBe('close');
    expect(CtrlWBehavior.Warn).toBe('warn');
  });

  it('UIMode values are correct', () => {
    expect(UIMode.MultiDocument).toBe('multi-document');
    expect(UIMode.Zen).toBe('zen');
  });
});

describe('serverLaunchArgsFixed', () => {
  it('contains --no-browser', () => {
    expect(serverLaunchArgsFixed).toContain('--no-browser');
  });

  it('contains port placeholder', () => {
    expect(serverLaunchArgsFixed.some(a => a.includes('{port}'))).toBe(true);
  });

  it('contains token placeholder', () => {
    expect(serverLaunchArgsFixed.some(a => a.includes('{token}'))).toBe(true);
  });

  it('disables browser', () => {
    expect(serverLaunchArgsFixed).toContain('--no-browser');
  });

  it('disables quit button', () => {
    expect(serverLaunchArgsFixed).toContain('--LabApp.quit_button=False');
  });
});

describe('serverLaunchArgsDefault', () => {
  it('allows hidden files', () => {
    expect(
      serverLaunchArgsDefault.some(a => a.includes('allow_hidden=True'))
    ).toBe(true);
  });
});

describe('resolveWorkingDirectory', () => {
  it('returns home when no directory given', () => {
    // app.getPath mock returns /tmp/jlab-test-userdata/home
    const result = resolveWorkingDirectory('');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('returns given path when it is a valid directory', () => {
    mockFs.lstatSync = vi.fn(() => ({ isDirectory: () => true } as fs.Stats));
    const result = resolveWorkingDirectory('/valid/dir');
    expect(result).toBe('/valid/dir');
  });

  it('resets to home when path is a file not a directory', () => {
    mockFs.lstatSync = vi.fn(() => ({ isDirectory: () => false } as fs.Stats));
    const result = resolveWorkingDirectory('/some/file.txt');
    expect(result).not.toBe('/some/file.txt');
  });

  it('resets to home when path does not exist', () => {
    mockFs.lstatSync = vi.fn(() => {
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    });
    const result = resolveWorkingDirectory('/nonexistent/path');
    expect(result).not.toBe('/nonexistent/path');
  });

  it('keeps invalid path when resetIfInvalid is false', () => {
    mockFs.lstatSync = vi.fn(() => {
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    });
    const result = resolveWorkingDirectory('/bad/path', false);
    expect(result).toBe('/bad/path');
  });
});

describe('Setting', () => {
  it('returns the default value until one is set', () => {
    const s = new Setting<string>('def');
    expect(s.value).toBe('def');
    expect(s.valueSet).toBe(false);
  });

  it('returns the assigned value after it is set', () => {
    const s = new Setting<string>('def');
    s.value = 'changed';
    expect(s.value).toBe('changed');
    expect(s.valueSet).toBe(true);
  });

  it('reports differentThanDefault only after a real change', () => {
    const s = new Setting<number>(10);
    expect(s.differentThanDefault).toBe(false);
    s.value = 11;
    expect(s.differentThanDefault).toBe(true);
  });

  it('setToDefault restores the default value', () => {
    const s = new Setting<string>('def');
    s.value = 'x';
    s.setToDefault();
    expect(s.value).toBe('def');
    expect(s.differentThanDefault).toBe(false);
  });
});

describe('UserSettings', () => {
  // the unreadable-config list is module state keyed by path, and every UserSettings here reads the same path, so a test that leaves one marked would decide the outcome of the next
  afterEach(() => {
    mockFs.existsSync = vi.fn(() => false);
    mockFs.renameSync = vi.fn();
    resetConfigFile(UserSettings.getUserSettingsPath());
  });

  it('getValue returns the default before any change', () => {
    const us = new UserSettings(false);
    expect(us.getValue(SettingType.theme)).toBe(ThemeType.System);
  });

  it('setValue then getValue round-trips a non-default value', () => {
    const us = new UserSettings(false);
    us.setValue(SettingType.theme, ThemeType.Light);
    expect(us.getValue(SettingType.theme)).toBe(ThemeType.Light);
  });

  it('unsetValue restores the default', () => {
    const us = new UserSettings(false);
    us.setValue(SettingType.theme, ThemeType.Light);
    us.unsetValue(SettingType.theme);
    expect(us.getValue(SettingType.theme)).toBe(ThemeType.System);
  });

  it('starts on defaults instead of throwing when settings.json is corrupt', () => {
    // reading is done while this module is still being imported, so a throw here takes the app down before a window exists (#824)
    mockFs.existsSync = vi.fn(() => true);
    mockFs.readFileSync = vi.fn(() => Buffer.from('{"theme": "dark",}')) as any;

    const us = new UserSettings(true);

    expect(us.getValue(SettingType.theme)).toBe(ThemeType.System);
  });

  it('does not save defaults over a settings.json it could not read', () => {
    mockFs.existsSync = vi.fn(() => true);
    mockFs.readFileSync = vi.fn(() => Buffer.from('{"theme": "dark",}')) as any;

    const us = new UserSettings(true);
    us.save();

    expect(mockFs.openSync).not.toHaveBeenCalled();
    expect(mockFs.writeFileSync).not.toHaveBeenCalled();
    expect(mockFs.renameSync).not.toHaveBeenCalled();
  });

  it('ignores a value whose shape does not match the default', () => {
    mockFs.existsSync = vi.fn(() => true);
    mockFs.readFileSync = vi.fn(() =>
      Buffer.from(JSON.stringify({ condaChannels: 'conda-forge' }))
    ) as any;

    const us = new UserSettings(true);

    // a string here would reach join() later and throw there instead
    expect(us.getValue(SettingType.condaChannels)).toEqual(['conda-forge']);
  });

  it('ignores null, which typeof calls an object', () => {
    mockFs.existsSync = vi.fn(() => true);
    mockFs.readFileSync = vi.fn(() =>
      Buffer.from(JSON.stringify({ serverEnvVars: null }))
    ) as any;

    const us = new UserSettings(true);

    // the settings dialog runs Object.keys on this
    expect(us.getValue(SettingType.serverEnvVars)).toEqual({});
  });

  it('applies the values it finds in a valid settings.json', () => {
    mockFs.existsSync = vi.fn(() => true);
    mockFs.readFileSync = vi.fn(() => Buffer.from('{"theme": "dark"}')) as any;

    const us = new UserSettings(true);

    expect(us.getValue(SettingType.theme)).toBe(ThemeType.Dark);
  });

  it('save persists only settings that differ from their default', () => {
    mockFs.writeFileSync = vi.fn();
    const us = new UserSettings(false);
    us.setValue(SettingType.theme, ThemeType.Light);
    us.save();
    const written = JSON.parse(
      (mockFs.writeFileSync as any).mock.calls[0][1] as string
    );
    expect(written).toHaveProperty('theme', ThemeType.Light);
    expect(written).not.toHaveProperty('logLevel');
  });
});
