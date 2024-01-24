import { ChildProcess, execFile } from 'child_process';
import { IRegistry, SERVER_TOKEN_PREFIX } from './registry';
import { dialog, ipcMain } from 'electron';
import { ArrayExt } from '@lumino/algorithm';
import log from 'electron-log';
import * as fs from 'fs';
import * as path from 'path';
import { request as httpRequest } from 'http';
import { request as httpsRequest } from 'https';
import { IDisposable, IEnvironmentType, IPythonEnvironment } from './tokens';
import {
  activatePathForEnvPath,
  createTempFile,
  getEnvironmentPath,
  getFreePort,
  getUserDataDir,
  waitForDuration
} from './utils';
import {
  KeyValueMap,
  serverLaunchArgsDefault,
  serverLaunchArgsFixed,
  SettingType,
  userSettings,
  WorkspaceSettings
} from './config/settings';
import { randomBytes } from 'crypto';
import { condaEnvPathForCondaExePath, getCondaPath } from './env';
import { EventTypeMain } from './eventtypes';
import { ManagePythonEnvironmentDialog } from './pythonenvdialog/pythonenvdialog';

const SERVER_LAUNCH_TIMEOUT = 30000; // milliseconds
const SERVER_RESTART_LIMIT = 3; // max server restarts

function createLaunchScript(
  serverInfo: JupyterServer.IInfo,
  baseCondaEnvPath: string,
  port: number,
  token: string
): string {
  const isWin = process.platform === 'win32';
  const envPath = getEnvironmentPath(serverInfo.environment);

  // note: traitlets<5.0 require fully specified arguments to
  // be followed by equals sign without a space; this can be
  // removed once jupyter_server requires traitlets>5.0
  const launchArgs = ['python', '-m', 'jupyterlab'];

  const strPort = port.toString();

  for (const arg of serverLaunchArgsFixed) {
    launchArgs.push(arg.replace('{port}', strPort).replace('{token}', token));
  }

  if (!serverInfo.overrideDefaultServerArgs) {
    for (const arg of serverLaunchArgsDefault) {
      launchArgs.push(arg);
    }
  }

  let launchCmd = launchArgs.join(' ');

  if (serverInfo.serverArgs) {
    launchCmd += ` ${serverInfo.serverArgs}`;
  }

  let script: string;
  const isConda =
    serverInfo.environment.type === IEnvironmentType.CondaRoot ||
    serverInfo.environment.type === IEnvironmentType.CondaEnv;

  // conda activate is only available in base conda environments or
  // conda-packed environments

  let condaActivatePath = '';
  let condaShellScriptPath = '';
  let isBaseCondaActivate = true;

  // use activate from the environment instead of base when possible
  if (isConda) {
    if (isWin) {
      const envActivatePath = path.join(envPath, 'condabin', 'activate.bat');
      if (fs.existsSync(envActivatePath)) {
        condaActivatePath = envActivatePath;
        isBaseCondaActivate = false;
      } else {
        condaActivatePath = path.join(
          baseCondaEnvPath,
          'condabin',
          'activate.bat'
        );
      }
    } else {
      const envActivatePath = path.join(envPath, 'bin', 'activate');
      if (fs.existsSync(envActivatePath)) {
        condaActivatePath = envActivatePath;
        isBaseCondaActivate = false;
      } else {
        condaActivatePath = path.join(baseCondaEnvPath, 'bin', 'activate');
        condaShellScriptPath = path.join(
          baseCondaEnvPath,
          'etc',
          'profile.d',
          'conda.sh'
        );
      }
    }
  }

  const envActivatePath = activatePathForEnvPath(envPath);

  if (isWin) {
    if (isConda) {
      const parentDir = path.dirname(condaActivatePath);
      const activateName = path.basename(condaActivatePath);
      // server launch sometimes fails if activate.bat is called directly.
      // so, cd into activate directory then back to working directory
      script = `
        CALL cd /d "${parentDir}"
        CALL ${activateName}
        ${isBaseCondaActivate ? `CALL conda activate ${envPath}` : ''}
        CALL cd /d "${serverInfo.workingDirectory}"
        CALL ${launchCmd}`;
    } else {
      script = `
        CALL ${envActivatePath}
        CALL ${launchCmd}`;
    }
  } else {
    if (isConda) {
      script = `
        source "${condaActivatePath}"
        ${
          isBaseCondaActivate
            ? `source ${condaShellScriptPath} && conda activate "${envPath}"`
            : ''
        }
        ${launchCmd}`;
    } else {
      script = `
        source "${envActivatePath}"
        ${launchCmd}`;
    }
  }

  const ext = isWin ? 'bat' : 'sh';
  const scriptPath = createTempFile(`launch.${ext}`, script);

  console.debug(`Server launch script:\n${script}`);

  if (!isWin) {
    fs.chmodSync(scriptPath, 0o755);
  }

  return scriptPath;
}

