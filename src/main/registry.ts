import { basename, join, normalize } from 'path';
import * as path from 'path';
import * as fs from 'fs';
import * as semver from 'semver';
import log from 'electron-log';
const which = require('which');
const WinRegistry = require('winreg');
import { ISignal, Signal } from '@lumino/signaling';
import {
  IDisposable,
  IEnvironmentType,
  IPythonEnvironment,
  IPythonEnvResolveError,
  IPythonEnvValidateResult,
  IVersionContainer,
  PythonEnvResolveErrorType
} from './tokens';
import {
  envPathForPythonPath,
  getBundledPythonEnvPath,
  getBundledPythonPath,
  getEnvironmentPath,
  getUserHomeDir,
  isBaseCondaEnv,
  isCondaEnv,
  isPortInUse,
  pythonPathForEnvPath,
  runCommand,
  versionWithoutSuffix
} from './utils';
import { SettingType, userSettings } from './config/settings';
import { appData } from './config/appdata';
import {
  condaEnvPathForCondaExePath,
  condaExePathForEnvPath,
  environmentSatisfiesRequirements,
  getCondaChannels,
  getEnvironmentInfoFromPythonPath,
  getEnvironmentInfoFromPythonPathSync,
  getPythonEnvsDirectory,
  IJupyterEnvRequirement,
  JUPYTER_ENV_REQUIREMENTS,
  updateDiscoveredPythonPaths,
  validatePythonPath
} from './env';
import { app } from 'electron';

export interface IRegistry {
  getDefaultEnvironment: () => Promise<IPythonEnvironment>;
  getEnvironmentByPath: (pythonPath: string) => IPythonEnvironment;
  getEnvironmentList: (cacheOK: boolean) => Promise<IPythonEnvironment[]>;
  addEnvironment: (pythonPath: string) => IPythonEnvironment;
  removeEnvironment: (pythonPath: string) => boolean;
  validatePythonEnvironmentAtPath: (
    pythonPath: string
  ) => Promise<IPythonEnvValidateResult>;
  validateCondaBaseEnvironmentAtPath: (envPath: string) => boolean;
  setDefaultPythonPath: (pythonPath: string) => boolean;
  getCurrentPythonEnvironment: () => IPythonEnvironment;
  getRequirementsInstallCommand: (envPath: string) => string;
  getEnvironmentInfo(pythonPath: string): Promise<IPythonEnvironment>;
  getRunningServerList(): Promise<string[]>;
  dispose(): Promise<void>;
  environmentListUpdated: ISignal<this, void>;
  clearUserSetPythonEnvs(): void;
  bundledEnvironmentIsLatest(): boolean;
}

export const SERVER_TOKEN_PREFIX = 'jlab:srvr:';

