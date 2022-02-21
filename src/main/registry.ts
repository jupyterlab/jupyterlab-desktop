import {
    execFile, ExecFileOptions, execFileSync
} from 'child_process';

import {
    IService
} from './main';

import {
    join, basename, normalize, dirname
} from 'path';

import * as path from 'path';

import {
    app, dialog
} from 'electron';

import * as semver from 'semver';

import {
    ArrayExt
} from '@lumino/algorithm';

import * as fs from 'fs';
import log from 'electron-log';
import { IEnvironmentType, IPythonEnvironment, IVersionContainer } from './tokens';

const env_info_py = fs.readFileSync(path.join(__dirname, 'env_info.py')).toString();

let which = require('which');
let WinRegistry = require('winreg');

export interface IRegistry {

    getDefaultEnvironment: () => Promise<IPythonEnvironment>;

    getEnvironmentByPath: (path: string) => Promise<IPythonEnvironment>;

    setDefaultEnvironment: (path: string) => Promise<void>;

    // refreshEnvironmentList: () => Promise<void>;

    getEnvironmentList: () => Promise<IPythonEnvironment[]>;

    addEnvironment: (path: string) => Promise<IPythonEnvironment>;

    getUserJupyterPath: () => Promise<IPythonEnvironment>;

    getBundledPythonPath: () => string;

    validatePythonEnvironmentAtPath:(path: string) => boolean;

    setDefaultPythonPath: (path: string) => void;

    getCurrentPythonEnvironment: () => IPythonEnvironment;

    getAdditionalPathIncludesForPythonPath: (pythonPath: string) => string;

    getRequirements: () => Registry.IRequirement[];
}

export class Registry implements IRegistry {
    constructor() {
        this._requirements = [
            {
                name: 'jupyterlab',
                moduleName: 'jupyterlab',
                commands: ['--version'],
                versionRange: new semver.Range('>=3.1.0')
            }
        ];

        // disable registry building since environment selection list is not
        // exposed to users yet
        const onlySingleUserEnvSupport = true;

        if (!onlySingleUserEnvSupport) {
            let pathEnvironments = this._loadPATHEnvironments();
            let condaEnvironments = this._loadCondaEnvironments();
            let allEnvironments = [pathEnvironments, condaEnvironments];
            if (process.platform === 'win32') {
                let windowRegEnvironments = this._loadWindowsRegistryEnvironments(this._requirements);
                allEnvironments.push(windowRegEnvironments);
            }

            this._registryBuilt = Promise.all<IPythonEnvironment[]>(allEnvironments).then(environments => {
                let flattenedEnvs: IPythonEnvironment[] = Array.prototype.concat.apply([], environments);
                let uniqueEnvs = this._getUniqueObjects(flattenedEnvs, env => {
                    return env.path;
                });

                return this._filterPromises(uniqueEnvs, (value) => {
                    return this._pathExists(value.path);
                }).then(existingEnvs => {
                    let updatedEnvs = this._updatePythonEnvironmentsWithRequirementVersions(uniqueEnvs, this._requirements);
                    return updatedEnvs.then(envs => {
                        let filteredEnvs = this._filterPythonEnvironmentsByRequirements(envs, this._requirements);
                        this._sortEnvironments(filteredEnvs, this._requirements);

                        this._setDefaultEnvironment(filteredEnvs[0]);
                        this._environments = this._environments.concat(filteredEnvs);

                        return;
                    });
                });

            }).catch(reason => {
                if (reason.fileName || reason.lineNumber) {
                    log.error(`Registry building failed! ${reason.name} at ${reason.fileName}:${reason.lineNumber}: ${reason.message}`);
                } else if (reason.stack) {
                    log.error(`Registry building failed! ${reason.name}: ${reason.message}`);
                    log.error(reason.stack);
                } else {
                    log.error(`Registry building failed! ${reason.name}: ${reason.message}`);
                }
                this._setDefaultEnvironment(undefined);
            });
        } else {
            this._registryBuilt = Promise.resolve();
        }
    }

