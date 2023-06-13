// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import * as path from 'path';
import * as fs from 'fs';
import * as semver from 'semver';
import * as tar from 'tar';
import log from 'electron-log';
import { AddressInfo, createServer, Socket } from 'net';
import { app, nativeTheme } from 'electron';
import { IPythonEnvironment } from './tokens';
import { exec, spawn } from 'child_process';

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
  const isWin = process.platform === 'win32';
  const pythonPath = environment.path;
  let envPath = path.dirname(pythonPath);
  if (!isWin) {
    envPath = path.normalize(path.join(envPath, '../'));
  }

  return envPath;
}

export function getBundledPythonInstallDir(): string {
  // this directory path cannot have any spaces since
  // conda constructor cannot install to such paths
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
  let envPath = path.join(userDataDir, 'jlab_server');

  return envPath;
}

export function getBundledPythonPath(): string {
  const platform = process.platform;
  let envPath = getBundledPythonEnvPath();
  if (platform !== 'win32') {
    envPath = path.join(envPath, 'bin');
  }

  const bundledPythonPath = path.join(
    envPath,
    `python${platform === 'win32' ? '.exe' : ''}`
  );

  return bundledPythonPath;
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
  Failure = 'FAILURE',
  Cancelled = 'CANCELLED',
  Success = 'SUCCESS',
  RemovingExistingInstallation = 'REMOVING_EXISTING_INSTALLATION'
}

export interface IBundledEnvironmentInstallListener {
  onInstallStatus: (status: EnvironmentInstallStatus, message?: string) => void;
  confirmOverwrite: () => Promise<boolean>;
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
    const installerPath = `${appDir}/env_installer/jlab_server.tar.gz`;
    installPath = installPath || getBundledPythonEnvPath();

    if (fs.existsSync(installPath)) {
      if (listener) {
        const confirmed = await listener.confirmOverwrite();
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

    const unpackCommand = isWin
      ? `${installPath}\\Scripts\\activate.bat && conda-unpack`
      : `source "${installPath}/bin/activate" && conda-unpack`;

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

export async function activateEnvironment(envPath: string): Promise<boolean> {
  return new Promise<boolean>((resolve, reject) => {
    const platform = process.platform;
    const isWin = platform === 'win32';
    envPath = envPath || getBundledPythonEnvPath();

    const activateCommand = isWin
      ? `${envPath}\\Scripts\\activate.bat`
      : `source "${envPath}/bin/activate"`;

    const shell = isWin
      ? spawn('cmd.exe', ['-cmd', '/K', `"${activateCommand}"`], {
          stdio: 'inherit'
        })
      : spawn('sh', ['-c', `${activateCommand};exec sh`], {
          stdio: 'inherit'
        });

    shell.on('close', code => {
      if (code !== 0) {
        console.log('[shell] exit with code:', code);
      }
      resolve(true);
    });
  });
}
