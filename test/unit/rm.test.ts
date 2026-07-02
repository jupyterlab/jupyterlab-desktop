import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { rm } from '../../scripts/rm';

// rm.js is the native rimraf replacement the conda/build npm scripts call.
// Globs are passed as absolute patterns so the test does not depend on cwd
// (fs.globSync resolves relative patterns against process.cwd, and chdir is
// not available in worker threads).
describe('rm (native rimraf replacement)', () => {
  let work: string;

  beforeEach(() => {
    work = mkdtempSync(join(tmpdir(), 'jlab-rm-'));
  });

  afterEach(() => {
    rmSync(work, { recursive: true, force: true });
  });

  it('removes a single file passed as a literal path', () => {
    const file = join(work, 'jlab_server.tar.gz');
    writeFileSync(file, 'x');

    rm([file]);

    expect(existsSync(file)).toBe(false);
  });

  it('removes a non-empty directory recursively', () => {
    const dir = join(work, 'jlab_server');
    mkdirSync(join(dir, 'bin'), { recursive: true });
    writeFileSync(join(dir, 'bin', 'python'), '#!/bin/sh\n');

    rm([dir]);

    expect(existsSync(dir)).toBe(false);
  });

  it('expands a glob and removes only the matching entries', () => {
    writeFileSync(join(work, 'conda-osx-64.lock'), '');
    writeFileSync(join(work, 'conda-win-64.lock'), '');
    writeFileSync(join(work, 'jlab_server.yaml'), '');

    rm([join(work, '*.lock')]);

    expect(existsSync(join(work, 'conda-osx-64.lock'))).toBe(false);
    expect(existsSync(join(work, 'conda-win-64.lock'))).toBe(false);
    expect(existsSync(join(work, 'jlab_server.yaml'))).toBe(true);
  });

  it('does not throw when a glob matches nothing', () => {
    writeFileSync(join(work, 'keep.yaml'), '');

    expect(() => rm([join(work, '*.lock')])).not.toThrow();
    expect(existsSync(join(work, 'keep.yaml'))).toBe(true);
  });

  it('does not throw when a literal path is missing', () => {
    expect(() => rm([join(work, 'does-not-exist')])).not.toThrow();
  });

  it('removes every path when given multiple arguments', () => {
    const a = join(work, 'a');
    const b = join(work, 'b.tar.gz');
    mkdirSync(a);
    writeFileSync(b, 'x');

    rm([a, b]);

    expect(existsSync(a)).toBe(false);
    expect(existsSync(b)).toBe(false);
  });
});
