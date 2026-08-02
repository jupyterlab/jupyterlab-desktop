import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const repoRoot = path.resolve(__dirname, '../..');

const read = (relative: string) =>
  fs.readFileSync(path.join(repoRoot, relative), 'utf8');

// The deb and rpm postinst runs as root and installs an AppArmor profile, so it
// has to stay in step with the electron-builder release we ship against.
describe('the Linux after-install script', () => {
  it('carries the app-builder-lib template it is derived from, unedited', () => {
    const upstream = read(
      'node_modules/app-builder-lib/templates/linux/after-install.tpl'
    );

    const ours = read('electron-builder-scripts/linux_after_install.sh');

    expect(ours.startsWith(upstream)).toBe(true);
  });

  it('links jlab into the PATH on top of what the template does', () => {
    const ours = read('electron-builder-scripts/linux_after_install.sh');

    expect(ours).toContain(
      "ln -sf '/opt/${sanitizedProductName}/resources/app/jlab' /usr/bin/jlab"
    );
  });

  it('is wired into both package targets through electron-builder', () => {
    const build = JSON.parse(read('package.json')).build;

    for (const target of [build.deb, build.rpm]) {
      expect(target.afterInstall).toBe('build/linux_after_install.sh');
      expect(target.fpm ?? []).not.toContain(
        '--after-install=build/linux_after_install.sh'
      );
    }
  });
});