    /**
     * Retrieve the default environment from the registry, once it has been resolved
     *
     * @returns a promise containing the default environment
     */
    getDefaultEnvironment(): Promise<IPythonEnvironment> {
        return new Promise((resolve, reject) => {
            this._registryBuilt.then(() => {
                if (this._default) {
                    resolve(this._default);
                } else {
                    reject(new Error(`No default environment found!`));
                }
            }).catch(reason => {
                reject(new Error(`Default environment could not be obtained: ${reason}`));
            });
        });
    }

    getEnvironmentByPath(pathToMatch: string): Promise<IPythonEnvironment> {
        return new Promise((resolve, reject) => {
            this._registryBuilt.then(() => {
                let matchingEnv = ArrayExt.findFirstValue(this._environments, env => pathToMatch === env.path);

                if (matchingEnv) {
                    resolve(matchingEnv);
                } else {
                    reject(new Error(`No environment found with path matching "${pathToMatch}"`));
                }
            }).catch(reason => {
                reject(new Error(`Registry failed to build: ${reason}`));
            });
        });
    }

    /**
     * Either find default environment by path if it exists in the list, or create a new environment that
     * will be used as the default.
     * @param newDefaultPath the path to the new python executable that will be used as the default
     * @returns a void promise that will be resolved when the process is complete
     */
    setDefaultEnvironment(newDefaultPath: string): Promise<void> {
        return new Promise((resolve, reject) => {
            this._registryBuilt.then(() => {
                if (this._default) {
                    if (this._default.path === newDefaultPath) {
                        resolve();
                    } else {
                        let foundInList = ArrayExt.findFirstValue(this._environments, env => env.path === newDefaultPath);

                        if (foundInList) {
                            this._setDefaultEnvironment(foundInList);

                            resolve();
                        } else {
                            this._buildEnvironmentFromPath(newDefaultPath, this._requirements).then(newEnv => {
                                this._setDefaultEnvironment(newEnv);
                                this._environments.unshift(newEnv);
                                resolve();
                            }).catch(reject);
                        }
                    }
                } else {
                    this._buildEnvironmentFromPath(newDefaultPath, this._requirements).then(newEnv => {
                        this._setDefaultEnvironment(newEnv);
                        this._environments.unshift(newEnv);
                        resolve();
                    }).catch(reject);
                }
            }).catch(reason => {
                reject(new Error(`Default environment could not be set: ${reason}`));
            });
        });
    }

    /**
     * Retrieve the complete list of environments, once they have been resolved
     * @returns a promise that resolves to a complete list of environments
     */
    getEnvironmentList(): Promise<IPythonEnvironment[]> {
        return new Promise((resolve, reject) => {
            this._registryBuilt.then(() => {
                if (this._environments) {
                    resolve(this._environments);
                } else {
                    reject(new Error(`No environment list found!`));
                }
            }).catch(reason => {
                reject(new Error(`Environment list could not be obtained: ${reason}`));
            });
        });
    }

    /**
     * Create a new environment from a python executable, without waiting for the
     * entire registry to be resolved first.
     * @param path The location of the python executable to create an environment from
     */
    addEnvironment(path: string): Promise<IPythonEnvironment> {
        return new Promise((resolve, reject) => {
            this._buildEnvironmentFromPath(path, this._requirements).then(newEnv => {
                this._environments.push(newEnv);
                resolve(newEnv);
            }).catch(reject);
        });
    }

    /**
     * Open a file selection dialog so users
     * can enter the local path to the Jupyter server.
     *
     * @return a promise that is fulfilled with the user path.
     */
    getUserJupyterPath(): Promise<IPythonEnvironment> {
        return new Promise<IPythonEnvironment>((resolve, reject) => {
            dialog.showOpenDialog({
                properties: ['openFile', 'showHiddenFiles'],
                buttonLabel: 'Use Path'
            }).then(({filePaths}) => {
                if (!filePaths) {
                    reject(new Error('cancel'));
                } else {
                    this.addEnvironment(filePaths[0]).then(resolve).catch(reject);
                }
            });

        });
    }

