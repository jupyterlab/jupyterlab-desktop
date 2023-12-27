// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import * as path from 'path';
import * as fs from 'fs';
import * as semver from 'semver';
import * as tar from 'tar';
import * as os from 'os';
import log from 'electron-log';
import { AddressInfo, createServer, Socket } from 'net';
import { app, nativeTheme } from 'electron';
import { IPythonEnvironment } from './tokens';
import { exec } from 'child_process';

export const DarkThemeBGColor = '#212121';
export const LightThemeBGColor = '#ffffff';

export interface ISaveOptions {
  id: string;
  raw: string;
}

export function isDevMode(): boolean {
  return require.main.filename.indexOf('app.asar') === -1;
}

export function getAppDir(): string {
  let appDir = app.getAppPath();
  if (!isDevMode()) {
    appDir = path.dirname(appDir);
  }

  return appDir;
}

export function getUserHomeDir(): string {
  return app.getPath('home');
}

export function getUserDataDir(): string {
  const userDataDir = app.getPath('userData');

  if (!fs.existsSync(userDataDir)) {
    try {
      fs.mkdirSync(userDataDir, { recursive: true });
    } catch (error) {
      log.error(error);
    }
  }

  return userDataDir;
}

export function getSchemasDir(): string {
  return path.normalize(path.join(getAppDir(), './build/schemas'));
}

export function getEnvironmentPath(environment: IPythonEnvironment): string {
  return envPathForPythonPath(environment.path);
}

export function getBundledPythonInstallDir(): string {
  // this directory path cannot have any spaces since
  // conda environments cannot be installed to such paths
  const installDir =
    process.platform === 'darwin'
      ? path.normalize(path.join(app.getPath('home'), 'Library', app.getName()))
      : app.getPath('userData');

  if (!fs.existsSync(installDir)) {
    try {
      fs.mkdirSync(installDir, { recursive: true });
    } catch (error) {
      log.error(error);
    }
  }

  return installDir;
}

// user data dir for<= 3.5.1-1
export function getOldUserConfigPath() {
  return path.join(getBundledPythonInstallDir(), 'jupyterlab-desktop-data');
}

export function getBundledPythonEnvPath(): string {
  const userDataDir = getBundledPythonInstallDir();

  return path.join(userDataDir, 'jlab_server');
}

export function getBundledPythonPath(): string {
  return pythonPathForEnvPath(getBundledPythonEnvPath(), true);
}

export function getPythonEnvsDirectory(): string {
  // TODO: user settings
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

export function getCondaPath() {
  // user settings
  return process.env['CONDA_EXE'];
}

export function isDarkTheme(themeType: string) {
  if (themeType === 'light') {
    return false;
  } else if (themeType === 'dark') {
    return true;
  } else {
    return nativeTheme.shouldUseDarkColors;
  }
}

export function clearSession(session: Electron.Session): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      Promise.all([
        session.clearCache(),
        session.clearAuthCache(),
        session.clearStorageData(),
        session.flushStorageData()
      ]).then(() => {
        resolve();
      });
    } catch (error) {
      reject();
    }
  });
}

export function isPortInUse(port: number): Promise<boolean> {
  return new Promise<boolean>((resolve, reject) => {
    let inUse = false;
    const socket = new Socket();
    socket.setTimeout(200);
    socket.once('error', err => {
      inUse = false;
      socket.destroy();
    });
    socket.on('timeout', () => {
      inUse = false;
      socket.destroy();
    });
    socket.on('connect', () => {
      inUse = true;
      socket.destroy();
    });
    socket.on('close', exception => {
      resolve(inUse);
    });
    socket.connect({ port: port, host: '127.0.0.1' });
  });
}

export function getFreePort(): Promise<number> {
  return new Promise<number>(resolve => {
    const getPort = () => {
      const server = createServer(socket => {
        socket.write('Echo server\r\n');
        socket.pipe(socket);
      });

      server.on('error', function (e) {
        getPort();
      });
      server.on('listening', function (e: any) {
        const port = (server.address() as AddressInfo).port;
        server.close();

        resolve(port);
      });

      server.listen(0, '127.0.0.1');
    };

    getPort();
  });
}

export async function waitForDuration(duration: number): Promise<boolean> {
  return new Promise(resolve => {
    setTimeout(() => {
      resolve(false);
    }, duration);
  });
}

/**
 * Wait for a function to finish for max. timeout milliseconds (copied from galata)
 *
 * @param fn Function
 * @param timeout Timeout
 */
export async function waitForFunction(
  fn: () => boolean,
  timeout?: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    let checkTimer: NodeJS.Timeout = null;
    let timeoutTimer: NodeJS.Timeout = null;
    const check = async () => {
      checkTimer = null;
      if (await Promise.resolve(fn())) {
        if (timeoutTimer) {
          clearTimeout(timeoutTimer);
        }
        resolve();
      } else {
        checkTimer = setTimeout(check, 200);
      }
    };

    void check();

    if (timeout) {
      timeoutTimer = setTimeout(() => {
        timeoutTimer = null;
        if (checkTimer) {
          clearTimeout(checkTimer);
        }
        reject(new Error('Timed out waiting for condition to be fulfilled.'));
      }, timeout);
    }
  });
}

