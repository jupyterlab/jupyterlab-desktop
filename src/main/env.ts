// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import * as fs from 'fs';
import * as path from 'path';
import * as semver from 'semver';
import log from 'electron-log';
import { SettingType, userSettings } from './config/settings';
import { appData } from './config/appdata';
import {
  createCommandScriptInEnv,
  envPathForPythonPath,
  getBundledPythonInstallDir,
  isBaseCondaEnv,
  pythonPathForEnvPath,
  runCommand,
  runCommandSync,
  versionWithoutSuffix
} from './utils';
import {
  EnvironmentTypeName,
  IEnvironmentType,
  IPythonEnvironment
} from './tokens';
import { execFileSync, spawn } from 'child_process';

const envInfoPyCode = fs
  .readFileSync(path.join(__dirname, 'env_info.py'))
  .toString();

export interface IJupyterEnvRequirement {
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

  /**
   * pip install command
   */
  pipCommand: string;
  /**
   * conda install command
   */
  condaCommand: string;
}

const MIN_JLAB_VERSION_REQUIRED = '3.0.0';

export const JUPYTER_ENV_REQUIREMENTS = [
  {
    name: 'jupyterlab',
    moduleName: 'jupyterlab',
    commands: ['--version'],
    versionRange: new semver.Range(`>=${MIN_JLAB_VERSION_REQUIRED}`),
    pipCommand: `"jupyterlab>=${MIN_JLAB_VERSION_REQUIRED}"`,
    condaCommand: `"jupyterlab>=${MIN_JLAB_VERSION_REQUIRED}"`
  }
];

export interface IFormInputValidationResponse {
  valid: boolean;
  message?: string;
}

export function getCondaPath() {
  let condaPath = userSettings.getValue(SettingType.condaPath);
  if (condaPath && fs.existsSync(condaPath)) {
    return condaPath;
  }
  condaPath = appData.condaPath;
  if (condaPath && fs.existsSync(condaPath)) {
    return condaPath;
  }
  condaPath = process.env['CONDA_EXE'];
  if (condaPath && fs.existsSync(condaPath)) {
    return condaPath;
  }
}

export function getCondaChannels(): string[] {
  let condaChannels = userSettings.getValue(SettingType.condaChannels);
  if (condaChannels && Array.isArray(condaChannels)) {
    return condaChannels;
  }

  return ['conda-forge'];
}

export function getSystemPythonPath() {
  let pythonPath = userSettings.getValue(SettingType.systemPythonPath);
  if (pythonPath && fs.existsSync(pythonPath)) {
    return pythonPath;
  }
  pythonPath = appData.systemPythonPath;
  if (pythonPath && fs.existsSync(pythonPath)) {
    return pythonPath;
  }
}

export function getPythonEnvsDirectory(): string {
  let envsPath = userSettings.getValue(SettingType.pythonEnvsPath);
  if (envsPath && fs.existsSync(envsPath)) {
    return envsPath;
  }

  const userDataDir = getBundledPythonInstallDir();

  return path.join(userDataDir, 'envs');
}

export function getNextPythonEnvName(): string {
  const envsDir = getPythonEnvsDirectory();
  const prefix = 'env_';
  const maxTries = 10000;

  let index = 1;
  const getNextName = () => {
    return `${prefix}${index++}`;
  };

  let name = getNextName();

  while (fs.existsSync(path.join(envsDir, name))) {
    if (index > maxTries) {
      return 'invalid_env';
    }
    name = getNextName();
  }

  return name;
}

export function condaExePathForEnvPath(envPath: string) {
  if (process.platform === 'win32') {
    return path.join(envPath, 'Scripts', 'conda.exe');
  } else {
    return path.join(envPath, 'bin', 'conda');
  }
}

export function condaEnvPathForCondaExePath(condaPath: string) {
  return path.resolve(path.dirname(condaPath), '..');
}

export interface ICommandRunCallback {
  (msg: string): void;
}

