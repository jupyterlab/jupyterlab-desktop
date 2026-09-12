// Real filesystem, no fs mock: the rest of the suite pins the call sequence, this pins what actually lands on disk. Modes, symlinks and rename semantics are exactly the parts a mock cannot answer for.
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

// These exercise POSIX permission bits and symlinks: root ignores the mode bits, and Windows needs Developer Mode before symlinkSync works at all.
const asRoot = process.getuid?.() === 0;
const onWindows = process.platform === 'win32';
const posixOnly = it.skipIf(onWindows);
const unprivilegedPosix = it.skipIf(onWindows || asRoot);
// process.umask throws in a worker thread and the pool is not pinned, so probe it rather than guess from the platform
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

  // Windows has no mode to keep: chmod there moves the read-only bit alone, so a file written 0600 reads back 0666 whatever the writer does.
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
      // openSync's mode argument would be masked here; fchmod is not, which is the whole reason the mode is applied after the open
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

  // The temporary used to be named after the pid, so a symlink could be planted at it and a run as root would truncate and chown whatever it named. An unpredictable name removes the plant rather than only failing closed on it, and there is no longer a name for a test to point at: that the name is unpredictable is asserted in utils.test.ts, against the mocked openSync, which is the only place it can be observed before the rename takes it away. What a real filesystem can still say is that repeated writes leave nothing behind.
  it('leaves no temporary behind across repeated writes', () => {
    const target = path.join(dir, 'settings.json');

    for (let i = 0; i < 5; i++) {
      expect(writeJsonConfigFile(target, { theme: `t${i}` })).toBe(true);
    }

    expect(fs.readdirSync(dir).filter(n => n.endsWith('.tmp'))).toEqual([]);
    expect(JSON.parse(fs.readFileSync(target, 'utf8'))).toEqual({
      theme: 't4'
    });
  });

  // GNU Stow and chezmoi both produce chains, and right after a clone the payload at the end is not there yet, which is when the realpath fallback runs. Following one hop renames onto the middle link and unlinks it, which is the outcome the resolver exists to prevent.
  posixOnly('follows a whole symlink chain, not one hop of it', () => {
    const target = path.join(dir, 'settings.json');
    const mid = path.join(dir, 'mid.json');
    const real = path.join(dir, 'real.json');
    fs.symlinkSync(real, mid);
    fs.symlinkSync(mid, target);

    expect(writeJsonConfigFile(target, { theme: 'dark' })).toBe(true);

    // both links survive as links, and the payload landed at the end of the chain
    expect(fs.lstatSync(target).isSymbolicLink()).toBe(true);
    expect(fs.lstatSync(mid).isSymbolicLink()).toBe(true);
    expect(JSON.parse(fs.readFileSync(real, 'utf8'))).toEqual({
      theme: 'dark'
    });
  });

  // A cycle is the only way to exhaust the hop cap, and returning whichever link we were holding would rename a regular file over it, destroying the structure the resolver exists to keep.
  posixOnly('leaves a symlink cycle alone rather than writing into it', () => {
    const a = path.join(dir, 'settings.json');
    const b = path.join(dir, 'b.json');
    fs.symlinkSync(b, a);
    fs.symlinkSync(a, b);

    expect(writeJsonConfigFile(a, { theme: 'dark' })).toBe(false);

    expect(fs.lstatSync(a).isSymbolicLink()).toBe(true);
    expect(fs.lstatSync(b).isSymbolicLink()).toBe(true);
  });

  // The writer refuses this and the reset did not, so the recovery path would have taken the link the writer had just protected.
  posixOnly('does not move a symlink cycle aside either', () => {
    const a = path.join(dir, 'settings.json');
    const b = path.join(dir, 'b.json');
    fs.symlinkSync(b, a);
    fs.symlinkSync(a, b);

    expect(resetConfigFile(a)).toBe(false);

    expect(fs.lstatSync(a).isSymbolicLink()).toBe(true);
    expect(fs.readdirSync(dir).filter(n => n.includes('.corrupt'))).toEqual([]);
  });

  posixOnly('creates a config nobody else can read', () => {
    // app-data.json holds recentRemoteURLs, whose entries carry a token in the query string, so the umask default is too generous to create it at
    const target = path.join(dir, 'app-data.json');

    expect(writeJsonConfigFile(target, { recentRemoteURLs: [] })).toBe(true);

    expect(fs.statSync(target).mode & 0o777).toBe(0o600);
  });

  // The 0600 default is argued from app-data.json's tokens, and that argument does not reach a project's .jupyter/desktop-settings.json, which master created at the umask default. A project directory shared between two accounts is a real place for it to be, and 0600 locks the second one out of its own workspace settings for the session.
  it.runIf(canSetUmask && !onWindows)(
    'creates a file without a secret at the umask default',
    () => {
      const target = path.join(dir, 'desktop-settings.json');
      const previous = process.umask(0o027);

      try {
        expect(writeJsonConfigFile(target, { uiMode: 'zen' }, 'umask')).toBe(
          true
        );
        // 0666 narrowed by the mask, which is what master's writeFileSync produced. The mask is set here rather than read, because the point is that the writer never touches the process-wide one itself.
        expect(fs.statSync(target).mode & 0o777).toBe(0o640);
        expect(fs.statSync(target).mode & 0o777).not.toBe(0o600);
      } finally {
        process.umask(previous);
      }
    }
  );

  // A config symlinked into a dotfiles repo on a volume that is not mounted: mkdirSync with recursive would build the whole missing tree on the boot disk and write the settings into the shadow copy, which on macOS also blocks the real mount. master's writeFileSync failed with ENOENT and created nothing.
  posixOnly('refuses a link whose target directory does not exist', () => {
    const target = path.join(dir, 'settings.json');
    const missing = path.join(dir, 'unmounted', 'jlab');
    fs.symlinkSync(path.join(missing, 'settings.json'), target);

    expect(writeJsonConfigFile(target, { theme: 'dark' })).toBe(false);
    expect(fs.existsSync(missing)).toBe(false);
  });

  it('cleans up its temporary when the rename cannot happen', () => {
    // a config path that is a directory: the temporary is created, the rename is the step that fails, which is the only way to reach the cleanup
    const target = path.join(dir, 'settings.json');
    fs.mkdirSync(target);

    expect(writeJsonConfigFile(target, { theme: 'dark' })).toBe(false);

    expect(fs.statSync(target).isDirectory()).toBe(true);
    expect(siblings()).toEqual(['settings.json']);
  });

  it('leaves a temporary belonging to another run alone', () => {
    // Names it cannot have chosen, since 8039df1 made the suffix random rather than the pid. What this pins is the cleanup: it removes the one name it created and must not sweep the directory, or a second instance mid-write loses its temporary.
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

  it('reads one saved as UTF-16, which Save As and Out-File both write', () => {
    const target = path.join(dir, 'settings.json');
    fs.writeFileSync(
      target,
      Buffer.concat([
        Buffer.from([0xff, 0xfe]),
        Buffer.from('{"theme":"dark"}', 'utf16le')
      ])
    );

    // decoded as UTF-8 the mark becomes two replacement characters, which no amount of trimming removes, and the file reads as corrupt
    expect(readJsonConfigFile(target)).toEqual({ theme: 'dark' });
    expect(getUnreadableConfigFiles()).not.toContain(target);
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

  // The same torn file with one byte more. The tail trim leaves the newline in place, and String.trim does not treat NUL as whitespace, so this used to reach JSON.parse and be marked while the case above was not.
  it('treats NUL padding ending in a newline as absent too', () => {
    const target = path.join(dir, 'settings.json');
    fs.writeFileSync(
      target,
      Buffer.concat([Buffer.alloc(64), Buffer.from('\n')])
    );

    expect(readJsonConfigFile(target)).toBeUndefined();
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

  it('reads a file saved as UTF-16 big endian', () => {
    const target = path.join(dir, 'settings.json');
    const le = Buffer.from('{"theme":"dark"}', 'utf16le');
    fs.writeFileSync(
      target,
      Buffer.concat([Buffer.from([0xfe, 0xff]), Buffer.from(le).swap16()])
    );

    // Notepad calls it "Unicode big endian"; decoded as UTF-8 the mark becomes replacement characters and the file is marked, which refuses every write to it from then on
    expect(readJsonConfigFile(target)).toEqual({ theme: 'dark' });
    expect(getUnreadableConfigFiles()).not.toContain(target);
  });

  // swap16 needs a whole number of code units, so a big-endian file cut mid-character threw a RangeError out of the decode and the file was marked, which refuses every write to it from then on.
  it('reads a UTF-16 big endian file truncated mid-character', () => {
    const target = path.join(dir, 'settings.json');
    const le = Buffer.from('{"theme":"dark"}', 'utf16le');
    const be = Buffer.concat([
      Buffer.from([0xfe, 0xff]),
      Buffer.from(le).swap16()
    ]);
    // one byte of the next code unit reached disk and its pair did not
    fs.writeFileSync(target, Buffer.concat([be, Buffer.from([0x00])]));

    expect(readJsonConfigFile(target)).toEqual({ theme: 'dark' });
    expect(getUnreadableConfigFiles()).not.toContain(target);
  });

  it('refuses JSON torn in the middle rather than inventing a value', () => {
    const target = path.join(dir, 'settings.json');
    // the tail reached disk and the middle did not
    fs.writeFileSync(
      target,
      Buffer.concat([
        Buffer.from('{"pythonPath":"/opt/py","theme"'),
        Buffer.alloc(6),
        Buffer.from(':"dark"}')
      ])
    );

    // stripping NUL everywhere would splice it into valid JSON holding a value nobody wrote, and the next save would persist it
    expect(readJsonConfigFile(target)).toBeUndefined();
    expect(getUnreadableConfigFiles()).toContain(target);
  });

  it('reads a file torn in the middle without stalling the import', () => {
    // the run above is six bytes, which is the size that hides what this costs. A power cut pads in filesystem blocks, so this is the shape the report describes, and the read happens while the config modules are still being imported, with no window up to show for it.
    const target = path.join(dir, 'settings.json');
    fs.writeFileSync(
      target,
      Buffer.concat([
        Buffer.from('{"theme":"dark"'),
        Buffer.alloc(200 * 1024),
        Buffer.from('}')
      ])
    );

    const started = Date.now();
    expect(readJsonConfigFile(target)).toBeUndefined();
    // measured at 22.7 s with `replace(/\0+$/, '')`, whose anchor retries from every position in the run, against under a millisecond for a scan. The margin between those is what makes a wall-clock assertion safe here
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it('does not build a config directory through a dangling link', () => {
    // a dotfiles setup points the config directory at an external volume and the volume is not mounted. Pinned rather than guarded: recursive mkdirSync throws ENOENT through a dangling link rather than creating the chain behind it, so the shadow copy this would otherwise leave on the boot disk is Node's refusal and not ours. A guard here measured as dead.
    const missing = path.join(dir, 'not-mounted');
    const linked = path.join(dir, 'linked-config');
    fs.symlinkSync(missing, linked);

    const target = path.join(linked, 'settings.json');
    expect(writeJsonConfigFile(target, { theme: 'dark' })).toBe(false);
    expect(fs.existsSync(missing)).toBe(false);
  });

  it('yields nothing more once marked, however the file reads later', () => {
    const target = path.join(dir, 'settings.json');
    fs.writeFileSync(target, '{');
    readJsonConfigFile(target);

    // a second reader must not get the repaired values while the object built at import still holds defaults
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
    // the reset moves the target away, so the link is left dangling; if the next write cannot follow it the app never saves config again
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