export class Registry implements IRegistry, IDisposable {
  constructor() {
    // TODO: refactor into a recallable method

    // initialize environment list and default
    // initialize environment list to cached ones
    this._environments = [
      ...appData.discoveredPythonEnvs,
      ...appData.userSetPythonEnvs
    ].filter(env => this._pathExistsSync(env.path));

    // initialize default environment to user set or bundled
    // TODO: try to use userSettings.pythonPath and bundled python path separately
    // because userSettings.pythonPath might be invalid but bundled one may be valid
    let pythonPath = userSettings.getValue(SettingType.pythonPath);
    if (pythonPath === '') {
      pythonPath = getBundledPythonPath();
    }

    // TODO: validate appData.condaPath and appData.systemPythonPath. getCondaPath instead of appData.condaPath
    // try to set condaPath from CONDA_EXE

    try {
      const defaultEnv = this._resolveEnvironmentSync(pythonPath);

      if (defaultEnv) {
        this._defaultEnv = defaultEnv;
        // if default env is conda root, then set its conda executable as conda path
        if (
          defaultEnv.type === IEnvironmentType.CondaRoot &&
          !appData.condaPath
        ) {
          this.setCondaPath(
            condaExePathForEnvPath(getEnvironmentPath(defaultEnv))
          );
        }
      }
    } catch (error) {
      //
    }

    // try to set default env from discovered pythonPath
    if (!this._defaultEnv && appData.pythonPath) {
      try {
        const defaultEnv = this._resolveEnvironmentSync(appData.pythonPath);

        if (defaultEnv) {
          this._defaultEnv = defaultEnv;
          // if default env is conda root, then set its conda executable as conda path
          if (
            defaultEnv.type === IEnvironmentType.CondaRoot &&
            !appData.condaPath
          ) {
            this.setCondaPath(
              condaExePathForEnvPath(getEnvironmentPath(defaultEnv))
            );
          }
        }
      } catch (error) {
        //
      }
    }

    // try to set default env from condaPath
    if (!this._defaultEnv && appData.condaPath) {
      if (
        this.validateCondaBaseEnvironmentAtPath(
          condaEnvPathForCondaExePath(appData.condaPath)
        )
      ) {
        // set default env from appData.condPath
        if (!this._defaultEnv) {
          const condaEnvPath = condaEnvPathForCondaExePath(appData.condaPath);
          const pythonPath = pythonPathForEnvPath(condaEnvPath, true);
          try {
            const defaultEnv = this._resolveEnvironmentSync(pythonPath);
            if (defaultEnv) {
              this._defaultEnv = defaultEnv;
              if (!appData.pythonPath) {
                appData.pythonPath = pythonPath;
              }
            }
          } catch (error) {
            //
          }
        }
      }
    }

    // try to set systemPythonPath from default env
    if (
      !appData.systemPythonPath &&
      this._defaultEnv &&
      fs.existsSync(this._defaultEnv.path)
    ) {
      this.setSystemPythonPath(this._defaultEnv.path);
    }

    // discover environments on system
    const pathEnvironments = this._loadPathEnvironments();
    const condaEnvironments = this._loadCondaEnvironments();
    const allEnvironments = [pathEnvironments, condaEnvironments];
    if (process.platform === 'win32') {
      let windowRegEnvironments = this._loadWindowsRegistryEnvironments();
      allEnvironments.push(windowRegEnvironments);
    }

    this._registryBuilt = Promise.all<IPythonEnvironment[]>(allEnvironments)
      .then(async environments => {
        let discoveredEnvs = [].concat(...environments);

        this._userSetEnvironments = await this._resolveEnvironments(
          this._getUserSetPythonEnvs(),
          true
        );

        // filter out user set environments
        discoveredEnvs = discoveredEnvs.filter(env => {
          return !this._userSetEnvironments.find(
            userSetEnv => userSetEnv.path === env.path
          );
        });

        discoveredEnvs = await this._resolveEnvironments(discoveredEnvs, true);
        this._discoveredEnvironments = discoveredEnvs;

        this._updateEnvironments();

        if (!this._defaultEnv && this._environments.length > 0) {
          this._defaultEnv = this._environments[0];
          if (!appData.pythonPath) {
            appData.pythonPath = this._defaultEnv.path;
          }
        }

        await updateDiscoveredPythonPaths();
      })
      .catch(reason => {
        if (reason.fileName || reason.lineNumber) {
          log.error(
            `Registry building failed! ${reason.name} at ${reason.fileName}:${reason.lineNumber}: ${reason.message}`
          );
        } else if (reason.stack) {
          log.error(
            `Registry building failed! ${reason.name}: ${reason.message}`
          );
          log.error(reason.stack);
        } else {
          log.error(
            `Registry building failed! ${reason.name}: ${reason.message}`
          );
        }
      });
  }

  get environmentListUpdated(): ISignal<this, void> {
    return this._environmentListUpdated;
  }

  clearUserSetPythonEnvs(): void {
    if (this._userSetEnvironments.length === 0) {
      return;
    }

    this._userSetEnvironments = [];
    this._updateEnvironments();
    this._environmentListUpdated.emit();
  }

