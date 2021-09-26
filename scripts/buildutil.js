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
      --check-version-match      check for JupyterLab version match
      --set-jupyterlab-version   set JupyterLab version

    Other options:
      --help                     show usage information
      --version                  show version information

    Examples
      $ node buildutil --check-version-match
`,
    {
        flags: {
            checkVersionMatch: {
                type: "boolean",
                default: false,
            },
            setJupyterlabVersion: {
                type: "string",
                default: ""
            }
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
                ? "wininstall.nsh"
                : "linux_after_install.sh";
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

    console.log('JupyterLab version match satisfied!');
    process.exit(0);
}

if (cli.flags.setJupyterlabVersion !== "") {
    const https = require('https');
    const newVersion = cli.flags.setJupyterlabVersion;
    console.log(`Downloading JupyterLab v${newVersion} package.json`);

    const url = `https://raw.githubusercontent.com/jupyterlab/jupyterlab/v${newVersion}/jupyterlab/staging/package.json`;

    https.get(url, (res) => {
        let body = "";

        res.on("data", (chunk) => {
            body += chunk;
        });

        res.on("end", () => {
            try {
                let newPkgData = JSON.parse(body);
                if (!(newPkgData.devDependencies && newPkgData.resolutions)) {
                    console.error(`Invalid package.json format for v${newVersion}!`);
                    process.exit(1);
                }
                
                const newDependencies = {...newPkgData.devDependencies, ...newPkgData.resolutions};

                const pkgjsonFilePath = path.resolve(__dirname, "../package.json");
                const pkgjsonFileData = fs.existsSync(pkgjsonFilePath)
                    ? fs.readJSONSync(pkgjsonFilePath)
                    : undefined;
                if (!pkgjsonFileData) {
                    console.error("package.json not found!");
                    process.exit(1);
                }

                const oldDependencies = pkgjsonFileData.dependencies;

                for (const packageName in oldDependencies) {
                    if (packageName.startsWith('@jupyterlab') && packageName in newDependencies) {
                        oldDependencies[packageName] = newDependencies[packageName];
                    }
                }

                fs.writeFileSync(pkgjsonFilePath, JSON.stringify(pkgjsonFileData, null, 2));

                console.log(`JupyterLab dependencies updated to v${newVersion}`);

                process.exit(0);
            } catch (error) {
                console.error(error.message);
                process.exit(1);
            };
        });
    }).on("error", (error) => {
        console.error(error.message);
        process.exit(1);
    });
}
