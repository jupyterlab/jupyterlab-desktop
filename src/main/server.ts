import {
    ChildProcess, execFile, execSync
} from 'child_process';

import {
    IService
} from './main';

import {
    IRegistry, Registry
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

import * as path from 'path';
import * as fs from 'fs-extra';

export
class JupyterServer {

    constructor(options: JupyterServer.IOptions) {
        this._info.environment = options.environment;
    }

    get info(): JupyterServer.IInfo {
        return this._info;
    }

    /**
     * Start a local Jupyer server. This method can be
     * called multiple times without initiating multiple starts.
     *
     * @return a promise that is resolved when the server has started.
     */
    public start(): Promise<JupyterServer.IInfo> {
        if (this._startServer) {
            return this._startServer;
        }

        this._startServer = new Promise<JupyterServer.IInfo>((resolve, reject) => {
            let urlRegExp = /http:\/\/localhost:\d+\/\S*/g;
            let tokenRegExp = /token=\w+/g;
            let baseRegExp = /http:\/\/localhost:\d+\//g;
            // @ts-ignore
            let home = app.getPath('home');
            const envPath = '/Users/username/jupyterlab_app_env/bin/python';

            if (!fs.existsSync(envPath)) {
                let env_setup = path.join (__dirname, '../../../../env_setup/JupyterLab-3.0.7-MacOSX-x86_64.sh');
                console.log(env_setup);

                dialog.showMessageBox({message: env_setup});

                execSync(`${env_setup} -b -p /Users/username/jupyterlab_app_env`);
            }

            //this._info.environment.path = '/Users/username/miniconda3/envs/jlab3/bin/python';
            this._info.environment.path = envPath;

            this._nbServer = execFile(this._info.environment.path, ['-m', 'jupyter', 'lab', '--expose-app-in-browser', '--no-browser', '--ServerApp.password', '', '--ServerApp.disable_check_xsrf', 'True', '--NotebookApp.allow_origin', '*'], {
                cwd: '/Users/username/jupyterlab_app_env/bin'/*home*/,
                env: {
                    PATH: `/Users/username/jupyterlab_app_env/bin:${process.env['PATH']}`
                }
            });

            this._nbServer.on('exit', () => {
                this._serverStartFailed();
                reject(new Error('Could not find Jupyter in PATH'));
            });

            this._nbServer.on('error', (err: Error) => {
                this._serverStartFailed();
                reject(new Error('Could not find Jupyter in PATH'));
            });

            this._nbServer.stderr.on('data', (serverBuff: string) => {
                let urlMatch = serverBuff.toString().match(urlRegExp);
                if (!urlMatch) {
                    return;
                }

                let url = urlMatch[0].toString();
                let token = (url.match(tokenRegExp));

                if (!token) {
                    this._cleanupListeners();
                    reject(new Error('Update Jupyter notebook to version 4.3.0 or greater'));
                    return;
                }

                this._info.token = token[0].replace('token=', '');
                this._info.url = (url.match(baseRegExp))[0];

                this._cleanupListeners();
                resolve(this._info);
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

    private _info: JupyterServer.IInfo = { url: null, token: null, environment: null };
}

export
namespace JupyterServer {

    export
    interface IOptions {
        environment: Registry.IPythonEnvironment;
    }

    export
    interface IInfo {
        url: string;
        token: string;
        environment: Registry.IPythonEnvironment;
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
        err?: any;
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
                .then((environment: Registry.IPythonEnvironment) => {
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
        let env: Promise<Registry.IPythonEnvironment>;

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
        let env: Promise<Registry.IPythonEnvironment>;

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
            err: e.message || 'Server creation error'
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