  // rediscover Python envs directory for user installed environments,
  // in case they are not in cache already
  private _getUserSetPythonEnvs(): IPythonEnvironment[] {
    const envsDir = getPythonEnvsDirectory();
    const envsDirExists =
      envsDir && fs.existsSync(envsDir) && fs.statSync(envsDir).isDirectory();
    let userInstalledEnvs: IPythonEnvironment[] = [];

    if (envsDirExists) {
      try {
        const list = fs.readdirSync(envsDir);
        list.forEach(filePath => {
          const envPath = envsDir + '/' + filePath;
          const stat = fs.lstatSync(envPath);
          if (stat && stat.isDirectory()) {
            const pythonPath = pythonPathForEnvPath(envPath);
            if (fs.existsSync(pythonPath)) {
              const found = appData.userSetPythonEnvs.find(env => {
                return env.path === pythonPath;
              });

              if (!found) {
                userInstalledEnvs.push({
                  path: pythonPath,
                  name: '',
                  type: IEnvironmentType.Path,
                  versions: {},
                  defaultKernel: 'python3'
                });
              }
            }
          }
        });
      } catch (error) {
        log.error(`Failed to re-discover /envs directory (${envsDir})`, error);
      }
    }

    return [...appData.userSetPythonEnvs, ...userInstalledEnvs];
  }

  private async _resolveEnvironments(
    envs: IPythonEnvironment[],
    sort?: boolean
  ): Promise<IPythonEnvironment[]> {
    let filteredEnvs = envs.filter(env => this._pathExistsSync(env.path));
    const uniqueEnvs = this._getUniqueObjects(filteredEnvs);
    const resolvedEnvs = await Promise.all(
      uniqueEnvs.map(async env => await this._resolveEnvironment(env.path))
    );
    filteredEnvs = resolvedEnvs.filter(env => env !== undefined);

    if (sort) {
      this._sortEnvironments(filteredEnvs, JUPYTER_ENV_REQUIREMENTS);
    }

    return filteredEnvs;
  }

  private async _resolveEnvironment(
    pythonPath: string
  ): Promise<IPythonEnvironment> {
    if (!(await this._pathExists(pythonPath))) {
      return;
    }

    const env = await this.getEnvironmentInfo(pythonPath);

    if (env && environmentSatisfiesRequirements(env)) {
      return env;
    }
  }

  /**
   * Resolve Python environment at pythonPath
   * @param pythonPath Python path
   * @returns Python environment info or throws exception PythonEnvResolveErrorType
   */
  private _resolveEnvironmentSync(pythonPath: string): IPythonEnvironment {
    if (!this._pathExistsSync(pythonPath)) {
      log.error(`Python path "${pythonPath}" does not exist.`);
      throw {
        type: PythonEnvResolveErrorType.PathNotFound
      } as IPythonEnvResolveError;
    }

    let env: IPythonEnvironment;

    try {
      env = this.getEnvironmentInfoSync(pythonPath);
    } catch (error) {
      log.error(
        `Failed to get environment info at path '${pythonPath}'.`,
        error
      );
      throw {
        type: PythonEnvResolveErrorType.ResolveError
      } as IPythonEnvResolveError;
    }

    if (!environmentSatisfiesRequirements(env)) {
      const envPath = envPathForPythonPath(pythonPath);
      const versionsFound: string[] = [];
      JUPYTER_ENV_REQUIREMENTS.forEach(req => {
        versionsFound.push(`${req.name}: ${env.versions[req.name]}`);
      });

      log.error(
        `Required Python packages not found in the environment path "${envPath}". Versions found are: ${versionsFound.join(
          ','
        )}. You can install missing packages using '${this.getRequirementsInstallCommand(
          envPath
        )}'.`
      );
      throw {
        type: PythonEnvResolveErrorType.RequirementsNotSatisfied
      } as IPythonEnvResolveError;
    }

    return env;
  }

