import {
    spawn
} from 'child_process';

import {
    IService
} from './main';

import {
    join, basename
} from 'path';

import {
    app
} from 'electron';

import {
    SemVer, Range, satisfies
} from 'semver';

import * as fs from 'fs';

export
    interface IRegistry {

    getDefaultEnvironment: () => Promise<Registry.IEnvironment>;

    setDefaultEnvironment: (path: string) => Promise<void>;

    getCondaInstallations: () => Promise<Registry.ICondaInstall[]>;

    addPackageRequiment: (requirement: Registry.IPackageRequirement) => Promise<void>;

    removePackageRequirement: (requirement: Registry.IPackageRequirement) => Promise<void>;

    getPackageRequirements: () => Promise<Registry.IPackageRequirement[]>;

    refreshEnvironments: () => Promise<void>;
}

export
    class Registry implements IRegistry {

    constructor(requirements: Registry.IPackageRequirement[]) {
        this._requirements = requirements;

        this._registryBuilt = this._loadCondaInstalls().then(condaInstallations => {
            condaInstallations.forEach(condaInstall => {
                condaInstall.envs.forEach(environment => {
                    this._refreshEnviromentWithRequirements(environment, this._requirements);
                });

                this._refreshEnviromentWithRequirements(condaInstall.rootEnv, this._requirements);
            });

            this._condaInstallations = condaInstallations;

            this._sortCondaInstallsAndEnvironments(this._condaInstallations);
            this._default = this._selectInitialDefaultEnvironment(this._condaInstallations);
        }).catch(reason => {
            console.log(`Registry building failed! Reason: ${reason}`);
            this._condaInstallations = undefined;
        });
    }

    getCondaInstallations(): Promise<Registry.ICondaInstall[]> {
        return new Promise((resolve, reject) => {
            this._registryBuilt.then(() => {
                if (this._condaInstallations && this._condaInstallations.length > 0) {
                    resolve(this._condaInstallations);
                } else {
                    reject(new Error(`No conda installations found!`));
                }
            });
        });
    }

    getDefaultEnvironment(): Promise<Registry.IEnvironment> {
        return new Promise((resolve, reject) => {
            this._registryBuilt.then(() => {
                if (this._default) {
                    resolve(this._default);
                } else {
                    reject(new Error(`No default environment found!`));
                }
            });
        });
    }

    setDefaultEnvironment: (path: string) => Promise<void>;

    addPackageRequiment: (requirement: Registry.IPackageRequirement) => Promise<void>;

    removePackageRequirement: (requirement: Registry.IPackageRequirement) => Promise<void>;

    getPackageRequirements(): Promise<Registry.IPackageRequirement[]> {
        return this._registryBuilt.then(() => {
            return Promise.resolve(this._requirements);
        });
    }

    refreshEnvironments(): Promise<void> {
        return this._registryBuilt.then(() => {
            this._condaInstallations.forEach(condaInstall => {
                condaInstall.envs.forEach(environment => {
                    this._refreshEnviromentWithRequirements(environment, this._requirements);
                });

                this._refreshEnviromentWithRequirements(condaInstall.rootEnv, this._requirements);
            });
        });
    }

    // Conda installations must be sorted before being passed to this function
    private _selectInitialDefaultEnvironment(sortedCondaInstallations: Registry.ICondaInstall[]): Registry.IEnvironment {
        if (sortedCondaInstallations.length === 0) {
            return undefined;
        } else {
            for (let condaIndex = 0; condaIndex < sortedCondaInstallations.length; condaIndex++) {
                if (sortedCondaInstallations[condaIndex].rootEnv.satisfiesRequirements) {
                    return sortedCondaInstallations[condaIndex].rootEnv;
                }
                for (let envIndex = 0; envIndex < sortedCondaInstallations[condaIndex].envs.length; envIndex++) {
                    if (sortedCondaInstallations[condaIndex].envs[envIndex].satisfiesRequirements) {
                        return sortedCondaInstallations[condaIndex].envs[envIndex];
                    }
                }
            }
        }
    }

    private _sortCondaInstallsAndEnvironments(condaInstalls: Registry.ICondaInstall[]) {
        condaInstalls.forEach(condaInstallation => {
            condaInstallation.envs.sort((a, b) => {
                if (a.satisfiesRequirements && !b.satisfiesRequirements) {
                    return -1;
                } else if (!a.satisfiesRequirements && b.satisfiesRequirements) {
                    return 1;
                } else {
                    if (a.name < b.name) {
                        return -1;
                    } else if (a.name > b.name) {
                        return 1;
                    } else {
                        return 1;
                    }
                }
            });
        });

        condaInstalls.sort((a, b) => {
            if (a.presentInPath && !b.presentInPath) {
                return -1;
            } else if (!a.presentInPath && b.presentInPath) {
                return 1;
            } else {
                if (a.rootEnv.satisfiesRequirements && !b.rootEnv.satisfiesRequirements) {
                    return -1;
                } else if (!a.rootEnv.satisfiesRequirements && b.rootEnv.satisfiesRequirements) {
                    return 1;
                } else {
                    return a.name.localeCompare(b.name);
                }
            }
        });
    }

    private _getPATHCondaInstalls(): Promise<string[]> {
        return this._getExecutableInstancesInPATH('conda').then(condasInPath => {
            return Promise.all(condasInPath.map(condaExecutablePath => {
                return this._getJSONFromCommand(condaExecutablePath, ['info']).then(condaInfoJSON => {
                    return condaInfoJSON.root_prefix as string;
                });
            }));
        });
    }

    private _loadCondaInstalls(): Promise<Registry.ICondaInstall[]> {
        return new Promise((resolve, reject) => {
            this._getPATHCondaInstalls().then(condas => {
                let condasInPath = new Set(condas);
                let uniqueCondaInstalls = condas.concat(Registry.COMMON_CONDA_LOCATIONS).filter((value, index, self) => {
                    return self.indexOf(value) === index; // get unique conda install locations
                });

                this._filterNonexistantPaths(uniqueCondaInstalls).then(existingCondaInstallPaths => { // filter out conda paths that don't exist
                    return Promise.all(existingCondaInstallPaths.map(condaInstallPath => {
                        return this._loadCondaFolder(condaInstallPath, condasInPath.has(condaInstallPath)); // for each existing path load the conda install
                    }))
                        .then(resolve)
                        .catch(reject);
                });
            });
        });
    }

    private _loadCondaFolder(condaInstallPath: string, inPATH: boolean): Promise<Registry.ICondaInstall> {
        return new Promise((resolve, reject) => {
            let subfolders = [join(condaInstallPath, 'bin'), join(condaInstallPath, 'conda-meta'), join(condaInstallPath, 'envs')];
            this._checkAllPaths(subfolders).then(subfoldersExist => {
                if (!subfoldersExist) {
                    reject(new Error(`Conda installation at ${condaInstallPath} does not contain necessary folders!`));
                } else {
                    let rootEnv = this._loadEnvironmentFolder('root', condaInstallPath);
                    let otherEnvs = this._loadEnvironments(join(condaInstallPath, 'envs'));
                    Promise.all([rootEnv, otherEnvs]).then(resolvedEnvironments => {
                        let name = basename(condaInstallPath);
                        let newCondaInstall: Registry.ICondaInstall = {
                            path: condaInstallPath,
                            name: name,
                            rootEnv: resolvedEnvironments[0],
                            envs: resolvedEnvironments[1],
                            presentInPath: inPATH
                        };

                        resolve(newCondaInstall);
                    });
                }
            });
        });
    }

    private _loadEnvironments(condaEnvsPath: string): Promise<Registry.IEnvironment[]> {
        return new Promise((resolve, reject) => {
            fs.readdir(condaEnvsPath, (err, files) => {
                if (err) {
                    reject(err);
                } else {
                    let loadedEnvironments = Promise.all(files.map(filename => {
                        return this._loadEnvironmentFolder(filename, join(condaEnvsPath, filename));
                    }));

                    resolve(loadedEnvironments);
                }
            });
        });
    }

    private _loadEnvironmentFolder(environmentName: string, environmentPath: string): Promise<Registry.IEnvironment> {
        return new Promise((resolve, reject) => {
            let subfolders = [join(environmentPath, 'bin'), join(environmentPath, 'conda-meta')];
            this._checkAllPaths(subfolders).then((subfolderExist) => {
                if (!subfolderExist) {
                    reject(new Error(`Environment at ${environmentPath} does not contain necessary folders!`));
                } else {
                    this._loadPackages(join(environmentPath, 'conda-meta')).then(newPackages => {
                        let newEnv: Registry.IEnvironment = {
                            path: environmentPath,
                            name: environmentName,
                            packages: newPackages,
                            binFolder: join(environmentPath, 'bin'),
                            satisfiesRequirements: false
                        };
                        resolve(newEnv);
                    }).catch(err => {
                        reject(err);
                    });
                }
            });
        });
    }

    private _refreshEnviromentWithRequirements(environment: Registry.IEnvironment, requirements: Registry.IPackageRequirement[]) {
        environment.satisfiesRequirements = requirements.every(requirement => {
            return environment.packages.some((pack) => {
                return satisfies(pack.version, requirement.versionRange, true);
            });
        });
    }

    private _loadPackages(condaMetaPath: string): Promise<Registry.IPackage[]> {
        return new Promise((resolve, reject) => {
            // Read conda-meta directory for a list of json files containing package specifications.
            fs.readdir(condaMetaPath, (err, files) => {
                if (err) {
                    reject(err);
                } else {
                    // Filter out the history file from the list of files.
                    let historyFileReg = /^history$/;
                    let packageFiles = files.filter((filename) => {
                        return !historyFileReg.test(filename);
                    });

                    // For each package filename read in the json file
                    Promise.all(packageFiles.map((packageFilename) => {
                        return this._loadPackageFromJSON(join(condaMetaPath, packageFilename));
                    })).then((packages) => {
                        resolve(packages);
                    }).catch((err) => {
                        reject(err);
                    });
                }
            });
        });
    }

    private _loadPackageFromJSON(packagePath: string): Promise<Registry.IPackage> {
        return new Promise<Registry.IPackage>((resolve, reject) => {
            fs.readFile(packagePath, (err, data) => {
                if (err) {
                    reject(err);
                } else {
                    // Create new IPackage from name and version field contained in package file
                    let jsonData = JSON.parse(data.toString());
                    let newPackage: Registry.IPackage = {
                        name: jsonData.name,
                        version: jsonData.version
                    };
                    resolve(newPackage);
                }
            });
        });
    }

    private _filterNonexistantPaths(paths: string[]): Promise<string[]> {
        return Promise.all(paths.map((path, index) => this._pathExists(path))).then(results => {
            return paths.filter((element, index) => {
                return results[index];
            });
        });
    }

    // Check that all paths exists
    private _checkAllPaths(paths: string[]): Promise<boolean> {
        return Promise.all(paths.map(path => {
            return this._pathExists(path);
        })).then(results => {
            return results.every((value) => value);
        });
    }

    private _pathExists(path: string): Promise<boolean> {
        return new Promise<boolean>((res, rej) => {
            fs.access(path, fs.constants.F_OK, (e) => {
                res(e === undefined || e === null);
            });
        });
    }

    private _getExecutableInstancesInPATH(executableName: string): Promise<string[]> {
        return new Promise<string[]>((resolve, reject) => {
            let executableSearch = spawn('/bin/bash', ['-l']);
            executableSearch.stdin.write(`exec which -a ${executableName} \n`);

            executableSearch.on('exit', () => {
                executableSearch.removeAllListeners();

                let rawOutput = (executableSearch.stdout.read() as Buffer);
                if (!rawOutput) {
                    resolve([]);
                } else {
                    resolve(rawOutput.toString().split('\n'));
                }
            });
        });
    }

    private _getJSONFromCommand(executablePath: string, commands: string[]): Promise<any> {
        return new Promise<any>((resolve, reject) => {
            let executableRun = spawn(executablePath, commands);

            executableRun.on('exit', () => {
                executableRun.removeAllListeners();

                let rawOutput = (executableRun.stdout.read() as Buffer);
                if (!rawOutput) {
                    let errOutput = (executableRun.stderr.read() as Buffer);
                    reject(new Error(`Command produced no output to stdout! Stderr: ${errOutput}`));
                } else {
                    resolve(JSON.parse(rawOutput.toString()));
                }
            });
        });
    }

    private _condaInstallations: Registry.ICondaInstall[] = [];

    private _requirements: Registry.IPackageRequirement[] = [];

    private _default: Registry.IEnvironment;

    private _registryBuilt: Promise<void>;
}

