import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as tar from 'tar';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { extractTarball } from '../../src/main/utils';

describe('extractTarball', () => {
  let work: string;

  beforeEach(() => {
    work = mkdtempSync(join(tmpdir(), 'jlab-tar-'));
  });

  afterEach(() => {
    rmSync(work, { recursive: true, force: true });
  });

  it('extracts a gzipped tarball, preserving nested files and contents', async () => {
    // Arrange: build a real conda-pack-shaped .tar.gz (a nested bin/ + a file).
    const srcDir = join(work, 'src');
    mkdirSync(join(srcDir, 'bin'), { recursive: true });
    writeFileSync(join(srcDir, 'bin', 'python'), '#!/bin/sh\n');
    writeFileSync(join(srcDir, 'marker.txt'), 'hello-env');
    const tarball = join(work, 'jlab_server.tar.gz');
    await tar.c({ gzip: true, cwd: srcDir, file: tarball }, [
      'bin/python',
      'marker.txt'
    ]);
    const dest = join(work, 'dest');
    mkdirSync(dest);

    // Act
    await extractTarball(tarball, dest);

    // Assert
    expect(existsSync(join(dest, 'bin', 'python'))).toBe(true);
    expect(readFileSync(join(dest, 'marker.txt'), 'utf8')).toBe('hello-env');
  });

  it('rejects when the tarball is missing', async () => {
    await expect(
      extractTarball(join(work, 'does-not-exist.tar.gz'), work)
    ).rejects.toThrow();
  });
});
