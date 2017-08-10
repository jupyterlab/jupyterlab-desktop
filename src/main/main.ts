import {app} from 'electron'

import * as Bottle from 'bottlejs';

/**
 * Require debugging tools. Only
 * runs when in development.
 */
require('electron-debug')({showDevTools: false});

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

