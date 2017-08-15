import {
    app, ipcMain
} from 'electron'

import {
    JupyterApplicationIPC as AppIPC
} from 'jupyterlab_app/src/ipc';

import * as Bottle from 'bottlejs';

/**
 * Require debugging tools. Only
 * runs when in development.
 */
require('electron-debug')({showDevTools: true});

/**
 * A user-defined service.
 * 
 * Services make up the core functionality of the
 * application. Each service is istatntiated 
 * once and then becomes available to every other serivce. 
 */
export
interface IService {

    /**
     * The required services.
     */
    requirements: String[];

    /**
     * The service name that is required by other services.
     */
    provides: string,

    /**
     * A function to create the service object.
     */
    activate: (...any: any[]) => any,

    /**
     * Whether the service should be instantiated immediatelty,
     * or lazy loaded.
     */
    autostart?: boolean
}

/**
 * Servies required by this application.
 */
let services: IService[] = [
    require('./app').default,
    require('./sessions').default,
    require('./server').default,
    require('./menu').default,
    require('./shortcuts').default
];

/**
 * "open-file" listener should be registered before
 * app ready for "double click" files to open in application
 */
app.once('will-finish-launching', (e: Electron.Event) => {
    app.on('open-file', (event: Electron.Event, path: string) => {
        ipcMain.once(AppIPC.LAB_READY, (event: Electron.Event) => {
            event.sender.send(AppIPC.OPEN_FILES, path);
        });
    });
});

/**
 * Load all services when the electron app is
 * ready.
 */
app.on('ready', () => {
    let serviceManager = new Bottle();
    let autostarts: string[] = [];
    services.forEach((s: IService) => {
        serviceManager.factory(s.provides, (container: any) => {
            let args = s.requirements.map((r: string) => {
                return container[r]
            });
            return s.activate(...args);
        });
        if (s.autostart)
            autostarts.push(s.provides);
    });
    serviceManager.digest(autostarts);
});

