// Real filesystem, no fs mock: the rest of the suite pins the call sequence,
// this pins what actually lands on disk. Modes, symlinks and rename semantics
// are exactly the parts a mock cannot answer for.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import {
  getUnreadableConfigFiles,
  readJsonConfigFile,
  resetConfigFile,
  writeJsonConfigFile
} from '../../src/main/utils';

// These exercise POSIX permission bits and symlinks: root ignores the mode
// bits, and Windows needs Developer Mode before symlinkSync works at all.
const asRoot = process.getuid?.() === 0;
const onWindows = process.platform === 'win32';
const posixOnly = it.skipIf(onWindows);
const unprivilegedPosix = it.skipIf(onWindows || asRoot);
// process.umask throws in a worker thread and the pool is not pinned, so probe
// it rather than guess from the platform
const canSetUmask = (() => {
  if (onWindows) {
    return false;
  }
  try {
    process.umask(process.umask());
    return true;
  } catch {
    return false;
  }
})();

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jlab-config-fs-'));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

const siblings = () => fs.readdirSync(dir).sort();

describe('writeJsonConfigFile on a real filesystem', () => {
  it('lands the JSON and leaves no temporary behind', () => {
    const target = path.join(dir, 'settings.json');

    expect(writeJsonConfigFile(target, { theme: 'dark' })).toBe(true);

    expect(JSON.parse(fs.readFileSync(target, 'utf8'))).toEqual({
      theme: 'dark'
    });
    expect(siblings()).toEqual(['settings.json']);
  });

  // Windows has no mode to keep: chmod there moves the read-only bit alone, so
  // a file written 0600 reads back 0666 whatever the writer does.
  posixOnly('keeps a private file private', () => {
    const target = path.join(dir, 'settings.json');
    fs.writeFileSync(target, '{}');
    fs.chmodSync(target, 0o600);

    writeJsonConfigFile(target, { theme: 'dark' });

    expect(fs.statSync(target).mode & 0o777).toBe(0o600);
  });

  it.runIf(canSetUmask)(
    'keeps a group-writable file group-writable under a tighter umask',
    () => {
      // openSync's mode argument would be masked here; fchmod is not, which is
      // the whole reason the mode is applied after the open
      const target = path.join(dir, 'shared.json');
      fs.writeFileSync(target, '{}');
      fs.chmodSync(target, 0o664);
      const previous = process.umask(0o022);

      try {
        writeJsonConfigFile(target, { theme: 'dark' });
      } finally {
        process.umask(previous);
      }

      expect(fs.statSync(target).mode & 0o777).toBe(0o664);
    }
  );

  posixOnly('writes through a symlink without replacing it', () => {
    const real = path.join(dir, 'real.json');
    const link = path.join(dir, 'settings.json');
    fs.writeFileSync(real, JSON.stringify({ theme: 'light' }));
    fs.symlinkSync(real, link);
    const linkInode = fs.lstatSync(link).ino;

    expect(writeJsonConfigFile(link, { theme: 'dark' })).toBe(true);

    expect(fs.lstatSync(link).isSymbolicLink()).toBe(true);
    expect(fs.lstatSync(link).ino).toBe(linkInode);
    expect(JSON.parse(fs.readFileSync(real, 'utf8'))).toEqual({
      theme: 'dark'
    });
    expect(siblings()).toEqual(['real.json', 'settings.json']);
  });

  posixOnly(
    'creates the target of a dangling symlink rather than unlinking it',
    () => {
      const real = path.join(dir, 'real.json');
      const link = path.join(dir, 'settings.json');
      fs.symlinkSync(real, link);

      expect(writeJsonConfigFile(link, { theme: 'dark' })).toBe(true);

      expect(fs.lstatSync(link).isSymbolicLink()).toBe(true);
      expect(JSON.parse(fs.readFileSync(real, 'utf8'))).toEqual({
        theme: 'dark'
      });
    }
  );

  unprivilegedPosix(
    'reports failure and leaves nothing behind when the directory is read only',
    () => {
      const readOnly = path.join(dir, 'locked');
      fs.mkdirSync(readOnly);
      const target = path.join(readOnly, 'settings.json');
      fs.chmodSync(readOnly, 0o500);

      try {
        expect(writeJsonConfigFile(target, { theme: 'dark' })).toBe(false);
        expect(fs.readdirSync(readOnly)).toEqual([]);
      } finally {
        fs.chmodSync(readOnly, 0o700);
      }
    }
  );

  it('cleans up its temporary when the rename cannot happen', () => {
    // a config path that is a directory: the temporary is created, the rename
    // is the step that fails, which is the only way to reach the cleanup
    const target = path.join(dir, 'settings.json');
    fs.mkdirSync(target);

    expect(writeJsonConfigFile(target, { theme: 'dark' })).toBe(false);

    expect(fs.statSync(target).isDirectory()).toBe(true);
    expect(siblings()).toEqual(['settings.json']);
  });

  it('leaves a temporary belonging to another process alone', () => {
    // the pid in the name is what keeps two instances off each other; the
    // second path is the one a pid-less implementation would have taken
    const target = path.join(dir, 'settings.json');
    const otherPid = `${target}.999999.tmp`;
    const shared = `${target}.tmp`;
    fs.writeFileSync(otherPid, 'from another run');
    fs.writeFileSync(shared, 'from a pid-less run');

    expect(writeJsonConfigFile(target, { theme: 'dark' })).toBe(true);

    expect(fs.readFileSync(otherPid, 'utf8')).toBe('from another run');
    expect(fs.readFileSync(shared, 'utf8')).toBe('from a pid-less run');
  });

  it('creates the directory when it is not there yet', () => {
    // a project's .jupyter directory does not exist until the first save
    const target = path.join(dir, '.jupyter', 'desktop-settings.json');

    expect(writeJsonConfigFile(target, { uiMode: 'zen' })).toBe(true);

    expect(JSON.parse(fs.readFileSync(target, 'utf8'))).toEqual({
      uiMode: 'zen'
    });
  });

  it('replaces the contents rather than appending to them', () => {
    const target = path.join(dir, 'settings.json');
    writeJsonConfigFile(target, { a: 1, b: 2, c: 3 });

    writeJsonConfigFile(target, { a: 1 });

    expect(JSON.parse(fs.readFileSync(target, 'utf8'))).toEqual({ a: 1 });
  });
});