  /**
   * Retrieve the default environment from the registry, once it has been resolved
   *
   * @returns a promise containing the default environment
   */
  getDefaultEnvironment(): Promise<IPythonEnvironment> {
    if (this._defaultEnv) {
      return Promise.resolve(this._defaultEnv);
    } else {
      return new Promise((resolve, reject) => {
        this._registryBuilt
          .then(() => {
            if (this._defaultEnv) {
              resolve(this._defaultEnv);
            } else {
              reject(new Error(`No default environment found!`));
            }
          })
          .catch(reason => {
            reject(
              new Error(`Default environment could not be obtained: ${reason}`)
            );
          });
      });
    }
  }

  getEnvironmentByPath(pythonPath: string): IPythonEnvironment {
    return this._environments.find(env => pythonPath === env.path);
  }

  /**
   * Retrieve the complete list of environments, once they have been resolved
   * @returns a promise that resolves to a complete list of environments
   */
  getEnvironmentList(cacheOK: boolean): Promise<IPythonEnvironment[]> {
    if (cacheOK && this._environments.length > 0) {
      return Promise.resolve(this._environments);
    } else {
      return new Promise((resolve, reject) => {
        this._registryBuilt
          .then(() => {
            if (this._environments) {
              resolve(this._environments);
            } else {
              reject(new Error(`No environment list found!`));
            }
          })
          .catch(reason => {
            reject(
              new Error(`Environment list could not be obtained: ${reason}`)
            );
          });
      });
    }
  }

  setCondaPath(rootPath: string) {
    appData.condaPath = rootPath;
  }

  setSystemPythonPath(pythonPath: string) {
    appData.systemPythonPath = pythonPath;
  }

  /**
   * Create a new environment from a python executable, without waiting for the
   * entire registry to be resolved first.
   * @param pythonPath The location of the python executable to create an environment from
   */
  addEnvironment(pythonPath: string): IPythonEnvironment {
    const inDiscoveredEnvList = this._discoveredEnvironments.find(
      env => pythonPath === env.path
    );
    if (inDiscoveredEnvList) {
      return inDiscoveredEnvList;
    }

    const inUserSetEnvList = this._userSetEnvironments.find(
      env => pythonPath === env.path
    );
    if (inUserSetEnvList) {
      return inUserSetEnvList;
    }

    try {
      const env = this._resolveEnvironmentSync(pythonPath);
      if (env) {
        if (!this._defaultEnv) {
          this._defaultEnv = env;
        }
        this._userSetEnvironments.push(env);
        this._updateEnvironments();
        this._environmentListUpdated.emit();
        return env;
      }
    } catch (error) {
      //
    }
  }

  /**
   * Remove environment from registry.
   * @param pythonPath The location of the python executable to create an environment from
   */
  removeEnvironment(pythonPath: string): boolean {
    const discoveredEnvironments = this._discoveredEnvironments.filter(
      env => pythonPath !== env.path
    );
    if (discoveredEnvironments.length < this._discoveredEnvironments.length) {
      this._discoveredEnvironments = discoveredEnvironments;
      this._updateEnvironments();
      this._environmentListUpdated.emit();
      return true;
    }

    const userSetEnvironments = this._userSetEnvironments.filter(
      env => pythonPath !== env.path
    );
    if (userSetEnvironments.length < this._userSetEnvironments.length) {
      this._userSetEnvironments = userSetEnvironments;
      this._updateEnvironments();
      this._environmentListUpdated.emit();
      return true;
    }

    return false;
  }

  async validatePythonEnvironmentAtPath(
    pythonPath: string
  ): Promise<IPythonEnvValidateResult> {
    if (!fs.existsSync(pythonPath)) {
      return {
        valid: false,
        error: {
          type: PythonEnvResolveErrorType.PathNotFound
        }
      };
    }
    if (!(await validatePythonPath(pythonPath)).valid) {
      return {
        valid: false,
        error: {
          type: PythonEnvResolveErrorType.InvalidPythonBinary
        }
      };
    }

    try {
      const env = this._resolveEnvironmentSync(pythonPath);
      if (!env) {
        return {
          valid: false,
          error: {
            type: PythonEnvResolveErrorType.ResolveError
          }
        };
      }
    } catch (error) {
      return {
        valid: false,
        error
      };
    }

    return {
      valid: true
    };
  }