    validatePythonEnvironmentAtPath(path: string): boolean {
        if (!fs.existsSync(path)) {
            return false;
        }

        for (const req of this._requirements) {
            let pythonOutput = this._runPythonModuleCommandSync(path, req.moduleName, req.commands);
            let versionFromOutput = this._extractVersionFromExecOutputSync(pythonOutput);
            if (!semver.satisfies(versionFromOutput, req.versionRange)) {
                return false;
            }
        }

        return true;
    }

    getEnvironmentInfo(pythonPath: string): IPythonEnvironment {
        const runOptions = { env: { 'PATH': this.getAdditionalPathIncludesForPythonPath(pythonPath)}};
        const pythonVersionOutput = this._runCommandSync(pythonPath, ['--version'], runOptions);
        const pythonVersion = this._extractVersionFromExecOutputSync(pythonVersionOutput);
        const jlabVersionOutput = this._runCommandSync(pythonPath, ['-m', 'jupyterlab', '--version'], runOptions);
        const jlabVersion = this._extractVersionFromExecOutputSync(jlabVersionOutput);
        const env_info_out = this._runCommandSync(pythonPath, ['-c', env_info_py]);
        const envInfo = JSON.parse(env_info_out.trim());
        const envName = `${envInfo.type}: ${envInfo.name}`;

        return {
            type: envInfo.type === 'conda' ? IEnvironmentType.CondaEnv : IEnvironmentType.VirtualEnv,
            name: envName,
            path: pythonPath,
            versions: { 'python': pythonVersion, 'jupyterlab': jlabVersion },
            default: false
        };
    }

    setDefaultPythonPath(path: string): void {
        this._default = this.getEnvironmentInfo(path);
    }

    getCurrentPythonEnvironment() : IPythonEnvironment {
        return this._default;
    }

    getBundledPythonPath(): string {
        const platform = process.platform;
        let envPath = join(dirname(app.getAppPath()), 'jlab_server');
        if (platform !== 'win32') {
            envPath = join(envPath, 'bin');
        }
        const bundledPythonPath = join(envPath, `python${platform === 'win32' ? '.exe' : ''}`);

        return bundledPythonPath;
    }

    getAdditionalPathIncludesForPythonPath(pythonPath: string): string {
        const platform = process.platform;

        let envPath = path.dirname(pythonPath);
        if (platform !== 'win32') {
            envPath = path.normalize(path.join(envPath, '../'));
        }

        let path_env = '';
        if (platform === 'win32') {
            path_env = `${envPath};${envPath}\\Library\\mingw-w64\\bin;${envPath}\\Library\\usr\\bin;${envPath}\\Library\\bin;${envPath}\\Scripts;${envPath}\\bin;${process.env['PATH']}`;
        } else {
            path_env = `${envPath}:${envPath}/bin:${process.env['PATH']}`;
        }
        
        return path_env;
    }

    getRequirements(): Registry.IRequirement[] {
        return this._requirements;
    }

    private _buildEnvironmentFromPath(pythonPath: string, requirements: Registry.IRequirement[]): Promise<IPythonEnvironment> {
        let newEnvironment: IPythonEnvironment = {
            name: `SetDefault-${basename(pythonPath)}`,
            path: pythonPath,
            type: IEnvironmentType.PATH,
            versions: {},
            default: false
        };

        let updatedEnv = this._updatePythonEnvironmentsWithRequirementVersions([newEnvironment], requirements);

        return (updatedEnv
            .catch((error: Error) => {
                return Promise.reject(new Error(`Python check failed: ${error}`));
            })
            .then(newEnvs => {
            let filteredEnvs = this._filterPythonEnvironmentsByRequirements(newEnvs, requirements);
            if (filteredEnvs.length === 0) {
                const requirementsDescription = requirements.map(
                    requirement => `${requirement.name} (${requirement.moduleName}) ${requirement.versionRange.range}`
                ).join(', ');
                return Promise.reject(new Error(
                    `Required packages could not be found in the selected Python path:\n${pythonPath}\n\nThe requirements are: ${requirementsDescription}`
                ));
            } else {
                return Promise.resolve(filteredEnvs[0]);
            }
        }));
    }

    
    private _loadPATHEnvironments(): Promise<IPythonEnvironment[]> {
        let pythonExecutableName: string;
        if (process.platform === 'win32') {
            pythonExecutableName = 'python.exe';
        } else {
            pythonExecutableName = 'python';
        }

        let pythonInstances = [this._getExecutableInstances(pythonExecutableName, process.env.PATH)];
        if (process.platform === 'darwin') {
            pythonInstances.push(this._getExecutableInstances('python3', process.env.PATH));
        }

        let flattenedPythonPaths: Promise<string[]> = Promise.all(pythonInstances).then<string[]>(multiplePythons => {
            return Array.prototype.concat.apply([], multiplePythons);
        });

        return flattenedPythonPaths.then((pythons: string[]) => {
            return pythons.map((pythonPath, index) => {
                let newPythonEnvironment: IPythonEnvironment = {
                    name: `${basename(pythonPath)}-${index}`,
                    path: pythonPath,
                    type: IEnvironmentType.PATH,
                    versions: {},
                    default: false
                };

                return newPythonEnvironment;
            });
        });
    }