async function checkIfUrlExists(url: URL): Promise<boolean> {
  return new Promise<boolean>(resolve => {
    const requestFn = url.protocol === 'https:' ? httpsRequest : httpRequest;
    const req = requestFn(url, function (r) {
      resolve(r.statusCode >= 200 && r.statusCode < 400);
    });
    req.on('error', function (err) {
      resolve(false);
    });
    req.end();
  });
}

export async function waitUntilServerIsUp(url: URL): Promise<boolean> {
  return new Promise<boolean>(resolve => {
    async function checkUrl() {
      const exists = await checkIfUrlExists(url);
      if (exists) {
        return resolve(true);
      } else {
        setTimeout(async () => {
          await checkUrl();
        }, 500);
      }
    }

    checkUrl();
  });
}

export class JupyterServer {
  constructor(options: JupyterServer.IOptions) {
    this._options = options;
    this._info.environment = options.environment;
    const workingDir =
      this._options.workingDirectory || userSettings.resolvedWorkingDirectory;
    this._info.workingDirectory = workingDir;

    const wsSettings = new WorkspaceSettings(workingDir);
    this._info.serverArgs = wsSettings.getValue(SettingType.serverArgs);
    this._info.overrideDefaultServerArgs = wsSettings.getValue(
      SettingType.overrideDefaultServerArgs
    );
    this._info.serverEnvVars = wsSettings.getValue(SettingType.serverEnvVars);
  }

  get info(): JupyterServer.IInfo {
    return this._info;
  }

