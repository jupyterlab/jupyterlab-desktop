// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import {
    app, BrowserWindow, ipcMain, shell
} from 'electron';

import {
    IService
} from './main';

import {
    ElectronStateDB
} from './state';

import {
    JSONObject, JSONValue
} from '@lumino/coreutils';

import log from 'electron-log';

import { AsyncRemote, asyncRemoteMain } from '../asyncremote';
import fetch from 'node-fetch';
import * as yaml from 'js-yaml';
import * as semver from 'semver';

export
interface IApplication {

    /**
     * Register as service with persistent state.
     *
     * @return promise fulfileld with the service's previous state.
     */
    registerStatefulService: (service: IStatefulService) => Promise<JSONValue>;

    registerClosingService: (service: IClosingService) => void;

    /**
     * Force the application service to write data to the disk.
     */
    saveState: (service: IStatefulService, data: JSONValue) => Promise<void>;
}

/**
 * A service that has data that needs to persist.
 */
export
interface IStatefulService {

    /**
     * The human-readable id for the service state. Must be unique
     * to each service.
     */
    id: string;

    /**
     * Called before the application quits. Qutting will
     * be suspended until the returned promise is resolved with
     * the service's state.
     *
     * @return promise that is fulfilled with the service's state.
     */
    getStateBeforeQuit(): Promise<JSONValue>;

    /**
     * Called before state is passed to the service. Implementing
     * services should scan the state for issues in this function.
     * If the data is invalid, the function should return false.
     *
     * @return true if the data is valid, false otherwise.
     */
    verifyState: (state: JSONValue) => boolean;
}

/**
 * A service that has to complete some task on application exit
 */
export
interface IClosingService {
    /**
     * Called before the application exits and after the states are saved.
     * Service resolves the promise upon a successful cleanup.
     *
     * @return promise that is fulfilled when the service is ready to quit
     */
    finished(): Promise<void>;
}

export
namespace IAppRemoteInterface {
    export
    let checkForUpdates: AsyncRemote.IMethod<void, void> = {
        id: 'JupyterLabDesktop-check-for-updates'
    };
    export
    let openDevTools: AsyncRemote.IMethod<void, void> = {
        id: 'JupyterLabDesktop-open-dev-tools'
    };
}

export
class JupyterApplication implements IApplication, IStatefulService {
    readonly id = 'JupyterLabDesktop';

    /**
     * Construct the Jupyter application
     */
    constructor() {
        this._registerListeners();

        // Get application state from state db file.
        this._appState = new Promise<JSONObject>((res, rej) => {
            this._appStateDB.fetch(JupyterApplication.APP_STATE_NAMESPACE)
                .then((state: JSONObject) => {
                    res(state);
                })
                .catch( (e) => {
                    log.error(e);
                    res({});
                });
        });

        this._applicationState = {
            checkForUpdatesAutomatically: true
        };

        this.registerStatefulService(this)
            .then((state: JupyterApplication.IState) => {
                if (state) {
                    this._applicationState = state;
                }

                if (this._applicationState.checkForUpdatesAutomatically) {
                    setTimeout(() => {
                        this._checkForUpdates('on-new-version');
                    }, 5000);
                }
            });
    }

    registerStatefulService(service: IStatefulService): Promise<JSONValue> {
        this._services.push(service);

        return new Promise<JSONValue>((res, rej) => {
            this._appState
                .then((state: JSONObject) => {
                    if (state[service.id] && service.verifyState(state[service.id])) {
                        res(state[service.id]);
                    }
                    res(null);
                })
                .catch(() => {res(null); });
        });
    }

    registerClosingService(service: IClosingService): void {
        this._closing.push(service);
    }

    saveState(service: IStatefulService, data: JSONValue): Promise<void> {
        this._updateState(service.id, data);
        return this._saveState();
    }

    getStateBeforeQuit(): Promise<JupyterApplication.IState> {
        return Promise.resolve(this._applicationState);
    }

    verifyState(state: JupyterApplication.IState): boolean {
        return true;
    }

    private _updateState(id: string, data: JSONValue): void {
        let prevState = this._appState;

        this._appState = new Promise<JSONObject>((res, rej) => {
            prevState
                .then((state: JSONObject) => {
                    state[id] = data;
                    res(state);
                })
                .catch((state: JSONObject) => res(state));
        });
    }

    private _rewriteState(ids: string[], data: JSONValue[]): void {
        let prevState = this._appState;

        this._appState = new Promise<JSONObject>((res, rej) => {
            prevState
                .then(() => {
                    let state: JSONObject = {};
                    ids.forEach((id: string, idx: number) => {
                        state[id] = data[idx];
                    });
                    res(state);
                })
                .catch((state: JSONObject) => res(state));
        });
    }


    private _saveState(): Promise<void> {
        return new Promise<void>((res, rej) => {
            this._appState
                .then((state: JSONObject) => {
                    return this._appStateDB.save(JupyterApplication.APP_STATE_NAMESPACE, state);
                })
                .then(() => {
                    res();
                })
                .catch((e) => {
                    rej(e);
                });
        });
    }

