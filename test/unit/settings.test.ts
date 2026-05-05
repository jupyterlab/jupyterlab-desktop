import { describe, it, expect, vi } from 'vitest';
import * as fs from 'fs';

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return { ...actual, existsSync: vi.fn(), lstatSync: vi.fn(), mkdirSync: vi.fn() };
});

import {
  ThemeType,
  StartupMode,
  LogLevel,
  CtrlWBehavior,
  UIMode,
  SettingType,
  serverLaunchArgsFixed,
  serverLaunchArgsDefault,
  DEFAULT_WIN_WIDTH,
  DEFAULT_WIN_HEIGHT,
  resolveWorkingDirectory
} from '../../../src/main/config/settings';

const mockFs = vi.mocked(fs);

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
    expect(serverLaunchArgsDefault.some(a => a.includes('allow_hidden=True'))).toBe(true);
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
    mockFs.lstatSync = vi.fn(() => { throw new Error('ENOENT'); });
    const result = resolveWorkingDirectory('/nonexistent/path');
    expect(result).not.toBe('/nonexistent/path');
  });

  it('keeps invalid path when resetIfInvalid is false', () => {
    mockFs.lstatSync = vi.fn(() => { throw new Error('ENOENT'); });
    const result = resolveWorkingDirectory('/bad/path', false);
    expect(result).toBe('/bad/path');
  });
});