  /**
   * Start a local Jupyter server. This method can be
   * called multiple times without initiating multiple starts.
   *
   * @return a promise that is resolved when the server has started.
   */
  public start(): Promise<JupyterServer.IInfo> {
    if (this._startServer) {
      return this._startServer;
    }
    let started = false;

    this._startServer = new Promise<JupyterServer.IInfo>(
      // eslint-disable-next-line no-async-promise-executor
      async (resolve, reject) => {
        const isWin = process.platform === 'win32';
        const pythonPath = this._info.environment.path;
        if (!fs.existsSync(pythonPath)) {
          reject(`Error: Environment not found at: ${pythonPath}`);
          return;
        }
        this._info.port = this._options.port || (await getFreePort());
        this._info.token = this._options.token || this._generateToken();
        this._info.url = new URL(
          `http://localhost:${this._info.port}/lab?token=${this._info.token}`
        );

        let baseCondaEnvPath: string = '';

        if (this._info.environment.type === IEnvironmentType.CondaRoot) {
          baseCondaEnvPath = getEnvironmentPath(this._info.environment);
        } else if (this._info.environment.type === IEnvironmentType.CondaEnv) {
          const condaPath = getCondaPath();

          if (!condaPath) {
            const choice = dialog.showMessageBoxSync({
              message: 'conda not found',
              detail:
                'conda executable not found. Please set conda path in settings to use the conda sub environment.',
              type: 'error',
              buttons: ['OK'],
              defaultId: 0
            });
            if (choice == 0) {
              ipcMain.emit(
                EventTypeMain.ShowManagePythonEnvironmentsDialog,
                undefined /*event*/,
                ManagePythonEnvironmentDialog.Tab.Settings
              );
              reject(`Error: conda executable not found.`);
              return;
            }
          }

          baseCondaEnvPath = condaEnvPathForCondaExePath(condaPath);
        }

        const launchScriptPath = createLaunchScript(
          this._info,
          baseCondaEnvPath,
          this._info.port,
          this._info.token
        );

        const jlabWorkspacesDir = path.join(
          this._info.workingDirectory,
          '.jupyter',
          'desktop-workspaces'
        );

        const serverEnvVars = { ...this._info.serverEnvVars };

        // allow modifying PATH without replacing by using {PATH} variable
        if (process.env.PATH && 'PATH' in serverEnvVars) {
          serverEnvVars.PATH = serverEnvVars.PATH.replace(
            '{PATH}',
            process.env.PATH
          );
        }

        const execOptions = {
          cwd: this._info.workingDirectory,
          shell: isWin ? 'cmd.exe' : '/bin/bash',
          env: {
            ...process.env,
            JUPYTER_CONFIG_DIR:
              process.env.JLAB_DESKTOP_CONFIG_DIR || getUserDataDir(),
            JUPYTERLAB_WORKSPACES_DIR:
              process.env.JLAB_DESKTOP_WORKSPACES_DIR || jlabWorkspacesDir,
            ...serverEnvVars
          }
        };

        console.debug(
          `Server launch parameters:\n  [script]: ${launchScriptPath}\n  [options]: ${JSON.stringify(
            execOptions
          )}`
        );

        this._nbServer = execFile(launchScriptPath, execOptions);

        Promise.race([
          waitUntilServerIsUp(this._info.url),
          waitForDuration(SERVER_LAUNCH_TIMEOUT)
        ]).then((up: boolean) => {
          if (up) {
            started = true;
            fs.unlinkSync(launchScriptPath);
            resolve(this._info);
          } else {
            this._serverStartFailed();
            reject(new Error('Failed to launch Jupyter Server'));
          }
        });

        this._nbServer.on('exit', () => {
          if (started) {
            /* On Windows, JupyterLab server sometimes crashes randomly during websocket
              connection. As a result of this, users experience kernel connections failures.
              This crash only happens when server is launched from electron app. Since we
              haven't been able to detect the exact cause of these crashes we are restarting the
              server at the same port. After the restart, users are able to launch new kernels
              for the notebook.
              */
            this._cleanupListeners();

            if (!this._stopping && this._restartCount < SERVER_RESTART_LIMIT) {
              started = false;
              this._startServer = null;
              this.start();
              this._restartCount++;
            }
          } else {
            this._serverStartFailed();
            reject(
              new Error(
                'Jupyter Server process terminated before the initialization completed'
              )
            );
          }
        });

        this._nbServer.on('error', (err: Error) => {
          if (started) {
            dialog.showMessageBox({
              message: `Jupyter Server process errored: ${err.message}`,
              type: 'error'
            });
          } else {
            this._serverStartFailed();
            reject(err);
          }
        });
      }
    );

    return this._startServer;
  }

  /**
   * Stop the currently executing Jupyter server.
   *
   * @return a promise that is resolved when the server has stopped.
   */
  public stop(): Promise<void> {
    // If stop has already been initiated, just return the promise
    if (this._stopServer) {
      return this._stopServer;
    }

    this._stopping = true;

    this._stopServer = new Promise<void>((resolve, reject) => {
      if (this._nbServer !== undefined) {
        if (process.platform === 'win32') {
          execFile(
            'taskkill',
            ['/PID', String(this._nbServer.pid), '/T', '/F'],
            () => {
              this._stopping = false;
              resolve();
            }
          );
        } else {
          this._nbServer.kill();
          this._shutdownServer()
            .then(() => {
              this._stopping = false;
              resolve();
            })
            .catch(reject);
        }
      } else {
        this._stopping = false;
        resolve();
      }
    });
    return this._stopServer;
  }

