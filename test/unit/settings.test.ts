import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import log from 'electron-log';

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    existsSync: vi.fn(),
    lstatSync: vi.fn(),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    // a vi.fn() with no implementation returns undefined, and the reader calls .toString() on it: throw what fs throws for a missing file instead
    readFileSync: vi.fn(() => {
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    })
  };
});

import {
  CtrlWBehavior,
  DEFAULT_WIN_HEIGHT,
  DEFAULT_WIN_WIDTH,
  LogLevel,
  resetUnreadableReports,
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

const mockFs = vi.mocked(fs);

// save() reads the file before merging over it, so a stub left set by one test would feed the next one whatever the previous body returned
beforeEach(() => {
  vi.clearAllMocks();
  mockFs.existsSync = vi.fn();
  mockFs.lstatSync = vi.fn();
  mockFs.mkdirSync = vi.fn();
  mockFs.writeFileSync = vi.fn();
  mockFs.readFileSync = vi.fn(() => {
    throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
  }) as any;
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
      throw new Error('ENOENT');
    });
    const result = resolveWorkingDirectory('/nonexistent/path');
    expect(result).not.toBe('/nonexistent/path');
  });

  it('keeps invalid path when resetIfInvalid is false', () => {
    mockFs.lstatSync = vi.fn(() => {
      throw new Error('ENOENT');
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

  it('does not let a __proto__ key out of the file reach Object.prototype', () => {
    // read walks SettingType rather than the file, so nothing out of the file ever indexes _settings. Walking the file instead resolved '__proto__' to Object.prototype and assigned onto it, at module import.
    mockFs.existsSync = vi.fn(() => true);
    mockFs.readFileSync = vi.fn(() =>
      Buffer.from('{"__proto__":{"pwned":1},"theme":"dark"}')
    ) as any;
    mockFs.writeFileSync = vi.fn();

    try {
      const us = new UserSettings(true);
      us.save();

      // What each of these is worth, measured rather than assumed, after two earlier versions of this comment got it wrong.
      //
      // Against `read` walking the file instead of the enum: no assertion fires at all. The test dies first with `TypeError: Invalid property descriptor`, out of the assignment itself. The mutation is caught, by the throw, and leaving only one assertion in place does not tell you which one caught it, it tells you the throw happened before it.
      //
      // Against the merge, `{ ...onDisk }` swapped for `Object.assign({}, onDisk)`: only the round-trip below fires. Assign invokes the `__proto__` setter on `merged`, which retargets that object's own prototype and never touches `Object.prototype`, so neither probe can see it.
      //
      // So these two catch neither named mutation. They stay as the pollution invariant, which is what a future change that writes onto `Object.prototype` would trip, and the comment says so rather than claiming a guard they do not provide.
      expect(({} as any).value).toBeUndefined();
      expect(({} as any).pwned).toBeUndefined();
      // This one is the merge guard, and the only assertion here that catches the spread being swapped for assign. It reads as the redundant one next to two prototype checks, which is exactly why it says so.
      const written = (mockFs.writeFileSync as any).mock.calls[0][1] as string;
      expect(written).toContain('__proto__');
    } finally {
      delete (Object.prototype as any).value;
      delete (Object.prototype as any).pwned;
    }
  });

  // `__proto__` is the one that pollutes; `constructor` and `toString` are the two that shadow. All three have to come back out of the merge as own properties of a plain object, or a key somebody put in the file is lost the same way an unknown one used to be.
  it('carries constructor and toString through the merge as plain keys', () => {
    mockFs.existsSync = vi.fn(() => true);
    mockFs.readFileSync = vi.fn(() =>
      Buffer.from('{"constructor":"c","toString":"t","theme":"dark"}')
    ) as any;
    mockFs.writeFileSync = vi.fn();

    const us = new UserSettings(true);
    us.save();

    const written = JSON.parse(
      (mockFs.writeFileSync as any).mock.calls[0][1] as string
    );
    expect(Object.getOwnPropertyNames(written)).toEqual(
      expect.arrayContaining(['constructor', 'toString'])
    );
    expect(written.constructor).toBe('c');
    expect(written.toString).toBe('t');
  });

  // The catch used to swallow both cases the same way, and merging over {} deletes every key this build does not know: the loss this merge exists to prevent, with the write reporting success.
  beforeEach(() => {
    // module state, so without this the second unreadable case reads as silent because the first already reported
    resetUnreadableReports();
  });

  it('says so when the file is there and could not be read', () => {
    mockFs.existsSync = vi.fn(() => true);
    let reads = 0;
    mockFs.readFileSync = vi.fn(() => {
      // readable at construction, unreadable by the time save re-reads it
      if (reads++ === 0) {
        return Buffer.from('{"futureSetting":42,"theme":"dark"}');
      }
      throw Object.assign(new Error('EBUSY'), { code: 'EBUSY' });
    }) as any;
    mockFs.writeFileSync = vi.fn();

    const us = new UserSettings(true);
    us.save();

    expect(log.error).toHaveBeenCalledWith(
      expect.stringContaining('left alone until it is repaired'),
      expect.anything()
    );
  });

  // Eighteen call sites reach save(), so a condition that persists would otherwise put the same line in the log on every settings change.
  it('reports an unreadable file once, not on every save', () => {
    mockFs.existsSync = vi.fn(() => true);
    let reads = 0;
    mockFs.readFileSync = vi.fn(() => {
      if (reads++ === 0) {
        return Buffer.from('{"futureSetting":42}');
      }
      throw Object.assign(new Error('EBUSY'), { code: 'EBUSY' });
    }) as any;
    mockFs.writeFileSync = vi.fn();

    const us = new UserSettings(true);
    us.save();
    us.save();
    us.save();

    expect(vi.mocked(log.error).mock.calls).toHaveLength(1);
  });

  // One-shot for the whole process would show a support log the first breakage and not the current state: repaired at noon and broken again at three has to say so twice.
  it('says so again after the file was repaired and broke again', () => {
    mockFs.existsSync = vi.fn(() => true);
    const shapes = ['{"a":1}', 'nope', '{"a":1}', 'nope'];
    let n = 0;
    mockFs.readFileSync = vi.fn(() => Buffer.from(shapes[n++] ?? '{}')) as any;
    mockFs.writeFileSync = vi.fn();

    const us = new UserSettings(true);
    us.save();
    us.save();
    us.save();

    expect(vi.mocked(log.error).mock.calls).toHaveLength(2);
  });

  // Rejected for its shape rather than for a parse failure, and it wipes the file the same way, so it cannot be the one case that says nothing. `new UserSettings(false)` skips read(), so save() reaches the guard with shapes that read() would have thrown on first. Both arms are deletable with every other test still green without these.
  it.each([
    ['null', 'null'],
    ['a number', '42'],
    ['a string', '"x"']
  ])('reports a top level that is %s', (_name, raw) => {
    mockFs.existsSync = vi.fn(() => true);
    mockFs.readFileSync = vi.fn(() => Buffer.from(raw)) as any;
    mockFs.writeFileSync = vi.fn();

    new UserSettings(false).save();

    expect(log.error).toHaveBeenCalledWith(
      expect.stringContaining('holds no JSON object')
    );
  });

  it('says so when the top level is not an object', () => {
    mockFs.existsSync = vi.fn(() => true);
    mockFs.readFileSync = vi.fn(() => Buffer.from('[1,2,3]')) as any;
    mockFs.writeFileSync = vi.fn();

    new UserSettings(true).save();

    expect(log.error).toHaveBeenCalledWith(
      expect.stringContaining('holds no JSON object')
    );
  });

  // Clearing the mark before the shape check undid the dedup for exactly this case: a file that parses and is not an object logged on every save while a parse failure logged once.
  it('reports a rejected shape once, not on every save', () => {
    mockFs.existsSync = vi.fn(() => true);
    mockFs.readFileSync = vi.fn(() => Buffer.from('[1,2,3]')) as any;
    mockFs.writeFileSync = vi.fn();

    const us = new UserSettings(true);
    us.save();
    us.save();
    us.save();

    expect(vi.mocked(log.error).mock.calls).toHaveLength(1);
  });

  // The whole point of merging rather than rebuilding: what this object holds wins over what the file holds for a key this build owns. Untested until now, and a mutation that only writes a key absent from the file left every test in this suite green.
  it('writes its own value over the one already in the file', () => {
    mockFs.existsSync = vi.fn(() => true);
    mockFs.readFileSync = vi.fn(() =>
      Buffer.from('{"theme":"light","futureSetting":42}')
    ) as any;
    mockFs.writeFileSync = vi.fn();

    const us = new UserSettings(true);
    us.setValue(SettingType.theme, ThemeType.Dark);
    us.save();

    const written = JSON.parse(
      (mockFs.writeFileSync as any).mock.calls[0][1] as string
    );
    expect(written.theme).toBe(ThemeType.Dark);
    // and the key it does not own is still there, which is the other half
    expect(written.futureSetting).toBe(42);
  });

  // Two breakages of the same file are two different things to repair, and the mark used to remember only that the path had been reported, so the second stayed silent with the first one's wording standing in the log. The repaired-and-broke-again test above does not cover this: it puts a valid object between the two, which clears the mark for the wrong reason.
  const breakages = (shapes: string[]) => {
    mockFs.existsSync = vi.fn(() => true);
    let n = 0;
    mockFs.readFileSync = vi.fn(() => {
      const shape = shapes[n++] ?? '{}';
      if (shape === 'GONE') {
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      }
      if (shape === 'EBUSY') {
        throw Object.assign(new Error('EBUSY'), { code: 'EBUSY' });
      }
      return Buffer.from(shape);
    }) as any;
    mockFs.writeFileSync = vi.fn();
    // one shape is consumed by the constructor, the rest by a save each
    const us = new UserSettings(true);
    for (let i = 1; i < shapes.length; i++) {
      us.save();
    }
    return vi.mocked(log.error).mock.calls.length;
  };

  it('reports a parse failure and then a rejected shape', () => {
    expect(breakages(['{"a":1}', 'nope', '[1,2,3]'])).toBe(2);
  });

  it('reports a rejected shape and then a parse failure', () => {
    expect(breakages(['{"a":1}', '[1,2,3]', 'nope'])).toBe(2);
  });

  // The file going away is not a repair, but whatever was reported about it no longer describes anything.
  it('reports again after the file disappeared in between', () => {
    expect(breakages(['{"a":1}', 'nope', 'GONE', 'nope'])).toBe(2);
  });

  // The case troubleshoot.md sends people into, and the one a reader can act on, so it must not be worded like a permission problem.
  it('says the file is not valid JSON, not that it could not be read', () => {
    mockFs.existsSync = vi.fn(() => true);
    let n = 0;
    mockFs.readFileSync = vi.fn(() =>
      Buffer.from(n++ === 0 ? '{"a":1}' : '{"theme":"dark",}')
    ) as any;
    mockFs.writeFileSync = vi.fn();

    new UserSettings(true).save();

    expect(log.error).toHaveBeenCalledWith(
      expect.stringContaining('is not valid JSON'),
      expect.anything()
    );
  });

  // Its own kind, or the dedup would swallow the second break after a different first one.
  it('reports a malformed file after an unreadable one', () => {
    expect(breakages(['{"a":1}', 'EBUSY', '{"theme":"dark",}'])).toBe(2);
  });

  // The boolean exists so a caller can tell; without it `jlab config set` printed success over a write that was declined.
  it('reports the refusal to its caller', () => {
    mockFs.existsSync = vi.fn(() => true);
    let n = 0;
    mockFs.readFileSync = vi.fn(() =>
      Buffer.from(n++ === 0 ? '{"a":1}' : '[1,2,3]')
    ) as any;
    mockFs.writeFileSync = vi.fn();

    const us = new UserSettings(true);

    expect(us.save()).toBe(false);
  });

  it('says nothing when the file is simply absent', () => {
    mockFs.existsSync = vi.fn(() => false);
    mockFs.readFileSync = vi.fn(() => {
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    }) as any;
    mockFs.writeFileSync = vi.fn();

    new UserSettings(true).save();

    expect(log.error).not.toHaveBeenCalled();
  });

  // `[1,2,3]` is the only non-object shape that survives read(): null, a number and a string all throw out of `key in jsonData`, and that throw is #1115's to catch, not this branch's.
  it('leaves an array at the top level alone rather than writing over it', () => {
    mockFs.existsSync = vi.fn(() => true);
    mockFs.readFileSync = vi.fn(() => Buffer.from('[1,2,3]')) as any;
    mockFs.writeFileSync = vi.fn();

    const us = new UserSettings(true);
    us.save();

    // the file is there and unusable, so it is left for the user to repair rather than overwritten with what this build happens to hold
    expect(mockFs.writeFileSync).not.toHaveBeenCalled();
  });

  it('drops a key whose value is back to the default', () => {
    // merging over the file means the on-disk value survives unless something takes it out, and a setting that no longer differs is one of those
    mockFs.existsSync = vi.fn(() => true);
    mockFs.readFileSync = vi.fn(() =>
      Buffer.from(JSON.stringify({ showNewsFeed: false }))
    ) as any;
    mockFs.writeFileSync = vi.fn();

    const us = new UserSettings(true);
    us.setValue(SettingType.showNewsFeed, true); // true is the default

    us.save();

    const written = JSON.parse(
      (mockFs.writeFileSync as any).mock.calls[0][1] as string
    );
    expect('showNewsFeed' in written).toBe(false);
  });

  it('writes back a key it has no setting for', () => {
    // save merges over the file rather than rebuilding it, or a settings.json written by a newer build loses whatever this one does not recognise, and troubleshoot.md sends people to edit this file by hand
    mockFs.existsSync = vi.fn(() => true);
    mockFs.readFileSync = vi.fn(() =>
      Buffer.from(JSON.stringify({ futureSetting: 42, theme: 'dark' }))
    ) as any;
    mockFs.writeFileSync = vi.fn();

    const us = new UserSettings(true);
    us.save();

    const written = JSON.parse(
      (mockFs.writeFileSync as any).mock.calls[0][1] as string
    );
    expect(written).toEqual({ futureSetting: 42, theme: 'dark' });
  });
});
