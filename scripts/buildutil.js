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
      --check-version-match         check for JupyterLab version match
      --update-binary-sign-list     update binary list to sign for macOS
      --copy-extras-to-bundled-env  copy extra files from extras to bundled environment installer
      --platform                    platform for --update-binary-sign-list. osx-64 or osx-arm64

    Other options:
      --help                        show usage information
      --version                     show version information

    Examples
      $ node buildutil --check-version-match
`,
  {
    flags: {
      checkVersionMatch: {
        type: 'boolean',
        default: false
      },
      updateBinarySignList: {
        type: 'boolean',
        default: false
      },
      platform: {
        type: 'string',
        default: 'osx-64'
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

  // check JupyterLab version bundled
  const bundledEnvData = yaml.load(
    fs.readFileSync(
      path.resolve(__dirname, '../env_installer/jlab_server.yaml'),
      'utf8'
    )
  );

  const jlabCondaPkg = bundledEnvData['dependencies'].find(pkg =>
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

if (cli.flags.updateBinarySignList) {
  const { isBinary } = require('istextorbinary');
  const envInstallerDir = path.resolve('env_installer', 'jlab_server');

  const getFileExtension = filePath => {
    const lastDot = filePath.lastIndexOf('.');
    if (lastDot !== -1) {
      return filePath.substring(lastDot + 1);
    }
  };

  const skipExtensions = new Set([
    'a',
    'bz2',
    'dat',
    'eot',
    'exe',
    'gif',
    'gz',
    'jpg',
    'icns',
    'ico',
    'mo',
    'npy',
    'npz',
    'parquet',
    'pdf',
    'pkl',
    'png',
    'ppm',
    'pyc',
    'testcase',
    'tiff',
    'ttf',
    'wav',
    'whl',
    'woff',
    'woff2',
    'xz',
    'zip'
  ]);

  const skipPathComponents = [
    '/pytz/zoneinfo/',
    '/tzdata/zoneinfo/',
    'share/terminfo/'
  ];

  // sign binary files except for certain extensions and certain directories
  const needsSigning = filePath => {
    const skippedPath = skipPathComponents.find(component => {
      return filePath.includes(component);
    });

    if (skippedPath || skipExtensions.has(getFileExtension(filePath))) {
      return false;
    }

    return isBinary(null, fs.readFileSync(filePath));
  };

  const findBinariesInDirectory = dirPath => {
    let results = [];
    const list = fs.readdirSync(dirPath);
    list.forEach(filePath => {
      filePath = dirPath + '/' + filePath;
      const stat = fs.lstatSync(filePath);
      if (stat && stat.isDirectory()) {
        results = results.concat(findBinariesInDirectory(filePath));
      } else {
        if (!stat.isSymbolicLink() && needsSigning(filePath)) {
          results.push(path.relative(envInstallerDir, filePath));
        }
      }
    });

    return results;
  };

  const binaries = findBinariesInDirectory(envInstallerDir);
  const fileContent = binaries.join('\n');
  const signListFile = path.join(
    'env_installer',
    `sign-${cli.flags.platform}.txt`
  );

  fs.writeFileSync(signListFile, `${fileContent}\n`);

  console.log(`Saved binary sign list to ${signListFile}`);

  process.exit(0);
}

if (cli.flags.copyExtrasToBundledEnv) {
  const envExtrasDir = path.resolve('env_installer', 'extras');
  const envInstallerDir = path.resolve('env_installer', 'jlab_server');

  fs.copySync(envExtrasDir, envInstallerDir, { recursive: true });

  console.log(
    `Finished copying env extras from \n\t"${envExtrasDir}" to \n\t"${envInstallerDir}"`
  );

  process.exit(0);
}