export
namespace Registry {

    export
        interface ICondaInstall {
        path: string;
        name: string;
        envs: IEnvironment[];
        rootEnv: IEnvironment;
        presentInPath: boolean;
    }

    export
        interface IEnvironment {
        path: string;
        name: string;
        packages: IPackage[];
        binFolder: string;
        satisfiesRequirements: boolean;
    }

    export
        interface IPackage {
        name: string;
        version: SemVer;
    }

    export
        interface IPackageRequirement {
        packageName: string;
        executableName?: string;
        versionRange: Range;
        versionCommand?: string[];
    }

    export
        const COMMON_CONDA_LOCATIONS = [
            join(app.getPath('home'), 'anaconda3'),
            join(app.getPath('home'), 'anaconda'),
            join(app.getPath('home'), 'miniconda3'),
            join(app.getPath('home'), 'miniconda')
        ];
}

let service: IService = {
    requirements: [],
    provides: 'IRegistry',
    activate: (): IRegistry => {
        let requirements = [
            {
                packageName: 'jupyter',
                executableName: 'jupyter',
                versionRange: new Range('>=4.3.0'),
                versionCommand: ['--version']
            } as Registry.IPackageRequirement,
            {
                packageName: 'notebook',
                executableName: 'jupyter',
                versionRange: new Range('>=5.0.0'),
                versionCommand: ['notebook', '--version']
            }
        ];

        return new Registry(requirements);
    },
    autostart: true
};
export default service;
