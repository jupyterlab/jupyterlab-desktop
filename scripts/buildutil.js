const meow = require("meow");
const fs = require("fs-extra");
const path = require("path");
const semver = require("semver");
const lockfile = require("@yarnpkg/lockfile");
const yaml = require("js-yaml");

const platform = process.platform;

const cli = meow(
    `
    Usage
      $ node buildutil <options>

    Options
      --check-version-match     check for JupyterLab version match

    Other options:
      --help                    show usage information
      --version                 show version information

    Examples
      $ node buildutil --check-version-match
`,
    {
        flags: {
            checkVersionMatch: {
                type: "boolean",
                default: false,
            },
        },
    }
);

const searchTextInFile = (filePath, text) => {
    try {
        const fileContent = fs.readFileSync(filePath, "utf8");
        return fileContent.includes(text);
    } catch (e) {
        console.error('Error searching for file content', e);
    }

    return false;
};

if (cli.flags.checkVersionMatch) {
    // parse App version
    const pkgjsonFilePath = path.resolve(__dirname, "../package.json");
    const pkgjsonFileData = fs.existsSync(pkgjsonFilePath)
        ? fs.readJSONSync(pkgjsonFilePath)
        : undefined;
    if (!pkgjsonFileData) {
        console.error("package.json not found!");
        process.exit(1);
    }

    const appVersion = pkgjsonFileData["version"];
    console.log(`JupyterLab App version: ${appVersion}`);

    // parse JupyterLab version bundled to App UI
    const yarnlockFilePath = path.resolve(__dirname, "../yarn.lock");
    if (!fs.existsSync(yarnlockFilePath)) {
        console.error("yarn.lock not found!");
        process.exit(1);
    }

    const yarnLockFileContent = fs.readFileSync(yarnlockFilePath, "utf8");
    const yarnLockData = lockfile.parse(yarnLockFileContent).object;
    const yarnPackages = Object.keys(yarnLockData);
    const metapackage = yarnPackages.find((pkg) =>
        pkg.startsWith("@jupyterlab/metapackage")
    );
    if (!metapackage) {
        console.error("@jupyterlab/metapackage not found!");
        process.exit(1);
    }

    const jlabVersion = yarnLockData[metapackage].version;
    console.log(`JupyterLab version: ${jlabVersion}`);

    if (
        !semver.valid(appVersion) ||
        !semver.valid(jlabVersion) ||
        semver.major(appVersion) !== semver.major(jlabVersion) ||
        semver.minor(appVersion) !== semver.minor(jlabVersion) ||
        semver.patch(appVersion) !== semver.patch(jlabVersion)
    ) {
        console.error(
            `App package version ${appVersion} doesn't match bundled JupyterLab version ${jlabVersion}`
        );
        process.exit(1);
    }

    // check JupyterLab version bundled to App Server
    const constructorData = yaml.load(
        fs.readFileSync(
            path.resolve(__dirname, "../env_installer/construct.yaml"),
            "utf8"
        )
    );
    const appServerVersion = constructorData["version"];
    console.log(`App Server version: ${appServerVersion}`);

    if (appServerVersion !== appVersion) {
        console.error(
            `App Server version ${appServerVersion} doesn't match App version ${appVersion}`
        );
        process.exit(1);
    }

    const jlabCondaPkg = constructorData["specs"].find((pkg) => pkg.startsWith("jupyterlab"));
    if (!jlabCondaPkg) {
        console.error("jupyterlab conda package not found in environment specs!");
        process.exit(1);
    }
    const specParts = jlabCondaPkg.split(" ");
    const appServerJLabVersion = specParts[1];
    console.log(`App Server JupyterLab version: ${appServerJLabVersion}`);

    if (appServerJLabVersion !== jlabVersion) {
        console.error(
            `App Server package version ${appServerJLabVersion} doesn't match bundled JupyterLab version ${jlabVersion}`
        );
        process.exit(1);
    }

    // check JupyterLab versions in scripts
    const envInstallerScriptName =
        platform === "darwin"
            ? "postinstall"
            : platform === "win32"
                ? "electron-builder-scripts/wininstall.nsh"
                : "electron-builder-scripts/linux_after_install.sh";
    const envInstallScriptPath = path.resolve(
        __dirname,
        `../electron-builder-scripts/${envInstallerScriptName}`
    );
    let searchString = `JupyterLabAppServer-${appVersion}-`;
    if (!searchTextInFile(envInstallScriptPath, searchString)) {
        console.error(
            `Script file ${envInstallScriptPath} doesn't contain correct App version ${appVersion}`
        );
        process.exit(1);
    }

    searchString = `"appVersion": "${appVersion}",`;
    if (
        !searchTextInFile(
            path.resolve(__dirname, `../src/browser/index.html`),
            searchString
        )
    ) {
        console.error(
            `src/index.html doesn't contain correct App version ${appVersion}`
        );
        process.exit(1);
    }

    process.exit(0);
}