export interface ICommandRunCallbacks {
  stdout?: ICommandRunCallback;
  stderr?: ICommandRunCallback;
}

export async function runCommandInEnvironment(
  envPath: string,
  command: string,
  callbacks?: ICommandRunCallbacks
) {
  const isWin = process.platform === 'win32';
  const baseCondaPath = getCondaPath();
  const condaEnvPath = condaEnvPathForCondaExePath(baseCondaPath);
  const commandScript = createCommandScriptInEnv(
    envPath,
    condaEnvPath,
    command,
    ' && '
  );

  // TODO: implement timeout. in case there is network issues

  return new Promise<boolean>((resolve, reject) => {
    const shell = isWin
      ? spawn('cmd', ['/c', commandScript], {
          env: process.env,
          windowsVerbatimArguments: true
        })
      : spawn('bash', ['-c', commandScript], {
          env: {
            ...process.env,
            BASH_SILENCE_DEPRECATION_WARNING: '1'
          }
        });

    if (shell.stdout) {
      shell.stdout.on('data', chunk => {
        const msg = Buffer.from(chunk).toString();
        console.debug('>', msg);
        if (callbacks?.stdout) {
          callbacks.stdout(msg);
        }
      });
    }
    if (shell.stderr) {
      shell.stderr.on('data', chunk => {
        const msg = Buffer.from(chunk).toString();
        console.error('>', msg);
        if (callbacks?.stdout) {
          callbacks.stdout(msg);
        }
      });
    }

    shell.on('close', code => {
      if (code !== 0) {
        console.error('Shell exit with code:', code);
        resolve(false);
      }
      resolve(true);
    });
  });
}

export function validateNewPythonEnvironmentName(
  name: string
): IFormInputValidationResponse {
  const envsDir = getPythonEnvsDirectory();
  let message = '';
  let valid = false;

  if (name.trim() === '') {
    message = 'Name cannot be empty';
  } else if (!name.match(/^[a-zA-Z0-9-_]+$/)) {
    message = 'Name can only have letters, numbers, - and _';
  } else if (fs.existsSync(path.join(envsDir, name))) {
    message = 'An environment with this name / directory already exists';
  } else {
    valid = true;
  }
  return {
    valid,
    message
  };
}

export function validatePythonEnvironmentInstallDirectory(
  dirPath: string
): IFormInputValidationResponse {
  let message = '';
  let valid = false;

  try {
    if (!fs.existsSync(dirPath)) {
      message = 'Directory does not exist';
    } else {
      const stat = fs.lstatSync(dirPath);
      if (!stat || !stat.isDirectory()) {
        message = 'Not a directory';
      } else {
        valid = true;
      }
    }
  } catch (error) {
    message = 'Invalid input. Enter an existing directory path.';
  }

  return {
    valid,
    message
  };
}

export async function validatePythonPath(
  pythonPath: string
): Promise<IFormInputValidationResponse> {
  return new Promise<IFormInputValidationResponse>((resolve, reject) => {
    const returnInvalid = (message: string) => {
      resolve({
        valid: false,
        message
      });
    };
    try {
      if (!fs.existsSync(pythonPath)) {
        returnInvalid('Python executable does not exist');
      } else {
        const stat = fs.lstatSync(pythonPath);
        if (!stat || !(stat.isFile() || stat.isSymbolicLink())) {
          returnInvalid('Not a valid file');
        } else {
          const output = execFileSync(pythonPath, ['--version']);
          if (output.toString().trim().startsWith('Python ')) {
            resolve({
              valid: true
            });
          }

          returnInvalid('Not a valid Python executable');
        }
      }
    } catch (error) {
      returnInvalid('Invalid input. Enter a valid Python executable path.');
    }
  });
}

/**
 * Checks if condaPath is a valid conda executable in a base conda environment
 * @param condaPath path to conda executable
 * @returns IFormInputValidationResponse with validity and error message if any
 */