// remove alpha / beta suffixes
export function versionWithoutSuffix(version: string) {
  return `${semver.major(version, { loose: true })}.${semver.minor(version, {
    loose: true
  })}.${semver.patch(version, { loose: true })}`;
}

export enum EnvironmentInstallStatus {
  Started = 'STARTED',
  Running = 'RUNNING',
  Failure = 'FAILURE',
  Cancelled = 'CANCELLED',
  Success = 'SUCCESS',
  RemovingExistingInstallation = 'REMOVING_EXISTING_INSTALLATION'
}

export interface IBundledEnvironmentInstallListener {
  onInstallStatus: (status: EnvironmentInstallStatus, message?: string) => void;
  forceOverwrite?: boolean;
  confirmOverwrite?: () => Promise<boolean>;
}

export async function installBundledEnvironment(
  installPath: string,
  listener?: IBundledEnvironmentInstallListener
): Promise<boolean> {
  // eslint-disable-next-line no-async-promise-executor
  return new Promise<boolean>(async (resolve, reject) => {
    const platform = process.platform;
    const isWin = platform === 'win32';
    const appDir = getAppDir();
    const installerPath = path.join(
      appDir,
      'env_installer',
      'jlab_server.tar.gz'
    );
    installPath = installPath || getBundledPythonEnvPath();

    if (fs.existsSync(installPath)) {
      if (listener) {
        const confirmed =
          listener.forceOverwrite ||
          (listener.confirmOverwrite !== undefined &&
            (await listener.confirmOverwrite()));
        if (confirmed) {
          listener?.onInstallStatus(
            EnvironmentInstallStatus.RemovingExistingInstallation
          );
          fs.rmSync(installPath, { recursive: true });
        } else {
          listener?.onInstallStatus(EnvironmentInstallStatus.Cancelled);
          reject();
          return;
        }
      } else {
        reject();
        return;
      }
    }

    listener?.onInstallStatus(EnvironmentInstallStatus.Started);

    try {
      fs.mkdirSync(installPath, { recursive: true });
      await tar.x({ C: installPath, file: installerPath });
    } catch (error) {
      listener?.onInstallStatus(
        EnvironmentInstallStatus.Failure,
        'Failed to install the environment'
      );
      log.error(new Error(`Installer Exit: ${error}`));
      reject();
      return;
    }

    markEnvironmentAsJupyterInstalled(installPath, {
      type: 'conda',
      source: 'bundled-installer',
      appVersion: app.getVersion()
    });

    let unpackCommand = isWin
      ? `${installPath}\\Scripts\\activate.bat && conda-unpack`
      : `source "${installPath}/bin/activate" && conda-unpack`;

    if (platform === 'darwin') {
      unpackCommand = `${createUnsignScriptInEnv(
        installPath
      )}\n${unpackCommand}`;
    }

    const installerProc = exec(unpackCommand, {
      shell: isWin ? 'cmd.exe' : '/bin/bash'
    });

    installerProc.on('exit', (exitCode: number) => {
      if (exitCode === 0) {
        listener?.onInstallStatus(EnvironmentInstallStatus.Success);
        resolve(true);
      } else {
        const message = `Installer Exit: ${exitCode}`;
        listener?.onInstallStatus(EnvironmentInstallStatus.Failure, message);
        log.error(new Error(message));
        reject();
        return;
      }
    });

    installerProc.on('error', (err: Error) => {
      listener?.onInstallStatus(EnvironmentInstallStatus.Failure, err.message);
      log.error(err);
      reject();
      return;
    });
  });
}

export function markEnvironmentAsJupyterInstalled(
  envPath: string,
  extraData?: { [key: string]: any }
) {
  const envInstallInfoPath = jupyterEnvInstallInfoPathForEnvPath(envPath);

  const data = {
    installer: 'jupyterlab-desktop',
    ...(extraData || {})
  };

  try {
    const dirPath = path.dirname(envInstallInfoPath);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }

    fs.writeFileSync(envInstallInfoPath, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Failed to create file', envInstallInfoPath, error);
  }
}

export function createTempFile(
  fileName = 'temp',
  data = '',
  encoding: BufferEncoding = 'utf8'
) {
  const tempDirPath = path.join(os.tmpdir(), 'jlab_desktop');
  const tmpDir = fs.mkdtempSync(tempDirPath);
  const tmpFilePath = path.join(tmpDir, fileName);

  fs.writeFileSync(tmpFilePath, data, { encoding });

  return tmpFilePath;
}

export function pythonPathForEnvPath(envPath: string, isConda?: boolean) {
  if (process.platform === 'win32') {
    if (isConda === undefined) {
      isConda = isCondaEnv(envPath);
    }
    return isConda
      ? path.join(envPath, 'python.exe')
      : path.join(envPath, 'Scripts', 'python.exe');
  } else {
    return path.join(envPath, 'bin', 'python');
  }
}

