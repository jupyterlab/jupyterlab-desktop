// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import {
    app
} from 'electron';

import {
    IService
} from './main';

import {
    ElectronStateDB
} from './state';

import {
    JSONObject, JSONValue
} from '@phosphor/coreutils';

import {
    JupyterLabSession
} from './sessions';

import log from 'electron-log';

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
class JupyterApplication implements IApplication {

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

    private _appStateDB = new ElectronStateDB({namespace: 'jupyterlab-application-data'});

    private _appState: Promise<JSONObject>;

    private _services: IStatefulService[] = [];

    private _closing: IClosingService[] = [];

}

export
namespace JupyterApplication {

    export
    const APP_STATE_NAMESPACE = 'jupyter-lab-app';

    export
    interface IState extends JSONObject {
        windows: JupyterLabSession.IState[];
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
