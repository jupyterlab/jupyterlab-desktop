import {
    ChildProcess, execFile
} from 'child_process';

import {
    IService
} from './main';

import {
    IRegistry
} from './registry';

import {
    app, dialog
} from 'electron';

import {
    AsyncRemote, asyncRemoteMain
} from '../asyncremote';

import {
    IApplication, IClosingService
} from './app';

import {
    ArrayExt
} from '@lumino/algorithm';

import log from 'electron-log';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as http from 'http';
import { IEnvironmentType, IPythonEnvironment } from './tokens';
import { appConfig } from './utils';

const SERVER_LAUNCH_TIMEOUT = 30000; // milliseconds

function createTempFile(fileName = 'temp', data = '', encoding: BufferEncoding = 'utf8') {
    const tempDirPath = path.join(os.tmpdir(), 'jlab_desktop');
    const tmpDir = fs.mkdtempSync(tempDirPath);
    const tmpFilePath = path.join(tmpDir, fileName);

    fs.writeFileSync(tmpFilePath, data, {encoding});

    return tmpFilePath;
}

function createLaunchScript(environment: IPythonEnvironment): string {
    const platform = process.platform;
    const isWin = platform === 'win32';
    const pythonPath = environment.path;
    let envPath = path.dirname(pythonPath);
    if (!isWin) {
        envPath = path.normalize(path.join(envPath, '../'));
    }

    // note: traitlets<5.0 require fully specified arguments to
    // be followed by equals sign without a space; this can be
    // removed once jupyter_server requires traitlets>5.0
    const launchCmd = [
        'python', '-m', 'jupyterlab',
        '--no-browser',
        // do not use any config file
        '--JupyterApp.config_file_name=""',
        `--ServerApp.port=${appConfig.jlabPort}`,
        // use our token rather than any pre-configured password
        '--ServerApp.password=""',
        '--ServerApp.allow_origin="*"',
        // enable hidden files (let user decide whether to display them)
        '--ContentsManager.allow_hidden=True'
    ].join(' ');

    let script: string;

    if (isWin) {
        if (environment.type === IEnvironmentType.CondaEnv) {
            script = `
                CALL ${envPath}\\condabin\\activate.bat
                CALL ${launchCmd}`;
        } else {
            script = `
                CALL ${envPath}\\activate.bat
                CALL ${launchCmd}`;
        }
    } else {
        script = `
            source ${envPath}/bin/activate
            ${launchCmd}`;
    }

    const ext = isWin ? 'bat' : 'sh';
    const scriptPath = createTempFile(`launch.${ext}`, script);

    if (!isWin) {
        fs.chmodSync(scriptPath, 0o755);
    }

    return scriptPath;
}

async function waitForDuration(duration: number): Promise<boolean> {
    return new Promise(resolve => {
        setTimeout(() => {
            resolve(false);
        }, duration);
    });
}

async function checkIfUrlExists(url: URL): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
        const req = http.request(url, function(r) {
            resolve(r.statusCode >= 200 && r.statusCode < 400);
        });
        req.on('error', function(err) {
            resolve(false);
        });
        req.end();
    });
}

async function waitUntilServerIsUp(port: number): Promise<boolean> {
    const url = new URL(`http://localhost:${port}`);
    return new Promise<boolean>(async (resolve) => {
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

        await checkUrl();
    });
}

export
class JupyterServer {

