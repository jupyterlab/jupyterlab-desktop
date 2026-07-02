import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

// js-yaml moved from 4.x to 5.x. The two ways this repo uses it are
// yaml.load() on the bundled-env spec (buildutil.js) and on the auto-updater's
// latest.yml (app.ts). v5 parses numbers per YAML 1.2 and removed the safe*
// helpers, so pin the behavior we actually rely on against the real files.

describe('js-yaml load on the data this app parses', () => {
  it('reads the bundled-env spec and finds the jupyterlab pin', () => {
    const spec = yaml.load(
      fs.readFileSync(
        path.resolve(__dirname, '../../env_installer/jlab_server.yaml'),
        'utf8'
      )
    ) as { dependencies: string[] };

    const jlabPin = spec.dependencies.find(
      pkg => typeof pkg === 'string' && pkg.startsWith('jupyterlab ')
    );

    expect(jlabPin).toMatch(/^jupyterlab \d+\.\d+\.\d+/);
  });

  it('reads a release manifest and keeps the version as a string', () => {
    // The shape app.ts pulls from the published latest.yml.
    const manifest = yaml.load(
      ['version: 4.6.0', 'path: JupyterLab.dmg'].join('\n')
    ) as { version: string };

    expect(manifest.version).toBe('4.6.0');
    expect(typeof manifest.version).toBe('string');
  });
});