  validateCondaBaseEnvironmentAtPath(envPath: string): boolean {
    return isBaseCondaEnv(envPath);
  }

  async getEnvironmentInfo(pythonPath: string): Promise<IPythonEnvironment> {
    if (this._disposing) {
      return;
    }

    return getEnvironmentInfoFromPythonPath(pythonPath);
  }

  getEnvironmentInfoSync(pythonPath: string): IPythonEnvironment {
    if (this._disposing) {
      return;
    }

    return getEnvironmentInfoFromPythonPathSync(pythonPath);
  }

  setDefaultPythonPath(pythonPath: string): boolean {
    if (pythonPath === '') {
      pythonPath = getBundledPythonPath();
    }

    // check if already resolved
    let env = this.getEnvironmentByPath(pythonPath);
    if (env) {
      this._defaultEnv = env;
      return true;
    }

    // try to resolve it
    try {
      env = this._resolveEnvironmentSync(pythonPath);
      if (env) {
        this._defaultEnv = env;
        return true;
      }
    } catch (error) {
      //
    }

    return false;
  }

  getCurrentPythonEnvironment(): IPythonEnvironment {
    return this._defaultEnv;
  }

  getRequirementsInstallCommand(envPath: string): string {
    const isConda = isCondaEnv(envPath);
    const condaChannels = getCondaChannels();
    const channels = condaChannels.map(channel => `-c ${channel}`);
    const cmdList = [
      isConda ? `conda install ${channels.join(' ')} -y` : 'pip install'
    ];

    JUPYTER_ENV_REQUIREMENTS.forEach(req => {
      cmdList.push(isConda ? req.condaCommand : req.pipCommand);
    });

    return cmdList.join(' ');
  }

  getRunningServerList(): Promise<string[]> {
    return new Promise<string[]>(resolve => {
      if (this._defaultEnv) {
        this._runPythonModuleCommand(this._defaultEnv.path, 'jupyter', [
          'server',
          'list',
          '--json'
        ])
          .then(async output => {
            const runningServers: string[] = [];
            const lines = output.split('\n');
            for (const line of lines) {
              const jsonStart = line.indexOf('{');
              if (jsonStart !== -1) {
                const jsonStr = line.substring(jsonStart);
                try {
                  const jsonData = JSON.parse(jsonStr);
                  // check if server is not created by desktop app and is still running
                  if (
                    !jsonData.token.startsWith(SERVER_TOKEN_PREFIX) &&
                    (await isPortInUse(jsonData.port))
                  ) {
                    runningServers.push(
                      `${jsonData.url}lab?token=${jsonData.token}`
                    );
                  }
                } catch (error) {
                  console.error(
                    `Failed to parse running JupyterLab server list`,
                    error
                  );
                }
              }
            }

            resolve(runningServers);
          })
          .catch(reason => {
            console.debug(
              `Failed to get running JupyterLab server list`,
              reason
            );
            resolve([]);
          });
      } else {
        resolve([]);
      }
    });
  }

  bundledEnvironmentIsLatest(): boolean {
    const bundledPythonPath = getBundledPythonPath();

    let bundledEnvInstallationLatest = false;

    try {
      const bundledEnv = this.getEnvironmentByPath(bundledPythonPath);
      if (!bundledEnv) {
        return false;
      }

      const jlabVersion = bundledEnv.versions['jupyterlab'];
      const appVersion = app.getVersion();

      if (
        semver.compare(
          versionWithoutSuffix(jlabVersion),
          versionWithoutSuffix(appVersion)
        ) > -1
      ) {
        bundledEnvInstallationLatest = true;
      }
    } catch (error) {
      log.error('Failed to check bundled environment update', error);
    }

    return bundledEnvInstallationLatest;
  }

  private _updateEnvironments() {
    this._environments = [
      ...this._userSetEnvironments,
      ...this._discoveredEnvironments
    ];
    appData.discoveredPythonEnvs = JSON.parse(
      JSON.stringify(this._discoveredEnvironments)
    );
    appData.userSetPythonEnvs = JSON.parse(
      JSON.stringify(this._userSetEnvironments)
    );
  }