export async function validateCondaPath(
  condaPath: string
): Promise<IFormInputValidationResponse> {
  return new Promise<IFormInputValidationResponse>((resolve, reject) => {
    const returnInvalid = (message: string) => {
      resolve({
        valid: false,
        message
      });
    };
    try {
      if (!fs.existsSync(condaPath)) {
        returnInvalid('conda executable does not exist');
      } else {
        const stat = fs.lstatSync(condaPath);
        if (!stat || !stat.isFile()) {
          returnInvalid('Not a valid file');
        } else {
          const condaEnvPath = condaEnvPathForCondaExePath(condaPath);
          if (!isBaseCondaEnv(condaEnvPath)) {
            returnInvalid('Executable is not in a base conda environment');
          } else {
            try {
              let output = '';
              runCommandInEnvironment(
                condaEnvPath,
                `"${condaPath}" info --json`,
                {
                  stdout: msg => {
                    output += msg;
                  }
                }
              )
                .then(result => {
                  if (result) {
                    try {
                      const jsonOutput = JSON.parse(output);
                      if ('conda_version' in jsonOutput) {
                        resolve({
                          valid: true
                        });
                      }
                    } catch (error) {
                      //
                    }
                  }

                  returnInvalid('Not a valid conda executable');
                })
                .catch(reason => {
                  returnInvalid(`Not a valid conda executable. ${reason}`);
                });
            } catch (error) {
              returnInvalid(`Not a valid conda executable. ${error.message}`);
            }
          }
        }
      }
    } catch (error) {
      returnInvalid('Invalid input. Enter a valid conda executable path.');
    }
  });
}

export function validateCondaChannels(
  condaChannels: string
): IFormInputValidationResponse {
  let message = '';
  let valid = false;

  if (condaChannels.trim() === '') {
    valid = true;
  } else if (!condaChannels.match(/^[a-zA-Z0-9-_ ]+$/)) {
    message = 'Channel name can only have letters, numbers, - and _';
  } else {
    valid = true;
  }
  return {
    valid,
    message
  };
}

export async function validateSystemPythonPath(
  pythonPath: string
): Promise<IFormInputValidationResponse> {
  return new Promise<IFormInputValidationResponse>((resolve, reject) => {
    const returnInvalid = (message: string) => {
      resolve({
        valid: false,
        message
      });
    };
    try {
      if (!fs.existsSync(pythonPath)) {
        returnInvalid('Python executable does not exist');
      } else {
        const stat = fs.lstatSync(pythonPath);
        if (!stat || !(stat.isFile() || stat.isSymbolicLink())) {
          returnInvalid('Not a valid file');
        } else {
          const output = execFileSync(pythonPath, ['-c', 'print(":valid:")']);
          if (output.toString().trim() === ':valid:') {
            resolve({
              valid: true
            });
          }

          returnInvalid('Not a valid Python executable');
        }
      }
    } catch (error) {
      returnInvalid('Invalid input. Enter a valid Python executable path.');
    }
  });
}

export function getAdditionalPathIncludesForPythonPath(
  pythonPath: string
): string {
  const platform = process.platform;

  let envPath = envPathForPythonPath(pythonPath);

  let pathEnv = '';
  if (platform === 'win32') {
    pathEnv = `${envPath};${envPath}\\Library\\mingw-w64\\bin;${envPath}\\Library\\usr\\bin;${envPath}\\Library\\bin;${envPath}\\Scripts;${envPath}\\bin;${process.env['PATH']}`;
  } else {
    pathEnv = `${envPath}:${envPath}/bin:${process.env['PATH']}`;
  }

  return pathEnv;
}