  get started(): Promise<boolean> {
    return new Promise<boolean>((resolve, reject) => {
      const checkStartServerPromise = () => {
        if (this._startServer) {
          this._startServer
            .then(() => {
              resolve(true);
            })
            .catch(reject);
        } else {
          setTimeout(() => {
            checkStartServerPromise();
          }, 100);
        }
      };

      checkStartServerPromise();
    });
  }

  private _serverStartFailed(): void {
    this._cleanupListeners();
    // Server didn't start, resolve stop promise
    this._stopServer = Promise.resolve();
  }

  private _cleanupListeners(): void {
    this._nbServer.removeAllListeners();
    this._nbServer.stderr.removeAllListeners();
  }

  private _callShutdownAPI(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const req = httpRequest(
        `${this._info.url.origin}/api/shutdown?_xsrf=${this._info.token}`,
        {
          method: 'POST',
          headers: {
            Authorization: `token ${this._info.token}`
          }
        },
        r => {
          if (r.statusCode == 200) {
            resolve();
          } else {
            reject(`Server failed to shutdown. Response code: ${r.statusCode}`);
          }
        }
      );
      req.on('error', err => {
        reject(err);
      });
      req.end();
    });
  }

  private _shutdownServer(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this._callShutdownAPI()
        .then(() => {
          resolve();
        })
        .catch(error => {
          // if no connection, it is possible that server was not up yet
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          if (error.code === 'ECONNREFUSED') {
            Promise.race([
              waitUntilServerIsUp(this._info.url),
              waitForDuration(SERVER_LAUNCH_TIMEOUT)
            ]).then((up: boolean) => {
              if (up) {
                this._callShutdownAPI()
                  .then(() => {
                    resolve();
                  })
                  .catch(reject);
              } else {
                reject();
              }
            });
          } else {
            reject(error);
          }
        });
    });
  }

  private _generateToken() {
    return SERVER_TOKEN_PREFIX + randomBytes(19).toString('hex');
  }

  /**
   * The child process object for the Jupyter server
   */
  private _nbServer: ChildProcess;
  private _stopServer: Promise<void> = null;
  private _startServer: Promise<JupyterServer.IInfo> = null;
  private _options: JupyterServer.IOptions;
  private _info: JupyterServer.IInfo = {
    type: 'local',
    url: null,
    port: null,
    token: null,
    workingDirectory: null,
    environment: null,
    serverArgs: '',
    overrideDefaultServerArgs: false,
    serverEnvVars: {},
    version: null
  };
  private _stopping: boolean = false;
  private _restartCount: number = 0;
}

export namespace JupyterServer {
  export interface IOptions {
    port?: number;
    token?: string;
    workingDirectory?: string;
    environment?: IPythonEnvironment;
  }

  export interface IInfo {
    type: 'local' | 'remote';
    url: URL;
    port: number;
    token: string;
    environment: IPythonEnvironment;
    workingDirectory: string;
    serverArgs: string;
    overrideDefaultServerArgs: boolean;
    serverEnvVars: KeyValueMap;
    version?: string;
    pageConfig?: any;
  }
}

export interface IServerFactory {
  /**
   * Create and start a 'free' server is none exists.
   *
   * @param opts the Jupyter server options.
   *
   * @return the factory item.
   */
  createFreeServersIfNeeded: (
    opts?: JupyterServer.IOptions,
    freeCount?: number
  ) => Promise<void>;

