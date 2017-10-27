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
    Range, satisfies
} from 'semver';

import * as fs from 'fs';

let which = require('which');

export
    interface IRegistry {

    getDefaultEnvironment: () => Promise<Registry.IPythonEnvironment>;

    setDefaultEnvironment: (path: string) => Promise<void>;

    // refreshEnvironmentList: () => Promise<void>;

    getEnvironmentList: () => Promise<Registry.IPythonEnvironment[]>;
}

export
    class Registry implements IRegistry {

    /*

    if (process.platform == 'win32') {
        var main = new WindowsRegistry({
            hive: WindowsRegistry.HKCU,
            key: '\\SOFTWARE\\Python\\PythonCore'
        });
        main.keys((err: any, items: any[]) => {
            items.forEach((item) => {
                var installPath = new WindowsRegistry({
                    hive: WindowsRegistry.HKCU,
                    key: item.key + '\\InstallPath'
                });
                installPath.values((err: any, vals: any[]) => {
                    vals.forEach((v) => {
                        if (v.name == '(Default)')
                            console.log(v.value);
                    });
                });
            });
        });
        return;
    }
    */

    constructor() {
        this._requirements = [
            {
                name: 'jupyter_core',
                moduleName: 'jupyter',
                commands: ['--version'],
                versionRange: new Range('>=4.2.0')
            },
            {
                name: 'notebook',
                moduleName: 'jupyter',
                commands: ['notebook', '--version'],
                versionRange: new Range('>=5.0.0')
            }
        ];

        let pathEnvironments = this._loadPATHEnvironments();
        let condaEnvironments = this._loadCondaEnvironments();
        let allEnvironments = [pathEnvironments, condaEnvironments];
        if (process.platform === 'win32') {
            let windowRegEnvironments = this._loadWindowsRegistryEnvironments();
            allEnvironments.push(windowRegEnvironments);
        }

        this._registryBuilt = Promise.all<Registry.IPythonEnvironment[]>(allEnvironments).then(environments => {
            let flattenedEnvs: Registry.IPythonEnvironment[] = Array.prototype.concat.apply([], environments);
            let updatedEnvs = this._updatePythonEnvironmentsWithRequirementVersions(flattenedEnvs, this._requirements);

            return updatedEnvs.then(envs => {
                let filteredEnvs = this._filterPythonEnvironmentsByRequirements(envs, this._requirements);
                this._sortEnvironments(filteredEnvs, this._requirements);

                this._default = filteredEnvs[0];
                this._environments = filteredEnvs;

                return;
            });
        }).catch(reason => {
            console.log(`Registry building failed! Reason: ${reason}`);
            this._default = undefined;
        });
    }

    getDefaultEnvironment(): Promise<Registry.IPythonEnvironment> {
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

    setDefaultEnvironment(newDefaultPath: string): Promise<void> {
        return new Promise((resolve, reject) => {
            this._registryBuilt.then(() => {
                if (this._default) {
                    if (this._default.path === newDefaultPath) {
                        resolve();
                    } else {
                        let foundInList = this._environments.filter(env => {
                            return env.path === newDefaultPath;
                        })[0];

                        if (foundInList) {
                            this._default = foundInList;

                            resolve();
                        } else {
                            this._buildEnvironmentFromPath(newDefaultPath, this._requirements).then(newEnv => {
                                this._default = newEnv;
                                resolve();
                            }).catch(reject);
                        }
                    }
                } else {
                    this._buildEnvironmentFromPath(newDefaultPath, this._requirements).then(newEnv => {
                        this._default = newEnv;
                        resolve();
                    }).catch(reject);
                }
            });
        });
    }

    getEnvironmentList(): Promise<Registry.IPythonEnvironment[]> {
        return new Promise((resolve, reject) => {
            this._registryBuilt.then(() => {
                if (this._environments) {
                    resolve(this._environments);
                } else {
                    reject(new Error(`No environment list found!`));
                }
            });
        });
    }

    private _buildEnvironmentFromPath(pythonPath: string, requirements: Registry.IRequirement[]): Promise<Registry.IPythonEnvironment> {
        let possibleNewDefault: Registry.IPythonEnvironment = {
            name: `SetDefault-${basename(pythonPath)}`,
            path: pythonPath,
            type: Registry.IEnvironmentType.PATH,
            versions: {}
        };

        let updatedEnv = this._updatePythonEnvironmentsWithRequirementVersions([possibleNewDefault], requirements);

        return updatedEnv.then(newEnvs => {
            let filteredEnvs = this._filterPythonEnvironmentsByRequirements(newEnvs, requirements);
            if (filteredEnvs.length === 0) {
                return Promise.reject(new Error('Python path does not satisfiy requirement!'));
            } else {
                return Promise.resolve(filteredEnvs[0]);
            }
        }, err => {
            return Promise.reject(new Error('Python check failed!'));
        });
    }

    private _loadPATHEnvironments(): Promise<Registry.IPythonEnvironment[]> {
        let pathPythons = this._getExecutableInstances('python', process.env.PATH);
        let pathPython3s = this._getExecutableInstances('python3', process.env.PATH);

        return Promise.all([pathPythons, pathPython3s]).then(([python2s, python3s]: [string[], string[]]) => {
            let uniquePythons = python2s.concat(python3s).filter((value, index, self) => {
                return self.indexOf(value) === index;
            });

            return uniquePythons.map((pythonPath, index) => {
                let newPythonEnvironment: Registry.IPythonEnvironment = {
                    name: `${basename(pythonPath)}-${index}`,
                    path: pythonPath,
                    type: Registry.IEnvironmentType.PATH,
                    versions: {}
                };

                return newPythonEnvironment;
            });
        });
    }

    private _loadCondaEnvironments(): Promise<Registry.IPythonEnvironment[]> {
        let pathCondas = this._getPATHCondas();
        let commonCondas = this._filterNonexistantPaths(Registry.COMMON_CONDA_LOCATIONS);

        let allCondas = [pathCondas, commonCondas];
        if (process.platform === 'win32') {
            allCondas.push(this._getWindowsRegistryCondas());
        }

        return Promise.all(allCondas).then(allCondas => {
            let flattenedCondaRoots: string[] = Array.prototype.concat.apply([], allCondas);
            let uniqueCondaRoots = flattenedCondaRoots.filter((value: string, index, self) => {
                return self.indexOf(value) === index;
            });

            let rootEnvironments = uniqueCondaRoots.map(condaRootPath => {
                let newRootEnvironment: Registry.IPythonEnvironment = {
                    name: basename(condaRootPath),
                    path: join(condaRootPath, 'bin', 'python'),
                    type: Registry.IEnvironmentType.CondaRoot,
                    versions: {}
                };

                return newRootEnvironment;
            });

            return rootEnvironments;
        });
    }

    private _getPATHCondas(): Promise<string[]> {
        let PATH = process.env.PATH;
        return this._getExecutableInstances('conda', PATH).then(condasInPath => {
            return Promise.all(condasInPath.map(condaExecutablePath => {
                let condaInfoOutput = this._runCommand(condaExecutablePath, ['info']);
                return this._convertExecutableOutputFromJson(condaInfoOutput).then(condaInfoJSON => {
                    return condaInfoJSON.root_prefix as string;
                });
            }));
        });
    }

    private _getWindowsRegistryCondas(): Promise<string[]> {
        return Promise.resolve([]);
    }

    private _loadWindowsRegistryEnvironments(): Promise<Registry.IPythonEnvironment[]> {
        return Promise.resolve([]);
    }

    private _filterPythonEnvironmentsByRequirements(environments: Registry.IPythonEnvironment[], requirements: Registry.IRequirement[]): Registry.IPythonEnvironment[] {
        return environments.filter((env, index, envSelf) => {
            return requirements.every((req, index, reqSelf) => {
                try {
                    return satisfies(env.versions[req.name], req.versionRange);
                } catch (e) {
                    return false;
                }
            });
        });
    }

    private _updatePythonEnvironmentsWithRequirementVersions(environments: Registry.IPythonEnvironment[], requirements: Registry.IRequirement[]): Promise<Registry.IPythonEnvironment[]> {
        let updatedEnvironments = environments.map(env => {
            let versions: Promise<[string, string]>[] = requirements.map(req => {
                let pythonOutput = this._runPythonModuleCommand(env.path, req.moduleName, req.commands);
                let versionFromOutput = this._extractVersionFromExecOutput(pythonOutput);
                return versionFromOutput.then<[string, string]>(version => {
                    return [req.name, version];
                }).catch<[string, string]>(reason => {
                    return [req.name, Registry.NO_MODULE_SENTINEL];
                });
            });

            return Promise.all(versions).then(versions => {
                env.versions = versions.reduce((accum: Registry.IVersionContainer, current: [string, string], index, self) => {
                    accum[current[0]] = current[1];
                    return accum;
                }, {});

                return env;
            });
        });

        return Promise.all(updatedEnvironments);
    }

    private _extractVersionFromExecOutput(output: Promise<string>): Promise<string> {
        return new Promise((resolve, reject) => {
            output.then(output => {
                let matches: string[] = [];
                let currentMatch: RegExpExecArray;
                do {
                    currentMatch = Registry.SEMVER_REGEX.exec(output);
                    if (currentMatch) {
                        matches.push(currentMatch[0]);
                    }
                } while (currentMatch);

                if (matches.length === 0) {
                    reject(new Error(`Could not find SemVer match in output!`));
                } else {
                    resolve(matches[0]);
                }
            }, reason => {
                console.log(reason);
                reject(new Error(`Command output failed!`));
            });
        });
    }

    private _convertExecutableOutputFromJson(output: Promise<string>): Promise<any> {
        return new Promise((resolve, reject) => {
            output.then(output => {
                try {
                    resolve(JSON.parse(output));
                } catch (e) {
                    reject(e);
                }
            }).catch(reject);
        });
    }

    private _filterNonexistantPaths(paths: string[]): Promise<string[]> {
        return Promise.all(paths.map((path, index) => this._pathExists(path))).then(results => {
            return paths.filter((element, index) => {
                return results[index];
            });
        });
    }

    private _pathExists(path: string): Promise<boolean> {
        return new Promise<boolean>((res, rej) => {
            fs.access(path, fs.constants.F_OK, (e) => {
                res(e === undefined || e === null);
            });
        });
    }

    private _getExecutableInstances(executableName: string, path: string): Promise<string[]> {
        return new Promise<string[]>((resolve, reject) => {
            which(executableName, { all: true, path: path }, (err: any, result: string) => {
                if (err) {
                    if (err.code === 'ENOENT') {
                        resolve([]);
                    } else {
                        reject(err);
                    }
                } else {
                    if (typeof result === 'string') {
                        resolve([result]);
                    } else {
                        resolve(result);
                    }
                }
            });
        });
    }

    private _runPythonModuleCommand(pythonPath: string, moduleName: string, commands: string[]): Promise<string> {
        let totalCommands = ['-m', moduleName].concat(commands);
        return new Promise<string>((resolve, reject) => {
            this._runCommand(pythonPath, totalCommands).then(output => {
                let reg = new RegExp(Registry.NO_MODULE_REGEX_FORMAT_STRING(moduleName));

                if (reg.test(output)) {
                    reject(new Error(`Python executable could not find ${moduleName} module!`));
                } else {
                    resolve(output);
                }

            }).catch(reject);
        });
    }

    private _runCommand(executablePath: string, commands: string[]): Promise<string> {
        return new Promise<any>((resolve, reject) => {
            let executableRun = spawn(executablePath, commands);

            executableRun.on('exit', () => {
                executableRun.removeAllListeners();

                let rawOutput = (executableRun.stdout.read() as Buffer);
                if (!rawOutput) {
                    let errOutput = (executableRun.stderr.read() as Buffer);
                    if (!errOutput) {
                        reject(new Error(`Command produced no output to stdout or stderr!`));
                    } else {
                        resolve(errOutput);
                    }
                } else {
                    resolve(rawOutput.toString());
                }
            });
        });
    }

    private _sortEnvironments(environments: Registry.IPythonEnvironment[], requirements: Registry.IRequirement[]) {
        environments.sort((a, b) => {
            let typeCompareResult = this._compareEnvType(a.type, b.type);
            if (typeCompareResult !== 0) {
                return typeCompareResult;
            } else {
                let versionCompareResult = this._compareVersions(a.versions, b.versions, requirements);
                if (versionCompareResult !== 0) {
                    return versionCompareResult;
                } else {
                    return a.name.localeCompare(b.name);
                }
            }
        });
    }

    private _compareVersions(a: Registry.IVersionContainer, b: Registry.IVersionContainer, requirements: Registry.IRequirement[]): number {
        let versionPairs = requirements.map(req => {
            return [a[req.name], b[req.name]];
        });

        for (let index = 0; index < requirements.length; index++) {
            let [aVersion, bVersion] = versionPairs[index];
            let result = aVersion.localeCompare(bVersion);

            if (result !== 0) {
                return result;
            }
        }

        return 0;
    }

    private _compareEnvType(a: Registry.IEnvironmentType, b: Registry.IEnvironmentType): number {
        return this._getEnvTypeValue(a) - this._getEnvTypeValue(b);
    }

    private _getEnvTypeValue(a: Registry.IEnvironmentType): number {
        switch (a) {
            case Registry.IEnvironmentType.PATH:
                return 0;
            case Registry.IEnvironmentType.CondaRoot:
                return 1;
            case Registry.IEnvironmentType.WindowsReg:
                return 2;
            case Registry.IEnvironmentType.CondaEnv:
                return 3;
            default:
                return 100;
        }
    }

    private _environments: Registry.IPythonEnvironment[];

    private _default: Registry.IPythonEnvironment;

    private _registryBuilt: Promise<void>;

    private _requirements: Registry.IRequirement[];
}

export
namespace Registry {

    export
        interface IPythonEnvironment {
        path: string;
        name: string;
        type: IEnvironmentType;
        versions: IVersionContainer; // First version is for jupyter, second version is for jupyter notebook
    }

    export
        interface IVersionContainer {
        [name: string]: string;
    }

    export enum IEnvironmentType {
        PATH = 'PATH',
        CondaRoot = 'conda-root',
        CondaEnv = 'conda-env',
        WindowsReg = 'windows-reg',
    }

    export interface IRequirement {
        name: string;
        moduleName: string;
        commands: string[];
        versionRange: Range;
    }

    export
        const COMMON_CONDA_LOCATIONS = [
            join(app.getPath('home'), 'anaconda3'),
            join(app.getPath('home'), 'anaconda'),
            join(app.getPath('home'), 'miniconda3'),
            join(app.getPath('home'), 'miniconda')
        ];

    // Copied from https://raw.githubusercontent.com/sindresorhus/semver-regex/master/index.js
    export
        const SEMVER_REGEX = /\bv?(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[\da-z\-]+(?:\.[\da-z\-]+)*)?(?:\+[\da-z\-]+(?:\.[\da-z\-]+)*)?\b/ig;

    export
        function NO_MODULE_REGEX_FORMAT_STRING(moduleName: string): string {
        return `No module named ${moduleName}$`;
    }

    export const NO_MODULE_SENTINEL = 'NO MODULE OR VERSION FOUND';
}

let service: IService = {
    requirements: [],
    provides: 'IRegistry',
    activate: (): IRegistry => {
        return new Registry();
    },
    autostart: true
};
export default service;