describe('readJsonConfigFile on a real filesystem', () => {
  it('leaves a corrupt file byte for byte and refuses to write over it', () => {
    const target = path.join(dir, 'settings.json');
    const original = '{"theme": "dark",';
    fs.writeFileSync(target, original);

    expect(readJsonConfigFile(target)).toBeUndefined();
    expect(getUnreadableConfigFiles()).toContain(target);
    expect(writeJsonConfigFile(target, { theme: 'light' })).toBe(false);

    expect(fs.readFileSync(target, 'utf8')).toBe(original);
    expect(siblings()).toEqual(['settings.json']);
  });

  unprivilegedPosix('marks a config it has no permission to read', () => {
    const target = path.join(dir, 'settings.json');
    fs.writeFileSync(target, '{"theme":"dark"}');
    fs.chmodSync(target, 0o000);

    try {
      expect(readJsonConfigFile(target)).toBeUndefined();
      expect(getUnreadableConfigFiles()).toContain(target);
    } finally {
      fs.chmodSync(target, 0o600);
    }
  });

  it('marks a config path that turned into a directory', () => {
    const target = path.join(dir, 'settings.json');
    fs.mkdirSync(target);

    expect(readJsonConfigFile(target)).toBeUndefined();
    expect(getUnreadableConfigFiles()).toContain(target);
  });

  it('reads a file a Windows editor saved with a byte order mark', () => {
    const target = path.join(dir, 'settings.json');
    fs.writeFileSync(target, '﻿{"theme":"dark"}');

    expect(readJsonConfigFile(target)).toEqual({ theme: 'dark' });
  });

  it('treats an empty file as absent and lets the next write through', () => {
    const target = path.join(dir, 'settings.json');
    fs.writeFileSync(target, '');

    expect(readJsonConfigFile(target)).toBeUndefined();
    expect(getUnreadableConfigFiles()).not.toContain(target);
    expect(writeJsonConfigFile(target, { theme: 'dark' })).toBe(true);
  });

  it('treats a file of NUL bytes as absent, which is what a power cut leaves', () => {
    const target = path.join(dir, 'settings.json');
    fs.writeFileSync(target, Buffer.alloc(64));

    expect(readJsonConfigFile(target)).toBeUndefined();
    // trim leaves NUL, so this used to reach JSON.parse and get marked
    expect(getUnreadableConfigFiles()).not.toContain(target);
    expect(writeJsonConfigFile(target, { theme: 'dark' })).toBe(true);
  });

  it('reads JSON a crash left padded with NUL rather than marking it', () => {
    const target = path.join(dir, 'settings.json');
    const json = '{"theme":"dark"}';
    // the file keeps its old length and the tail never made it to disk
    fs.writeFileSync(
      target,
      Buffer.concat([Buffer.from(json), Buffer.alloc(48)])
    );

    expect(readJsonConfigFile(target)).toEqual({ theme: 'dark' });
    expect(getUnreadableConfigFiles()).not.toContain(target);
  });

  it('yields nothing more once marked, however the file reads later', () => {
    const target = path.join(dir, 'settings.json');
    fs.writeFileSync(target, '{');
    readJsonConfigFile(target);

    // a second reader must not get the repaired values while the object built
    // at import still holds defaults
    fs.writeFileSync(target, '{"theme":"dark"}');
    expect(readJsonConfigFile(target)).toBeUndefined();

    expect(getUnreadableConfigFiles()).toContain(target);
    expect(writeJsonConfigFile(target, {})).toBe(false);
  });
});