  private async _loadPathEnvironments(): Promise<IPythonEnvironment[]> {
    const pythonExecutableName =
      process.platform === 'win32' ? 'python.exe' : 'python';

    const pythonInstances = [
      this._getExecutableInstances(pythonExecutableName, process.env.PATH)
    ];

    if (process.platform === 'darwin') {
      pythonInstances.unshift(
        this._getExecutableInstances('python3', process.env.PATH)
      );
    }

    const flattenedPythonPaths: Promise<string[]> = Promise.all(
      pythonInstances
    ).then<string[]>(multiplePythons => {
      return Array.prototype.concat.apply([], multiplePythons);
    });

    const pythonPaths = await flattenedPythonPaths;

    if (!appData.systemPythonPath && pythonPaths.length > 0) {
      this.setSystemPythonPath(pythonPaths[0]);
    }

    return pythonPaths.map((pythonPath, index) => {
      let newPythonEnvironment: IPythonEnvironment = {
        name: `${basename(pythonPath)}-${index}`,
        path: pythonPath,
        type: IEnvironmentType.Path,
        versions: {},
        defaultKernel: 'python3'
      };

      return newPythonEnvironment;
    });
  }

  private async _loadCondaEnvironments(): Promise<IPythonEnvironment[]> {
    const pathCondas = this._getPathCondas();
    const commonCondas = Promise.resolve(
      Registry.COMMON_CONDA_LOCATIONS.filter(condaEnvPath =>
        this._pathExistsSync(condaEnvPath)
      )
    );

    const allCondas = [pathCondas, commonCondas];

    // add bundled conda env to the list of base conda envs
    const bundledEnvPath = getBundledPythonEnvPath();
    if (fs.existsSync(path.join(bundledEnvPath, 'condabin'))) {
      allCondas.unshift(Promise.resolve([bundledEnvPath]));
    }

    if (process.platform === 'win32') {
      allCondas.push(this._getWindowsRegistryCondas());
    }

    const rootEnvs = await this._loadRootCondaEnvironments(allCondas);
    const subEnvs = rootEnvs.reduce<Promise<IPythonEnvironment[]>[]>(
      (accum, currentRootEnv, index, self) => {
        let rootSubEnvsFolderPath: string;
        if (process.platform === 'win32') {
          rootSubEnvsFolderPath = normalize(join(currentRootEnv.path, '..'));
        } else {
          rootSubEnvsFolderPath = normalize(
            join(currentRootEnv.path, '..', '..')
          );
        }

        accum.push(this._getSubEnvironmentsFromRoot(rootSubEnvsFolderPath));

        return accum;
      },
      []
    );
    const subEnvsResolved = await Promise.all(subEnvs);
    let flattenSubEnvs = Array.prototype.concat.apply(
      [],
      subEnvsResolved
    ) as IPythonEnvironment[];
    return rootEnvs.concat(flattenSubEnvs);
  }

  private _getSubEnvironmentsFromRoot(
    rootPath: string
  ): Promise<IPythonEnvironment[]> {
    let subEnvironmentsFolder = join(rootPath, 'envs');
    let rootName = basename(rootPath);

    return new Promise((resolve, reject) => {
      if (!fs.existsSync(subEnvironmentsFolder)) {
        return resolve([]);
      }
      fs.readdir(subEnvironmentsFolder, (err, files) => {
        if (err) {
          reject(err);
        } else {
          let subEnvsWithPython = files
            .map(subEnvPath => {
              return pythonPathForEnvPath(
                path.join(subEnvironmentsFolder, subEnvPath),
                true
              );
            })
            .filter(pythonPath => this._pathExists(pythonPath));

          resolve(
            subEnvsWithPython.map(subEnvPath => {
              return {
                name: `${rootName}-${basename(
                  normalize(join(subEnvPath, '..', '..'))
                )}`,
                path: subEnvPath,
                type: IEnvironmentType.CondaEnv,
                versions: {}
              } as IPythonEnvironment;
            })
          );
        }
      });
    });
  }

