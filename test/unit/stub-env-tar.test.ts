import { afterEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const { createStubEnvTar } = require('../../scripts/stub-env-tar.js');

describe('createStubEnvTar', () => {
  let staging: string | undefined;

  afterEach(() => {
    if (staging) {
      fs.rmSync(staging, { recursive: true, force: true });
      staging = undefined;
    }
  });

  it('writes a non-empty gzip tarball at the requested path', () => {
    // Arrange
    staging = fs.mkdtempSync(path.join(os.tmpdir(), 'jlab-stub-test-'));
    const out = path.join(staging, 'jlab_server.tar.gz');

    // Act
    const returned = createStubEnvTar(out);

    // Assert. Read once (readFileSync throws if it is missing) and assert on the
    // buffer, instead of existsSync + statSync + readFileSync which is a TOCTOU
    // race on the same path.
    expect(returned).toBe(out);
    const content = fs.readFileSync(out);
    expect(content.length).toBeGreaterThan(0);
    expect(content[0]).toBe(0x1f);
    expect(content[1]).toBe(0x8b);
  });

  it('packs the STUB_FOR_E2E marker file into the tarball', () => {
    // Arrange
    staging = fs.mkdtempSync(path.join(os.tmpdir(), 'jlab-stub-test-'));
    const out = path.join(staging, 'jlab_server.tar.gz');

    // Act
    createStubEnvTar(out);
    const listing = execFileSync('tar', ['-tzf', out], { encoding: 'utf8' });

    // Assert
    expect(listing).toContain('STUB_FOR_E2E');
  });

  it('overwrites an existing tarball at the target path', () => {
    // Arrange
    staging = fs.mkdtempSync(path.join(os.tmpdir(), 'jlab-stub-test-'));
    const out = path.join(staging, 'jlab_server.tar.gz');
    fs.writeFileSync(out, 'stale');

    // Act
    createStubEnvTar(out);
    const listing = execFileSync('tar', ['-tzf', out], { encoding: 'utf8' });

    // Assert
    expect(listing).toContain('STUB_FOR_E2E');
  });
});