    private _loadCondaEnvironments(): Promise<IPythonEnvironment[]> {
        let pathCondas = this._getPATHCondas();
        let commonCondas = this._filterNonexistantPaths(Registry.COMMON_CONDA_LOCATIONS);

        let allCondas = [pathCondas, commonCondas];
        if (process.platform === 'win32') {
            allCondas.push(this._getWindowsRegistryCondas());
        }

        return this._loadRootCondaEnvironments(allCondas).then(rootEnvs => {
            let subEnvs = rootEnvs.reduce<Promise<IPythonEnvironment[]>[]>((accum, currentRootEnv, index, self) => {
                let rootSubEnvsFolderPath: string;
                if (process.platform === 'win32') {
                    rootSubEnvsFolderPath = normalize(join(currentRootEnv.path, '..'));
                } else {
                    rootSubEnvsFolderPath = normalize(join(currentRootEnv.path, '..', '..'));
                }

                accum.push(this._getSubEnvironmentsFromRoot(rootSubEnvsFolderPath));

                return accum;
            }, []);

            return Promise.all(subEnvs).then(subEnvs => {
                let flattenSubEnvs = Array.prototype.concat.apply([], subEnvs) as IPythonEnvironment[];

                return rootEnvs.concat(flattenSubEnvs);
            });
        });
    }

    private _getSubEnvironmentsFromRoot(rootPath: string): Promise<IPythonEnvironment[]> {
        let subEnvironmentsFolder = join(rootPath, 'envs');
        let rootName = basename(rootPath);

        return new Promise((resolve, reject) => {
            fs.readdir(subEnvironmentsFolder, (err, files) => {
                if (err) {
                    reject(err);
                } else {
                    let subEnvsWithPython = this._filterNonexistantPaths(files.map(subEnvPath => {
                        return join(subEnvironmentsFolder, subEnvPath, 'bin', 'python');
                    }));

                    subEnvsWithPython.catch(reject).then(subEnvs => {
                        return Array.prototype.concat.apply([], subEnvs) as string[];
                    }).then(subEnvsWithPython => {
                        resolve(subEnvsWithPython.map(subEnvPath => {
                            return {
                                name: `${rootName}-${basename(normalize(join(subEnvPath, '..', '..')))}`,
                                path: subEnvPath,
                                type: IEnvironmentType.CondaEnv,
                                versions: {}
                            } as IPythonEnvironment;
                        }));
                    });
                }
            });
        });
    }

    private _loadRootCondaEnvironments(condaRoots: Promise<string[]>[]): Promise<IPythonEnvironment[]> {
        return Promise.all(condaRoots).then(allCondas => {
            let flattenedCondaRoots: string[] = Array.prototype.concat.apply([], allCondas);
            let uniqueCondaRoots = this._getUniqueObjects(flattenedCondaRoots);

            return uniqueCondaRoots.map(condaRootPath => {
                let path: string;
                if (process.platform === 'win32') {
                    path = join(condaRootPath, 'python.exe');
                } else {
                    path = join(condaRootPath, 'bin', 'python');
                }

                let newRootEnvironment: IPythonEnvironment = {
                    name: basename(condaRootPath),
                    path: path,
                    type: IEnvironmentType.CondaRoot,
                    versions: {},
                    default: false
                };

                return newRootEnvironment;
            });
        });
    }