  private async _loadRootCondaEnvironments(
    condaRoots: Promise<string[]>[]
  ): Promise<IPythonEnvironment[]> {
    const allCondas = await Promise.all(condaRoots);
    const flattenedCondaRoots: string[] = Array.prototype.concat.apply(
      [],
      allCondas
    );
    const uniqueCondaRoots = this._getUniqueObjects(flattenedCondaRoots);

    return uniqueCondaRoots.map(condaRootEnvPath => {
      const path = pythonPathForEnvPath(condaRootEnvPath, true);

      const newRootEnvironment: IPythonEnvironment = {
        name: basename(condaRootEnvPath),
        path: path,
        type: IEnvironmentType.CondaRoot,
        versions: {},
        defaultKernel: 'python3'
      };

      if (!appData.condaPath) {
        this.setCondaPath(condaExePathForEnvPath(condaRootEnvPath));
      }

      return newRootEnvironment;
    });
  }

  private async _getPathCondas(): Promise<string[]> {
    const PATH = process.env.PATH;
    const condasInPath = await this._getExecutableInstances('conda', PATH);

    return await Promise.all(
      condasInPath.map(async condaExecutablePath => {
        const condaInfoOutput = runCommand(condaExecutablePath, [
          'info',
          '--json'
        ]);
        const condaInfoJSON = await this._convertExecutableOutputFromJson(
          condaInfoOutput
        );
        return condaInfoJSON.root_prefix as string;
      })
    );
  }

  private _getWindowsRegistryCondas(): Promise<string[]> {
    let valuePredicate = (value: any) => {
      return value.name === '(Default)';
    };

    return this._getAllMatchingValuesFromSubRegistry(
      WinRegistry.HKCU,
      '\\SOFTWARE\\Python\\ContinuumAnalytics',
      'InstallPath',
      valuePredicate
    );
  }

  private async _loadWindowsRegistryEnvironments(): Promise<
    IPythonEnvironment[]
  > {
    const valuePredicate = (value: any) => {
      return value.name === '(Default)';
    };

    const defaultPaths = this._getAllMatchingValuesFromSubRegistry(
      WinRegistry.HKCU,
      '\\SOFTWARE\\Python\\PythonCore',
      'InstallPath',
      valuePredicate
    );

    const installPaths = await defaultPaths;

    return await Promise.all(
      installPaths.map(path => {
        const finalPath = join(path, 'python.exe');

        return {
          name: `WinReg-${basename(normalize(join(path, '..')))}`,
          path: finalPath,
          type: IEnvironmentType.WindowsReg,
          versions: {}
        } as IPythonEnvironment;
      })
    );
  }

  // This function will retrieve all subdirectories of the main registry path, and for each subdirectory(registry) it will search for the key
  // matching the subDirectory parameter and the value the passes
  private async _getAllMatchingValuesFromSubRegistry(
    registryHive: string,
    mainRegPath: string,
    subDirectory: string,
    valueFilter: (value: any) => boolean
  ): Promise<string[]> {
    const mainWinRegistry = new WinRegistry({
      hive: registryHive,
      key: mainRegPath
    });

    const getMainRegistryKeys: Promise<any[]> = new Promise(
      (resolve, reject) => {
        mainWinRegistry.keys((err: any, items: any[]) => {
          if (err) {
            reject(err);
          } else {
            resolve(items);
          }
        });
      }
    );

    const installPathValues: Promise<any[]> = getMainRegistryKeys
      .then(items => {
        return Promise.all(
          items.map(item => {
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
          })
        );
      })
      .then(nestedInstallPathValues => {
        return Array.prototype.concat.apply([], nestedInstallPathValues);
      });

    const pathValues = await installPathValues;
    return pathValues.filter(valueFilter).map(v => v.value);
  }