    constructor(options: JupyterServer.IOptions) {
        this._info.environment = options.environment;
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

        this._startServer = new Promise<JupyterServer.IInfo>((resolve, reject) => {
            const home = process.env.JLAB_DESKTOP_HOME || app.getPath('home');
            const isWin = process.platform === 'win32';
            const pythonPath = this._info.environment.path;
            if (!fs.existsSync(pythonPath)) {
                dialog.showMessageBox({message: `Environment not found at: ${pythonPath}`, type: 'error' });
                reject();
            }
            this._info.url = `http://localhost:${appConfig.jlabPort}`;
            this._info.token = appConfig.token;
            
            const launchScriptPath = createLaunchScript(this._info.environment); 

            this._nbServer = execFile(launchScriptPath, {
                cwd: home,
                shell: isWin ? 'cmd.exe' : '/bin/bash',
                env: {
                    ...process.env,
                    JUPYTER_TOKEN: appConfig.token,
                    JUPYTER_CONFIG_DIR: process.env.JLAB_DESKTOP_CONFIG_DIR || app.getPath('userData')
                }
            });
            
            Promise.race([
                waitUntilServerIsUp(appConfig.jlabPort),
                waitForDuration(SERVER_LAUNCH_TIMEOUT)
            ])
            .then((up: boolean) => {
                this._cleanupListeners();
                if (up) {
                    fs.unlinkSync(launchScriptPath);
                    resolve(this._info);
                } else {
                    reject(new Error('Failed to launch Jupyter Server'));
                }
            });

            this._nbServer.on('exit', () => {
                if (started) {
                    dialog.showMessageBox({message: 'Jupyter Server process terminated', type: 'error' });
                } else {
                    this._serverStartFailed();
                    reject(new Error('Jupyter Server process terminated before the initialization completed'));
                }
            });

            this._nbServer.on('error', (err: Error) => {
                if (started) {
                    dialog.showMessageBox({message: `Jupyter Server process errored: ${err.message}`, type: 'error' });
                } else {
                    this._serverStartFailed();
                    reject(err);
                }
            });
        });

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

        this._stopServer = new Promise<void>((res, rej) => {
            if (this._nbServer !== undefined) {
                if (process.platform === 'win32') {
                    execFile('taskkill', ['/PID', String(this._nbServer.pid), '/T', '/F'], () => {
                        res();
                    });
                } else {
                    this._nbServer.kill();
                    res();
                }
            } else {
                res();
            }
        });
        return this._stopServer;
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

    /**
     * The child process object for the Jupyter server
     */
    private _nbServer: ChildProcess;

    private _stopServer: Promise<void> = null;

    private _startServer: Promise<JupyterServer.IInfo> = null;

    private _info: JupyterServer.IInfo = { url: null, token: null, environment: null, version: null };
}

export
namespace JupyterServer {

    export
    interface IOptions {
        environment: IPythonEnvironment;
    }

    export
    interface IInfo {
        url: string;
        token: string;
        environment: IPythonEnvironment;
        version?: string;
    }
}

export
interface IServerFactory {

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
    createFreeServer: (opts: JupyterServer.IOptions) => JupyterServerFactory.IFactoryItem;

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
    createServer: (opts: JupyterServer.IOptions) => Promise<JupyterServerFactory.IFactoryItem>;

    /**
     * Kill all currently running servers.
     *
     * @return a promise that is fulfilled when all servers are killed.
     */
    killAllServers: () => Promise<void[]>;
}

export
namespace IServerFactory {

    export
    interface IServerStarted {
        readonly factoryId: number;
        url: string;
        token: string;
        error?: Error;
    }

    export
    interface IServerStop {
        factoryId: number;
    }

    export
        let requestServerStart: AsyncRemote.IMethod<void, IServerStarted> = {
            id: 'JupyterServerFactory-requestserverstart'
        };

    export
        let requestServerStop: AsyncRemote.IMethod<IServerStop, void> = {
            id: 'JupyterServerFactory-requestserverstop'
        };

    export
        let requestServerStartPath: AsyncRemote.IMethod<void, IServerStarted> = {
            id: 'JupyterServerFactory-requestserverstartpath'
        };

    export
        let pathSelectedEvent: AsyncRemote.IEvent<void> = {
            id: 'JupyterServerFactory-pathselectedevent'
        };
}

export
class JupyterServerFactory implements IServerFactory, IClosingService {