    private _getPATHCondas(): Promise<string[]> {
        let PATH = process.env.PATH;
        return this._getExecutableInstances('conda', PATH).then(condasInPath => {
            return Promise.all(condasInPath.map(condaExecutablePath => {
                let condaInfoOutput = this._runCommand(condaExecutablePath, ['info', '--json']);
                return this._convertExecutableOutputFromJson(condaInfoOutput).then(condaInfoJSON => {
                    return condaInfoJSON.root_prefix as string;
                });
            }));
        });
    }

    private _getWindowsRegistryCondas(): Promise<string[]> {
        let valuePredicate = (value: any) => {
            return value.name === '(Default)';
        };

        return this._getAllMatchingValuesFromSubRegistry(WinRegistry.HKCU, '\\SOFTWARE\\Python\\ContinuumAnalytics', 'InstallPath', valuePredicate);
    }

    private _loadWindowsRegistryEnvironments(requirements: Registry.IRequirement[]): Promise<IPythonEnvironment[]> {
        let valuePredicate = (value: any) => {
            return value.name === '(Default)';
        };

        let defaultPaths = this._getAllMatchingValuesFromSubRegistry(WinRegistry.HKCU, '\\SOFTWARE\\Python\\PythonCore', 'InstallPath', valuePredicate);

        return defaultPaths.then(installPaths => {
            return Promise.all(installPaths.map(path => {
                let finalPath = join(path, 'python.exe');

                return {
                    name: `WinReg-${basename(normalize(join(path, '..')))}`,
                    path: finalPath,
                    type: IEnvironmentType.WindowsReg,
                    versions: {}
                } as IPythonEnvironment;
            }));
        });
    }