export async function getEnvironmentInfoFromPythonPath(
  pythonPath: string
): Promise<IPythonEnvironment> {
  try {
    const envInfoOut = await runCommand(pythonPath, ['-c', envInfoPyCode], {
      // TODO: is this still necessary?
      env: { PATH: getAdditionalPathIncludesForPythonPath(pythonPath) }
    });
    const envInfo = JSON.parse(envInfoOut.trim());
    const envType =
      envInfo.type === 'conda-root'
        ? IEnvironmentType.CondaRoot
        : envInfo.type === 'conda-env'
        ? IEnvironmentType.CondaEnv
        : IEnvironmentType.VirtualEnv;
    const envName = `${EnvironmentTypeName[envType]}: ${envInfo.name}`;

    return {
      path: pythonPath,
      type: envType,
      name: envName,
      versions: envInfo.versions,
      defaultKernel: envInfo.defaultKernel
    };
  } catch (error) {
    log.error(`Failed to get environment info at path '${pythonPath}'.`, error);
  }
}

export function getEnvironmentInfoFromPythonPathSync(
  pythonPath: string
): IPythonEnvironment {
  const envInfoOut = runCommandSync(pythonPath, ['-c', envInfoPyCode], {
    env: { PATH: getAdditionalPathIncludesForPythonPath(pythonPath) }
  });
  const envInfo = JSON.parse(envInfoOut.trim());
  const envType =
    envInfo.type === 'conda-root'
      ? IEnvironmentType.CondaRoot
      : envInfo.type === 'conda-env'
      ? IEnvironmentType.CondaEnv
      : IEnvironmentType.VirtualEnv;
  const envName = `${EnvironmentTypeName[envType]}: ${envInfo.name}`;

  return {
    path: pythonPath,
    type: envType,
    name: envName,
    versions: envInfo.versions,
    defaultKernel: envInfo.defaultKernel
  };
}

export function environmentSatisfiesRequirements(
  environment: IPythonEnvironment,
  requirements?: IJupyterEnvRequirement[]
): boolean {
  if (!requirements) {
    requirements = JUPYTER_ENV_REQUIREMENTS;
  }

  return requirements.every((req, index, reqSelf) => {
    try {
      const version = environment.versions[req.name];
      return semver.satisfies(versionWithoutSuffix(version), req.versionRange);
    } catch (e) {
      return false;
    }
  });
}

export async function updateDiscoveredPythonPaths() {
  await updateDiscoveredPathsFromServerPythonPath();
  await updateDiscoveredPathsFromCondaPath();
  await updateDiscoveredPathsFromSystemPythonPath();
}

export async function updateDiscoveredPathsFromServerPythonPath() {
  const pythonPath = appData.pythonPath;
  if (!pythonPath) {
    return;
  }

  if (!appData.condaPath) {
    const envPath = envPathForPythonPath(pythonPath);
    const condaPath = condaExePathForEnvPath(envPath);
    if ((await validateCondaPath(condaPath)).valid) {
      appData.condaPath = condaPath;
    }
  }

  if (!appData.systemPythonPath) {
    appData.systemPythonPath = pythonPath;
  }
}

export async function updateDiscoveredPathsFromCondaPath() {
  const condaPath = appData.condaPath;
  if (!condaPath) {
    return;
  }

  const envPath = condaEnvPathForCondaExePath(condaPath);
  const pythonPath = pythonPathForEnvPath(envPath);

  if (!appData.pythonPath) {
    const env = await getEnvironmentInfoFromPythonPath(pythonPath);
    if (env && environmentSatisfiesRequirements(env)) {
      appData.pythonPath = env.path;
    }
  }

  if (!appData.systemPythonPath) {
    appData.systemPythonPath = pythonPath;
  }
}

export async function updateDiscoveredPathsFromSystemPythonPath() {
  const systemPythonPath = appData.systemPythonPath;
  if (!systemPythonPath) {
    return;
  }

  if (!appData.pythonPath) {
    const env = await getEnvironmentInfoFromPythonPath(systemPythonPath);
    if (env && environmentSatisfiesRequirements(env)) {
      appData.pythonPath = env.path;
    }
  }

  if (!appData.condaPath) {
    const envPath = envPathForPythonPath(systemPythonPath);
    const condaPath = condaExePathForEnvPath(envPath);
    if ((await validateCondaPath(condaPath)).valid) {
      appData.condaPath = condaPath;
    }
  }
}