  /**
   * Create and start a 'free' server. The server created will be returned
   * in the next call to 'createServer'.
   *
   * This method is a way to pre-launch Jupyter servers to improve load
   * times.
   *
   * @param opts the Jupyter server options.
   *
   * @return the factory item.
   */
  createFreeServer: (
    opts?: JupyterServer.IOptions
  ) => Promise<JupyterServerFactory.IFactoryItem>;

  /**
   * Create a Jupyter server.
   *
   * If a free server is available, it is preferred over
   * server creation.
   *
   * @param opts the Jupyter server options.
   * @param forceNewServer force the creation of a new server over a free server.
   *
   * @return the factory item.
   */
  createServer: (
    opts?: JupyterServer.IOptions
  ) => Promise<JupyterServerFactory.IFactoryItem>;

  /**
   * Kill all currently running servers.
   *
   * @return a promise that is fulfilled when all servers are killed.
   */
  killAllServers: () => Promise<void[]>;

  /**
   * Check if any server was launched using the environment.
   *
   * @param pythonPath Python path for the environment.
   *
   * @return true if environment at pythonPath is in use.
   */
  isEnvironmentInUse(pythonPath: string): boolean;
}

export namespace IServerFactory {
  export interface IServerStarted {
    readonly factoryId: number;
    type: 'local' | 'remote';
    url: string;
    token: string;
    error?: Error;
    pageConfig?: any;
  }

  export interface IServerStop {
    factoryId: number;
  }
}

export class JupyterServerFactory implements IServerFactory, IDisposable {
  constructor(registry: IRegistry) {
    this._registry = registry;
  }

  async createFreeServersIfNeeded(
    opts?: JupyterServer.IOptions,
    freeCount: number = 1
  ): Promise<void> {
    const unusedServerCount = await this._geUnusedServerCount();
    for (let i = unusedServerCount; i < freeCount; ++i) {
      this.createFreeServer(opts);
    }
  }

  /**
   * Create and start a 'free' server. The server created will be returned
   * in the next call to 'createServer'.
   *
   * This method is a way to pre-launch Jupyter servers to improve load
   * times.
   *
   * @param opts the Jupyter server options.
   *
   * @return the factory item.
   */
  async createFreeServer(
    opts?: JupyterServer.IOptions
  ): Promise<JupyterServerFactory.IFactoryItem> {
    let item: JupyterServerFactory.IFactoryItem;
    let env: IPythonEnvironment;

    if (!opts?.environment) {
      env = await this._registry.getDefaultEnvironment();
    } else {
      env = opts?.environment;
    }

    opts = { ...opts, ...{ environment: env } };
    item = this._createServer(opts);
    item.server.start().catch(error => {
      console.error('Failed to start server', error);
      this._removeFailedServer(item.factoryId);
    });

    return item;
  }

  /**
   * Create a Jupyter server.
   *
   * If a free server is available, it is preferred over
   * server creation.
   *
   * @param opts the Jupyter server options.
   */
  async createServer(
    opts?: JupyterServer.IOptions
  ): Promise<JupyterServerFactory.IFactoryItem> {
    let item: JupyterServerFactory.IFactoryItem;
    let env: IPythonEnvironment;

    if (!opts?.environment) {
      env = await this._registry.getDefaultEnvironment();
    } else {
      env = opts?.environment;
    }

    opts = { ...opts, ...{ environment: env } };

    item = (await this._findUnusedServer(opts)) || this._createServer(opts);
    item.used = true;

    item.server.start().catch(error => {
      console.error('Failed to start server', error);
      this._removeFailedServer(item.factoryId);
    });

    return item;
  }

  /**
   * Stop a Jupyter server.
   *
   * @param factoryId the factory item id.
   */
  stopServer(factoryId: number): Promise<void> {
    let idx = this._getServerIdx(factoryId);
    if (idx < 0) {
      return Promise.reject(new Error('Invalid server id: ' + factoryId));
    }

    let server = this._servers[idx];
    if (server.closing) {
      return server.closing;
    }
    let promise = new Promise<void>((res, rej) => {
      server.server
        .stop()
        .then(() => {
          ArrayExt.removeAt(this._servers, idx);
          res();
        })
        .catch(e => {
          log.error(e);
          ArrayExt.removeAt(this._servers, idx);
          rej();
        });
    });
    server.closing = promise;
    return promise;
  }