    // This function will retrieve all subdirectories of the main registry path, and for each subdirectory(registry) it will search for the key
    // matching the subDirectory parameter and the value the passes
    private _getAllMatchingValuesFromSubRegistry(registryHive: string, mainRegPath: string, subDirectory: string, valueFilter: (value: any) => boolean): Promise<string[]> {
        let mainWinRegistry = new WinRegistry({
            hive: registryHive,
            key: mainRegPath,
        });

        let getMainRegistryKeys: Promise<any[]> = new Promise((resolve, reject) => {
            mainWinRegistry.keys((err: any, items: any[]) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(items);
                }
            });
        });

        let installPathValues: Promise<any[]> = getMainRegistryKeys.then(items => {
            return Promise.all(items.map(item => {
                let installPath = new WinRegistry({
                    hive: registryHive,
                    key: item.key + '\\' + subDirectory
                });

                let allValues: Promise<any[]> = new Promise((resolve, reject) => {
                    installPath.values((err: any, values: any[]) => {
                        if (err) {
                            reject(err);
                        } else {
                            resolve(values);
                        }
                    });
                });

                return allValues;
            }));
        }).then(nestedInstallPathValues => {
            return Array.prototype.concat.apply([], nestedInstallPathValues);
        });

        return installPathValues.then(values => {
            return values.filter(valueFilter).map(v => v.value);
        });
    }

    private _filterPythonEnvironmentsByRequirements(environments: IPythonEnvironment[], requirements: Registry.IRequirement[]): IPythonEnvironment[] {
        return environments.filter((env, index, envSelf) => {
            return requirements.every((req, index, reqSelf) => {
                try {
                    return semver.satisfies(env.versions[req.name], req.versionRange);
                } catch (e) {
                    return false;
                }
            });
        });
    }

    private _updatePythonEnvironmentsWithRequirementVersions(environments: IPythonEnvironment[], requirements: Registry.IRequirement[]): Promise<IPythonEnvironment[]> {
        let updatedEnvironments = environments.map(env => {
            // Get versions for each requirement
            let versions: Promise<[string, string]>[] = requirements.map(req => {
                let pythonOutput = this._runPythonModuleCommand(env.path, req.moduleName, req.commands);
                let versionFromOutput = this._extractVersionFromExecOutput(pythonOutput);
                return versionFromOutput.then<[string, string]>(version => {
                    return [req.name, version];
                }).catch<[string, string]>(reason => {
                    return [req.name, Registry.NO_MODULE_SENTINEL];
                });
            });

            // Get version for python executable
            let pythonVersion = this._extractVersionFromExecOutput(this._runCommand(env.path, ['--version']))
                .then<[string, string]>(versionString => {
                    return ['python', versionString];
                }).catch<[string, string]>(reason => {
                    return ['python', Registry.NO_MODULE_SENTINEL];
                });
            versions.push(pythonVersion);

            return Promise.all(versions).then(versions => {
                env.versions = versions.reduce((accum: IVersionContainer, current: [string, string], index, self) => {
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
            return output.then(output => {
                const version = this._extractVersionFromExecOutputSync(output);
                if (version === '') {
                    reject(new Error(`Could not find SemVer match in output!`));
                } else {
                    resolve(version);
                }
            }).catch(reason => {
                reject(new Error(`Command output failed: ${reason}`));
            });
        });
    }

    private _extractVersionFromExecOutputSync(output: string): string {
        let matches: string[] = [];
        let currentMatch: RegExpExecArray;
        do {
            currentMatch = Registry.SEMVER_REGEX.exec(output);
            if (currentMatch) {
                matches.push(currentMatch[0]);
            }
        } while (currentMatch);

        return matches.length === 0 ? '' : matches[0];
    }

    private _convertExecutableOutputFromJson(output: Promise<string>): Promise<any> {
        return new Promise((resolve, reject) => {
            output.then(output => {
                try {
                    resolve(JSON.parse(output));
                } catch (e) {
                    log.error(output);
                    reject(e);
                }
            }).catch(reject);
        });
    }

    private _filterNonexistantPaths(paths: string[]): Promise<string[]> {
        return this._filterPromises(paths, this._pathExists);
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
            which(executableName, { all: true, path: path }, (err: any, result: string | string[]) => {
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
                let missingModuleReg = new RegExp(`No module named ${moduleName}$`);
                let commandErrorReg = new RegExp(`Error executing Jupyter command`);

                if (missingModuleReg.test(output)) {
                    reject(new Error(`Python executable could not find ${moduleName} module!`));
                } else if (commandErrorReg.test(output)) {
                    reject(new Error(`Jupyter command execution failed! ${output}`));
                } else {
                    resolve(output);
                }
            }).catch(reject);
        });
    }

    private _runPythonModuleCommandSync(pythonPath: string, moduleName: string, commands: string[]): string {
        const totalCommands = ['-m', moduleName].concat(commands);
        const runOptions = { env: { 'PATH': this.getAdditionalPathIncludesForPythonPath(pythonPath)}};

        return this._runCommandSync(pythonPath, totalCommands, runOptions);
    }

    private _runCommand(executablePath: string, commands: string[]): Promise<string> {
        return new Promise((resolve, reject) => {
            let executableRun = execFile(executablePath, commands);
            let stdoutBufferChunks: Buffer[] = [];
            let stdoutLength = 0;
            let stderrBufferChunks: Buffer[] = [];
            let stderrLength = 0;

            executableRun.stdout.on('data', chunk => {
                if (typeof chunk === 'string') {
                    let newBuffer = Buffer.from(chunk);
                    stdoutLength += newBuffer.length;
                    stdoutBufferChunks.push(newBuffer);
                } else {
                    stdoutLength += chunk.length;
                    stdoutBufferChunks.push(chunk);
                }
            });

            executableRun.stderr.on('data', chunk => {
                if (typeof chunk === 'string') {
                    let newBuffer = Buffer.from(chunk);
                    stderrLength += newBuffer.length;
                    stderrBufferChunks.push(Buffer.from(newBuffer));
                } else {
                    stderrLength += chunk.length;
                    stderrBufferChunks.push(chunk);
                }
            });

            executableRun.on('close', () => {
                executableRun.removeAllListeners();

                let stdoutOutput = Buffer.concat(stdoutBufferChunks, stdoutLength).toString();
                let stderrOutput = Buffer.concat(stderrBufferChunks, stderrLength).toString();

                if (stdoutOutput.length === 0) {
                    if (stderrOutput.length === 0) {
                        reject(new Error(`"${executablePath} ${commands.join(' ')}" produced no output to stdout or stderr!`));
                    } else {
                        resolve(stderrOutput);
                    }
                } else {
                    resolve(stdoutOutput);
                }
            });
        });
    }

    private _runCommandSync(executablePath: string, commands: string[], options?: ExecFileOptions): string {
        try {
            return execFileSync(executablePath, commands, options).toString();
        } catch(error) {
            return 'EXEC:ERROR';
        }
    }

    private _sortEnvironments(environments: IPythonEnvironment[], requirements: Registry.IRequirement[]) {
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

    private _compareVersions(a: IVersionContainer, b: IVersionContainer, requirements: Registry.IRequirement[]): number {
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

    private _compareEnvType(a: IEnvironmentType, b: IEnvironmentType): number {
        return this._getEnvTypeValue(a) - this._getEnvTypeValue(b);
    }

    private _getEnvTypeValue(a: IEnvironmentType): number {
        switch (a) {
            case IEnvironmentType.PATH:
                return 0;
            case IEnvironmentType.CondaRoot:
                return 1;
            case IEnvironmentType.WindowsReg:
                return 2;
            case IEnvironmentType.CondaEnv:
                return 3;
            default:
                return 100;
        }
    }

    // Probably pretty slow, luckily won't ever be used on many values
    private _getUniqueObjects<T, V>(arr: T[], keyFunction?: (value: T) => V) {
        if (keyFunction) {
            let mappedIndices = arr.map(keyFunction).map((keyValue, index, self) => {
                return self.indexOf(keyValue);
            });

            let filteredIndices = mappedIndices.filter((mappedIndex, actualIndex, self) => {
                return mappedIndex === actualIndex;
            });

            let filteredValues = filteredIndices.map(index => {
                return arr[index];
            });

            return filteredValues;
        } else {
            return arr.filter((value, index, self) => {
                return self.indexOf(value) === index;
            });
        }
    }

    private _filterPromises<T>(arr: T[], predicate: (value: T, index: number, self: T[]) => Promise<boolean>): Promise<T[]> {
        let predicatedValues = arr.map((value, index) => predicate(value, index, arr));

        return Promise.all(predicatedValues).then(predicatedValues => {
            return arr.filter((element, index) => {
                return predicatedValues[index];
            });
        });
    }

    private _setDefaultEnvironment(newEnv: IPythonEnvironment) {
        if (this._default) {
            this._default.default = false;
        }
        this._default = newEnv;
        if (this._default) {
            this._default.default = true;
        }
    }

    private _environments: IPythonEnvironment[] = [];

    private _default: IPythonEnvironment;

    private _registryBuilt: Promise<void>;

    private _requirements: Registry.IRequirement[];
}

export
namespace Registry {

    /**
     * This type represents module/executable package requirements for the python executables
     * in the registry. Each requirement should correspond to a python module that is also
     * executable via the '-m <module_name>' interface
     */
    export interface IRequirement {
        /**
         * The display name for the requirement
         */
        name: string;
        /**
         * The actual module name that will be used with the python executable
         */
        moduleName: string;
        /**
         * List of extra commands that will produce a version number for checking
         */
        commands: string[];
        /**
         * The Range of acceptable version produced by the previous commands field
         */
        versionRange: semver.Range;
    }

    export const COMMON_CONDA_LOCATIONS = [
        join(app.getPath('home'), 'anaconda3'),
        join(app.getPath('home'), 'anaconda'),
        join(app.getPath('home'), 'miniconda3'),
        join(app.getPath('home'), 'miniconda')
    ];

    // Copied from https://raw.githubusercontent.com/sindresorhus/semver-regex/master/index.js
    export const SEMVER_REGEX = /\bv?(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[\da-z\-]+(?:\.[\da-z\-]+)*)?(?:\+[\da-z\-]+(?:\.[\da-z\-]+)*)?\b/ig;

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
