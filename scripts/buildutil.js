const meow = require("meow");
const fs = require("fs-extra");
const path = require("path");
const semver = require("semver");
const lockfile = require("@yarnpkg/lockfile");
const yaml = require("js-yaml");

const platform = process.platform;
const pkgjsonFilePath = path.resolve(__dirname, "../package.json");

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

function searchTextInFile(filePath, text) {
    try {
        const fileContent = fs.readFileSync(filePath, "utf8");
        return fileContent.includes(text);
    } catch (e) {
        console.error('Error searching for file content', e);
    }

    return false;
}

// remove ~ or ^ prefix from semver version
function makeVersionAbsolute(version) {
    if (version.length > 0 && (version[0] === '^' || version[0] === '~')) {
        return version.substring(1);
    }

    return version;
}

/*
* Checks if JupyterLab extensions listed in package.json
* are properly included into the bundle in "extensions/index.ts"
*/
function checkExtensionImports() {
    console.log('Checking for missing extension imports...');

    const pkgjsonFileData = fs.existsSync(pkgjsonFilePath)
        ? fs.readJSONSync(pkgjsonFilePath)
        : undefined;
    if (!pkgjsonFileData) {
        console.error("package.json not found!");
        process.exit(1);
    }

    const extensions = pkgjsonFileData.jupyterlab.extensions;
    const mimeExtensions = pkgjsonFileData.jupyterlab.mimeExtensions;
    const extensionsFilePath = path.resolve(__dirname, `../src/browser/extensions/index.ts`);
    let extensionsFileContent = '';
    try {
        extensionsFileContent = fs.readFileSync(extensionsFilePath, "utf8");
    } catch (e) {
        console.error('Error loading "extensions/index.ts"', e);
    }
    for (const extension of [...extensions, ...mimeExtensions]) {
        if (!extensionsFileContent.includes(`require('${extension}')`)) {
            console.error(`${extension} is not imported in "extensions/index.ts"`);
            process.exit(1);
        }
    }

    console.log('All extensions are bundled correctly.');
}

if (cli.flags.checkVersionMatch) {
    // parse application version
    const pkgjsonFileData = fs.existsSync(pkgjsonFilePath)
        ? fs.readJSONSync(pkgjsonFilePath)
        : undefined;
    if (!pkgjsonFileData) {
        console.error("package.json not found!");
        process.exit(1);
    }

    const appVersion = pkgjsonFileData["version"];
    console.log(`JupyterLab Desktop version: ${appVersion}`);

    // parse JupyterLab version bundled to application UI
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
            `Application package version ${appVersion} doesn't match bundled JupyterLab version ${jlabVersion}`
        );
        process.exit(1);
    }

    // check JupyterLab version bundled to Application Server
    const constructorData = yaml.load(
        fs.readFileSync(
            path.resolve(__dirname, "../env_installer/construct.yaml"),
            "utf8"
        )
    );
    const appServerVersion = constructorData["version"];
    console.log(`Application Server version: ${appServerVersion}`);

    if (appServerVersion !== appVersion) {
        console.error(
            `Application Server version ${appServerVersion} doesn't match Application version ${appVersion}`
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
    console.log(`Application Server JupyterLab version: ${appServerJLabVersion}`);

    if (appServerJLabVersion !== jlabVersion) {
        console.error(
            `Application Server package version ${appServerJLabVersion} doesn't match bundled JupyterLab version ${jlabVersion}`
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
    let searchString = `JupyterLabDesktopAppServer-${appVersion}-`;
    if (!searchTextInFile(envInstallScriptPath, searchString)) {
        console.error(
            `Script file ${envInstallScriptPath} doesn't contain correct Application version ${appVersion}`
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
            `src/index.html doesn't contain correct Application version ${appVersion}`
        );
        process.exit(1);
    }

    checkExtensionImports();

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

                const newResolutions = {...newPkgData.resolutions}
                const newDependencies = {...newPkgData.devDependencies, ...newResolutions};

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
                        oldDependencies[packageName] = makeVersionAbsolute(newDependencies[packageName]);
                    }
                }

                // copy resolutions and singleton packages as-is
                pkgjsonFileData.resolutions = newResolutions;
                pkgjsonFileData.singletonPackages = newPkgData.singletonPackages;

                fs.writeFileSync(pkgjsonFilePath, JSON.stringify(pkgjsonFileData, null, 2));

                console.log(`JupyterLab dependencies updated to v${newVersion}`);

                checkExtensionImports();

                // Check if all extensions of the new JupyterLab version are
                // bundled into the application
                console.log('Checking for extension list match...');
                const extensions = pkgjsonFileData.jupyterlab.extensions;
                const mimeExtensions = pkgjsonFileData.jupyterlab.mimeExtensions;
                const excludedExtensions = pkgjsonFileData.jupyterlab.excludedExtensions;

                const extensionSet = new Set([...extensions, ...excludedExtensions]);
                const mimeExtensionSet = new Set([...mimeExtensions, ...excludedExtensions]);

                for (const extension in newPkgData.jupyterlab.extensions) {
                    if (!extensionSet.has(extension)) {
                        console.error(
                            `JupyterLab v${newVersion} ${extension} is not bundled into the application!`
                        );
                        process.exit(1);
                    }
                }

                for (const extension in newPkgData.jupyterlab.mimeExtensions) {
                    if (!mimeExtensionSet.has(extension)) {
                        console.error(
                            `JupyterLab v${newVersion} ${extension} is not bundled into the application!`
                        );
                        process.exit(1);
                    }
                }

                console.log('All extensions in the new version are bundled correctly.');

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
