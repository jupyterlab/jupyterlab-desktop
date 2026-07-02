import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { execFileSync } from 'child_process';
import { fixDarwinPath } from '../../src/main/utils';

vi.mock('child_process', async orig => {
  const actual = await orig<typeof import('child_process')>();
  return { ...actual, execFileSync: vi.fn() };
});

const mockedExecFileSync = vi.mocked(execFileSync);

describe('fixDarwinPath', () => {
  let originalPlatform: PropertyDescriptor | undefined;
  let originalPath: string | undefined;

  const setPlatform = (value: string) => {
    Object.defineProperty(process, 'platform', { value, configurable: true });
  };

  beforeEach(() => {
    originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
    originalPath = process.env.PATH;
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (originalPlatform) {
      Object.defineProperty(process, 'platform', originalPlatform);
    }
    process.env.PATH = originalPath;
  });

  it('adopts the PATH the login shell reports on macOS', () => {
    // Arrange
    setPlatform('darwin');
    process.env.PATH = '/usr/bin';
    mockedExecFileSync.mockReturnValue(
      ('HOME=/Users/x\nPATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin\nSHELL=/bin/zsh\n' as unknown) as Buffer
    );

    // Act
    fixDarwinPath();

    // Assert
    expect(process.env.PATH).toBe('/opt/homebrew/bin:/usr/local/bin:/usr/bin');
    expect(mockedExecFileSync).toHaveBeenCalledWith(
      expect.any(String),
      ['-ilc', 'env; exit'],
      expect.objectContaining({ encoding: 'utf8' })
    );
  });

  it('strips ANSI escapes a chatty rc file prints before env', () => {
    // Arrange
    setPlatform('darwin');
    process.env.PATH = '/usr/bin';
    mockedExecFileSync.mockReturnValue(
      ('\x1b[32mwelcome\x1b[0m\nPATH=/opt/homebrew/bin:/usr/bin\n' as unknown) as Buffer
    );

    // Act
    fixDarwinPath();

    // Assert
    expect(process.env.PATH).toBe('/opt/homebrew/bin:/usr/bin');
  });

  it('keeps a value containing = signs intact', () => {
    // Arrange
    setPlatform('darwin');
    mockedExecFileSync.mockReturnValue(('PATH=/a=b:/c\n' as unknown) as Buffer);

    // Act
    fixDarwinPath();

    // Assert
    expect(process.env.PATH).toBe('/a=b:/c');
  });

  it('does not spawn a shell on non-macOS platforms', () => {
    // Arrange
    setPlatform('linux');
    process.env.PATH = '/usr/bin';

    // Act
    fixDarwinPath();

    // Assert
    expect(mockedExecFileSync).not.toHaveBeenCalled();
    expect(process.env.PATH).toBe('/usr/bin');
  });

  it('leaves the existing PATH untouched when the shell spawn throws', () => {
    // Arrange
    setPlatform('darwin');
    process.env.PATH = '/usr/bin';
    mockedExecFileSync.mockImplementation(() => {
      throw new Error('shell not found');
    });

    // Act
    fixDarwinPath();

    // Assert
    expect(process.env.PATH).toBe('/usr/bin');
  });
});