    constructor(app: IApplication, registry: IRegistry) {
        this._registry = registry;
        app.registerClosingService(this);

        asyncRemoteMain.registerRemoteMethod(IServerFactory.requestServerStart, () => {
            return this.createServer(({} as JupyterServer.IOptions))
                .then((data: JupyterServerFactory.IFactoryItem) => {
                    return this._factoryToIPC(data);
                })
                .catch((e: Error) => {
                    return this._errorToIPC(e);
                });
        });

        asyncRemoteMain.registerRemoteMethod(IServerFactory.requestServerStartPath, (data: any, caller) => {
            return this._registry.getUserJupyterPath()
                .then((environment: IPythonEnvironment) => {
                    asyncRemoteMain.emitRemoteEvent(IServerFactory.pathSelectedEvent, undefined, caller);
                    return this.createServer({ environment });
                })
                .then((data: JupyterServerFactory.IFactoryItem) => {
                    return this._factoryToIPC(data);
                })
                .catch((e: Error) => {
                    if (e.message !== 'cancel') {
                        return this._errorToIPC(e);
                    }
                });
        });

        asyncRemoteMain.registerRemoteMethod(IServerFactory.requestServerStop, (arg: IServerFactory.IServerStop) => {
            return this.stopServer(arg.factoryId);
        });
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
    createFreeServer(opts: JupyterServer.IOptions): JupyterServerFactory.IFactoryItem {
        let item: JupyterServerFactory.IFactoryItem;
        let env: Promise<IPythonEnvironment>;

        if (!opts.environment) {
            env = this._registry.getDefaultEnvironment();
        } else {
            env = Promise.resolve(opts.environment);
        }

        env.then(env => {
            opts.environment = env;
            item = this._createServer(opts);

            return item.server.start();
        }).catch((e: Error) => {
            // The server failed to start, remove it from the factory.
            log.warn(e);
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
     * @param forceNewServer force the creation of a new server over a free server.
     */
    createServer(opts: JupyterServer.IOptions, forceNewServer?: boolean): Promise<JupyterServerFactory.IFactoryItem> {
        let server: JupyterServerFactory.IFactoryItem;
        let env: Promise<IPythonEnvironment>;

        if (!opts.environment) {
            env = this._registry.getDefaultEnvironment();
        } else {
            env = Promise.resolve(opts.environment);
        }

        return env.then(env => {
            if (forceNewServer) {
                server = this._createServer({ environment: env });
            } else {
                server = this._findUnusedServer({ environment: env }, !opts.environment) || this._createServer({ environment: env });
            }
            server.used = true;

            return server.server.start();
        })
            .then((data: JupyterServer.IInfo) => {
                return Promise.resolve(server);
            })
            .catch((e) => {
                this._removeFailedServer(server.factoryId);
                return Promise.reject(e);
            });
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
            server.server.stop()
                .then(() => {
                    ArrayExt.removeAt(this._servers, idx);
                    res();
                })
                .catch((e) => {
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
        let stopPromises = this._servers.map((server) => {
            return server.server.stop();
        });
        // Empty the server array.
        this._servers = [];
        return Promise.all(stopPromises);
    }

    /**
     * Closes all servers and cleans up any remaining listeners
     * @return promise that is fulfilled when the server factory is ready to quit
     */
    finished(): Promise<void> {
        let promise = new Promise<void>((resolve, reject) => {
            this.killAllServers()
                .then(() => { resolve(); })
                .catch(() => { reject(); });
        });
        return promise;
    }



    private _createServer(opts: JupyterServer.IOptions): JupyterServerFactory.IFactoryItem {
        let item: JupyterServerFactory.IFactoryItem = {
            factoryId: this._nextId++,
            server: new JupyterServer(opts),
            closing: null,
            used: false
        };

        this._servers.push(item);
        return item;
    }

    private _findUnusedServer(opts: JupyterServer.IOptions, usedDefault: boolean): JupyterServerFactory.IFactoryItem | null {
        let result = ArrayExt.findFirstValue(this._servers, (server: JupyterServerFactory.IFactoryItem, idx: number) => {
            return !server.used && opts.environment.path === server.server.info.environment.path;
        });

        if (!result && usedDefault) {
            result = ArrayExt.findFirstValue(this._servers, (server) => {
                return !server.used;
            });
        }

        return result;
    }

    private _removeFailedServer(factoryId: number): void {
        let idx = this._getServerIdx(factoryId);
        if (idx < 0) {
            return;
        }
        ArrayExt.removeAt(this._servers, idx);
    }

    private _getServerIdx(factoryId: number): number {
        return ArrayExt.findFirstIndex(this._servers, (s: JupyterServerFactory.IFactoryItem, idx: number) => {
            if (s.factoryId === factoryId) {
                return true;
            }
            return false;
        });
    }

    private _factoryToIPC(data: JupyterServerFactory.IFactoryItem): IServerFactory.IServerStarted {
        let info = data.server.info;
        return {
            factoryId: data.factoryId,
            url: info.url,
            token: info.token
        };
    }

    private _errorToIPC(e: Error): IServerFactory.IServerStarted {
        return {
            factoryId: -1,
            url: null,
            token: null,
            error: e
        };
    }

    private _servers: JupyterServerFactory.IFactoryItem[] = [];

    private _nextId: number = 1;

    private _registry: IRegistry;

}

export
namespace JupyterServerFactory {

    /**
     * The object created by the JupyterServerFactory.
     */
    export
    interface IFactoryItem {

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

let service: IService = {
    requirements: ['IRegistry', 'IApplication'],
    provides: 'IServerFactory',
    activate: (registry: IRegistry, app: IApplication): IServerFactory => {
        return new JupyterServerFactory(app, registry);
    },
    autostart: true
};
export default service;