  /**
   * Kill all currently running servers.
   *
   * @return a promise that is fulfilled when all servers are killed.
   */
  killAllServers(): Promise<void[]> {
    // Get stop promises from all servers
    let stopPromises = this._servers.map(server => {
      return server.server.stop();
    });
    // Empty the server array.
    this._servers = [];
    return Promise.all(stopPromises);
  }

  isEnvironmentInUse(pythonPath: string): boolean {
    return (
      this._servers.find(server => {
        return server.server.info.environment.path === pythonPath;
      }) !== undefined
    );
  }

  dispose(): Promise<void> {
    if (this._disposePromise) {
      return this._disposePromise;
    }

    this._disposePromise = new Promise<void>((resolve, reject) => {
      this.killAllServers()
        .then(() => {
          resolve();
        })
        .catch(reject);
    });

    return this._disposePromise;
  }

  private _createServer(
    opts: JupyterServer.IOptions
  ): JupyterServerFactory.IFactoryItem {
    let item: JupyterServerFactory.IFactoryItem = {
      factoryId: this._nextId++,
      server: new JupyterServer(opts),
      closing: null,
      used: false
    };

    this._servers.push(item);
    return item;
  }

  private async _findUnusedServer(
    opts?: JupyterServer.IOptions
  ): Promise<JupyterServerFactory.IFactoryItem | null> {
    const workingDir =
      opts?.workingDirectory || userSettings.resolvedWorkingDirectory;
    const env =
      opts?.environment || (await this._registry.getDefaultEnvironment());

    let result = ArrayExt.findFirstValue(
      this._servers,
      (server: JupyterServerFactory.IFactoryItem, idx: number) => {
        return (
          !server.used &&
          server.server.info.workingDirectory === workingDir &&
          server.server.info.environment.path === env?.path
        );
      }
    );

    return result;
  }

  private async _geUnusedServerCount(
    opts?: JupyterServer.IOptions
  ): Promise<number> {
    let count = 0;

    const workingDir =
      opts?.workingDirectory || userSettings.resolvedWorkingDirectory;

    const env =
      opts?.environment || (await this._registry.getDefaultEnvironment());

    this._servers.forEach(server => {
      if (
        !server.used &&
        server.server.info.workingDirectory === workingDir &&
        server.server.info.environment.path === env?.path
      ) {
        count++;
      }
    });

    return count;
  }

  private _removeFailedServer(factoryId: number): void {
    let idx = this._getServerIdx(factoryId);
    if (idx < 0) {
      return;
    }
    ArrayExt.removeAt(this._servers, idx);
  }

  private _getServerIdx(factoryId: number): number {
    return ArrayExt.findFirstIndex(
      this._servers,
      (s: JupyterServerFactory.IFactoryItem, idx: number) => {
        if (s.factoryId === factoryId) {
          return true;
        }
        return false;
      }
    );
  }

  private _servers: JupyterServerFactory.IFactoryItem[] = [];
  private _nextId: number = 1;
  private _registry: IRegistry;
  private _disposePromise: Promise<void>;
}

export namespace JupyterServerFactory {
  /**
   * The object created by the JupyterServerFactory.
   */
  export interface IFactoryItem {
    /**
     * The factory ID. Used to keep track of the server.
     */
    readonly factoryId: number;

    /**
     * Whether the server is currently used.
     */
    used: boolean;

    /**
     * A promise that is created when the server is closing
     * and resolved on close.
     */
    closing: Promise<void>;

    /**
     * The actual Jupyter server object.
     */
    server: JupyterServer;
  }
}
