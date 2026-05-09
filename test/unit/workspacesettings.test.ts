import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    existsSync: vi.fn(),
    lstatSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn()
  };
});

import {
  resolveWorkingDirectory,
  SettingType,
  ThemeType,
  UIMode,
  WorkspaceSettings
} from '../../src/main/config/settings';

const mockFs = vi.mocked(fs);

describe('WorkspaceSettings.getWorkspaceSettingsPath', () => {
  it('returns .jupyter/desktop-settings.json inside working dir', () => {
    const result = WorkspaceSettings.getWorkspaceSettingsPath(
      '/data/notebooks'
    );
    expect(result).toBe(
      path.join('/data/notebooks', '.jupyter', 'desktop-settings.json')
    );
  });
});

describe('WorkspaceSettings — no workspace file', () => {
  beforeEach(() => {
    // user settings file does not exist, workspace settings file does not exist
    mockFs.existsSync = vi.fn(() => false);
    mockFs.readFileSync = vi.fn(() => {
      throw new Error('ENOENT');
    });
  });

  it('constructs without throwing', () => {
    expect(() => new WorkspaceSettings('/data/nb')).not.toThrow();
  });

  it('hasValue returns false for any setting when no workspace file', () => {
    const ws = new WorkspaceSettings('/data/nb');
    expect(ws.hasValue(SettingType.theme)).toBe(false);
  });

  it('getValue falls through to user default when no workspace override', () => {
    const ws = new WorkspaceSettings('/data/nb');
    // theme default is 'system'
    const val = ws.getValue(SettingType.theme);
    expect(typeof val).toBe('string');
  });
});

describe('WorkspaceSettings — with workspace file', () => {
  beforeEach(() => {
    mockFs.existsSync = vi.fn((p: fs.PathLike) => {
      return p.toString().includes('desktop-settings.json');
    });
    mockFs.readFileSync = vi.fn((p: fs.PathLike | fs.promises.FileHandle) => {
      if (p.toString().includes('desktop-settings.json')) {
        // serverArgs and uiMode are wsOverridable
        return Buffer.from(
          JSON.stringify({ serverArgs: '--no-browser', uiMode: 'zen' })
        );
      }
      throw new Error('ENOENT');
    });
  });

  it('reads workspace-overridden serverArgs', () => {
    const ws = new WorkspaceSettings('/data/nb');
    expect(ws.getValue(SettingType.serverArgs)).toBe('--no-browser');
  });

  it('reads workspace-overridden uiMode', () => {
    const ws = new WorkspaceSettings('/data/nb');
    expect(ws.getValue(SettingType.uiMode)).toBe(UIMode.Zen);
  });

  it('hasValue returns true for overridden setting', () => {
    const ws = new WorkspaceSettings('/data/nb');
    expect(ws.hasValue(SettingType.serverArgs)).toBe(true);
  });

  it('hasValue returns false for non-overridden setting', () => {
    const ws = new WorkspaceSettings('/data/nb');
    expect(ws.hasValue(SettingType.theme)).toBe(false);
  });

  it('non-overridden settings still return global default', () => {
    const ws = new WorkspaceSettings('/data/nb');
    // theme is not wsOverridable, should still have default
    expect(typeof ws.getValue(SettingType.theme)).toBe('string');
  });
});

describe('WorkspaceSettings setValue / unsetValue', () => {
  beforeEach(() => {
    mockFs.existsSync = vi.fn(() => false);
    mockFs.readFileSync = vi.fn(() => {
      throw new Error('ENOENT');
    });
  });

  it('setValue sets workspace-level value', () => {
    const ws = new WorkspaceSettings('/data/nb');
    ws.setValue(SettingType.theme, ThemeType.Dark);
    expect(ws.getValue(SettingType.theme)).toBe(ThemeType.Dark);
    expect(ws.hasValue(SettingType.theme)).toBe(true);
  });

  it('setValue overrides default', () => {
    const ws = new WorkspaceSettings('/data/nb');
    const before = ws.getValue(SettingType.theme);
    ws.setValue(SettingType.theme, ThemeType.Light);
    expect(ws.getValue(SettingType.theme)).toBe(ThemeType.Light);
  });

  it('unsetValue removes workspace override', () => {
    const ws = new WorkspaceSettings('/data/nb');
    ws.setValue(SettingType.theme, ThemeType.Dark);
    ws.unsetValue(SettingType.theme);
    expect(ws.hasValue(SettingType.theme)).toBe(false);
  });
});

describe('WorkspaceSettings save', () => {
  beforeEach(() => {
    mockFs.existsSync = vi.fn(() => false);
    mockFs.readFileSync = vi.fn(() => {
      throw new Error('ENOENT');
    });
    mockFs.writeFileSync = vi.fn();
    mockFs.mkdirSync = vi.fn();
  });

  it('writes desktop-settings.json when workspace settings differ from user settings', () => {
    const ws = new WorkspaceSettings('/data/nb');
    // uiMode is wsOverridable and always saved when present
    ws.setValue(SettingType.uiMode, UIMode.Zen);
    ws.save();
    expect(mockFs.writeFileSync).toHaveBeenCalled();
    const [writePath, content] = (mockFs.writeFileSync as any).mock.calls[0];
    expect(writePath).toContain('desktop-settings.json');
    const parsed = JSON.parse(content as string);
    expect(parsed.uiMode).toBe(UIMode.Zen);
  });

  it('creates parent directory when it does not exist', () => {
    const ws = new WorkspaceSettings('/data/nb');
    ws.setValue(SettingType.uiMode, UIMode.Zen);
    ws.save();
    expect(mockFs.mkdirSync).toHaveBeenCalled();
  });

  it('does not write when no workspace settings changed and file does not exist', () => {
    const ws = new WorkspaceSettings('/data/nb');
    ws.save();
    expect(mockFs.writeFileSync).not.toHaveBeenCalled();
  });
});