  private _convertExecutableOutputFromJson(
    output: Promise<string>
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      output
        .then(output => {
          try {
            resolve(JSON.parse(output));
          } catch (e) {
            log.error(output);
            reject(e);
          }
        })
        .catch(reject);
    });
  }

  private _pathExists(path: string): Promise<boolean> {
    return new Promise<boolean>((res, rej) => {
      fs.access(path, fs.constants.F_OK, e => {
        res(e === undefined || e === null);
      });
    });
  }

  private _pathExistsSync(path: string): boolean {
    try {
      fs.accessSync(path, fs.constants.F_OK);
      return true;
    } catch (err) {
      return false;
    }
  }

  private _getExecutableInstances(
    executableName: string,
    path: string
  ): Promise<string[]> {
    return new Promise<string[]>((resolve, reject) => {
      which(
        executableName,
        { all: true, path: path },
        (err: any, result: string | string[]) => {
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
        }
      );
    });
  }

  private _runPythonModuleCommand(
    pythonPath: string,
    moduleName: string,
    commands: string[]
  ): Promise<string> {
    let totalCommands = ['-m', moduleName].concat(commands);
    return new Promise<string>((resolve, reject) => {
      runCommand(pythonPath, totalCommands)
        .then(output => {
          let missingModuleReg = new RegExp(`No module named ${moduleName}$`);
          let commandErrorReg = new RegExp(`Error executing Jupyter command`);

          if (missingModuleReg.test(output)) {
            reject(
              new Error(
                `Python executable could not find ${moduleName} module!`
              )
            );
          } else if (commandErrorReg.test(output)) {
            reject(new Error(`Jupyter command execution failed! ${output}`));
          } else {
            resolve(output);
          }
        })
        .catch(reject);
    });
  }

  private _sortEnvironments(
    environments: IPythonEnvironment[],
    requirements: IJupyterEnvRequirement[]
  ) {
    environments.sort((a, b) => {
      let typeCompareResult = this._compareEnvType(a.type, b.type);
      if (typeCompareResult !== 0) {
        return typeCompareResult;
      } else {
        let versionCompareResult = this._compareVersions(
          a.versions,
          b.versions,
          requirements
        );
        if (versionCompareResult !== 0) {
          return versionCompareResult;
        } else {
          return a.name.localeCompare(b.name);
        }
      }
    });
  }

  private _compareVersions(
    a: IVersionContainer,
    b: IVersionContainer,
    requirements: IJupyterEnvRequirement[]
  ): number {
    let versionPairs = requirements.map(req => {
      return [a[req.name], b[req.name]];
    });

    for (let index = 0; index < requirements.length; index++) {
      let [aVersion, bVersion] = versionPairs[index];
      let result = bVersion.localeCompare(aVersion);

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
      case IEnvironmentType.Path:
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

      let filteredIndices = mappedIndices.filter(
        (mappedIndex, actualIndex, self) => {
          return mappedIndex === actualIndex;
        }
      );

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

  get ready(): Promise<void> {
    return this._registryBuilt;
  }

  dispose(): Promise<void> {
    this._disposing = true;

    return new Promise<void>(resolve => {
      this._registryBuilt.then(() => {
        this._disposing = false;
        resolve();
      });
    });
  }

  private _environments: IPythonEnvironment[] = [];
  private _discoveredEnvironments: IPythonEnvironment[] = [];
  private _userSetEnvironments: IPythonEnvironment[] = [];
  private _defaultEnv: IPythonEnvironment;
  private _registryBuilt: Promise<void>;
  private _disposing: boolean = false;
  private _environmentListUpdated = new Signal<this, void>(this);
}

export namespace Registry {
  /**
   * This type represents module/executable package requirements for the python executables
   * in the registry. Each requirement should correspond to a python module that is also
   * executable via the '-m <module_name>' interface
   */

  export const COMMON_CONDA_LOCATIONS = [
    join(getUserHomeDir(), 'anaconda3'),
    join(getUserHomeDir(), 'anaconda'),
    join(getUserHomeDir(), 'miniconda3'),
    join(getUserHomeDir(), 'miniconda')
  ];
}
