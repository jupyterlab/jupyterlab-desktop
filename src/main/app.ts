// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { 
    app
} from 'electron';

import {
    IService
} from './main';

import {
    JupyterMainMenu
} from 'jupyterlab_app/src/main/menu';

import {
    JupyterServerFactory
} from 'jupyterlab_app/src/main/server';

import {
    ElectronStateDB
} from 'jupyterlab_app/src/main/state';

import {
    JSONObject
} from '@phosphor/coreutils';

import {
    //KeyboardShortcutManager
} from 'jupyterlab_app/src/main/shortcuts'

import {
    JupyterLabSession
} from './sessions';


export
interface IApplication {

    registerStatefulService: (service: IStatefulService) => Promise<JSONObject>;

    saveState: (service: IStatefulService) => Promise<void>;
}

export
interface IStatefulService {

    id: string;

    getState(): JSONObject;
}

export
class JupyterApplication implements IApplication {

    /**
     * Construct the Jupyter application
     */
    constructor() {
        this._registerListeners();
        //this._shortcutManager = new KeyboardShortcutManager({jupyterApp: this});
        this._menu = new JupyterMainMenu({jupyterApp: this});
        this._serverFactory = new JupyterServerFactory({});
        
        this._appStateDB.fetch(JupyterApplication.APP_STATE_NAMESPACE)
            .then((state: JupyterApplication.IState) => {
                this._appState = state;
            })
            .catch( (e) => {
                console.error(e);
            });
    }


    registerStatefulService(service: IStatefulService): Promise<JSONObject> {
        return null;
    }
    
    saveState(service: IStatefulService): Promise<void> {
        return null;
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
            this._appStateDB.save(JupyterApplication.APP_STATE_NAMESPACE, this._appState)
                .then(() => {
                    this._serverFactory.killAllServers()
                        .then(() => process.exit())
                        .catch((e) => {
                            console.error(e);
                            process.exit();
                        });
                }).catch(() => {
                    this._serverFactory.killAllServers()
                        .then(() => process.exit())
                        .catch((e) => {
                            console.error(e);
                            process.exit();
                        });
                });
        });
    }

    private _menu: JupyterMainMenu;

    private _serverFactory: JupyterServerFactory;

    private _appStateDB = new ElectronStateDB({namespace: 'jupyterlab-application-data'});

    private _appState: JupyterApplication.IState;

    //private _shortcutManager: KeyboardShortcutManager;

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