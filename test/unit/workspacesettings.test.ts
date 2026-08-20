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
    expect(before).not.toBe(ThemeType.Light);
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

describe('WorkspaceSettings — keys it does not claim', () => {
  const written = () =>
    JSON.parse(vi.mocked(fs.writeFileSync).mock.calls[0][1] as string);

  beforeEach(() => {
    mockFs.existsSync = vi.fn(() => true);
    mockFs.writeFileSync = vi.fn();
    mockFs.mkdirSync = vi.fn();
    mockFs.readFileSync = vi.fn((p: fs.PathLike | fs.promises.FileHandle) => {
      if (p.toString().includes('desktop-settings.json')) {
        // uiMode is overridable, theme is not, futureProjectSetting is unknown
        return Buffer.from(
          JSON.stringify({
            uiMode: 'zen',
            theme: 'dark',
            futureProjectSetting: 7
          })
        );
      }
      return Buffer.from(JSON.stringify({ futureGlobalSetting: 42 }));
    });
  });

  it('writes back a key this build has no setting for', () => {
    const ws = new WorkspaceSettings('/data/nb');

    ws.save();

    expect(written().futureProjectSetting).toBe(7);
  });

  it('writes back a key that is not overridable by a project', () => {
    const ws = new WorkspaceSettings('/data/nb');

    ws.save();

    // meaningless in a project file, but deleting somebody's line is worse
    expect(written().theme).toBe('dark');
  });

  it('keeps the global file-s leftovers out of the project file', () => {
    const ws = new WorkspaceSettings('/data/nb');

    ws.save();

    // super.read() fills the base class from settings.json, and this class
    // writes desktop-settings.json: one set each, or they cross over
    expect('futureGlobalSetting' in written()).toBe(false);
  });

  it('writes a value set after that key was unset', () => {
    const ws = new WorkspaceSettings('/data/nb');

    ws.unsetValue(SettingType.uiMode);
    ws.setValue(SettingType.uiMode, UIMode.SingleDocument);
    ws.save();

    // setting a key again has to undo the pending removal, or the write is
    // dropped and the menu action silently does nothing
    expect(written().uiMode).toBe(UIMode.SingleDocument);
  });

  it('drops an override that no longer differs from the global value', () => {
    // only the project file holds it, or super.read() picks the same value up
    // as the global one and the two no longer differ for the wrong reason
    mockFs.readFileSync = vi.fn((p: fs.PathLike | fs.promises.FileHandle) =>
      p.toString().includes('desktop-settings.json')
        ? Buffer.from(JSON.stringify({ serverArgs: '--no-browser' }))
        : Buffer.from('{}')
    ) as any;
    const ws = new WorkspaceSettings('/data/nb');
    expect(ws.getValue(SettingType.serverArgs)).toBe('--no-browser');

    // serverArgs is overridable and the global default is ''
    ws.setValue(SettingType.serverArgs, '');
    ws.save();

    expect('serverArgs' in written()).toBe(false);
  });

  it('drops a leftover when that key is explicitly unset', () => {
    const ws = new WorkspaceSettings('/data/nb');

    // uiMode, because the CLI refuses a key a project cannot override, so a
    // non-overridable one is not a reachable input to unsetValue here
    ws.unsetValue(SettingType.uiMode);
    ws.save();

    expect('uiMode' in written()).toBe(false);
  });
});
