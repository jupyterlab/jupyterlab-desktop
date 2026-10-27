import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

const repoRoot = path.resolve(__dirname, '../..');

const read = (relative: string) =>
  fs.readFileSync(path.join(repoRoot, relative), 'utf8');

// The test installer step builds the macOS installer without signing, and it
// runs on every push to master while the version has no draft or pre-release.
// forceCodeSigning turns that build into an error. A pull request does not
// show the error, because electron-builder skips signing for pull requests
// before it reads the option, so these tests are the one check on a pull
// request that catches it.
describe('macOS code signing', () => {
  it('is not forced in the build config that every installer shares', () => {
    const build = JSON.parse(read('package.json')).build;

    expect(build.forceCodeSigning).toBeUndefined();
    expect(build.mac.forceCodeSigning).toBeUndefined();
  });

  it('is forced on both attempts of the release installer step', () => {
    const workflow = yaml.load(read('.github/workflows/publish.yml')) as any;
    const step = workflow.jobs.publish.steps.find(
      (step: any) => step.name === 'Create Application Installer for Release'
    );
    const builds = step.run.match(/^ *yarn dist:.*$/gm);

    expect(builds).toHaveLength(2);
    for (const build of builds) {
      expect(build).toContain('-c.mac.forceCodeSigning=true');
    }
  });
});
