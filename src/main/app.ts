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
} from 'jupyterlab_app/src/main/state';

import {
    JSONObject, JSONValue
} from '@phosphor/coreutils';

import {
    //KeyboardShortcutManager
} from 'jupyterlab_app/src/main/shortcuts'

import {
    JupyterLabSession
} from './sessions';


export
interface IApplication {

    registerStatefulService: (service: IStatefulService) => Promise<JSONValue>;

    saveState: (service: IStatefulService, data: JSONValue) => Promise<void>;
}

export
interface IStatefulService {

    id: string;

    getStateBeforeQuit(): Promise<JSONValue>;
    
    verifyState: (state: JSONValue) => boolean;
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
                    console.error(e);
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
                .catch(() => {res(null)});
        });
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
                    let state: JSONObject = {}
                    ids.forEach((id: string, idx: number) => {
                        state[id] = data[idx];
                    })
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
                })
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
            })

            // Wait for all services to return state
            Promise.all(state)
                .then((data: JSONValue[]) => {
                    this._rewriteState(ids, data);
                    return this._saveState()
                })
                .then(() => {
                    process.exit();
                })
                .catch(() => {
                    process.exit();
                });
        });
    }

    private _appStateDB = new ElectronStateDB({namespace: 'jupyterlab-application-data'});

    private _appState: Promise<JSONObject>;

    private _services: IStatefulService[] = [];

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
}
export default service;