describe('resetConfigFile on a real filesystem', () => {
  it('moves the file aside and unblocks the next write', () => {
    const target = path.join(dir, 'settings.json');
    const original = '{"theme": "dark",';
    fs.writeFileSync(target, original);
    readJsonConfigFile(target);

    expect(resetConfigFile(target)).toBe(true);

    expect(fs.readFileSync(`${target}.corrupt`, 'utf8')).toBe(original);
    expect(fs.existsSync(target)).toBe(false);
    expect(writeJsonConfigFile(target, { theme: 'light' })).toBe(true);
  });

  posixOnly('leaves a symlinked config writable after the reset', () => {
    // the reset moves the target away, so the link is left dangling; if the
    // next write cannot follow it the app never saves config again
    const real = path.join(dir, 'real.json');
    const link = path.join(dir, 'settings.json');
    fs.writeFileSync(real, '{"theme": "dark",');
    fs.symlinkSync(real, link);
    readJsonConfigFile(link);

    expect(resetConfigFile(link)).toBe(true);
    expect(fs.lstatSync(link).isSymbolicLink()).toBe(true);

    expect(writeJsonConfigFile(link, { theme: 'light' })).toBe(true);
    expect(JSON.parse(fs.readFileSync(real, 'utf8'))).toEqual({
      theme: 'light'
    });
  });

  it('keeps the copy from an earlier corruption', () => {
    const target = path.join(dir, 'settings.json');
    fs.writeFileSync(`${target}.corrupt`, 'first');
    fs.writeFileSync(target, 'second');

    resetConfigFile(target);

    expect(fs.readFileSync(`${target}.corrupt`, 'utf8')).toBe('first');
    expect(fs.readFileSync(`${target}.corrupt.1`, 'utf8')).toBe('second');
  });

  posixOnly('moves what a symlink points at, not the symlink', () => {
    const real = path.join(dir, 'real.json');
    const link = path.join(dir, 'settings.json');
    fs.writeFileSync(real, 'broken');
    fs.symlinkSync(real, link);

    expect(resetConfigFile(link)).toBe(true);

    expect(fs.readFileSync(`${real}.corrupt`, 'utf8')).toBe('broken');
    expect(fs.lstatSync(link).isSymbolicLink()).toBe(true);
  });
});
