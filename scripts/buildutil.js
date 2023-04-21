const meow = require('meow');
const fs = require('fs-extra');
const path = require('path');
const semver = require('semver');
const yaml = require('js-yaml');

const pkgjsonFilePath = path.resolve(__dirname, '../package.json');

const cli = meow(
  `
    Usage
      $ node buildutil <options>

    Options
      --check-version-match      check for JupyterLab version match

    Other options:
      --help                     show usage information
      --version                  show version information

    Examples
      $ node buildutil --check-version-match
`,
  {
    flags: {
      checkVersionMatch: {
        type: 'boolean',
        default: false
      }
    }
  }
);

if (cli.flags.checkVersionMatch) {
  // parse application version
  const pkgjsonFileData = fs.existsSync(pkgjsonFilePath)
    ? fs.readJSONSync(pkgjsonFilePath)
    : undefined;
  if (!pkgjsonFileData) {
    console.error('package.json not found!');
    process.exit(1);
  }

  const appVersion = pkgjsonFileData['version'];
  console.log(`JupyterLab Desktop version: ${appVersion}`);

  // check JupyterLab version bundled to Application Server
  const constructorData = yaml.load(
    fs.readFileSync(
      path.resolve(__dirname, '../env_installer/construct.yaml'),
      'utf8'
    )
  );
  const appServerVersion = constructorData['version'];
  console.log(`Application Server version: ${appServerVersion}`);

  if (appServerVersion !== appVersion) {
    console.error(
      `Application Server version ${appServerVersion} doesn't match Application version ${appVersion}`
    );
    process.exit(1);
  }

  const jlabCondaPkg = constructorData['specs'].find(pkg =>
    pkg.startsWith('jupyterlab')
  );
  if (!jlabCondaPkg) {
    console.error('jupyterlab conda package not found in environment specs!');
    process.exit(1);
  }
  const specParts = jlabCondaPkg.split(' ');
  const appServerJLabVersion = specParts[1];
  console.log(`Application Server JupyterLab version: ${appServerJLabVersion}`);

  if (
    !semver.valid(appVersion) ||
    !semver.valid(appServerJLabVersion) ||
    semver.major(appVersion) !== semver.major(appServerJLabVersion) ||
    semver.minor(appVersion) !== semver.minor(appServerJLabVersion) ||
    semver.patch(appVersion) !== semver.patch(appServerJLabVersion)
  ) {
    console.error(
      `Application package version ${appVersion} doesn't match bundled JupyterLab Python package version ${appServerJLabVersion}`
    );
    process.exit(1);
  }

  console.log('JupyterLab version match satisfied!');
  process.exit(0);
}