    /**
     * Register all application event listeners
     */
    private _registerListeners(): void {
        // On OS X it is common for applications and their menu bar to stay
        // active until the user quits explicitly with Cmd + Q.
        app.on('window-all-closed', () => {
            if (process.platform !== 'darwin') {
                app.quit();
            }
        });

        app.on('will-quit', (event) => {
            event.preventDefault();

            // Collect data from services
            let state: Promise<JSONValue>[] = this._services.map((s: IStatefulService) => {
                return s.getStateBeforeQuit();
            });
            let ids: string[] = this._services.map((s: IStatefulService) => {
                return s.id;
            });

            // Wait for all services to return state
            Promise.all(state)
                .then((data: JSONValue[]) => {
                    this._rewriteState(ids, data);
                    return this._saveState();
                })
                .then(() => {
                    this._quit();
                })
                .catch(() => {
                    log.error(new Error('JupyterLab did not save state successfully'));
                    this._quit();
                });
        });

        app.on('browser-window-focus', (_event: Event, window: BrowserWindow) => {
            this._window = window;
        });

        ipcMain.on('set-check-for-updates-automatically', (_event, autoUpdate) => {
            this._applicationState.checkForUpdatesAutomatically = autoUpdate;
        });

        ipcMain.on('launch-installer-download-page', () => {
            shell.openExternal('https://github.com/jupyterlab/jupyterlab-desktop/releases');
        });

        asyncRemoteMain.registerRemoteMethod(IAppRemoteInterface.checkForUpdates,
            (): Promise<void> => {
                this._checkForUpdates('always');
                return Promise.resolve();
            });

        asyncRemoteMain.registerRemoteMethod(IAppRemoteInterface.openDevTools,
            (): Promise<void> => {
                this._window.webContents.openDevTools();
                return Promise.resolve();
            });
    }

    private _showUpdateDialog(type: 'updates-available' | 'error' | 'no-updates') {
        let child = new BrowserWindow({
            title: 'JupyterLab Update',
            width: 400,
            height: 150,
            resizable: false,
            webPreferences: {
                enableRemoteModule: true,
                nodeIntegration: true
            }
        });

        const checkForUpdatesAutomatically = this._applicationState.checkForUpdatesAutomatically !== false;
        const message =
            type === 'error' ? 'Error occurred while checking for updates!' :
            type === 'no-updates' ? 'There are no updates available.' :
            `There is a new version available. Download the latest version from <a href="javascript:void(0)" onclick='handleReleasesLink(this);'>the Releases page</a>.`

        const pageSource = `
            <body style="background: rgba(238,238,238,1); font-size: 13px; font-family: Helvetica, Arial, sans-serif">
            <div style="height: 100%; display: flex;flex-direction: column; justify-content: space-between;">
                <div>
                    ${message}                
                </div>
                <div>
                    <label><input type='checkbox' ${checkForUpdatesAutomatically ? 'checked' : ''} onclick='handleAutoCheckForUpdates(this);'>Check for updates automatically</label>
                </div>
            </div>

            <script>
                const ipcRenderer = require('electron').ipcRenderer;

                function handleAutoCheckForUpdates(el) {
                    ipcRenderer.send('set-check-for-updates-automatically', el.checked);
                }

                function handleReleasesLink(el) {
                    ipcRenderer.send('launch-installer-download-page');
                }
            </script>
            </body>
        `;
        child.loadURL(`data:text/html;charset=utf-8,${pageSource}`);
    }

    private _checkForUpdates(showDialog: 'on-new-version' | 'always') {
        fetch('https://github.com/jupyterlab/jupyterlab-desktop/releases/latest/download/latest.yml').then(async (response) => {
            try {
                const data = await response.text();
                const latestReleaseData = yaml.load(data);
                const latestVersion = (latestReleaseData as any).version;
                const currentVersion = app.getVersion();
                const newVersionAvailable = semver.compare(currentVersion, latestVersion) === -1;
                if (showDialog === 'always' || newVersionAvailable) {
                    this._showUpdateDialog(newVersionAvailable ? 'updates-available' : 'no-updates');
                }
            } catch (error) {
                if (showDialog === 'always') {
                    this._showUpdateDialog('error');
                }
                console.error('Failed to check for updates:', error);
            }
        }).catch((error) => {
            if (showDialog === 'always') {
                this._showUpdateDialog('error');
            }
            console.error('Failed to check for updates:', error);
        });
    }

    private _quit(): void {
        let closing: Promise<void>[] = this._closing.map((s: IClosingService) => {
            return s.finished();
        });

        Promise.all(closing)
        .then( () => {process.exit(); })
        .catch( (err) => {
            log.error(new Error('JupyterLab could not close successfully'));
            process.exit();
        });
    }

    private _appStateDB = new ElectronStateDB({namespace: 'jupyterlab-desktop-data'});

    private _appState: Promise<JSONObject>;

    private _applicationState: JupyterApplication.IState;

    private _services: IStatefulService[] = [];

    private _closing: IClosingService[] = [];

    /**
     * The most recently focused window
     */
    private _window: Electron.BrowserWindow;
}

export
namespace JupyterApplication {

    export
    const APP_STATE_NAMESPACE = 'jupyter-lab-app';

    export
    interface IState extends JSONObject {
        checkForUpdatesAutomatically?: boolean;
    }
}

let service: IService = {
    requirements: [],
    provides: 'IApplication',
    activate: (): IApplication => {
        return new JupyterApplication();
    }
};
export default service;
