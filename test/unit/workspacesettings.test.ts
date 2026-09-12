import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import log from 'electron-log';

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    existsSync: vi.fn(),
    lstatSync: vi.fn(),
    readFileSync: vi.fn(() => {
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    }),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
    renameSync: vi.fn(),
    realpathSync: vi.fn((target: any) => target),
    fchownSync: vi.fn(),
    fchmodSync: vi.fn(),
    openSync: vi.fn(() => 7),
    fsyncSync: vi.fn(),
    closeSync: vi.fn(),
    unlinkSync: vi.fn()
  };
});

import {
  SettingType,
  ThemeType,
  UIMode,
  UserSettings,
  WorkspaceSettings
} from '../../src/main/config/settings';
import { resetConfigFile } from '../../src/main/utils';

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
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
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
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
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
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
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
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    });
    mockFs.writeFileSync = vi.fn();
    mockFs.mkdirSync = vi.fn();
    mockFs.renameSync = vi.fn();
    mockFs.realpathSync = vi.fn((target: any) => target) as any;
    mockFs.statSync = vi.fn(() => {
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    }) as any;
    mockFs.fchownSync = vi.fn();
    mockFs.fchmodSync = vi.fn();
    mockFs.openSync = vi.fn(() => 7) as any;
    mockFs.fsyncSync = vi.fn();
    mockFs.closeSync = vi.fn();
    mockFs.unlinkSync = vi.fn();
  });

  it('writes desktop-settings.json when workspace settings differ from user settings', () => {
    const ws = new WorkspaceSettings('/data/nb');
    // uiMode is wsOverridable and always saved when present
    ws.setValue(SettingType.uiMode, UIMode.Zen);
    ws.save();
    const [, target] = (mockFs.renameSync as any).mock.calls[0];
    expect(target).toContain('desktop-settings.json');
    const [, content] = (mockFs.writeFileSync as any).mock.calls[0];
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

  // A project override is written only when it differs from the *user* value, and the user value comes from the global settings.json. Marked unreadable, that read yields defaults, so an override that happens to equal the default stops looking like an override and is dropped from a workspace file that was perfectly readable. On master this path never ran, because a corrupt global crashed the app during import.
  const corruptGlobalAndReadableWorkspace = () => {
    mockFs.existsSync = vi.fn(() => true);
    mockFs.readFileSync = vi.fn((target: any) => {
      if (String(target).includes('desktop-settings.json')) {
        return Buffer.from(JSON.stringify({ serverArgs: '' }));
      }
      return Buffer.from('{ this is not json');
    }) as any;
  };

  // the mark lives in module state, so it outlives the test that set it. settings.test.ts and appdata.test.ts both carry this hook for the same reason; without it the next test appended here gets a refused write it did not ask for, and the failure points at that test rather than at this one.
  afterEach(() => {
    // resetConfigFile scans twenty quarantine slots and gives up when they all exist, so with the fixture's existsSync still answering true it returns false and clears nothing. appdata.test.ts and settings.test.ts both set this before calling it; this one did not, and the hook was a no-op that read as cleanup.
    mockFs.existsSync = vi.fn(() => false);
    mockFs.renameSync = vi.fn();
    resetConfigFile(UserSettings.getUserSettingsPath());
  });

  it('refuses to rewrite the workspace file when the global one is unreadable', () => {
    corruptGlobalAndReadableWorkspace();

    const ws = new WorkspaceSettings('/data/nb');

    expect(ws.save()).toBe(false);
    // the override survives because nothing was written over it
    expect(mockFs.writeFileSync).not.toHaveBeenCalled();
    // and it is logged, because all three GUI callers discard the boolean: without this the refusal reaches nobody
    expect(log.error).toHaveBeenCalledWith(
      expect.stringContaining('desktop-settings.json')
    );
  });

  // Guards the afterEach above rather than the code: the mark is module state, and without a working reset this fails while pointing at itself instead of at the corrupt-global test that left it.
  it('is not left refusing writes by the test before it', () => {
    mockFs.existsSync = vi.fn(() => false);
    const ws = new WorkspaceSettings('/data/nb');
    ws.setValue(SettingType.uiMode, UIMode.Zen);

    expect(ws.save()).toBe(true);
  });
});