export function envPathForPythonPath(pythonPath: string): string {
  const isWin = process.platform === 'win32';
  let envPath = path.dirname(pythonPath);
  if (!isWin || path.basename(envPath) === 'Scripts') {
    envPath = path.normalize(path.join(envPath, '../'));
  }

  return envPath;
}

export function activatePathForEnvPath(envPath: string) {
  return process.platform === 'win32'
    ? path.join(envPath, 'Scripts', 'activate.bat')
    : path.join(envPath, 'bin', 'activate');
}

export function condaSourcePathForEnvPath(envPath: string) {
  if (process.platform !== 'win32') {
    return path.join(envPath, 'etc', 'profile.d', 'conda.sh');
  }
}

export function jupyterEnvInstallInfoPathForEnvPath(envPath: string) {
  return path.join(envPath, '.jupyter', 'env.json');
}

export function isEnvInstalledByDesktopApp(envPath: string) {
  return fs.existsSync(jupyterEnvInstallInfoPathForEnvPath(envPath));
}

export function isCondaEnv(envPath: string): boolean {
  return fs.existsSync(path.join(envPath, 'conda-meta'));
}

export function isBaseCondaEnv(envPath: string): boolean {
  const isWin = process.platform === 'win32';
  const condaBinPath = path.join(
    envPath,
    'condabin',
    isWin ? 'conda.bat' : 'conda'
  );
  return fs.existsSync(condaBinPath) && fs.lstatSync(condaBinPath).isFile();
}

export function createCommandScriptInEnv(
  envPath: string,
  baseCondaPath: string,
  command?: string,
  joinStr?: string
): string {
  try {
    const stat = fs.lstatSync(envPath);
    if (!stat.isDirectory()) {
      return '';
    }
  } catch (error) {
    //
  }

  if (joinStr === undefined) {
    joinStr = '\n';
  }
  const isWin = process.platform === 'win32';

  let activatePath = activatePathForEnvPath(envPath);
  let condaSourcePath;

  let hasActivate = fs.existsSync(activatePath);
  const isConda = isCondaEnv(envPath);
  // conda commands don't work properly when called from the sub environment.
  // instead call using conda from the base environment with -p parameter
  const isCondaCommand = isConda && command?.startsWith('conda ');
  if (isCondaCommand && !isBaseCondaEnv(envPath)) {
    command = `${command} -p ${envPath}`;
  }

  // conda activate is only available in base conda environments or
  // conda-packed environments
  let isBaseCondaActivate = false;
  if (!hasActivate && isConda) {
    if (fs.existsSync(baseCondaPath)) {
      activatePath = activatePathForEnvPath(baseCondaPath);
      condaSourcePath = condaSourcePathForEnvPath(baseCondaPath);
      hasActivate = fs.existsSync(activatePath);
      isBaseCondaActivate = true;
    }
  }

  if (!hasActivate) {
    return '';
  }

  const scriptLines: string[] = [];

  if (isWin) {
    scriptLines.push(`CALL ${activatePath}`);
    if (isConda && isBaseCondaActivate) {
      scriptLines.push(`CALL conda activate ${envPath}`);
    }
    if (command) {
      scriptLines.push(`CALL ${command}`);
    }
  } else {
    scriptLines.push(`source "${activatePath}"`);
    if (isConda && isBaseCondaActivate) {
      scriptLines.push(`source "${condaSourcePath}"`);
      if (!isCondaCommand) {
        scriptLines.push(`conda activate "${envPath}"`);
      }
    }
    if (command) {
      scriptLines.push(command);
    }
  }

  return scriptLines.join(joinStr);
}

/*
  signed tarball contents need to be unsigned except for python binary,
  otherwise server runs into issues at runtime. python binary comes originally
  ad-hoc signed. after installation it needs be converted from hardened runtime,
  back to ad-hoc signed.
*/
export function createUnsignScriptInEnv(envPath: string): string {
  const appDir = getAppDir();
  const signListFile = path.join(
    appDir,
    'env_installer',
    `sign-osx-${process.arch === 'arm64' ? 'arm64' : '64'}.txt`
  );
  const fileContents = fs.readFileSync(signListFile, 'utf-8');
  const signList: string[] = [];

  fileContents.split(/\r?\n/).forEach(line => {
    if (line) {
      signList.push(`"${line}"`);
    }
  });

  // sign all binaries with ad-hoc signature
  return `cd ${envPath} && codesign -s - -o 0x2 -f ${signList.join(
    ' '
  )} && cd -`;
}

export function getLogFilePath(processType: 'main' | 'renderer' = 'main') {
  switch (process.platform) {
    case 'win32':
      return path.join(getUserDataDir(), `\\logs\\${processType}.log`);
    case 'darwin':
      return path.join(
        getUserHomeDir(),
        `/Library/Logs/jupyterlab-desktop/${processType}.log`
      );
    default:
      return path.join(
        getUserHomeDir(),
        `/.config/jupyterlab-desktop/logs/${processType}.log`
      );
  }
}
